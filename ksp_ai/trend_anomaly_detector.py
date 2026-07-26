"""
trend_anomaly_detector.py

Crime Intelligence & Analytics Platform - Trend & Anomaly Detection Module

Builds a complete daily time series per (district, crime_type), computes
moving averages, growth rates and trend strength, detects anomalies using
a ROLLING Z-score baseline, groups consecutive anomalous days into spike
events, and produces supplementary weekly/monthly/day-of-week/district-
ranking reports.

Public interface (for use by the batch pipeline or any other caller):

    process(df, **configuration) -> dict[str, pd.DataFrame]

`process()` takes an already-loaded pandas DataFrame, performs no file I/O,
never calls sys.exit(), and raises exceptions on bad input/parameters
instead. It returns a dictionary of DataFrames rather than writing
anything to disk:

    {
        "trend_summary":     daily-level trend + rolling-baseline metrics,
        "anomalies":         flagged spikes with severity,
        "statistics":        per district/crime_type rollup,
        "spike_events":      consecutive anomaly days grouped into events,
        "weekly":            weekly incident counts + growth,
        "monthly":           monthly incident counts + growth,
        "day_of_week":       incidents by weekday, weekend vs weekday,
        "district_ranking":  districts ranked by volume/anomalies,
    }

A thin CLI wrapper (`main()`) is kept for standalone/manual runs:
    read CSV -> process(df) -> save outputs + metadata -> print summary

Run standalone:
    python trend_anomaly_detector.py
    python trend_anomaly_detector.py --z-threshold 2.5 --z-window 30 --ma-short 7 --ma-long 30

Dependencies: pandas, numpy, argparse, logging, json, time
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# EXCEPTIONS
# ----------------------------------------------------------------------------


class TrendAnomalyDetectorError(Exception):
    """Raised when trend/anomaly detection cannot proceed because the
    input data or parameters are invalid. Callers (e.g. the batch
    pipeline) are expected to catch this rather than have the process
    killed by sys.exit()."""


# ----------------------------------------------------------------------------
# CONFIGURATION (defaults; overridable via CLI args or process() kwargs)
# ----------------------------------------------------------------------------

DEFAULT_INPUT_FILE = "synthetic_crimes.csv"
DEFAULT_TREND_SUMMARY_FILE = "trend_summary.csv"
DEFAULT_ANOMALIES_FILE = "crime_anomalies.csv"
DEFAULT_STATISTICS_FILE = "trend_statistics.csv"
DEFAULT_SPIKE_EVENTS_FILE = "spike_events.csv"
DEFAULT_WEEKLY_FILE = "weekly_trends.csv"
DEFAULT_MONTHLY_FILE = "monthly_trends.csv"
DEFAULT_DOW_FILE = "day_of_week_summary.csv"
DEFAULT_DISTRICT_RANKING_FILE = "district_ranking.csv"
DEFAULT_METADATA_FILE = "trend_metadata.json"

DEFAULT_MA_SHORT_WINDOW = 7       # 7-day moving average (trend smoothing)
DEFAULT_MA_LONG_WINDOW = 30       # 30-day moving average (trend smoothing)
DEFAULT_Z_WINDOW = 30             # rolling window used as the anomaly baseline
DEFAULT_Z_THRESHOLD = 3.0         # |z| >= threshold => "Moderate" anomaly (floor)
DEFAULT_SEVERITY_HIGH = 4.0       # |z| >= this => "High"
DEFAULT_SEVERITY_CRITICAL = 5.0   # |z| >= this => "Critical"
DEFAULT_MIN_OBSERVATIONS = 10     # minimum valid rolling-window observations
                                   # required before a day is eligible for scoring
DEFAULT_TREND_THRESHOLD = 0.05    # +/-5% week-over-week MA7 change to call trend
                                   # increasing/decreasing rather than stable

WEEKLY_GROWTH_LAG_DAYS = 7        # day-over-same-day-last-week comparison

REQUIRED_COLUMNS = ["incident_id", "crime_type", "district", "occurrence_datetime"]

MIN_ALLOWED_WINDOW = 2
MIN_ALLOWED_MIN_OBSERVATIONS = 3
MIN_ALLOWED_Z_WINDOW = 5

DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Column order for the "trend_summary" output, kept identical to what the
# original CLI wrote to trend_summary.csv.
TREND_SUMMARY_COLUMNS = [
    "date", "district", "crime_type", "daily_incidents",
    "moving_average_7", "moving_average_30", "daily_growth_rate",
    "weekly_growth_rate", "trend_strength_pct", "trend_direction",
    "rolling_mean", "rolling_std", "z_score",
]

# Column order for the "anomalies" output, kept identical to what the
# original CLI wrote to crime_anomalies.csv.
ANOMALIES_COLUMNS = [
    "date", "district", "crime_type", "incident_count",
    "expected_count", "z_score", "severity",
]


# ----------------------------------------------------------------------------
# VALIDATION (raises exceptions; never calls sys.exit)
# ----------------------------------------------------------------------------


def _validate_input_dataframe(df: pd.DataFrame) -> None:
    """Validate that ``df`` is a usable, non-empty DataFrame with all
    required columns present.

    Parameters
    ----------
    df : pd.DataFrame

    Raises
    ------
    TrendAnomalyDetectorError
        If ``df`` is None, not a DataFrame, empty, or missing required
        columns.
    """
    if df is None:
        raise TrendAnomalyDetectorError("Input DataFrame is None.")
    if not isinstance(df, pd.DataFrame):
        raise TrendAnomalyDetectorError(
            f"Expected a pandas DataFrame, got {type(df).__name__}."
        )
    if df.empty:
        raise TrendAnomalyDetectorError("Input DataFrame contains zero rows.")

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise TrendAnomalyDetectorError(
            f"Missing required columns in input DataFrame: {missing_cols}"
        )


def _validate_params(
    ma_short: int,
    ma_long: int,
    z_window: int,
    z_threshold: float,
    severity_high: float,
    severity_critical: float,
    min_observations: int,
    trend_threshold: float,
) -> None:
    """Validate all configurable trend/anomaly-detection parameters before
    processing begins, so bad input fails fast with a clear message
    instead of surfacing as a confusing error deep inside pandas.

    Raises
    ------
    ValueError
        If any parameter fails validation. All violations are collected
        and reported together.
    """
    errors = []

    if ma_short < MIN_ALLOWED_WINDOW:
        errors.append(f"ma_short must be >= {MIN_ALLOWED_WINDOW} (got {ma_short}).")
    if ma_long < MIN_ALLOWED_WINDOW:
        errors.append(f"ma_long must be >= {MIN_ALLOWED_WINDOW} (got {ma_long}).")
    if ma_short >= ma_long:
        errors.append(f"ma_short ({ma_short}) must be smaller than ma_long ({ma_long}).")
    if z_window < MIN_ALLOWED_Z_WINDOW:
        errors.append(f"z_window must be >= {MIN_ALLOWED_Z_WINDOW} (got {z_window}).")
    if z_threshold <= 0:
        errors.append(f"z_threshold must be > 0 (got {z_threshold}).")
    if min_observations < MIN_ALLOWED_MIN_OBSERVATIONS:
        errors.append(
            f"min_observations must be >= {MIN_ALLOWED_MIN_OBSERVATIONS} (got {min_observations})."
        )
    if min_observations > z_window:
        errors.append(
            f"min_observations ({min_observations}) cannot exceed z_window ({z_window})."
        )
    if not (0 < trend_threshold < 1):
        errors.append(f"trend_threshold must be between 0 and 1, exclusive (got {trend_threshold}).")
    if not (z_threshold <= severity_high < severity_critical):
        errors.append(
            f"Severity bands must satisfy z_threshold <= severity_high < severity_critical "
            f"(got {z_threshold} <= {severity_high} < {severity_critical})."
        )

    if errors:
        raise ValueError("Invalid trend/anomaly-detection parameters: " + " ".join(errors))


# ----------------------------------------------------------------------------
# DATA CLEANING
# ----------------------------------------------------------------------------


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    """Parse occurrence_datetime, drop invalid/incomplete rows, and derive
    occurrence_date (day-level) used for daily aggregation.

    Parameters
    ----------
    df : pd.DataFrame
        Raw crime dataset (must already contain REQUIRED_COLUMNS).

    Returns
    -------
    pd.DataFrame
        Cleaned dataset with an added 'occurrence_date' column.

    Raises
    ------
    TrendAnomalyDetectorError
        If no valid rows remain after cleaning.
    """
    logger.info("Cleaning and validating data...")
    initial_count = len(df)

    df = df.copy()
    df["occurrence_datetime"] = pd.to_datetime(df["occurrence_datetime"], errors="coerce")
    df = df.dropna(subset=["occurrence_datetime", "incident_id", "crime_type", "district"])

    df["occurrence_date"] = df["occurrence_datetime"].dt.normalize()
    df = df.reset_index(drop=True)

    removed = initial_count - len(df)
    logger.info("Removed %d invalid/incomplete rows. %d rows remain.", removed, len(df))

    if df.empty:
        raise TrendAnomalyDetectorError("No valid rows remain after cleaning.")

    return df


# ----------------------------------------------------------------------------
# AGGREGATION
# ----------------------------------------------------------------------------


def aggregate_daily_counts(df: pd.DataFrame) -> pd.DataFrame:
    """Build a complete daily time series per (district, crime_type), with
    zero-incident days made explicit (never silently missing) via
    reindexing over the full date x district x crime_type grid.

    Parameters
    ----------
    df : pd.DataFrame
        Cleaned dataset (output of clean_data) with an 'occurrence_date' column.

    Returns
    -------
    pd.DataFrame
        Columns: date, district, crime_type, daily_incidents. Sorted by
        district, crime_type, date.
    """
    logger.info("Aggregating daily incident counts...")

    daily_counts = (
        df.groupby(["occurrence_date", "district", "crime_type"])
        .size()
        .reset_index(name="daily_incidents")
    )

    full_date_range = pd.date_range(
        start=df["occurrence_date"].min(), end=df["occurrence_date"].max(), freq="D"
    )
    districts = df["district"].unique()
    crime_types = df["crime_type"].unique()

    full_index = pd.MultiIndex.from_product(
        [full_date_range, districts, crime_types], names=["date", "district", "crime_type"]
    )

    daily_counts = daily_counts.rename(columns={"occurrence_date": "date"})
    daily_counts = (
        daily_counts.set_index(["date", "district", "crime_type"])
        .reindex(full_index, fill_value=0)
        .reset_index()
    )
    daily_counts = daily_counts.sort_values(["district", "crime_type", "date"]).reset_index(drop=True)

    logger.info(
        "Built daily time series: %d rows across %d days, %d districts, %d crime types.",
        len(daily_counts), len(full_date_range), len(districts), len(crime_types),
    )

    return daily_counts


# ----------------------------------------------------------------------------
# TREND ANALYSIS
# ----------------------------------------------------------------------------


def calculate_moving_averages(daily_counts: pd.DataFrame, ma_short: int, ma_long: int) -> pd.DataFrame:
    """Compute rolling moving averages of daily_incidents per group
    (vectorized, no apply).

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Output of aggregate_daily_counts.
    ma_short, ma_long : int
        Short and long moving-average window sizes, in days.

    Returns
    -------
    pd.DataFrame
        Input with 'moving_average_7' and 'moving_average_30' columns added.
    """
    logger.info("Calculating %d-day and %d-day moving averages...", ma_short, ma_long)

    daily_counts = daily_counts.copy()
    grouped = daily_counts.groupby(["district", "crime_type"])["daily_incidents"]

    daily_counts["moving_average_7"] = grouped.transform(
        lambda s: s.rolling(window=ma_short, min_periods=1).mean()
    )
    daily_counts["moving_average_30"] = grouped.transform(
        lambda s: s.rolling(window=ma_long, min_periods=1).mean()
    )
    return daily_counts


def calculate_growth_rates(daily_counts: pd.DataFrame, trend_threshold: float) -> pd.DataFrame:
    """Compute daily/weekly growth rates, trend_strength_pct (week-over-week
    % change in the 7-day MA), and classify trend_direction. +/-inf results
    (division by a previous value of 0) are treated as "no measurable
    growth" (0.0) rather than an undefined spike.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Output of calculate_moving_averages.
    trend_threshold : float
        Fractional week-over-week MA7 change required to classify a trend
        as Increasing/Decreasing rather than Stable.

    Returns
    -------
    pd.DataFrame
        Input with 'daily_growth_rate', 'weekly_growth_rate',
        'trend_strength_pct', 'trend_direction' columns added.
    """
    logger.info("Calculating growth rates, trend strength, and trend direction...")

    df = daily_counts.copy()
    grouped_incidents = df.groupby(["district", "crime_type"])["daily_incidents"]
    grouped_ma7 = df.groupby(["district", "crime_type"])["moving_average_7"]

    daily_growth = grouped_incidents.pct_change(periods=1).replace([np.inf, -np.inf], np.nan).fillna(0.0)
    weekly_growth = grouped_incidents.pct_change(periods=WEEKLY_GROWTH_LAG_DAYS).replace(
        [np.inf, -np.inf], np.nan).fillna(0.0)
    ma7_growth = grouped_ma7.pct_change(periods=WEEKLY_GROWTH_LAG_DAYS).replace(
        [np.inf, -np.inf], np.nan).fillna(0.0)

    df["daily_growth_rate"] = daily_growth
    df["weekly_growth_rate"] = weekly_growth
    df["trend_strength_pct"] = (ma7_growth * 100).round(2)  # e.g. +18.5, -7.3

    conditions = [ma7_growth > trend_threshold, ma7_growth < -trend_threshold]
    df["trend_direction"] = np.select(conditions, ["Increasing", "Decreasing"], default="Stable")

    return df


# ----------------------------------------------------------------------------
# ROLLING Z-SCORE BASELINE + ANOMALY DETECTION
# ----------------------------------------------------------------------------


def calculate_rolling_zscore(
    daily_counts: pd.DataFrame, z_window: int, min_observations: int
) -> pd.DataFrame:
    """Compute a ROLLING (not global) Z-score baseline per (district,
    crime_type), so anomaly detection adapts to gradually changing crime
    patterns instead of comparing every day against one fixed,
    dataset-wide mean/std.

    For each day, the baseline mean/std are computed over the preceding
    `z_window` days ONLY (today is shifted out first) - this avoids the
    anomaly day contaminating its own baseline, which would otherwise
    dampen its own z-score.

    Days without at least `min_observations` valid prior days, or whose
    rolling std is 0 (a flat baseline), get z_score = NaN and are never
    flagged - division by zero is never attempted.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Must be sorted by district, crime_type, date and contain 'daily_incidents'.
    z_window : int
        Rolling window size (days) used as the baseline.
    min_observations : int
        Minimum valid prior observations required before scoring a day.

    Returns
    -------
    pd.DataFrame
        Input with 'rolling_mean', 'rolling_std', 'z_score' columns added.
    """
    logger.info(
        "Calculating rolling %d-day Z-score baseline (min_observations=%d)...",
        z_window, min_observations,
    )

    df = daily_counts.copy()
    grouped = df.groupby(["district", "crime_type"])["daily_incidents"]

    # Shift by 1 so "today" is never part of its own baseline window.
    shifted = grouped.transform(lambda s: s.shift(1))
    df["rolling_mean"] = (
        shifted.groupby([df["district"], df["crime_type"]])
        .transform(lambda s: s.rolling(window=z_window, min_periods=min_observations).mean())
    )
    df["rolling_std"] = (
        shifted.groupby([df["district"], df["crime_type"]])
        .transform(lambda s: s.rolling(window=z_window, min_periods=min_observations).std())
    )

    eligible = df["rolling_std"].notna() & (df["rolling_std"] > 0)
    df["z_score"] = np.nan
    df.loc[eligible, "z_score"] = (
        (df.loc[eligible, "daily_incidents"] - df.loc[eligible, "rolling_mean"])
        / df.loc[eligible, "rolling_std"]
    )

    n_ineligible = int((~eligible).sum())
    logger.info(
        "%d of %d day-rows had no valid rolling baseline (insufficient history "
        "or zero variance) and were left unscored.",
        n_ineligible, len(df),
    )

    return df


def _assign_severity(
    abs_z: pd.Series, z_threshold: float, severity_high: float, severity_critical: float
) -> pd.Series:
    """Map absolute Z-scores to severity labels using configurable band cutoffs."""
    conditions = [abs_z >= severity_critical, abs_z >= severity_high, abs_z >= z_threshold]
    choices = ["Critical", "High", "Moderate"]
    return pd.Series(np.select(conditions, choices, default="Moderate"), index=abs_z.index)


def detect_anomalies(
    daily_counts: pd.DataFrame, z_threshold: float, severity_high: float, severity_critical: float
) -> pd.DataFrame:
    """Flag rows whose rolling Z-score exceeds z_threshold in absolute value.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Must already contain 'z_score' and 'rolling_mean' (from
        calculate_rolling_zscore).
    z_threshold, severity_high, severity_critical : float
        Severity band cutoffs.

    Returns
    -------
    pd.DataFrame
        One row per flagged anomaly: date, district, crime_type,
        incident_count, expected_count, z_score, severity. Sorted by
        descending absolute z_score.
    """
    logger.info("Flagging anomalies (|z| >= %s)...", z_threshold)

    df = daily_counts
    mask = df["z_score"].notna() & (df["z_score"].abs() >= z_threshold)

    anomalies_df = df.loc[mask, ["date", "district", "crime_type", "daily_incidents",
                                  "rolling_mean", "z_score"]].copy()
    anomalies_df = anomalies_df.rename(columns={
        "daily_incidents": "incident_count", "rolling_mean": "expected_count"
    })
    anomalies_df["expected_count"] = anomalies_df["expected_count"].round(2)
    anomalies_df["z_score"] = anomalies_df["z_score"].round(3)
    anomalies_df["severity"] = _assign_severity(
        anomalies_df["z_score"].abs(), z_threshold, severity_high, severity_critical
    )

    anomalies_df = anomalies_df.sort_values(
        by="z_score", key=lambda s: s.abs(), ascending=False
    ).reset_index(drop=True)

    logger.info("Detected %d anomalies.", len(anomalies_df))
    return anomalies_df[ANOMALIES_COLUMNS]


def detect_spike_events(anomalies_df: pd.DataFrame) -> pd.DataFrame:
    """Group consecutive anomalous days (per district, crime_type) into
    single spike events, rather than reporting every anomalous day
    independently.

    Two anomaly rows belong to the same event if they are for the same
    (district, crime_type) and their dates are exactly 1 day apart.

    Parameters
    ----------
    anomalies_df : pd.DataFrame
        Output of detect_anomalies (unsorted order does not matter here).

    Returns
    -------
    pd.DataFrame
        Columns: district, crime_type, spike_start, spike_end, duration_days,
        peak_incident_count, peak_z_score, severity (max severity in event).
        Sorted by descending peak_incident_count.
    """
    logger.info("Grouping consecutive anomaly days into spike events...")

    if anomalies_df.empty:
        return pd.DataFrame(columns=[
            "district", "crime_type", "spike_start", "spike_end", "duration_days",
            "peak_incident_count", "peak_z_score", "severity",
        ])

    df = anomalies_df.sort_values(["district", "crime_type", "date"]).copy()

    # A new event starts whenever the group changes OR there's a gap > 1 day
    # since the previous anomaly row within the same group.
    group_change = (
        (df["district"] != df["district"].shift(1)) |
        (df["crime_type"] != df["crime_type"].shift(1))
    )
    day_gap = (df["date"] - df["date"].shift(1)).dt.days
    new_event = group_change | (day_gap != 1)
    df["event_id"] = new_event.cumsum()

    severity_rank = {"Moderate": 1, "High": 2, "Critical": 3}
    df["_severity_rank"] = df["severity"].map(severity_rank)

    events = df.groupby("event_id").agg(
        district=("district", "first"),
        crime_type=("crime_type", "first"),
        spike_start=("date", "min"),
        spike_end=("date", "max"),
        peak_incident_count=("incident_count", "max"),
        peak_z_score=("z_score", lambda s: s.loc[s.abs().idxmax()]),
        _max_severity_rank=("_severity_rank", "max"),
    ).reset_index(drop=True)

    events["duration_days"] = (events["spike_end"] - events["spike_start"]).dt.days + 1
    rank_to_label = {v: k for k, v in severity_rank.items()}
    events["severity"] = events["_max_severity_rank"].map(rank_to_label)
    events = events.drop(columns=["_max_severity_rank"])

    events = events[[
        "district", "crime_type", "spike_start", "spike_end", "duration_days",
        "peak_incident_count", "peak_z_score", "severity",
    ]].sort_values("peak_incident_count", ascending=False).reset_index(drop=True)

    logger.info("Grouped anomalies into %d spike events.", len(events))
    return events


# ----------------------------------------------------------------------------
# STATISTICS ROLLUP
# ----------------------------------------------------------------------------


def generate_statistics(daily_counts: pd.DataFrame, anomalies_df: pd.DataFrame) -> pd.DataFrame:
    """Per (district, crime_type) rollup: totals, averages, spike count,
    current trend.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Output of calculate_growth_rates/calculate_rolling_zscore.
    anomalies_df : pd.DataFrame
        Output of detect_anomalies.

    Returns
    -------
    pd.DataFrame
        Columns: district, crime_type, total_incidents,
        average_daily_incidents, maximum_daily_incidents,
        number_of_spikes, trend_direction. Sorted by total_incidents
        descending.
    """
    logger.info("Generating per-district/crime-type statistics...")

    base_stats = (
        daily_counts.groupby(["district", "crime_type"])["daily_incidents"]
        .agg(total_incidents="sum", average_daily_incidents="mean", maximum_daily_incidents="max")
        .reset_index()
    )

    latest_trend = (
        daily_counts.sort_values("date")
        .groupby(["district", "crime_type"])
        .tail(1)[["district", "crime_type", "trend_direction"]]
    )
    stats_df = base_stats.merge(latest_trend, on=["district", "crime_type"], how="left")

    if not anomalies_df.empty:
        spike_counts = anomalies_df.groupby(["district", "crime_type"]).size().reset_index(name="number_of_spikes")
        stats_df = stats_df.merge(spike_counts, on=["district", "crime_type"], how="left")
        stats_df["number_of_spikes"] = stats_df["number_of_spikes"].fillna(0).astype(int)
    else:
        stats_df["number_of_spikes"] = 0

    stats_df["average_daily_incidents"] = stats_df["average_daily_incidents"].round(3)
    stats_df = stats_df.sort_values("total_incidents", ascending=False).reset_index(drop=True)

    stats_df = stats_df[[
        "district", "crime_type", "total_incidents", "average_daily_incidents",
        "maximum_daily_incidents", "number_of_spikes", "trend_direction",
    ]]
    logger.info("Generated statistics for %d district/crime-type groups.", len(stats_df))
    return stats_df


# ----------------------------------------------------------------------------
# SUPPLEMENTARY REPORTS
# ----------------------------------------------------------------------------


def generate_weekly_monthly_trends(daily_counts: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Build weekly and monthly incident-count reports per (district,
    crime_type), each with a period-over-period growth rate.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Output of aggregate_daily_counts (or any later stage; only
        'date', 'district', 'crime_type', 'daily_incidents' are used).

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame]
        (weekly_df, monthly_df)
    """
    logger.info("Generating weekly and monthly trend reports...")

    indexed = daily_counts.set_index("date")

    weekly = (
        indexed.groupby(["district", "crime_type"])
        .resample("W")["daily_incidents"].sum()
        .reset_index(name="weekly_incidents")
        .rename(columns={"date": "week_start"})
    )
    weekly = weekly.sort_values(["district", "crime_type", "week_start"])
    weekly["weekly_growth_rate"] = (
        weekly.groupby(["district", "crime_type"])["weekly_incidents"]
        .pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0).round(4)
    )

    monthly = (
        indexed.groupby(["district", "crime_type"])
        .resample("ME")["daily_incidents"].sum()
        .reset_index(name="monthly_incidents")
        .rename(columns={"date": "month"})
    )
    monthly = monthly.sort_values(["district", "crime_type", "month"])
    monthly["monthly_growth_rate"] = (
        monthly.groupby(["district", "crime_type"])["monthly_incidents"]
        .pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0).round(4)
    )

    return weekly.reset_index(drop=True), monthly.reset_index(drop=True)


def generate_day_of_week_summary(daily_counts: pd.DataFrame) -> pd.DataFrame:
    """Summarize incidents by day of week and weekend-vs-weekday, across
    all districts/crime types, to surface recurring temporal patterns.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Output of aggregate_daily_counts (or any later stage).

    Returns
    -------
    pd.DataFrame
        Columns: day_of_week, is_weekend, total_incidents, average_incidents.
        Rows ordered Monday -> Sunday.
    """
    logger.info("Generating day-of-week summary...")

    df = daily_counts.copy()
    df["day_of_week"] = df["date"].dt.day_name()
    df["is_weekend"] = df["date"].dt.weekday >= 5

    summary = (
        df.groupby(["day_of_week", "is_weekend"])["daily_incidents"]
        .agg(total_incidents="sum", average_incidents="mean")
        .reset_index()
    )
    summary["average_incidents"] = summary["average_incidents"].round(3)
    summary["day_of_week"] = pd.Categorical(summary["day_of_week"], categories=DAY_ORDER, ordered=True)
    summary = summary.sort_values("day_of_week").reset_index(drop=True)
    summary["day_of_week"] = summary["day_of_week"].astype(str)

    return summary[["day_of_week", "is_weekend", "total_incidents", "average_incidents"]]


def generate_district_ranking(daily_counts: pd.DataFrame, anomalies_df: pd.DataFrame) -> pd.DataFrame:
    """Rank districts (across all crime types) by total incidents, number
    of anomalies, and average daily incidents.

    Parameters
    ----------
    daily_counts : pd.DataFrame
        Output of aggregate_daily_counts (or any later stage).
    anomalies_df : pd.DataFrame
        Output of detect_anomalies.

    Returns
    -------
    pd.DataFrame
        Columns: district, total_incidents, rank_by_incidents,
        number_of_anomalies, rank_by_anomalies, average_daily_incidents,
        rank_by_average. Sorted by rank_by_incidents ascending.
    """
    logger.info("Generating district ranking...")

    district_daily = daily_counts.groupby(["district", "date"])["daily_incidents"].sum().reset_index()
    base = (
        district_daily.groupby("district")["daily_incidents"]
        .agg(total_incidents="sum", average_daily_incidents="mean")
        .reset_index()
    )
    base["average_daily_incidents"] = base["average_daily_incidents"].round(3)

    if not anomalies_df.empty:
        anomaly_counts = anomalies_df.groupby("district").size().reset_index(name="number_of_anomalies")
        base = base.merge(anomaly_counts, on="district", how="left")
        base["number_of_anomalies"] = base["number_of_anomalies"].fillna(0).astype(int)
    else:
        base["number_of_anomalies"] = 0

    base["rank_by_incidents"] = base["total_incidents"].rank(ascending=False, method="min").astype(int)
    base["rank_by_anomalies"] = base["number_of_anomalies"].rank(ascending=False, method="min").astype(int)
    base["rank_by_average"] = base["average_daily_incidents"].rank(ascending=False, method="min").astype(int)

    base = base.sort_values("rank_by_incidents").reset_index(drop=True)
    return base[[
        "district", "total_incidents", "rank_by_incidents",
        "number_of_anomalies", "rank_by_anomalies",
        "average_daily_incidents", "rank_by_average",
    ]]


# ----------------------------------------------------------------------------
# PUBLIC INTERFACE - for use by the batch pipeline or any other caller
# ----------------------------------------------------------------------------


def process(
    df: pd.DataFrame,
    ma_short: int = DEFAULT_MA_SHORT_WINDOW,
    ma_long: int = DEFAULT_MA_LONG_WINDOW,
    z_window: int = DEFAULT_Z_WINDOW,
    z_threshold: float = DEFAULT_Z_THRESHOLD,
    severity_high: float = DEFAULT_SEVERITY_HIGH,
    severity_critical: float = DEFAULT_SEVERITY_CRITICAL,
    min_observations: int = DEFAULT_MIN_OBSERVATIONS,
    trend_threshold: float = DEFAULT_TREND_THRESHOLD,
) -> dict[str, pd.DataFrame]:
    """Run trend and anomaly detection over an already-loaded incident
    DataFrame and return every analytical output in-memory.

    This is the module's public, reusable entry point. It performs no
    file I/O (the caller is responsible for loading ``df`` and for
    persisting whichever returned DataFrames it needs) and never
    terminates the process - all failures are raised as exceptions so a
    calling batch pipeline can catch them and continue with other
    modules.

    Parameters
    ----------
    df : pd.DataFrame
        Incident dataset. Must contain at least the columns:
        'incident_id', 'crime_type', 'district', 'occurrence_datetime'.
    ma_short : int, default 7
        Short moving-average window, in days. Must be >= 2 and < ma_long.
    ma_long : int, default 30
        Long moving-average window, in days. Must be >= 2 and > ma_short.
    z_window : int, default 30
        Rolling window (days) used as the anomaly-detection baseline.
        Must be >= 5.
    z_threshold : float, default 3.0
        Absolute Z-score floor for a "Moderate" anomaly. Must be > 0.
    severity_high : float, default 4.0
        Absolute Z-score floor for "High" severity.
        Must satisfy z_threshold <= severity_high < severity_critical.
    severity_critical : float, default 5.0
        Absolute Z-score floor for "Critical" severity.
    min_observations : int, default 10
        Minimum valid rolling-window observations required before a day
        is eligible for anomaly scoring. Must be >= 3 and <= z_window.
    trend_threshold : float, default 0.05
        Fractional week-over-week MA7 change required to classify a
        trend as Increasing/Decreasing rather than Stable. Must be in (0, 1).

    Returns
    -------
    dict[str, pd.DataFrame]
        {
            "trend_summary":    daily-level trend + rolling-baseline metrics,
            "anomalies":        flagged spikes with severity,
            "statistics":       per district/crime_type rollup,
            "spike_events":     consecutive anomaly days grouped into events,
            "weekly":           weekly incident counts + growth,
            "monthly":          monthly incident counts + growth,
            "day_of_week":      incidents by weekday, weekend vs weekday,
            "district_ranking": districts ranked by volume/anomalies,
        }

    Raises
    ------
    TrendAnomalyDetectorError
        If ``df`` is None/not a DataFrame/empty, missing required
        columns, or if no valid rows remain after cleaning.
    ValueError
        If any configuration parameter fails validation.
    """
    start_time = time.time()
    logger.info(
        "process() starting: %d input rows, ma_short=%s, ma_long=%s, z_window=%s, "
        "z_threshold=%s, min_observations=%s, trend_threshold=%s",
        len(df) if isinstance(df, pd.DataFrame) else 0,
        ma_short, ma_long, z_window, z_threshold, min_observations, trend_threshold,
    )

    _validate_input_dataframe(df)
    _validate_params(
        ma_short, ma_long, z_window, z_threshold,
        severity_high, severity_critical, min_observations, trend_threshold,
    )

    df_clean = clean_data(df)

    daily_counts = aggregate_daily_counts(df_clean)
    daily_counts = calculate_moving_averages(daily_counts, ma_short, ma_long)
    daily_counts = calculate_growth_rates(daily_counts, trend_threshold)
    daily_counts = calculate_rolling_zscore(daily_counts, z_window, min_observations)

    anomalies_df = detect_anomalies(daily_counts, z_threshold, severity_high, severity_critical)
    spike_events_df = detect_spike_events(anomalies_df)
    statistics_df = generate_statistics(daily_counts, anomalies_df)

    weekly_df, monthly_df = generate_weekly_monthly_trends(daily_counts)
    dow_df = generate_day_of_week_summary(daily_counts)
    district_ranking_df = generate_district_ranking(daily_counts, anomalies_df)

    trend_summary_df = (
        daily_counts.sort_values(["district", "crime_type", "date"])
        .reset_index(drop=True)[TREND_SUMMARY_COLUMNS]
    )

    results = {
        "trend_summary": trend_summary_df,
        "anomalies": anomalies_df,
        "statistics": statistics_df,
        "spike_events": spike_events_df,
        "weekly": weekly_df,
        "monthly": monthly_df,
        "day_of_week": dow_df,
        "district_ranking": district_ranking_df,
    }

    elapsed = time.time() - start_time
    logger.info(
        "process() complete in %.2fs: %d trend rows, %d anomalies, %d spike events.",
        elapsed, len(trend_summary_df), len(anomalies_df), len(spike_events_df),
    )

    return results


# ----------------------------------------------------------------------------
# CLI WRAPPER - thin, optional, for standalone/manual runs only.
# All logic below this point is CLI plumbing; process() above does not
# depend on any of it.
# ----------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    """Parse and validate command-line arguments controlling file paths and
    the configurable trend/anomaly-detection parameters.

    Returns
    -------
    argparse.Namespace

    Raises
    ------
    SystemExit
        If any numeric argument fails validation. This is CLI argument
        validation only - it is separate from, and in addition to, the
        exception-based validation performed inside process().
    """
    parser = argparse.ArgumentParser(
        description="Trend and anomaly detection for the Crime Intelligence Platform."
    )
    parser.add_argument("--input", type=str, default=DEFAULT_INPUT_FILE)
    parser.add_argument("--trend-output", type=str, default=DEFAULT_TREND_SUMMARY_FILE)
    parser.add_argument("--anomalies-output", type=str, default=DEFAULT_ANOMALIES_FILE)
    parser.add_argument("--statistics-output", type=str, default=DEFAULT_STATISTICS_FILE)
    parser.add_argument("--spike-events-output", type=str, default=DEFAULT_SPIKE_EVENTS_FILE)
    parser.add_argument("--weekly-output", type=str, default=DEFAULT_WEEKLY_FILE)
    parser.add_argument("--monthly-output", type=str, default=DEFAULT_MONTHLY_FILE)
    parser.add_argument("--dow-output", type=str, default=DEFAULT_DOW_FILE)
    parser.add_argument("--district-ranking-output", type=str, default=DEFAULT_DISTRICT_RANKING_FILE)
    parser.add_argument("--metadata-output", type=str, default=DEFAULT_METADATA_FILE)

    parser.add_argument("--ma-short", type=int, default=DEFAULT_MA_SHORT_WINDOW,
                         help=f"Short moving-average window in days (default: {DEFAULT_MA_SHORT_WINDOW})")
    parser.add_argument("--ma-long", type=int, default=DEFAULT_MA_LONG_WINDOW,
                         help=f"Long moving-average window in days (default: {DEFAULT_MA_LONG_WINDOW})")
    parser.add_argument("--z-window", type=int, default=DEFAULT_Z_WINDOW,
                         help=f"Rolling window (days) used as the anomaly-detection baseline "
                              f"(default: {DEFAULT_Z_WINDOW})")
    parser.add_argument("--z-threshold", type=float, default=DEFAULT_Z_THRESHOLD,
                         help=f"Absolute Z-score floor for 'Moderate' anomalies (default: {DEFAULT_Z_THRESHOLD})")
    parser.add_argument("--severity-high", type=float, default=DEFAULT_SEVERITY_HIGH,
                         help=f"Absolute Z-score floor for 'High' severity (default: {DEFAULT_SEVERITY_HIGH})")
    parser.add_argument("--severity-critical", type=float, default=DEFAULT_SEVERITY_CRITICAL,
                         help=f"Absolute Z-score floor for 'Critical' severity (default: {DEFAULT_SEVERITY_CRITICAL})")
    parser.add_argument("--min-observations", type=int, default=DEFAULT_MIN_OBSERVATIONS,
                         help=f"Minimum valid rolling-window observations required before a day is "
                              f"eligible for anomaly scoring (default: {DEFAULT_MIN_OBSERVATIONS})")
    parser.add_argument("--trend-threshold", type=float, default=DEFAULT_TREND_THRESHOLD,
                         help=f"Fractional week-over-week MA7 change to classify a trend as "
                              f"increasing/decreasing (default: {DEFAULT_TREND_THRESHOLD})")

    args = parser.parse_args()
    _validate_cli_args(args)
    return args


def _validate_cli_args(args: argparse.Namespace) -> None:
    """Validate CLI-supplied numeric parameters before processing begins.
    CLI-only: exits the process on bad input, since there is no caller to
    hand an exception back to at this layer.
    """
    try:
        _validate_params(
            args.ma_short, args.ma_long, args.z_window, args.z_threshold,
            args.severity_high, args.severity_critical,
            args.min_observations, args.trend_threshold,
        )
    except ValueError as exc:
        print(f"ERROR: Invalid CLI arguments: {exc}")
        sys.exit(1)


def load_dataset(filepath: str) -> pd.DataFrame:
    """Load the crime dataset from a CSV file into a pandas DataFrame.
    CLI-only helper: process() itself never reads files.

    Raises
    ------
    SystemExit
        If the file cannot be found, is empty, or is missing required
        columns.
    """
    logger.info("Loading dataset from '%s'...", filepath)
    try:
        df = pd.read_csv(filepath)
    except FileNotFoundError:
        print(f"ERROR: File not found: '{filepath}'. Please run the dataset generator first.")
        sys.exit(1)
    except pd.errors.EmptyDataError:
        print(f"ERROR: File '{filepath}' is empty.")
        sys.exit(1)
    except Exception as exc:
        print(f"ERROR: Failed to read '{filepath}': {exc}")
        sys.exit(1)

    if df.empty:
        print("ERROR: Loaded dataset contains zero rows.")
        sys.exit(1)

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        print(f"ERROR: Missing required columns in dataset: {missing_cols}")
        sys.exit(1)

    logger.info("Loaded %d rows.", len(df))
    return df


def save_results(results: dict[str, pd.DataFrame], args: argparse.Namespace) -> None:
    """Persist every output DataFrame from process() to CSV.
    CLI-only helper: process() itself never writes files.

    Parameters
    ----------
    results : dict[str, pd.DataFrame]
        The dictionary returned by process().
    args : argparse.Namespace
        Parsed CLI arguments (used for output file paths).
    """
    outputs = [
        (results["trend_summary"], args.trend_output),
        (results["anomalies"], args.anomalies_output),
        (results["statistics"], args.statistics_output),
        (results["spike_events"], args.spike_events_output),
        (results["weekly"], args.weekly_output),
        (results["monthly"], args.monthly_output),
        (results["day_of_week"], args.dow_output),
        (results["district_ranking"], args.district_ranking_output),
    ]

    for frame, path in outputs:
        try:
            frame.reset_index(drop=True).to_csv(path, index=False)
            logger.info("Saved '%s' (%d rows).", path, len(frame))
        except Exception as exc:
            print(f"ERROR: Failed to save '{path}': {exc}")
            sys.exit(1)


def save_metadata(
    args: argparse.Namespace, results: dict[str, pd.DataFrame], elapsed_seconds: float
) -> None:
    """Write trend_metadata.json capturing the run's configuration and
    top-level summary metrics, so downstream systems/audits can see
    exactly which parameters produced a given set of output files.
    CLI-only helper.
    """
    trend_summary_df = results["trend_summary"]
    anomalies_df = results["anomalies"]

    metadata = {
        "configuration": {
            "moving_average_short_window_days": args.ma_short,
            "moving_average_long_window_days": args.ma_long,
            "z_score_rolling_window_days": args.z_window,
            "z_score_threshold": args.z_threshold,
            "severity_high_threshold": args.severity_high,
            "severity_critical_threshold": args.severity_critical,
            "min_observations": args.min_observations,
            "trend_threshold": args.trend_threshold,
        },
        "dataset": {
            "input_file": args.input,
            "total_incidents": int(trend_summary_df["daily_incidents"].sum()),
            "date_range_start": str(trend_summary_df["date"].min().date()),
            "date_range_end": str(trend_summary_df["date"].max().date()),
            "total_districts": int(trend_summary_df["district"].nunique()),
            "total_crime_types": int(trend_summary_df["crime_type"].nunique()),
        },
        "results": {
            "total_anomalies_detected": int(len(anomalies_df)),
        },
        "execution_time_seconds": round(elapsed_seconds, 2),
    }

    try:
        with open(args.metadata_output, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
        logger.info("Saved run metadata to '%s'.", args.metadata_output)
    except Exception as exc:
        print(f"ERROR: Failed to save '{args.metadata_output}': {exc}")
        sys.exit(1)


def print_summary(results: dict[str, pd.DataFrame], elapsed_seconds: float) -> None:
    """Print a high-level summary of the trend/anomaly detection run.
    CLI-only: a human-facing report, not reusable module logic.
    """
    trend_summary_df = results["trend_summary"]
    anomalies_df = results["anomalies"]
    statistics_df = results["statistics"]

    total_incidents = int(trend_summary_df["daily_incidents"].sum())
    total_districts = trend_summary_df["district"].nunique()
    total_crime_types = trend_summary_df["crime_type"].nunique()
    total_anomalies = len(anomalies_df)

    print("\n" + "=" * 60)
    print("TREND & ANOMALY DETECTION SUMMARY")
    print("=" * 60)
    print(f"Total incidents processed : {total_incidents}")
    print(f"Total districts           : {total_districts}")
    print(f"Total crime types         : {total_crime_types}")
    print(f"Total anomalies detected  : {total_anomalies}")

    if not anomalies_df.empty:
        largest_spike = anomalies_df.loc[anomalies_df["z_score"].abs().idxmax()]
        print(f"Largest spike             : {largest_spike['date'].date()} | "
              f"{largest_spike['district']} | {largest_spike['crime_type']} | "
              f"incidents={largest_spike['incident_count']} (expected ~{largest_spike['expected_count']}) | "
              f"z={largest_spike['z_score']} | severity={largest_spike['severity']}")
        most_affected_district = anomalies_df["district"].value_counts().idxmax()
        print(f"Most affected district    : {most_affected_district} "
              f"({(anomalies_df['district'] == most_affected_district).sum()} anomalies)")
    else:
        print("Largest spike             : N/A (no anomalies detected)")
        print("Most affected district    : N/A")

    if not statistics_df.empty:
        most_common_crime = statistics_df.groupby("crime_type")["total_incidents"].sum().idxmax()
        print(f"Most common crime         : {most_common_crime}")
    else:
        print("Most common crime         : N/A")

    print(f"Execution time            : {elapsed_seconds:.2f} seconds")
    print("=" * 60)


def main() -> None:
    """Thin CLI entry point: read CSV -> process(df) -> save outputs +
    metadata -> print summary.

    All the reusable logic lives in process(); this function only adds
    the file I/O and human-readable reporting needed for a standalone run.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    start_time = time.time()
    args = parse_args()

    df = load_dataset(args.input)

    try:
        results = process(
            df,
            ma_short=args.ma_short,
            ma_long=args.ma_long,
            z_window=args.z_window,
            z_threshold=args.z_threshold,
            severity_high=args.severity_high,
            severity_critical=args.severity_critical,
            min_observations=args.min_observations,
            trend_threshold=args.trend_threshold,
        )
    except (TrendAnomalyDetectorError, ValueError) as exc:
        print(f"ERROR: Trend/anomaly detection failed: {exc}")
        sys.exit(1)

    save_results(results, args)

    elapsed = time.time() - start_time
    save_metadata(args, results, elapsed)
    print_summary(results, elapsed)

    print(f"\nTotal execution time      : {elapsed:.2f} seconds")


if __name__ == "__main__":
    main()
