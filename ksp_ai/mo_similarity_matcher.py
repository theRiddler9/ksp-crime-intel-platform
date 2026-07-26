"""
mo_similarity_matcher.py

Standalone Modus Operandi (MO) similarity matcher.

This module is a self-contained simplification of the original
pipeline-integrated MOSimilarityMatcher. It has no dependency on any
external pipeline framework (no FeatureBundle, PipelineContext,
PipelineState, or externally precomputed TF-IDF matrix). It builds its
own MO text representation and TF-IDF matrix directly from a pandas
DataFrame and returns a plain DataFrame of similarity matches.

Method choice: TF-IDF + cosine similarity (unchanged from the original
module). For hackathon-scale data (hundreds to low thousands of
incidents) this requires no pretrained model, runs in milliseconds, and
is directly explainable ("shared vocabulary between incident MO
fields"). Sentence-transformer embeddings would likely help with
paraphrased free text but add a model-loading dependency and latency
that isn't justified here.

Blocking strategy: if a crime-type column is present, incidents are
grouped by crime type before any pairwise comparison. This is exact,
not approximate - it never compares incidents across crime types, which
is a reasonable prior for MO matching (a burglary is never an MO match
for a homicide), and it reduces cost from O(n^2) globally to
O(sum of block_size^2) across blocks. If no crime-type column exists,
all incidents fall into a single block and the module degrades
gracefully to full O(n^2) - documented, not silent.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

# Columns considered, in priority order, when building the MO text blob
# for each incident. All are optional; whichever are present in the
# input DataFrame are used, whichever are absent are silently skipped.
_MO_TEXT_COLUMNS: tuple[str, ...] = (
    "mo_text",
    "description",
    "narrative",
    "modus_operandi",
    "weapon_used",
    "entry_method",
    "target_type",
    "vehicle_used",
    "offender_description",
)

# Candidate column names used to identify each incident. The first one
# found in the DataFrame is used; if none are found, the DataFrame
# index is used instead.
_ID_COLUMNS: tuple[str, ...] = ("incident_id", "id", "case_id")

# Candidate column names used for crime-type blocking. The first one
# found is used; if none are found, blocking is skipped (single block).
_CRIME_TYPE_COLUMNS: tuple[str, ...] = ("crime_type", "offense_type", "category")


class SimilarityError(Exception):
    """Raised when MO similarity computation cannot be completed."""


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


def _resolve_crime_type_series(df: pd.DataFrame) -> pd.Series | None:
    """Return the crime-type column to block on, or None if absent."""
    for col in _CRIME_TYPE_COLUMNS:
        if col in df.columns:
            return df[col].astype(str).fillna("UNKNOWN")
    return None


def _build_mo_text(df: pd.DataFrame) -> pd.Series:
    """Build a single composite MO text blob per incident.

    Concatenates whichever of _MO_TEXT_COLUMNS are present in the
    DataFrame. Missing values in any given column are treated as empty
    strings rather than causing failures, so incidents with partial MO
    data still get a (possibly shorter) text representation instead of
    being dropped.
    """
    available = [col for col in _MO_TEXT_COLUMNS if col in df.columns]
    if not available:
        raise SimilarityError(
            f"none of the expected MO text columns are present in the input "
            f"DataFrame; looked for {_MO_TEXT_COLUMNS}, found columns: "
            f"{list(df.columns)}."
        )

    logger.info("building MO text from columns: %s", available)

    def _row_to_text(row: pd.Series) -> str:
        parts = []
        for col in available:
            value = row[col]
            if pd.isna(value):
                continue
            text = str(value).strip()
            if text:
                parts.append(text)
        return " ".join(parts)

    return df[available].apply(_row_to_text, axis=1)


def _compute_block_similarities(
    mo_text: pd.Series,
    incident_ids: pd.Series,
    block_indices: list[int],
) -> list[tuple[str, str, float]]:
    """Compute pairwise cosine similarities within a single block.

    Fits a fresh TF-IDF vectorizer on just this block's MO text. Fitting
    per-block (rather than once globally) keeps memory bounded to the
    block size and avoids ever materializing a dense N x N matrix over
    the full dataset - the same blocked-cost guarantee as the original
    module, achieved here without a precomputed global matrix.
    """
    if len(block_indices) < 2:
        return []  # no pairs possible within a singleton block

    block_text = mo_text.iloc[block_indices].tolist()

    # A block where every text is empty (or identical stopwords-only)
    # can leave TF-IDF with an empty vocabulary; skip cleanly.
    if not any(text.strip() for text in block_text):
        logger.debug("skipping block of size %d with no usable MO text", len(block_indices))
        return []

    try:
        vectorizer = TfidfVectorizer(min_df=1)
        block_matrix = vectorizer.fit_transform(block_text)
    except ValueError:
        # e.g. vocabulary is empty after stopword/token filtering
        logger.debug("TF-IDF vectorization produced no vocabulary for this block; skipping")
        return []

    similarity_matrix = cosine_similarity(block_matrix)

    results: list[tuple[str, str, float]] = []
    block_ids = [incident_ids.iloc[i] for i in block_indices]
    for local_a in range(len(block_indices)):
        for local_b in range(len(block_indices)):
            if local_a == local_b:
                continue  # never match an incident to itself
            score = float(similarity_matrix[local_a, local_b])
            score = max(0.0, min(1.0, score))  # guard floating-point drift past [0, 1]
            results.append((block_ids[local_a], block_ids[local_b], score))
    return results


def process(
    df: pd.DataFrame,
    threshold: float = 0.3,
    top_k: int = 5,
) -> pd.DataFrame:
    """Find incidents with similar Modus Operandi via TF-IDF cosine similarity.

    Builds a composite MO text representation per incident from whichever
    relevant columns are present in `df`, vectorizes it with TF-IDF, and
    computes pairwise cosine similarity - blocked by crime type when a
    crime-type column is available, to avoid an unnecessary global
    N x N comparison.

    Args:
        df: Input incidents. Must contain at least one of the MO text
            columns (see _MO_TEXT_COLUMNS). Should ideally contain an
            incident id column (see _ID_COLUMNS) and a crime-type
            column (see _CRIME_TYPE_COLUMNS); both are optional.
        threshold: Minimum cosine similarity score (0-1) for a match to
            be retained.
        top_k: Maximum number of matches kept per incident, ranked by
            descending similarity score.

    Returns:
        A DataFrame with columns:
            - incident_id: the source incident's id
            - matched_incident_id: the candidate match's id
            - similarity_score: cosine similarity in [0, 1]
        Sorted by incident_id, then by descending similarity_score.
        Empty (but correctly columned) if no incident meets the
        threshold.

    Raises:
        SimilarityError: if `df` is empty, if no MO text columns are
            present, or if 0 <= threshold <= 1 / top_k >= 1 are violated.
    """
    if df.empty:
        raise SimilarityError("input DataFrame is empty; nothing to match.")
    if not 0.0 <= threshold <= 1.0:
        raise SimilarityError(f"threshold must be within [0, 1], got {threshold!r}.")
    if top_k < 1:
        raise SimilarityError(f"top_k must be >= 1, got {top_k!r}.")

    start = time.perf_counter()

    incident_ids = _resolve_id_series(df)
    mo_text = _build_mo_text(df)
    crime_type = _resolve_crime_type_series(df)

    blocks: dict[str, list[int]] = defaultdict(list)
    if crime_type is not None:
        for row_index, ctype in enumerate(crime_type):
            blocks[ctype].append(row_index)
        logger.info("blocking by crime type into %d block(s)", len(blocks))
    else:
        logger.warning(
            "no crime-type column found (looked for %s); comparing all "
            "incidents in a single block (O(n^2) worst case)",
            _CRIME_TYPE_COLUMNS,
        )
        blocks["__ALL__"] = list(range(len(df)))

    try:
        raw_candidates: list[tuple[str, str, float]] = []
        for block_indices in blocks.values():
            raw_candidates.extend(
                _compute_block_similarities(mo_text, incident_ids, block_indices)
            )
    except Exception as exc:  # noqa: BLE001 - re-raised as a domain exception
        raise SimilarityError(
            f"similarity computation failed for {len(df)} incidents."
        ) from exc

    # Threshold filtering.
    filtered = [c for c in raw_candidates if c[2] >= threshold]

    # Top-K ranking per source incident.
    grouped: dict[str, list[tuple[str, str, float]]] = defaultdict(list)
    for incident_id, matched_id, score in filtered:
        grouped[incident_id].append((incident_id, matched_id, score))

    final_rows: list[tuple[str, str, float]] = []
    for incident_id, matches in grouped.items():
        ranked = sorted(matches, key=lambda m: m[2], reverse=True)
        final_rows.extend(ranked[:top_k])

    runtime_seconds = time.perf_counter() - start
    logger.info(
        "mo similarity matcher completed: %d raw candidates, %d after "
        "threshold/top_k, runtime=%.4fs",
        len(raw_candidates),
        len(final_rows),
        runtime_seconds,
    )

    result = pd.DataFrame(
        final_rows, columns=["incident_id", "matched_incident_id", "similarity_score"]
    )
    if not result.empty:
        result = result.sort_values(
            ["incident_id", "similarity_score"], ascending=[True, False]
        ).reset_index(drop=True)
    return result
