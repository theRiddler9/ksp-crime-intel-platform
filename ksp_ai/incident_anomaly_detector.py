"""
incident_anomaly_detector.py

Standalone incident anomaly detector.

This module is a self-contained simplification of the original
pipeline-integrated IncidentAnomalyDetector. It has no dependency on any
external pipeline framework (no FeatureBundle, PipelineContext,
PipelineState, or externally pre-scaled feature_matrix). It builds its
own feature matrix directly from a pandas DataFrame - selecting
features, imputing missing values, encoding categoricals, and scaling -
then scores every incident with scikit-learn's Isolation Forest.

Method choice: Isolation Forest, unchanged from the original module.
It scales near-linearly with dataset size and feature count
(O(n log n) per tree), needs no distance-matrix computation (unlike
Local Outlier Factor, which is O(n^2) without an index), and its
`contamination` parameter maps directly onto "expected proportion of
anomalous incidents." Local Outlier Factor and One-Class SVM remain
plausible future enhancements but aren't implemented here, consistent
with the original module's scope.
"""

from __future__ import annotations

import logging
import time

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

logger = logging.getLogger(__name__)

_N_ESTIMATORS = 200

# Candidate column names used to identify each incident. The first one
# found in the DataFrame is used; if none are found, the DataFrame
# index is used instead.
_ID_COLUMNS: tuple[str, ...] = ("incident_id", "id", "case_id")

# Columns that should never be treated as model features even if they
# are numeric or low-cardinality (identifiers, free text, timestamps
# that need explicit handling rather than naive encoding).
_EXCLUDED_COLUMNS: tuple[str, ...] = (
    "incident_id",
    "id",
    "case_id",
    "mo_text",
    "description",
    "narrative",
)

# A categorical column with more distinct values than this is treated
# as high-cardinality (e.g. free-text-like or an identifier) and
# dropped from the feature set rather than one-hot encoded, to avoid an
# explosion of sparse dummy columns on hackathon-scale data.
_MAX_CATEGORICAL_CARDINALITY = 50


class AnomalyDetectionError(Exception):
    """Raised when incident anomaly detection cannot be completed."""


def _resolve_id_series(df: pd.DataFrame) -> pd.Series:
    """Return a string-typed Series of incident identifiers.

    Uses the first matching column in _ID_COLUMNS, falling back to the
    DataFrame index if none is present.
    """
    for col in _ID_COLUMNS:
        if col in df.columns:
            return df[col].astype(str)
    logger.warning(
        "no incident id column found (looked for %s); falling back to DataFrame index",
        _ID_COLUMNS,
    )
    return df.index.to_series().astype(str)


def _select_feature_columns(
    df: pd.DataFrame, feature_columns: list[str] | None
) -> list[str]:
    """Determine which columns to use as model features.

    If `feature_columns` is explicitly provided, it is validated against
    the DataFrame and used as-is (caller's intent takes priority). If
    not, every column is auto-selected except the known id/text columns
    in _EXCLUDED_COLUMNS.
    """
    if feature_columns is not None:
        missing = [c for c in feature_columns if c not in df.columns]
        if missing:
            raise AnomalyDetectionError(
                f"requested feature_columns not found in DataFrame: {missing}."
            )
        if not feature_columns:
            raise AnomalyDetectionError("feature_columns was provided but is empty.")
        return list(feature_columns)

    selected = [c for c in df.columns if c not in _EXCLUDED_COLUMNS]
    if not selected:
        raise AnomalyDetectionError(
            "no usable feature columns remain after excluding id/text columns "
            f"{_EXCLUDED_COLUMNS}; pass feature_columns explicitly."
        )
    logger.info("auto-selected feature columns: %s", selected)
    return selected


def _build_feature_matrix(df: pd.DataFrame, feature_columns: list[str]) -> np.ndarray:
    """Build a fully numeric, imputed, scaled feature matrix.

    - Numeric columns: missing values imputed with the column median,
      then standardized (zero mean, unit variance) since Isolation
      Forest's tree splits are scale-insensitive per-feature but mixed
      raw scales can still distort the random hyperplane splits used
      internally; standardizing keeps behavior consistent with the
      original pipeline's pre-scaled feature_matrix.
    - Categorical/object columns: missing values imputed with the
      literal "missing" category, then one-hot encoded - but only if
      cardinality is within _MAX_CATEGORICAL_CARDINALITY, to avoid
      generating an unbounded number of sparse dummy columns.
    - Columns that are entirely null, constant, or excluded for
      cardinality reasons are dropped with a logged reason.
    """
    working = df[feature_columns].copy()
    numeric_frames: list[pd.DataFrame] = []
    categorical_frames: list[pd.DataFrame] = []

    for col in feature_columns:
        series = working[col]

        if series.isna().all():
            logger.warning("dropping feature '%s': entirely missing values", col)
            continue

        if pd.api.types.is_numeric_dtype(series):
            imputed = series.fillna(series.median())
            if imputed.nunique(dropna=True) <= 1:
                logger.warning("dropping feature '%s': constant after imputation", col)
                continue
            numeric_frames.append(imputed.to_frame(col))
        else:
            cardinality = series.nunique(dropna=True)
            if cardinality > _MAX_CATEGORICAL_CARDINALITY:
                logger.warning(
                    "dropping feature '%s': cardinality %d exceeds max %d "
                    "(likely free text or an identifier)",
                    col,
                    cardinality,
                    _MAX_CATEGORICAL_CARDINALITY,
                )
                continue
            filled = series.fillna("missing").astype(str)
            if filled.nunique() <= 1:
                logger.warning("dropping feature '%s': constant after imputation", col)
                continue
            dummies = pd.get_dummies(filled, prefix=col)
            categorical_frames.append(dummies)

    if not numeric_frames and not categorical_frames:
        raise AnomalyDetectionError(
            "no usable features remained after imputation/encoding; all "
            "requested feature columns were empty, constant, or too high-cardinality."
        )

    parts: list[pd.DataFrame] = []
    if numeric_frames:
        numeric_df = pd.concat(numeric_frames, axis=1)
        scaler = StandardScaler()
        scaled = scaler.fit_transform(numeric_df.to_numpy(dtype=float))
        parts.append(pd.DataFrame(scaled, columns=numeric_df.columns, index=working.index))
    if categorical_frames:
        parts.append(pd.concat(categorical_frames, axis=1).astype(float))

    combined = pd.concat(parts, axis=1)
    return combined.to_numpy(dtype=float)


def process(
    df: pd.DataFrame,
    contamination: float = 0.05,
    random_state: int = 42,
    feature_columns: list[str] | None = None,
) -> pd.DataFrame:
    """Score every incident for anomalousness using Isolation Forest.

    Builds a numeric feature matrix internally (selecting columns,
    imputing missing values, encoding categoricals, scaling numerics),
    fits an Isolation Forest, and returns a per-incident anomaly score
    and flag.

    Args:
        df: Input incidents. Should ideally contain an incident id
            column (see _ID_COLUMNS); if absent, the DataFrame index is
            used as the id.
        contamination: Expected proportion of anomalous incidents,
            passed directly to IsolationForest. Must be in (0, 0.5].
        random_state: Random seed for reproducibility.
        feature_columns: Explicit list of columns to use as model
            features. If None, all columns except known id/text columns
            are auto-selected.

    Returns:
        A DataFrame with columns:
            - incident_id: the incident's id
            - anomaly_score: Isolation Forest decision function output
              (lower = more anomalous)
            - is_anomaly: True if flagged anomalous under `contamination`
        Ordered by anomaly_score ascending (most anomalous first).

    Raises:
        AnomalyDetectionError: if `df` is empty, has fewer than 2 rows,
            has no usable feature columns, or if `contamination` is out
            of range.
    """
    if df.empty:
        raise AnomalyDetectionError("input DataFrame is empty; nothing to score.")
    if df.shape[0] < 2:
        raise AnomalyDetectionError(
            f"IsolationForest requires at least 2 samples; received {df.shape[0]}."
        )
    if not 0.0 < contamination <= 0.5:
        raise AnomalyDetectionError(
            f"contamination must be within (0, 0.5], got {contamination!r}."
        )

    start = time.perf_counter()

    incident_ids = _resolve_id_series(df)
    selected_columns = _select_feature_columns(df, feature_columns)

    try:
        matrix = _build_feature_matrix(df, selected_columns)
        model = IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_estimators=_N_ESTIMATORS,
        )
        model.fit(matrix)
        raw_scores = model.decision_function(matrix)
        predictions = model.predict(matrix)
    except AnomalyDetectionError:
        raise
    except Exception as exc:  # noqa: BLE001 - re-raised as a domain exception
        raise AnomalyDetectionError(
            f"Isolation Forest fitting/scoring failed for {df.shape[0]} incidents."
        ) from exc

    result = pd.DataFrame(
        {
            "incident_id": incident_ids.to_numpy(),
            "anomaly_score": raw_scores.astype(float),
            "is_anomaly": predictions == -1,
        }
    )
    result = result.sort_values("anomaly_score", ascending=True).reset_index(drop=True)

    runtime_seconds = time.perf_counter() - start
    anomaly_count = int(result["is_anomaly"].sum())
    logger.info(
        "incident anomaly detector completed: %d incidents scored, %d flagged "
        "anomalous, runtime=%.4fs",
        len(result),
        anomaly_count,
        runtime_seconds,
    )

    return result
