"""
risk_scoring_model.py

Crime Intelligence & Analytics Platform - District Risk Scoring Module

SECOND-STAGE AGGREGATOR: this module does not analyze raw incidents on its
own. It consumes the already-computed outputs of the upstream Hotspot
Clustering module and the upstream Trend Detection module (plus the raw
per-incident table) and combines them into a single normalized 0-100 risk
score per district, used to prioritize policing resources.

Reusable in-memory API
-----------------------
    process(
        incidents_df,       # per-incident data (see REQUIRED_COLUMNS["incidents"])
        cluster_stats_df,   # Hotspot Clustering process() output: per-cluster stats
        trend_stats_df,     # Trend Detection process() output: per district/crime_type stats
        anomalies_df,       # Trend Detection process() output: flagged anomalies
        trend_summary_df,   # OPTIONAL Trend Detection output: daily trend-strength summary
        spike_events_df,    # OPTIONAL Trend Detection output: grouped spike events
        weights,            # OPTIONAL feature-weight overrides
    ) -> (district_risk_scores_df, risk_feature_importance_df)

process() never reads from or writes to disk -- it is a pure, in-memory
transformation over DataFrames handed to it by the caller (or by the CLI
wrapper at the bottom of this file). See the module-level NOTE below for the
one behavioral adaptation this refactor required.

NOTE on hotspot_coverage_ratio (informational-only feature, not in
DEFAULT_WEIGHTS, does not affect risk_score):
    The previous CSV-based version computed this from a per-incident
    "crime_cluster_assignments.csv" file (fraction of a district's incidents
    whose row had cluster_id != -1). That per-incident assignment table is
    not part of the new explicit dependency surface (Hotspot Clustering's
    process() returns per-cluster stats, not a re-exposed per-incident
    assignment table). Since cluster_stats_df already carries
    'number_of_incidents' per cluster, and every clustered (non-noise)
    incident belongs to exactly one cluster row, the sum of
    'number_of_incidents' across a district's cluster rows is exactly the
    count of that district's clustered incidents -- the same numerator the
    old code computed, just sourced from the cluster-level table instead of
    the incident-level one. The denominator (district total incidents) now
    comes from trend_stats_df instead of the assignments file; both are
    expected to represent the same total. This is a plumbing adaptation, not
    a change to the risk-scoring mathematics, and it only affects an
    informational column that carries zero weight in the score.

Dependencies: pandas, numpy, argparse, logging, json, time
Run as a CLI (reads CSVs, calls process(), writes CSVs):
    python risk_scoring_model.py
    python risk_scoring_model.py --weight-total-incidents 0.30 --risk-high-max 70
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class RiskScoringError(Exception):
    """Raised for invalid inputs or unrecoverable business-rule violations
    (missing required columns, empty required data, no usable feature
    weights, invalid weights/thresholds, etc.). Callers should catch this
    instead of relying on process exit codes."""


# ----------------------------------------------------------------------------
# CONFIGURATION (defaults; overridable via CLI args or process() kwargs)
# ----------------------------------------------------------------------------
DEFAULT_INCIDENTS_INPUT = "synthetic_crimes.csv"
DEFAULT_CLUSTER_STATS_INPUT = "hotspot_clusters.csv"
DEFAULT_TREND_STATS_INPUT = "trend_statistics.csv"
DEFAULT_ANOMALIES_INPUT = "crime_anomalies.csv"

# Optional inputs - process() runs fine without these; the features they
# feed simply drop out of the weighted score and the remaining weights
# renormalize.
DEFAULT_TREND_SUMMARY_INPUT = "trend_summary.csv"
DEFAULT_SPIKE_EVENTS_INPUT = "spike_events.csv"

DEFAULT_SCORES_OUTPUT = "district_risk_scores.csv"
DEFAULT_IMPORTANCE_OUTPUT = "risk_feature_importance.csv"
DEFAULT_METADATA_OUTPUT = "risk_metadata.json"

NORMALIZATION_METHOD = "min_max"  # documented for metadata; only method implemented

# Default feature weights (must sum to 1.0). "trend_strength" and
# "repeat_offenders" are OPTIONAL - if their source data is unavailable,
# they are dropped and the remaining weights are renormalized to sum to 1.0.
DEFAULT_WEIGHTS: Dict[str, float] = {
    "total_incidents": 0.25,
    "average_hotspot_severity": 0.20,
    "trend_anomalies": 0.15,
    "crime_diversity": 0.10,
    "average_trend_strength": 0.10,   # optional (needs trend_summary_df)
    "average_z_score": 0.10,
    "average_hotspot_density": 0.05,
    "repeat_offender_percentage": 0.05,  # optional (needs repeat_offender column)
}
OPTIONAL_FEATURES = {"average_trend_strength", "repeat_offender_percentage"}

# Default risk-level thresholds (upper bound of each band, inclusive)
DEFAULT_RISK_LOW_MAX = 25.0
DEFAULT_RISK_MODERATE_MAX = 50.0
DEFAULT_RISK_HIGH_MAX = 75.0
# Critical = anything above risk_high_max, up to 100

WEIGHT_SUM_TOLERANCE = 1e-6

# Required columns per input DataFrame. Note there is no "assignments"
# entry: per-incident cluster membership is no longer a direct dependency
# of this module (see module docstring NOTE).
REQUIRED_COLUMNS: Dict[str, List[str]] = {
    "incidents": ["incident_id", "district", "crime_type"],
    "cluster_stats": ["cluster_id", "district", "severity_score", "density",
                       "cluster_radius_metres", "number_of_incidents"],
    "trend_stats": ["district", "crime_type", "total_incidents", "trend_direction"],
    "anomalies": ["district", "crime_type", "z_score", "severity"],
}


# ----------------------------------------------------------------------------
# VALIDATION (shared by process() and the CLI wrapper)
# ----------------------------------------------------------------------------
def _validate_required_columns(
    df: pd.DataFrame, required_cols: List[str], label: str, allow_empty: bool = False
) -> None:
    """
    Confirm `df` is a DataFrame containing every column in `required_cols`.

    Parameters
    ----------
    df : pd.DataFrame
    required_cols : List[str]
    label : str
        Human-readable name used in error messages.
    allow_empty : bool, default False
        If False (the default), `df` must also be non-empty -- this is
        for inputs that are structurally required to have rows
        (incidents_df, trend_stats_df). If True, a zero-row `df` is
        accepted as long as it still has every required column: some
        upstream analytical outputs (e.g. "zero hotspots detected",
        "zero anomalies detected") are legitimately empty, and that is
        valid analytical information, not a missing/malformed input.
        Column presence is still checked regardless of row count, so
        e.g. a bare `pd.DataFrame()` with no columns at all is still
        rejected even with allow_empty=True.

    Raises
    ------
    RiskScoringError
        If `df` is not a DataFrame, is missing required columns, or
        (when allow_empty is False) is empty.
    """
    if not isinstance(df, pd.DataFrame):
        raise RiskScoringError(f"'{label}' must be a pandas DataFrame, got {type(df).__name__}.")
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise RiskScoringError(f"'{label}' is missing required columns: {missing}")
    if df.empty and not allow_empty:
        raise RiskScoringError(f"'{label}' contains zero rows.")


def validate_inputs(
    incidents_df: pd.DataFrame,
    cluster_stats_df: pd.DataFrame,
    trend_stats_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    trend_summary_df: Optional[pd.DataFrame],
    spike_events_df: Optional[pd.DataFrame],
) -> Dict[str, bool]:
    """
    Validate every required input DataFrame and determine which optional
    features are usable given what was actually supplied.

    Parameters
    ----------
    incidents_df, cluster_stats_df, trend_stats_df, anomalies_df : pd.DataFrame
        Required inputs.
    trend_summary_df, spike_events_df : Optional[pd.DataFrame]
        Optional inputs; pass None (or an empty DataFrame) if unavailable.

    Returns
    -------
    Dict[str, bool]
        Availability flags: 'has_population_density', 'has_repeat_offender',
        'has_trend_summary', 'has_spike_events'.

    Raises
    ------
    RiskScoringError
        If incidents_df or trend_stats_df is missing, empty, or missing
        required columns. cluster_stats_df and anomalies_df may
        legitimately be empty (a valid DBSCAN run can find zero
        hotspots; a valid trend-analysis run can find zero anomalies -
        see their respective upstream modules), but are still rejected
        if they are missing required columns entirely.
    """
    logger.info("Validating input schemas...")

    _validate_required_columns(incidents_df, REQUIRED_COLUMNS["incidents"], "incidents_df")
    _validate_required_columns(
        cluster_stats_df, REQUIRED_COLUMNS["cluster_stats"], "cluster_stats_df", allow_empty=True
    )
    _validate_required_columns(trend_stats_df, REQUIRED_COLUMNS["trend_stats"], "trend_stats_df")
    _validate_required_columns(
        anomalies_df, REQUIRED_COLUMNS["anomalies"], "anomalies_df", allow_empty=True
    )

    has_trend_summary = (
        trend_summary_df is not None
        and isinstance(trend_summary_df, pd.DataFrame)
        and not trend_summary_df.empty
        and {"district", "trend_strength_pct"}.issubset(trend_summary_df.columns)
    )
    if trend_summary_df is not None and not (isinstance(trend_summary_df, pd.DataFrame) and trend_summary_df.empty) and not has_trend_summary:
        logger.info("trend_summary_df is present but missing required columns/rows "
                    "(district, trend_strength_pct); average_trend_strength will be excluded.")

    has_spike_events = (
        spike_events_df is not None
        and isinstance(spike_events_df, pd.DataFrame)
        and not spike_events_df.empty
        and "district" in spike_events_df.columns
    )
    if spike_events_df is not None and not (isinstance(spike_events_df, pd.DataFrame) and spike_events_df.empty) and not has_spike_events:
        logger.info("spike_events_df is present but missing a 'district' column; "
                    "number_of_spike_events will be excluded.")

    availability = {
        "has_population_density": "population_density" in incidents_df.columns,
        "has_repeat_offender": "repeat_offender" in incidents_df.columns,
        "has_trend_summary": has_trend_summary,
        "has_spike_events": has_spike_events,
    }

    logger.info("Schema validation complete. Feature availability: %s", availability)
    return availability


def _validate_weights(weights: Dict[str, float]) -> None:
    """
    Validate a feature-weight mapping.

    Raises
    ------
    RiskScoringError
        If `weights` is not a dict of the expected features, any weight is
        negative, or every weight is zero.
    """
    if not isinstance(weights, dict):
        raise RiskScoringError(f"weights must be a dict, got {type(weights).__name__}.")

    unknown = set(weights) - set(DEFAULT_WEIGHTS)
    if unknown:
        raise RiskScoringError(f"Unknown weight keys: {sorted(unknown)}. "
                                f"Expected a subset of: {sorted(DEFAULT_WEIGHTS)}")

    negative = [k for k, v in weights.items() if v < 0]
    if negative:
        raise RiskScoringError(f"Weights must be >= 0; negative for: {negative}")

    if sum(weights.values()) <= 0:
        raise RiskScoringError("At least one feature weight must be greater than 0.")


def _validate_thresholds(low_max: float, moderate_max: float, high_max: float) -> None:
    """
    Validate risk-level threshold ordering.

    Raises
    ------
    RiskScoringError
        If thresholds do not satisfy 0 < low_max < moderate_max < high_max < 100.
    """
    if not (0 < low_max < moderate_max < high_max < 100):
        raise RiskScoringError(
            "Risk thresholds must satisfy 0 < risk_low_max < risk_moderate_max < "
            f"risk_high_max < 100 (got {low_max}, {moderate_max}, {high_max})."
        )


# ----------------------------------------------------------------------------
# FEATURE PREPARATION
# ----------------------------------------------------------------------------
def _master_district_list(frames: List[Optional[pd.DataFrame]]) -> np.ndarray:
    """
    Build the definitive list of districts to score, as the union of every
    district value seen across all supplied DataFrames that have a
    'district' column. Using a union (rather than just incidents_df) guards
    against a district appearing only in a downstream table.

    Parameters
    ----------
    frames : List[Optional[pd.DataFrame]]

    Returns
    -------
    np.ndarray
        Sorted array of unique district names.
    """
    districts = set()
    for df in frames:
        if df is not None and isinstance(df, pd.DataFrame) and "district" in df.columns:
            districts.update(df["district"].dropna().unique().tolist())
    return np.array(sorted(districts))


def prepare_features(
    incidents_df: pd.DataFrame,
    cluster_stats_df: pd.DataFrame,
    trend_stats_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    trend_summary_df: Optional[pd.DataFrame],
    spike_events_df: Optional[pd.DataFrame],
    availability: Dict[str, bool],
) -> pd.DataFrame:
    """
    Build the per-district raw feature table by aggregating every input
    DataFrame. Districts absent from a given source default to 0 for that
    source's features (e.g. a district with no hotspot clusters gets
    number_of_hotspots = 0, average_hotspot_severity = 0).

    Features produced (raw, pre-normalization):
        - total_incidents            (trend_stats_df, summed per district)
        - crime_diversity            (trend_stats_df, unique crime_type count)
        - number_of_hotspots         (cluster_stats_df, cluster count)
        - average_hotspot_severity   (cluster_stats_df, mean severity_score)
        - average_hotspot_density    (cluster_stats_df, mean density)
        - average_hotspot_radius     (cluster_stats_df, mean cluster_radius_metres) [info only]
        - trend_anomalies            (anomalies_df, row count)
        - average_z_score            (anomalies_df, mean |z_score|)
        - average_trend_strength     (trend_summary_df, mean trend_strength_pct) [optional]
        - number_of_spike_events     (spike_events_df, row count) [optional, info only]
        - repeat_offender_percentage (incidents_df, mean(repeat_offender)*100) [optional]
        - crime_rate                 (total_incidents / avg population_density) [info only]
        - hotspot_coverage_ratio     (clustered incidents / total incidents) [info only;
                                       see module docstring NOTE on how this is now sourced]
        - dominant_trend_direction   (most common trend_direction across crime types) [info only]

    Parameters
    ----------
    incidents_df, cluster_stats_df, trend_stats_df, anomalies_df : pd.DataFrame
    trend_summary_df, spike_events_df : Optional[pd.DataFrame]
    availability : Dict[str, bool]
        Output of validate_inputs().

    Returns
    -------
    pd.DataFrame
        One row per district, containing all raw feature columns above
        (never NaN -- missing data is filled with 0).
    """
    logger.info("Preparing per-district features from all input sources...")

    master_districts = _master_district_list(
        [incidents_df, cluster_stats_df, trend_stats_df, anomalies_df, trend_summary_df, spike_events_df]
    )
    features = pd.DataFrame({"district": master_districts}).set_index("district")

    # --- total_incidents & crime_diversity (trend_stats_df) -----------------
    incidents_by_district = trend_stats_df.groupby("district")["total_incidents"].sum()
    diversity_by_district = trend_stats_df.groupby("district")["crime_type"].nunique()
    features["total_incidents"] = incidents_by_district.reindex(features.index).fillna(0)
    features["crime_diversity"] = diversity_by_district.reindex(features.index).fillna(0)

    # Dominant trend direction (most frequent across that district's crime types) - informational
    dominant_trend = (
        trend_stats_df.groupby("district")["trend_direction"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else "Stable")
    )
    features["dominant_trend_direction"] = dominant_trend.reindex(features.index).fillna("Stable")

    # --- hotspot features (cluster_stats_df) --------------------------------
    hotspot_agg = cluster_stats_df.groupby("district").agg(
        number_of_hotspots=("cluster_id", "count"),
        average_hotspot_severity=("severity_score", "mean"),
        average_hotspot_density=("density", "mean"),
        average_hotspot_radius=("cluster_radius_metres", "mean"),
        _clustered_incidents=("number_of_incidents", "sum"),
    )
    for col in ["number_of_hotspots", "average_hotspot_severity",
                "average_hotspot_density", "average_hotspot_radius"]:
        features[col] = hotspot_agg[col].reindex(features.index).fillna(0)

    # --- anomaly features (anomalies_df) ------------------------------------
    anomaly_agg = anomalies_df.groupby("district").agg(
        trend_anomalies=("z_score", "count"),
        average_z_score=("z_score", lambda s: s.abs().mean()),
    )
    features["trend_anomalies"] = anomaly_agg["trend_anomalies"].reindex(features.index).fillna(0)
    features["average_z_score"] = anomaly_agg["average_z_score"].reindex(features.index).fillna(0)

    # --- optional: average_trend_strength (trend_summary_df) ---------------
    if availability["has_trend_summary"]:
        strength_by_district = trend_summary_df.groupby("district")["trend_strength_pct"].mean()
        features["average_trend_strength"] = strength_by_district.reindex(features.index).fillna(0)
    else:
        features["average_trend_strength"] = 0.0

    # --- optional: number_of_spike_events (spike_events_df) - info only ----
    if availability["has_spike_events"]:
        spikes_by_district = spike_events_df.groupby("district").size()
        features["number_of_spike_events"] = spikes_by_district.reindex(features.index).fillna(0)
    else:
        features["number_of_spike_events"] = 0

    # --- optional: repeat_offender_percentage (incidents_df) ---------------
    if availability["has_repeat_offender"]:
        # repeat_offender may be stored as bool or string ("True"/"False") depending
        # on how the upstream table was produced; coerce robustly to a 0/1 float.
        repeat_flag = incidents_df["repeat_offender"]
        if repeat_flag.dtype == object:
            repeat_flag = repeat_flag.astype(str).str.strip().str.lower().map(
                {"true": 1.0, "false": 0.0, "1": 1.0, "0": 0.0}
            )
        else:
            repeat_flag = repeat_flag.astype(float)
        incidents_with_flag = incidents_df.assign(_repeat_flag=repeat_flag)
        repeat_pct = incidents_with_flag.groupby("district")["_repeat_flag"].mean() * 100.0
        features["repeat_offender_percentage"] = repeat_pct.reindex(features.index).fillna(0)
    else:
        features["repeat_offender_percentage"] = 0.0

    # --- crime_rate proxy (incidents_df population_density) - info only ----
    if availability["has_population_density"]:
        density_by_district = incidents_df.groupby("district")["population_density"].mean()
        density_aligned = density_by_district.reindex(features.index)
        # Avoid division by zero / missing density: safe divide -> 0 where density is 0 or NaN
        safe_density = density_aligned.replace(0, np.nan)
        crime_rate = (features["total_incidents"] / safe_density).fillna(0)
        features["crime_rate"] = crime_rate
    else:
        features["crime_rate"] = 0.0

    # --- hotspot_coverage_ratio - info only ---------------------------------
    # Numerator: incidents belonging to a real (non-noise) cluster, i.e. the
    # sum of cluster_stats_df's 'number_of_incidents' per district (computed
    # above as _clustered_incidents). Denominator: district total_incidents
    # from trend_stats_df. See module docstring NOTE for why this replaces
    # the old per-incident assignments file. Both should represent the same
    # underlying incident population.
    clustered = hotspot_agg["_clustered_incidents"].reindex(features.index).fillna(0)
    safe_total = features["total_incidents"].replace(0, np.nan)
    coverage = (clustered / safe_total).fillna(0)
    features["hotspot_coverage_ratio"] = coverage

    logger.info("Prepared feature table for %d districts.", len(features))
    return features.reset_index()


# ----------------------------------------------------------------------------
# NORMALIZATION
# ----------------------------------------------------------------------------
def _min_max_normalize(series: pd.Series) -> pd.Series:
    """
    Min-Max scale a numeric Series to [0, 1].

    If every value in the series is identical (range == 0), normalization is
    mathematically undefined; rather than dividing by zero, every district
    is given a neutral score of 0.5 so this feature contributes no
    differentiating signal to the composite score (it neither penalizes nor
    rewards any district, since none stands out from the others).

    Parameters
    ----------
    series : pd.Series
        Raw numeric feature values.

    Returns
    -------
    pd.Series
        Normalized values in [0, 1].
    """
    series = series.astype(float)
    min_val = series.min()
    max_val = series.max()
    value_range = max_val - min_val

    if value_range == 0 or pd.isna(value_range):
        return pd.Series(0.5, index=series.index)

    return (series - min_val) / value_range


def normalize_features(features: pd.DataFrame, weight_features: List[str]) -> pd.DataFrame:
    """
    Apply Min-Max normalization to every feature used in the weighted score.

    Parameters
    ----------
    features : pd.DataFrame
        Raw per-district feature table (output of prepare_features()).
    weight_features : List[str]
        Names of the feature columns that participate in the weighted score.

    Returns
    -------
    pd.DataFrame
        Copy of `features` with additional '<feature>_normalized' columns.
    """
    logger.info("Normalizing %d scoring features using min-max scaling...", len(weight_features))

    features = features.copy()
    for feature in weight_features:
        features[f"{feature}_normalized"] = _min_max_normalize(features[feature])

    return features


# ----------------------------------------------------------------------------
# RISK SCORING
# ----------------------------------------------------------------------------
def _renormalize_weights(
    configured_weights: Dict[str, float], availability: Dict[str, bool]
) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    Drop weights for unavailable optional features and renormalize the
    remaining weights so they sum to 1.0.

    Parameters
    ----------
    configured_weights : Dict[str, float]
        The user-configured (or default) weights, keyed by feature name.
    availability : Dict[str, bool]
        Feature-availability flags from validate_inputs().

    Returns
    -------
    Tuple[Dict[str, float], Dict[str, float]]
        (active_weights, all_configured_weights) -- active_weights contains
        only the features actually used, renormalized to sum to 1.0;
        all_configured_weights is the original input, unchanged (used for
        transparent feature-importance reporting).

    Raises
    ------
    RiskScoringError
        If, after dropping unavailable features, no weight mass remains.
    """
    feature_available = {
        "total_incidents": True,
        "average_hotspot_severity": True,
        "trend_anomalies": True,
        "crime_diversity": True,
        "average_trend_strength": availability["has_trend_summary"],
        "average_z_score": True,
        "average_hotspot_density": True,
        "repeat_offender_percentage": availability["has_repeat_offender"],
    }

    active = {
        feat: w for feat, w in configured_weights.items()
        if feature_available.get(feat, False) and w > 0
    }

    dropped = [f for f in configured_weights if f not in active]
    if dropped:
        logger.info("Excluding unavailable/zero-weight features from scoring: %s", dropped)

    total_weight = sum(active.values())
    if total_weight <= 0:
        raise RiskScoringError("No usable feature weights remain after excluding unavailable features.")

    renormalized = {feat: w / total_weight for feat, w in active.items()}
    return renormalized, configured_weights


def calculate_risk_scores(features: pd.DataFrame, active_weights: Dict[str, float]) -> pd.DataFrame:
    """
    Compute the weighted composite risk score (0-100) per district.

    score = 100 * sum(normalized_feature[f] * active_weight[f] for f in active_weights)

    The result is clipped to [0, 100] as a final safety net (it should
    already fall in that range given normalized inputs in [0, 1] and weights
    summing to 1.0, but floating-point edge cases are guarded against
    explicitly per the "risk scores must always remain between 0 and 100"
    requirement).

    Parameters
    ----------
    features : pd.DataFrame
        Must contain '<feature>_normalized' columns for every key in
        active_weights.
    active_weights : Dict[str, float]
        Renormalized weights (sum to 1.0), keyed by raw feature name.

    Returns
    -------
    pd.DataFrame
        `features` with a 'risk_score' column added.
    """
    logger.info("Calculating weighted composite risk scores...")

    features = features.copy()
    weighted_sum = pd.Series(0.0, index=features.index)

    for feature, weight in active_weights.items():
        weighted_sum += features[f"{feature}_normalized"] * weight

    features["risk_score"] = (weighted_sum * 100.0).clip(lower=0.0, upper=100.0).round(2)
    return features


def assign_risk_levels(
    features: pd.DataFrame, low_max: float, moderate_max: float, high_max: float
) -> pd.DataFrame:
    """
    Classify each district's risk_score into Low / Moderate / High / Critical
    bands using configurable thresholds (vectorized, no row-wise apply).

    Parameters
    ----------
    features : pd.DataFrame
        Must contain 'risk_score'.
    low_max, moderate_max, high_max : float
        Upper bounds (inclusive) of the Low, Moderate, and High bands.
        Critical = anything above high_max.

    Returns
    -------
    pd.DataFrame
        `features` with a 'risk_level' column added.
    """
    logger.info("Assigning risk levels (Low<= %s, Moderate<= %s, High<= %s, Critical> %s)...",
                low_max, moderate_max, high_max, high_max)

    features = features.copy()
    conditions = [
        features["risk_score"] <= low_max,
        features["risk_score"] <= moderate_max,
        features["risk_score"] <= high_max,
    ]
    choices = ["Low", "Moderate", "High"]
    features["risk_level"] = np.select(conditions, choices, default="Critical")
    return features


def generate_feature_importance(
    all_configured_weights: Dict[str, float], active_weights: Dict[str, float]
) -> pd.DataFrame:
    """
    Build the feature-importance report showing each feature's originally
    configured weight alongside the actually-used (renormalized) weight.
    Excluded features show normalized_weight = 0.0, making it explicit that
    they did not contribute to the final score.

    Parameters
    ----------
    all_configured_weights : Dict[str, float]
        Every feature's configured weight, before any exclusion.
    active_weights : Dict[str, float]
        Renormalized weights actually used (sums to 1.0).

    Returns
    -------
    pd.DataFrame
        Columns: feature, weight, normalized_weight. Sorted by normalized_weight
        descending.
    """
    logger.info("Generating feature importance report...")

    records = []
    for feature, configured_weight in all_configured_weights.items():
        records.append({
            "feature": feature,
            "weight": round(configured_weight, 4),
            "normalized_weight": round(active_weights.get(feature, 0.0), 4),
        })

    importance_df = pd.DataFrame(records).sort_values(
        "normalized_weight", ascending=False
    ).reset_index(drop=True)
    return importance_df


# ----------------------------------------------------------------------------
# PUBLIC IN-MEMORY API
# ----------------------------------------------------------------------------
def process(
    incidents_df: pd.DataFrame,
    cluster_stats_df: pd.DataFrame,
    trend_stats_df: pd.DataFrame,
    anomalies_df: pd.DataFrame,
    trend_summary_df: Optional[pd.DataFrame] = None,
    spike_events_df: Optional[pd.DataFrame] = None,
    weights: Optional[Dict[str, float]] = None,
    risk_low_max: float = DEFAULT_RISK_LOW_MAX,
    risk_moderate_max: float = DEFAULT_RISK_MODERATE_MAX,
    risk_high_max: float = DEFAULT_RISK_HIGH_MAX,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Compute district risk scores from upstream module outputs, entirely
    in-memory.

    This is a SECOND-STAGE aggregator: it must be called with the outputs
    of Hotspot Clustering's process() (`cluster_stats_df`) and Trend
    Detection's process() (`trend_stats_df`, `anomalies_df`, and optionally
    `trend_summary_df` / `spike_events_df`), plus the raw per-incident table
    (`incidents_df`). See the mapping table in this module's accompanying
    documentation for exactly which upstream output feeds which argument.

    Parameters
    ----------
    incidents_df : pd.DataFrame
        Per-incident data. Required columns: incident_id, district,
        crime_type. Optional columns 'population_density' and
        'repeat_offender' unlock additional (still-weighted) features.
    cluster_stats_df : pd.DataFrame
        Hotspot Clustering's per-cluster output. Required columns:
        cluster_id, district, severity_score, density,
        cluster_radius_metres, number_of_incidents.
    trend_stats_df : pd.DataFrame
        Trend Detection's per district/crime_type output. Required columns:
        district, crime_type, total_incidents, trend_direction.
    anomalies_df : pd.DataFrame
        Trend Detection's flagged-anomalies output. Required columns:
        district, crime_type, z_score, severity.
    trend_summary_df : Optional[pd.DataFrame]
        Trend Detection's optional daily trend-strength summary. If
        provided, must contain 'district' and 'trend_strength_pct' to be
        used; otherwise average_trend_strength defaults to 0 and its weight
        is dropped/renormalized away.
    spike_events_df : Optional[pd.DataFrame]
        Trend Detection's optional grouped spike-events output. If
        provided, must contain 'district' to be used; otherwise
        number_of_spike_events defaults to 0 (informational only).
    weights : Optional[Dict[str, float]]
        Feature weight overrides, keyed by feature name (see
        DEFAULT_WEIGHTS for valid keys). Defaults to DEFAULT_WEIGHTS.
        Weights for features whose source data is unavailable are dropped
        and the rest are renormalized to sum to 1.0.
    risk_low_max, risk_moderate_max, risk_high_max : float
        Upper bounds (inclusive) of the Low / Moderate / High risk bands.
        Critical = anything above risk_high_max.

    Returns
    -------
    Tuple[pd.DataFrame, pd.DataFrame]
        1. district_risk_scores: one row per district, sorted by risk_score
           descending, with 'risk_score' (0-100) and 'risk_level' plus all
           underlying raw features.
        2. risk_feature_importance: one row per configured feature, with
           its originally configured weight and its actually-used
           (renormalized) weight.

    Raises
    ------
    RiskScoringError
        If any required DataFrame is missing/empty/malformed, if `weights`
        contains unknown keys, negative values, or sums to zero usable
        weight, or if the risk thresholds are not strictly increasing
        within (0, 100).
    """
    weights = dict(DEFAULT_WEIGHTS) if weights is None else dict(weights)
    _validate_weights(weights)
    _validate_thresholds(risk_low_max, risk_moderate_max, risk_high_max)

    # Fill in any feature not present in a partial `weights` override with 0,
    # so downstream logic can always assume the full key set exists.
    configured_weights = {feat: weights.get(feat, 0.0) for feat in DEFAULT_WEIGHTS}

    availability = validate_inputs(
        incidents_df, cluster_stats_df, trend_stats_df, anomalies_df,
        trend_summary_df, spike_events_df,
    )

    features = prepare_features(
        incidents_df, cluster_stats_df, trend_stats_df, anomalies_df,
        trend_summary_df, spike_events_df, availability,
    )

    active_weights, all_configured_weights = _renormalize_weights(configured_weights, availability)

    features = normalize_features(features, list(active_weights.keys()))
    features = calculate_risk_scores(features, active_weights)
    features = assign_risk_levels(features, risk_low_max, risk_moderate_max, risk_high_max)

    importance_df = generate_feature_importance(all_configured_weights, active_weights)

    scores_df = features.sort_values("risk_score", ascending=False).reset_index(drop=True)

    logger.info("Scored %d districts (avg=%.2f, min=%.2f, max=%.2f).",
                len(scores_df), scores_df["risk_score"].mean(),
                scores_df["risk_score"].min(), scores_df["risk_score"].max())

    return scores_df, importance_df


# ============================================================================
# CLI WRAPPER (optional) -- reads CSVs from disk, calls process(), writes
# CSVs/JSON to disk. None of this code runs when process() is imported and
# called directly; it exists only for `python risk_scoring_model.py`.
# ============================================================================
def parse_args() -> argparse.Namespace:
    """
    Parse command-line arguments for input/output paths, feature weights,
    and risk-level thresholds.

    Returns
    -------
    argparse.Namespace
    """
    parser = argparse.ArgumentParser(
        description="District risk scoring for the Crime Intelligence Platform."
    )

    # Required input files
    parser.add_argument("--incidents-input", type=str, default=DEFAULT_INCIDENTS_INPUT)
    parser.add_argument("--cluster-stats-input", type=str, default=DEFAULT_CLUSTER_STATS_INPUT)
    parser.add_argument("--trend-stats-input", type=str, default=DEFAULT_TREND_STATS_INPUT)
    parser.add_argument("--anomalies-input", type=str, default=DEFAULT_ANOMALIES_INPUT)

    # Optional input files
    parser.add_argument("--trend-summary-input", type=str, default=DEFAULT_TREND_SUMMARY_INPUT)
    parser.add_argument("--spike-events-input", type=str, default=DEFAULT_SPIKE_EVENTS_INPUT)

    # Outputs
    parser.add_argument("--output-scores", type=str, default=DEFAULT_SCORES_OUTPUT)
    parser.add_argument("--output-importance", type=str, default=DEFAULT_IMPORTANCE_OUTPUT)
    parser.add_argument("--output-metadata", type=str, default=DEFAULT_METADATA_OUTPUT)

    # Weights
    parser.add_argument("--weight-total-incidents", type=float,
                         default=DEFAULT_WEIGHTS["total_incidents"])
    parser.add_argument("--weight-hotspot-severity", type=float,
                         default=DEFAULT_WEIGHTS["average_hotspot_severity"])
    parser.add_argument("--weight-trend-anomalies", type=float,
                         default=DEFAULT_WEIGHTS["trend_anomalies"])
    parser.add_argument("--weight-crime-diversity", type=float,
                         default=DEFAULT_WEIGHTS["crime_diversity"])
    parser.add_argument("--weight-trend-strength", type=float,
                         default=DEFAULT_WEIGHTS["average_trend_strength"])
    parser.add_argument("--weight-avg-zscore", type=float,
                         default=DEFAULT_WEIGHTS["average_z_score"])
    parser.add_argument("--weight-hotspot-density", type=float,
                         default=DEFAULT_WEIGHTS["average_hotspot_density"])
    parser.add_argument("--weight-repeat-offenders", type=float,
                         default=DEFAULT_WEIGHTS["repeat_offender_percentage"])

    # Risk thresholds (upper bound of Low / Moderate / High; Critical is above High)
    parser.add_argument("--risk-low-max", type=float, default=DEFAULT_RISK_LOW_MAX)
    parser.add_argument("--risk-moderate-max", type=float, default=DEFAULT_RISK_MODERATE_MAX)
    parser.add_argument("--risk-high-max", type=float, default=DEFAULT_RISK_HIGH_MAX)

    parser.add_argument("--log-level", type=str, default="INFO",
                         choices=["DEBUG", "INFO", "WARNING", "ERROR"])

    return parser.parse_args()


def _weights_from_args(args: argparse.Namespace) -> Dict[str, float]:
    """Build the configured (pre-renormalization) weights dict from CLI args."""
    return {
        "total_incidents": args.weight_total_incidents,
        "average_hotspot_severity": args.weight_hotspot_severity,
        "trend_anomalies": args.weight_trend_anomalies,
        "crime_diversity": args.weight_crime_diversity,
        "average_trend_strength": args.weight_trend_strength,
        "average_z_score": args.weight_avg_zscore,
        "average_hotspot_density": args.weight_hotspot_density,
        "repeat_offender_percentage": args.weight_repeat_offenders,
    }


def _read_required_csv(path: str, label: str) -> pd.DataFrame:
    """
    Read a required CSV file for the CLI wrapper.

    Parameters
    ----------
    path : str
        File path.
    label : str
        Human-readable name used in error messages.

    Returns
    -------
    pd.DataFrame

    Raises
    ------
    RiskScoringError
        If the file is missing, unreadable, or empty.
    """
    if not os.path.exists(path):
        raise RiskScoringError(f"Required input '{label}' not found at '{path}'.")
    try:
        df = pd.read_csv(path)
    except pd.errors.EmptyDataError as exc:
        raise RiskScoringError(f"Required input '{label}' at '{path}' is empty.") from exc
    except Exception as exc:
        raise RiskScoringError(f"Failed to read required input '{label}' at '{path}': {exc}") from exc

    if df.empty:
        raise RiskScoringError(f"Required input '{label}' at '{path}' contains zero rows.")

    logger.info("Loaded required input '%s': %d rows from '%s'.", label, len(df), path)
    return df


def _read_optional_csv(path: str, label: str) -> Optional[pd.DataFrame]:
    """
    Read an optional CSV file for the CLI wrapper. Returns None (with a
    log message) if the file is missing, unreadable, or empty -- this is
    not fatal, since optional features gracefully default to zero / drop
    out of the weighted score.

    Parameters
    ----------
    path : str
        File path.
    label : str
        Human-readable name used in log messages.

    Returns
    -------
    Optional[pd.DataFrame]
    """
    if not os.path.exists(path):
        logger.info("Optional input '%s' not found at '%s'; related features will "
                    "default to zero and be excluded from scoring.", label, path)
        return None
    try:
        df = pd.read_csv(path)
        if df.empty:
            logger.info("Optional input '%s' at '%s' is empty; skipping.", label, path)
            return None
        logger.info("Loaded optional input '%s': %d rows from '%s'.", label, len(df), path)
        return df
    except Exception as exc:
        logger.info("Failed to read optional input '%s' at '%s' (%s); skipping.", label, path, exc)
        return None


def save_results(scores_df: pd.DataFrame, importance_df: pd.DataFrame,
                  scores_path: str, importance_path: str) -> None:
    """
    Persist district_risk_scores.csv and risk_feature_importance.csv.

    Parameters
    ----------
    scores_df : pd.DataFrame
        Output of process() (first element of the returned tuple).
    importance_df : pd.DataFrame
        Output of process() (second element of the returned tuple).
    scores_path, importance_path : str
        Output file paths.

    Raises
    ------
    RiskScoringError
        If either file fails to write.
    """
    required_output_cols = [
        "district", "risk_score", "risk_level", "total_incidents",
        "number_of_hotspots", "trend_anomalies", "average_hotspot_severity",
        "average_trend_strength", "average_z_score", "crime_diversity",
    ]
    extra_info_cols = [
        "average_hotspot_density", "average_hotspot_radius", "repeat_offender_percentage",
        "crime_rate", "hotspot_coverage_ratio", "number_of_spike_events", "dominant_trend_direction",
    ]
    output_cols = required_output_cols + [c for c in extra_info_cols if c in scores_df.columns]

    try:
        scores_df.to_csv(scores_path, index=False, columns=output_cols)
        logger.info("Saved district risk scores to '%s' (%d rows).", scores_path, len(scores_df))
    except Exception as exc:
        raise RiskScoringError(f"Failed to save '{scores_path}': {exc}") from exc

    try:
        importance_df.to_csv(importance_path, index=False)
        logger.info("Saved feature importance to '%s' (%d rows).", importance_path, len(importance_df))
    except Exception as exc:
        raise RiskScoringError(f"Failed to save '{importance_path}': {exc}") from exc


def save_metadata(
    args: argparse.Namespace, scores_df: pd.DataFrame,
    all_configured_weights: Dict[str, float], active_weights: Dict[str, float],
    elapsed_seconds: float
) -> None:
    """
    Write risk_metadata.json capturing input files, configured weights,
    thresholds, and top-level dataset statistics for auditability.

    Parameters
    ----------
    args : argparse.Namespace
    scores_df : pd.DataFrame
    all_configured_weights, active_weights : Dict[str, float]
    elapsed_seconds : float

    Raises
    ------
    RiskScoringError
        If the file fails to write.
    """
    metadata = {
        "input_files": {
            "incidents": args.incidents_input,
            "cluster_stats": args.cluster_stats_input,
            "trend_statistics": args.trend_stats_input,
            "crime_anomalies": args.anomalies_input,
            "trend_summary_optional": args.trend_summary_input,
            "spike_events_optional": args.spike_events_input,
        },
        "normalization_method": NORMALIZATION_METHOD,
        "weights": {
            "configured": {k: round(v, 4) for k, v in all_configured_weights.items()},
            "active_renormalized": {k: round(v, 4) for k, v in active_weights.items()},
        },
        "risk_thresholds": {
            "low_max": args.risk_low_max,
            "moderate_max": args.risk_moderate_max,
            "high_max": args.risk_high_max,
        },
        "dataset_statistics": {
            "districts_scored": int(len(scores_df)),
            "average_risk_score": round(float(scores_df["risk_score"].mean()), 2),
            "min_risk_score": round(float(scores_df["risk_score"].min()), 2),
            "max_risk_score": round(float(scores_df["risk_score"].max()), 2),
            "risk_level_distribution": scores_df["risk_level"].value_counts().to_dict(),
        },
        "execution_time_seconds": round(elapsed_seconds, 2),
    }

    try:
        with open(args.output_metadata, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2)
        logger.info("Saved run metadata to '%s'.", args.output_metadata)
    except Exception as exc:
        raise RiskScoringError(f"Failed to save '{args.output_metadata}': {exc}") from exc


def print_summary(scores_df: pd.DataFrame, elapsed_seconds: float) -> None:
    """
    Print a high-level summary of the risk scoring run.

    Parameters
    ----------
    scores_df : pd.DataFrame
        Must contain 'district', 'risk_score', 'risk_level'; assumed sorted
        by risk_score descending (as process() returns it).
    elapsed_seconds : float
    """
    highest = scores_df.iloc[0]
    lowest = scores_df.iloc[-1]

    print("\n" + "=" * 60)
    print("DISTRICT RISK SCORING SUMMARY")
    print("=" * 60)
    print(f"Districts processed       : {len(scores_df)}")
    print(f"Highest-risk district     : {highest['district']} "
          f"(score={highest['risk_score']}, level={highest['risk_level']})")
    print(f"Lowest-risk district      : {lowest['district']} "
          f"(score={lowest['risk_score']}, level={lowest['risk_level']})")
    print(f"Average risk score        : {scores_df['risk_score'].mean():.2f}")
    print(f"Risk level distribution   : {scores_df['risk_level'].value_counts().to_dict()}")
    print(f"Execution time            : {elapsed_seconds:.2f} seconds")
    print("=" * 60)


def main() -> None:
    """
    CLI entry point:
        1. Parse + validate CLI args
        2. Read all required/optional CSVs from disk
        3. Call process() (pure in-memory computation)
        4. Save outputs + metadata to disk
        5. Print summary

    Any failure raises RiskScoringError (or another exception); this
    function does not call sys.exit(). When run as a script, an uncaught
    exception naturally terminates the process with a non-zero exit code
    and a full traceback.
    """
    start_time = time.time()

    args = parse_args()
    logging.basicConfig(level=getattr(logging, args.log_level), format="%(levelname)s: %(message)s")

    configured_weights = _weights_from_args(args)
    _validate_weights(configured_weights)
    _validate_thresholds(args.risk_low_max, args.risk_moderate_max, args.risk_high_max)

    logger.info("Loading input datasets...")
    incidents_df = _read_required_csv(args.incidents_input, "incidents")
    cluster_stats_df = _read_required_csv(args.cluster_stats_input, "cluster_stats")
    trend_stats_df = _read_required_csv(args.trend_stats_input, "trend_statistics")
    anomalies_df = _read_required_csv(args.anomalies_input, "crime_anomalies")
    trend_summary_df = _read_optional_csv(args.trend_summary_input, "trend_summary")
    spike_events_df = _read_optional_csv(args.spike_events_input, "spike_events")

    # process() re-validates and re-derives active/renormalized weights
    # internally; recomputed here too so the CLI can report/persist them.
    availability = validate_inputs(
        incidents_df, cluster_stats_df, trend_stats_df, anomalies_df,
        trend_summary_df, spike_events_df,
    )
    active_weights, all_configured_weights = _renormalize_weights(configured_weights, availability)

    scores_df, importance_df = process(
        incidents_df=incidents_df,
        cluster_stats_df=cluster_stats_df,
        trend_stats_df=trend_stats_df,
        anomalies_df=anomalies_df,
        trend_summary_df=trend_summary_df,
        spike_events_df=spike_events_df,
        weights=configured_weights,
        risk_low_max=args.risk_low_max,
        risk_moderate_max=args.risk_moderate_max,
        risk_high_max=args.risk_high_max,
    )

    save_results(scores_df, importance_df, args.output_scores, args.output_importance)

    elapsed = time.time() - start_time
    save_metadata(args, scores_df, all_configured_weights, active_weights, elapsed)
    print_summary(scores_df, elapsed)


if __name__ == "__main__":
    main()
