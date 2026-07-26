"""
hotspot_clustering.py

Crime Intelligence & Analytics Platform - Spatial Hotspot Clustering Module

Identifies spatial crime hotspots using DBSCAN with Haversine distance
(BallTree-backed).

Public interface (for use by the batch pipeline or any other caller):

    process(df, eps_meters=300, min_samples=10) -> (assignments_df, cluster_stats_df)

`process()` takes an already-loaded pandas DataFrame, performs no file I/O,
never calls sys.exit(), and raises exceptions on bad input/parameters
instead. It returns two DataFrames rather than writing anything to disk.

A thin CLI wrapper (`main()`) is kept for standalone/manual runs:
    read CSV -> process(df) -> save outputs -> print summary

Run standalone:
    python hotspot_clustering.py
    python hotspot_clustering.py --eps 250 --min-samples 15
    python hotspot_clustering.py --input synthetic_crimes.csv --eps 300 --min-samples 10

Dependencies: pandas, numpy, scikit-learn, math, argparse, logging, time
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
import time

import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------------
# EXCEPTIONS
# ----------------------------------------------------------------------------


class HotspotClusteringError(Exception):
    """Raised when hotspot clustering cannot proceed because the input
    data or parameters are invalid. Callers (e.g. the batch pipeline)
    are expected to catch this rather than have the process killed by
    sys.exit()."""


# ----------------------------------------------------------------------------
# CONFIGURATION (defaults; overridable via CLI args or process() kwargs)
# ----------------------------------------------------------------------------

DEFAULT_INPUT_FILE = "synthetic_crimes.csv"
DEFAULT_CLUSTERS_OUTPUT_FILE = "hotspot_clusters.csv"
DEFAULT_ASSIGNMENTS_OUTPUT_FILE = "crime_cluster_assignments.csv"

EARTH_RADIUS_METERS = 6_371_000.0

DEFAULT_DBSCAN_EPS_METERS = 300.0     # neighbourhood radius in metres
DEFAULT_DBSCAN_MIN_SAMPLES = 10       # minimum incidents to form a dense cluster

RADIUS_PERCENTILE = 95.0              # percentile used for the "official" cluster radius,
                                       # to avoid a single outlier point blowing up the size

REQUIRED_COLUMNS = [
    "incident_id", "crime_type", "district",
    "latitude", "longitude", "occurrence_datetime",
]
OPTIONAL_COLUMNS = ["offender_id"]  # used for unique_offenders stat if present

VALID_LAT_RANGE = (-90.0, 90.0)
VALID_LON_RANGE = (-180.0, 180.0)

# Minimum sane bound for DBSCAN's min_samples. sklearn technically accepts 1,
# but a "cluster" of 1 point is meaningless for hotspot detection.
MIN_ALLOWED_MIN_SAMPLES = 2

# Severity weights per crime type. Homicide/Kidnapping/Robbery/Assault/Theft
# values come from the requested spec; the remaining crime types (present in
# this dataset's generator) are filled in at defensible intermediate values
# so severity_score never silently ends up NaN for a hotspot.
CRIME_SEVERITY_WEIGHTS = {
    "Homicide": 10,
    "Kidnapping": 8,
    "Robbery": 5,
    "Assault": 3,
    "Burglary": 3,
    "Vehicle Theft": 2,
    "Fraud": 2,
    "Cyber Crime": 2,
    "Drug Offense": 4,
    "Theft": 1,
}
DEFAULT_SEVERITY_WEIGHT = 1  # fallback for any unrecognized crime_type


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
    HotspotClusteringError
        If ``df`` is None, not a DataFrame, empty, or missing required
        columns.
    """
    if df is None:
        raise HotspotClusteringError("Input DataFrame is None.")
    if not isinstance(df, pd.DataFrame):
        raise HotspotClusteringError(
            f"Expected a pandas DataFrame, got {type(df).__name__}."
        )
    if df.empty:
        raise HotspotClusteringError("Input DataFrame contains zero rows.")

    missing_cols = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing_cols:
        raise HotspotClusteringError(
            f"Missing required columns in input DataFrame: {missing_cols}"
        )


def _validate_dbscan_params(eps_meters: float, min_samples: int) -> None:
    """Validate DBSCAN parameters before any processing begins, so bad
    input fails fast with a clear message instead of surfacing as a
    confusing error deep inside sklearn.

    Parameters
    ----------
    eps_meters : float
    min_samples : int

    Raises
    ------
    ValueError
        If eps_meters <= 0 or min_samples < MIN_ALLOWED_MIN_SAMPLES.
    """
    errors = []

    if eps_meters <= 0:
        errors.append(f"eps_meters must be > 0 (got {eps_meters}).")

    if min_samples < MIN_ALLOWED_MIN_SAMPLES:
        errors.append(
            f"min_samples must be >= {MIN_ALLOWED_MIN_SAMPLES} (got {min_samples})."
        )

    if errors:
        raise ValueError("Invalid DBSCAN parameters: " + " ".join(errors))


# ----------------------------------------------------------------------------
# CLEANING
# ----------------------------------------------------------------------------


def clean_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    """Remove rows with missing or invalid latitude/longitude values.

    Steps performed:
        1. Coerce latitude/longitude to numeric (invalid parses -> NaN).
        2. Drop rows where latitude or longitude is NaN.
        3. Validate that latitude is within [-90, 90] and longitude within
           [-180, 180]; drop rows that fail validation.
        4. Parse occurrence_datetime into a proper datetime dtype (rows that
           fail to parse are dropped, since first/last incident dates rely
           on valid timestamps).
        5. Drop rows missing an incident_id.

    Parameters
    ----------
    df : pd.DataFrame
        Raw crime dataset (must already contain REQUIRED_COLUMNS).

    Returns
    -------
    pd.DataFrame
        Cleaned dataset containing only valid, usable rows.

    Raises
    ------
    HotspotClusteringError
        If no valid rows remain after cleaning.
    """
    logger.info("Cleaning and validating coordinates...")
    initial_count = len(df)

    df = df.copy()

    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df = df.dropna(subset=["latitude", "longitude"])

    lat_valid = df["latitude"].between(*VALID_LAT_RANGE)
    lon_valid = df["longitude"].between(*VALID_LON_RANGE)
    df = df[lat_valid & lon_valid]

    df["occurrence_datetime"] = pd.to_datetime(df["occurrence_datetime"], errors="coerce")
    df = df.dropna(subset=["occurrence_datetime"])

    df = df.dropna(subset=["incident_id"])

    df = df.reset_index(drop=True)

    removed = initial_count - len(df)
    logger.info("Removed %d invalid/incomplete rows. %d rows remain.", removed, len(df))

    if df.empty:
        raise HotspotClusteringError(
            "No valid rows remain after cleaning latitude/longitude/"
            "occurrence_datetime/incident_id."
        )

    return df


# ----------------------------------------------------------------------------
# CLUSTERING (DBSCAN + Haversine - algorithm unchanged)
# ----------------------------------------------------------------------------


def haversine_distance_vectorized(
    lat1: float, lon1: float, lat2_arr: np.ndarray, lon2_arr: np.ndarray
) -> np.ndarray:
    """Vectorized Haversine distance from a single reference point to an
    array of points, all given in decimal degrees.

    Parameters
    ----------
    lat1, lon1 : float
        Reference point coordinates (e.g. cluster centre), decimal degrees.
    lat2_arr, lon2_arr : np.ndarray
        Arrays of target point coordinates, decimal degrees.

    Returns
    -------
    np.ndarray
        Distances in metres, same shape as lat2_arr.
    """
    lat1_r = math.radians(lat1)
    lon1_r = math.radians(lon1)
    lat2_r = np.radians(lat2_arr)
    lon2_r = np.radians(lon2_arr)

    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r

    a = np.sin(dlat / 2.0) ** 2 + math.cos(lat1_r) * np.cos(lat2_r) * np.sin(dlon / 2.0) ** 2
    a = np.clip(a, 0.0, 1.0)  # guard against tiny floating point overshoot
    c = 2 * np.arcsin(np.sqrt(a))

    return EARTH_RADIUS_METERS * c


def run_dbscan(df: pd.DataFrame, eps_meters: float, min_samples: int) -> pd.DataFrame:
    """Run DBSCAN clustering on incident coordinates using Haversine distance
    via a BallTree-compatible metric.

    Parameters
    ----------
    df : pd.DataFrame
        Cleaned dataset containing 'latitude' and 'longitude' columns
        (in decimal degrees).
    eps_meters : float
        Neighbourhood radius for DBSCAN, in metres.
    min_samples : int
        Minimum number of samples required to form a dense region (cluster).

    Returns
    -------
    pd.DataFrame
        The input DataFrame with an added 'cluster_id' column
        (-1 indicates noise).
    """
    logger.info("Running DBSCAN (eps=%sm, min_samples=%s)...", eps_meters, min_samples)

    coords_rad = np.radians(df[["latitude", "longitude"]].to_numpy())

    # DBSCAN's haversine metric expects eps in radians; convert metres -> radians
    eps_radians = eps_meters / EARTH_RADIUS_METERS

    db = DBSCAN(
        eps=eps_radians,
        min_samples=min_samples,
        metric="haversine",
        algorithm="ball_tree",
    )

    labels = db.fit_predict(coords_rad)
    df = df.copy()
    df["cluster_id"] = labels

    n_clusters = len(set(labels) - {-1})
    n_noise = int(np.sum(labels == -1))
    logger.info("DBSCAN complete: %d clusters found, %d noise points.", n_clusters, n_noise)

    return df


# ----------------------------------------------------------------------------
# CLUSTER STATISTICS
# ----------------------------------------------------------------------------


def _most_common_value(series: pd.Series):
    """Return the most frequently occurring value in a pandas Series.

    Parameters
    ----------
    series : pd.Series

    Returns
    -------
    object
        The mode value, or None if the series is empty.
    """
    if series.empty:
        return None
    mode_result = series.mode()
    if mode_result.empty:
        return None
    return mode_result.iloc[0]


def _classify_risk_level(cluster_stats_df: pd.DataFrame) -> pd.Series:
    """Assign a relative risk level (High / Medium / Low) to each hotspot,
    based on tertiles of severity_score across the clusters found in THIS
    run. This is a relative ranking, not an absolute/calibrated threshold -
    if you need fixed cutoffs (e.g. "High = severity > 50"), replace this
    with domain-calibrated thresholds once real incident data is available.

    Parameters
    ----------
    cluster_stats_df : pd.DataFrame
        Must contain a 'severity_score' column.

    Returns
    -------
    pd.Series
        Risk level labels aligned to cluster_stats_df's index.
    """
    if cluster_stats_df.empty:
        return pd.Series([], dtype=object)

    scores = cluster_stats_df["severity_score"]

    if scores.nunique() <= 1:
        # All clusters equally severe - can't meaningfully rank
        return pd.Series(["Medium"] * len(scores), index=cluster_stats_df.index)

    high_cutoff = scores.quantile(2 / 3)
    low_cutoff = scores.quantile(1 / 3)

    def _label(score):
        if score >= high_cutoff:
            return "High"
        elif score >= low_cutoff:
            return "Medium"
        else:
            return "Low"

    return scores.apply(_label)


def calculate_cluster_statistics(df: pd.DataFrame, has_offender_id: bool) -> pd.DataFrame:
    """Compute per-cluster summary statistics for every DBSCAN cluster,
    ignoring noise points (cluster_id == -1).

    For each cluster, computes:
        - cluster_id
        - number_of_incidents
        - centre_latitude / centre_longitude (MEDIAN of member coordinates,
          chosen over mean for robustness against outlier/drifted points)
        - district (most common district among members)
        - most_common_crime (most frequent crime_type among members)
        - cluster_radius_metres (95th-percentile haversine distance from
          centre, to avoid a single stray point inflating the reported size)
        - cluster_radius_max_metres (raw maximum distance, kept for reference)
        - density (incidents per square metre within the reported radius)
        - severity_score (sum of per-incident crime severity weights)
        - risk_level (relative High/Medium/Low tier, see _classify_risk_level)
        - unique_crime_types (count of distinct crime types in the cluster)
        - unique_offenders (count of distinct offenders, if offender_id exists)
        - first_incident_date / last_incident_date

    Parameters
    ----------
    df : pd.DataFrame
        Dataset with an assigned 'cluster_id' column.
    has_offender_id : bool
        Whether the source dataset included an offender_id column.

    Returns
    -------
    pd.DataFrame
        One row per cluster, sorted by number_of_incidents descending.
    """
    logger.info("Calculating per-cluster statistics...")

    clustered_df = df[df["cluster_id"] != -1]

    base_columns = [
        "cluster_id", "district", "centre_latitude", "centre_longitude",
        "number_of_incidents", "cluster_radius_metres", "cluster_radius_max_metres",
        "density", "most_common_crime", "severity_score", "risk_level",
        "unique_crime_types", "unique_offenders",
        "first_incident_date", "last_incident_date",
    ]

    if clustered_df.empty:
        logger.warning("No clusters found (all points classified as noise).")
        return pd.DataFrame(columns=base_columns)

    cluster_records = []

    for cluster_id, sub_df in clustered_df.groupby("cluster_id"):
        # Median centre - more robust to outlier/drifted points than the mean
        centre_lat = float(sub_df["latitude"].median())
        centre_lon = float(sub_df["longitude"].median())

        # Vectorized distance calculation (no row-wise apply)
        distances = haversine_distance_vectorized(
            centre_lat, centre_lon,
            sub_df["latitude"].to_numpy(), sub_df["longitude"].to_numpy(),
        )

        radius_p95 = float(np.percentile(distances, RADIUS_PERCENTILE))
        radius_max = float(distances.max())

        n_incidents = int(len(sub_df))

        # Density: incidents per square metre within the reported (p95) radius.
        # Guard against a zero radius (all points effectively co-located).
        if radius_p95 > 0:
            density = n_incidents / (math.pi * radius_p95 ** 2)
        else:
            density = float("nan")

        severity_score = float(
            sub_df["crime_type"]
            .map(CRIME_SEVERITY_WEIGHTS)
            .fillna(DEFAULT_SEVERITY_WEIGHT)
            .sum()
        )

        unique_offenders = (
            int(sub_df["offender_id"].nunique()) if has_offender_id else None
        )

        record = {
            "cluster_id": int(cluster_id),
            "district": _most_common_value(sub_df["district"]),
            "centre_latitude": round(centre_lat, 6),
            "centre_longitude": round(centre_lon, 6),
            "number_of_incidents": n_incidents,
            "cluster_radius_metres": round(radius_p95, 2),
            "cluster_radius_max_metres": round(radius_max, 2),
            "density": round(density, 6) if not math.isnan(density) else None,
            "most_common_crime": _most_common_value(sub_df["crime_type"]),
            "severity_score": severity_score,
            "unique_crime_types": int(sub_df["crime_type"].nunique()),
            "unique_offenders": unique_offenders,
            "first_incident_date": sub_df["occurrence_datetime"].min(),
            "last_incident_date": sub_df["occurrence_datetime"].max(),
        }
        cluster_records.append(record)

    cluster_stats_df = pd.DataFrame(cluster_records)

    # Risk level depends on the full set of severity scores, so compute after
    # all clusters are built
    cluster_stats_df["risk_level"] = _classify_risk_level(cluster_stats_df)

    # Sort hotspots by descending number_of_incidents
    cluster_stats_df = cluster_stats_df.sort_values(
        "number_of_incidents", ascending=False
    ).reset_index(drop=True)

    if not has_offender_id:
        cluster_stats_df = cluster_stats_df.drop(columns=["unique_offenders"])
        base_columns = [c for c in base_columns if c != "unique_offenders"]

    logger.info("Computed statistics for %d clusters.", len(cluster_stats_df))
    return cluster_stats_df[[c for c in base_columns if c in cluster_stats_df.columns]]


# ----------------------------------------------------------------------------
# PUBLIC INTERFACE - for use by the batch pipeline or any other caller
# ----------------------------------------------------------------------------


def process(
    df: pd.DataFrame,
    eps_meters: float = DEFAULT_DBSCAN_EPS_METERS,
    min_samples: int = DEFAULT_DBSCAN_MIN_SAMPLES,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Run spatial hotspot clustering over an already-loaded incident
    DataFrame and return the results in-memory.

    This is the module's public, reusable entry point. It performs no file
    I/O (the caller is responsible for loading ``df`` and for persisting
    the returned DataFrames) and never terminates the process - all
    failures are raised as exceptions so a calling batch pipeline can
    catch them and continue with other modules.

    Parameters
    ----------
    df : pd.DataFrame
        Incident dataset. Must contain at least the columns:
        'incident_id', 'crime_type', 'district', 'latitude', 'longitude',
        'occurrence_datetime'. An optional 'offender_id' column, if
        present, enables the 'unique_offenders' cluster statistic.
    eps_meters : float, default 300
        DBSCAN neighbourhood radius, in metres. Must be > 0.
    min_samples : int, default 10
        DBSCAN minimum samples required to form a dense cluster.
        Must be >= 2.

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame]
        (assignments_df, cluster_stats_df)

        assignments_df : one row per input incident, with columns
            'incident_id', 'cluster_id', 'latitude', 'longitude', 'district'
            (cluster_id == -1 means the incident was classified as noise),
            sorted by cluster_id then incident_id.

        cluster_stats_df : one row per discovered cluster (noise excluded),
            with summary statistics as documented in
            calculate_cluster_statistics(). Empty (with the expected
            columns) if no clusters were found.

    Raises
    ------
    HotspotClusteringError
        If ``df`` is None/not a DataFrame/empty, missing required columns,
        or if no valid rows remain after coordinate cleaning.
    ValueError
        If eps_meters <= 0 or min_samples < 2.
    """
    start_time = time.time()
    logger.info(
        "process() starting: %d input rows, eps_meters=%s, min_samples=%s",
        len(df) if isinstance(df, pd.DataFrame) else 0, eps_meters, min_samples,
    )

    _validate_input_dataframe(df)
    _validate_dbscan_params(eps_meters, min_samples)

    has_offender_id = "offender_id" in df.columns

    df_clean = clean_coordinates(df)
    df_clustered = run_dbscan(df_clean, eps_meters=eps_meters, min_samples=min_samples)
    cluster_stats_df = calculate_cluster_statistics(df_clustered, has_offender_id)

    assignment_columns = ["incident_id", "cluster_id", "latitude", "longitude", "district"]
    assignments_df = (
        df_clustered[assignment_columns]
        .sort_values(["cluster_id", "incident_id"])
        .reset_index(drop=True)
    )

    elapsed = time.time() - start_time
    n_clusters = int(cluster_stats_df["cluster_id"].nunique()) if not cluster_stats_df.empty else 0
    logger.info(
        "process() complete in %.2fs: %d clusters, %d assignments.",
        elapsed, n_clusters, len(assignments_df),
    )

    return assignments_df, cluster_stats_df


# ----------------------------------------------------------------------------
# CLI WRAPPER - thin, optional, for standalone/manual runs only.
# All logic below this point is CLI plumbing; process() above does not
# depend on any of it.
# ----------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments so DBSCAN parameters and file paths can
    be changed without editing source code.

    Returns
    -------
    argparse.Namespace

    Raises
    ------
    SystemExit
        If eps <= 0 or min_samples < MIN_ALLOWED_MIN_SAMPLES. This is CLI
        argument validation only - it is separate from, and in addition
        to, the exception-based validation performed inside process().
    """
    parser = argparse.ArgumentParser(
        description="Spatial hotspot clustering for the Crime Intelligence Platform."
    )
    parser.add_argument(
        "--input", type=str, default=DEFAULT_INPUT_FILE,
        help=f"Path to input CSV (default: {DEFAULT_INPUT_FILE})",
    )
    parser.add_argument(
        "--clusters-output", type=str, default=DEFAULT_CLUSTERS_OUTPUT_FILE,
        help=f"Path to write cluster summary CSV (default: {DEFAULT_CLUSTERS_OUTPUT_FILE})",
    )
    parser.add_argument(
        "--assignments-output", type=str, default=DEFAULT_ASSIGNMENTS_OUTPUT_FILE,
        help=f"Path to write incident assignment CSV (default: {DEFAULT_ASSIGNMENTS_OUTPUT_FILE})",
    )
    parser.add_argument(
        "--eps", type=float, default=DEFAULT_DBSCAN_EPS_METERS,
        help=f"DBSCAN neighbourhood radius in metres, must be > 0 (default: {DEFAULT_DBSCAN_EPS_METERS})",
    )
    parser.add_argument(
        "--min-samples", type=int, default=DEFAULT_DBSCAN_MIN_SAMPLES,
        help=f"DBSCAN minimum samples per cluster, must be >= {MIN_ALLOWED_MIN_SAMPLES} "
             f"(default: {DEFAULT_DBSCAN_MIN_SAMPLES})",
    )
    args = parser.parse_args()

    _validate_cli_args(args)
    return args


def _validate_cli_args(args: argparse.Namespace) -> None:
    """Validate CLI-supplied DBSCAN parameters before any processing begins.
    CLI-only: exits the process on bad input, since there is no caller to
    hand an exception back to at this layer.

    Parameters
    ----------
    args : argparse.Namespace
        Parsed CLI arguments (expects .eps and .min_samples).

    Raises
    ------
    SystemExit
        If validation fails.
    """
    try:
        _validate_dbscan_params(args.eps, args.min_samples)
    except ValueError as exc:
        print(f"ERROR: Invalid CLI arguments: {exc}")
        sys.exit(1)


def load_dataset(filepath: str) -> pd.DataFrame:
    """Load the crime dataset from a CSV file into a pandas DataFrame.
    CLI-only helper: process() itself never reads files.

    Parameters
    ----------
    filepath : str
        Path to the input CSV file.

    Returns
    -------
    pd.DataFrame
        Raw loaded dataset.

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
        print(f"ERROR: File not found: '{filepath}'. "
              f"Please run the dataset generator first.")
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

    has_offender_id = "offender_id" in df.columns
    logger.info("Loaded %d rows. offender_id column present: %s", len(df), has_offender_id)
    return df


def save_results(
    cluster_stats_df: pd.DataFrame,
    assignments_df: pd.DataFrame,
    clusters_path: str,
    assignments_path: str,
) -> None:
    """Persist cluster statistics and incident-to-cluster assignments to CSV.
    CLI-only helper: process() itself never writes files.

    Parameters
    ----------
    cluster_stats_df : pd.DataFrame
        Per-cluster summary statistics.
    assignments_df : pd.DataFrame
        incident_id, cluster_id, latitude, longitude, district for every
        incident (including noise points), already sorted by process().
    clusters_path : str
        Output path for the cluster summary CSV.
    assignments_path : str
        Output path for the incident assignment CSV.
    """
    try:
        cluster_stats_df.to_csv(clusters_path, index=False)
        logger.info("Saved cluster summary to '%s' (%d rows).", clusters_path, len(cluster_stats_df))
    except Exception as exc:
        print(f"ERROR: Failed to save '{clusters_path}': {exc}")
        sys.exit(1)

    try:
        assignments_df.to_csv(assignments_path, index=False)
        logger.info(
            "Saved incident cluster assignments to '%s' (%d rows).",
            assignments_path, len(assignments_df),
        )
    except Exception as exc:
        print(f"ERROR: Failed to save '{assignments_path}': {exc}")
        sys.exit(1)


def print_summary(assignments_df: pd.DataFrame, cluster_stats_df: pd.DataFrame) -> None:
    """Print high-level summary information about the clustering run.
    CLI-only: a human-facing report, not reusable module logic.

    Parameters
    ----------
    assignments_df : pd.DataFrame
        Full incident-to-cluster assignment table (includes noise points).
    cluster_stats_df : pd.DataFrame
        Per-cluster summary statistics (noise excluded).
    """
    total_incidents = len(assignments_df)
    n_clusters = cluster_stats_df["cluster_id"].nunique() if not cluster_stats_df.empty else 0
    n_noise = int((assignments_df["cluster_id"] == -1).sum())

    print("\n" + "=" * 60)
    print("HOTSPOT CLUSTERING SUMMARY")
    print("=" * 60)
    print(f"Total incidents processed : {total_incidents}")
    print(f"Number of clusters found  : {n_clusters}")
    print(f"Noise points              : {n_noise}")

    if not cluster_stats_df.empty:
        largest = cluster_stats_df.iloc[0]
        print(f"Largest hotspot           : Cluster {largest['cluster_id']} "
              f"in {largest['district']} with {largest['number_of_incidents']} incidents "
              f"(radius ~{largest['cluster_radius_metres']}m, risk: {largest['risk_level']})")
        avg_size = cluster_stats_df["number_of_incidents"].mean()
        print(f"Average hotspot size      : {avg_size:.2f} incidents/cluster")

        risk_counts = cluster_stats_df["risk_level"].value_counts()
        print(f"Risk level breakdown      : {risk_counts.to_dict()}")
    else:
        print("Largest hotspot           : N/A (no clusters formed)")
        print("Average hotspot size      : N/A")

    print("=" * 60)


def main() -> None:
    """Thin CLI entry point: read CSV -> process(df) -> save outputs -> summary.

    All the reusable logic lives in process(); this function only adds the
    file I/O and human-readable reporting needed for a standalone run.
    """
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    start_time = time.time()
    args = parse_args()

    df = load_dataset(args.input)

    try:
        assignments_df, cluster_stats_df = process(
            df, eps_meters=args.eps, min_samples=args.min_samples
        )
    except (HotspotClusteringError, ValueError) as exc:
        print(f"ERROR: Hotspot clustering failed: {exc}")
        sys.exit(1)

    save_results(cluster_stats_df, assignments_df, args.clusters_output, args.assignments_output)
    print_summary(assignments_df, cluster_stats_df)

    elapsed = time.time() - start_time
    print(f"\nTotal execution time      : {elapsed:.2f} seconds")


if __name__ == "__main__":
    main()
