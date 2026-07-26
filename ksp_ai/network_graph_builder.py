"""
intelligence/modules/network_graph_builder.py

Builds an incident-offender-victim-location relationship graph using
NetworkX. Repeat offenders and repeat victims surface naturally as
high-degree nodes (many incident edges converging on one offender/victim
node) rather than requiring special-cased detection logic.

Graph type: undirected simple graph (nx.Graph), not a MultiGraph. Given
the node-type structure here, a (source, target) pair always corresponds
to exactly one semantic relation - an incident node is never linked to
another incident node directly, so incident<->offender is always
"involved_in", incident<->victim is always "victim_of", and
incident<->location is always "occurred_at". No two distinct relation
types ever compete for the same node pair, so a simple Graph is
sufficient and is significantly cheaper to analyze (degree centrality,
connected components) than a MultiGraph would be.

Time complexity: O(V + E) to build (linear in incidents + linked
offenders/victims/locations) and O(V + E) for density/connected-
components/degree-centrality. This scales comfortably to tens of
thousands of incidents in-memory; NetworkX itself becomes the
bottleneck well before this module's own logic does.

This is a standalone, dependency-light version of the module: it takes a
plain pandas DataFrame in and returns two plain DataFrames out. There is
no pipeline framework, no pydantic schema layer, and no mandatory file
I/O - callers own persistence, orchestration, and any downstream
validation.

Schema note: this module targets the frozen canonical dataset schema
(see Dataset_generator.py). It uses `occurrence_datetime` (not
`occurred_at`) and `offender_id` (not `suspect_ids`) because those are
the field names the canonical dataset actually produces. There is no
`location_id`/`location_type` column in the canonical schema either -
location nodes are instead derived from the existing `district` /
`police_station` fields, which keeps location nodes stable and
categorical (one node per station, not one per incident's exact GPS
fix).
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Hashable, Mapping

import networkx as nx
import pandas as pd

logger = logging.getLogger(__name__)

# Columns that must be present on the incidents DataFrame for a graph to
# be built at all. These are the genuinely mandatory fields in the
# canonical dataset schema.
REQUIRED_COLUMNS: tuple[str, ...] = (
    "incident_id",
    "crime_type",
    "district",
    "occurrence_datetime",
)

# Columns that unlock additional (optional) relationships/attributes when
# present. Missing any of these simply means that relationship/attribute
# is skipped, not an error.
OPTIONAL_LOCATION_COLUMNS: tuple[str, ...] = ("police_station", "latitude", "longitude")
OPTIONAL_PERSON_COLUMNS: tuple[str, ...] = ("offender_id", "victim_id")

DEFAULT_EDGE_WEIGHT_CAP = 5


class NetworkGraphError(Exception):
    """Raised when the incidents DataFrame cannot be turned into a graph."""


def process(
    df: pd.DataFrame,
    offender_ages: Mapping[str, int] | None = None,
    victim_ages: Mapping[str, int] | None = None,
    edge_weight_cap: int = DEFAULT_EDGE_WEIGHT_CAP,
    min_edge_weight: int = 1,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Build the incident/offender/victim/location relationship graph and
    return it as two DataFrames.

    Args:
        df: One row per incident. Required columns: incident_id,
            crime_type, district, occurrence_datetime. Optional columns:
            police_station (adds a stable, station-level location node
            and an "occurred_at" edge to it - falls back to a
            district-level location node if police_station is absent),
            latitude, longitude (kept as incident-node attributes, not
            used to create per-point location nodes), offender_id (adds
            an "involved_in" edge to a persistent offender node - the
            same offender_id always maps to the same node, which is what
            lets repeat offenders surface as high-degree nodes), victim_id
            (adds a "victim_of" edge to a persistent victim node,
            analogous to offender_id). Any of the optional columns may be
            absent or contain nulls/empty values per row - those
            relationships/attributes are simply skipped for that row.
        offender_ages: Optional {offender_id: age} lookup used to enrich
            offender nodes. Unknown or absent IDs are left without an age.
        victim_ages: Optional {victim_id: age} lookup used to enrich
            victim nodes, analogous to offender_ages.
        edge_weight_cap: Maximum weight assigned to a single edge (guards
            against one malformed row dominating downstream graph
            statistics).
        min_edge_weight: Edges with weight below this threshold are
            pruned from the final graph (and any node left with no edges
            as a result is pruned too). Default of 1 keeps every edge.

    Returns:
        (nodes_df, edges_df):
            nodes_df columns: id, type, label, degree, degree_centrality,
                crime_type, district, occurrence_datetime, police_station,
                latitude, longitude, age (attribute columns are NaN
                where not applicable to a given node's type).
            edges_df columns: source, target, relation, weight.
        Graph-level statistics (node_count, edge_count,
        connected_components, density) are attached to
        ``nodes_df.attrs`` and ``edges_df.attrs`` for convenience and are
        also logged, but are not part of the required return shape.

    Raises:
        NetworkGraphError: If required columns are missing or the
            DataFrame is empty.
    """
    _validate_columns(df)
    if df.empty:
        raise NetworkGraphError("Cannot build a graph from an empty DataFrame.")

    graph = _build_graph(df, offender_ages or {}, victim_ages or {}, edge_weight_cap)

    if min_edge_weight > 1:
        graph = _prune_weak_edges(graph, min_edge_weight)

    nodes_df, edges_df = _graph_to_dataframes(graph)

    stats = {
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "connected_components": nx.number_connected_components(graph) if graph.number_of_nodes() else 0,
        "density": nx.density(graph) if graph.number_of_nodes() > 1 else 0.0,
    }
    nodes_df.attrs.update(stats)
    edges_df.attrs.update(stats)
    logger.info("network graph builder completed: %s", stats)

    return nodes_df, edges_df


# ----------------------------------------------------------------------
# Validation
# ----------------------------------------------------------------------


def _validate_columns(df: pd.DataFrame) -> None:
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing:
        raise NetworkGraphError(
            f"Incidents DataFrame is missing required column(s): {missing}. "
            f"Required columns are: {list(REQUIRED_COLUMNS)}."
        )


# ----------------------------------------------------------------------
# Graph construction
# ----------------------------------------------------------------------


def _build_graph(
    df: pd.DataFrame,
    offender_ages: Mapping[str, int],
    victim_ages: Mapping[str, int],
    edge_weight_cap: int,
) -> nx.Graph:
    graph = nx.Graph()
    has_police_station = "police_station" in df.columns
    has_offenders = "offender_id" in df.columns
    has_victims = "victim_id" in df.columns

    for row in df.itertuples(index=False):
        row_dict = row._asdict()
        incident_id = row_dict["incident_id"]

        _add_incident_node(graph, row_dict)
        _add_location_node_and_edge(graph, row_dict, has_police_station)

        if has_offenders:
            offender_ids = _parse_person_ids(row_dict.get("offender_id"))
            _add_person_nodes_and_edges(
                graph, incident_id, offender_ids, "offender", "involved_in", offender_ages, edge_weight_cap
            )

        if has_victims:
            victim_ids = _parse_person_ids(row_dict.get("victim_id"))
            _add_person_nodes_and_edges(
                graph, incident_id, victim_ids, "victim", "victim_of", victim_ages, edge_weight_cap
            )

    return graph


def _add_incident_node(graph: nx.Graph, row: Mapping[str, Any]) -> None:
    incident_id = row["incident_id"]
    graph.add_node(
        incident_id,
        node_type="incident",
        label=f"Incident {incident_id}",
        crime_type=row["crime_type"],
        district=row["district"],
        occurrence_datetime=_to_iso(row["occurrence_datetime"]),
        latitude=row.get("latitude"),
        longitude=row.get("longitude"),
    )


def _add_location_node_and_edge(
    graph: nx.Graph, row: Mapping[str, Any], has_police_station: bool
) -> None:
    """
    Adds (or reuses) a stable, categorical location node and links the
    incident to it. `district` is always present (it's a required
    column), so a location relationship always exists for every row.
    When `police_station` is also present and non-missing, the node is
    station-level (one node per station); otherwise it falls back to a
    district-level node. This deliberately avoids creating one location
    node per exact latitude/longitude fix, which would fragment what
    should be a small, stable set of location nodes into thousands of
    singleton nodes. Latitude/longitude are kept as incident-node
    attributes instead (see _add_incident_node).
    """
    incident_id = row["incident_id"]
    district = row["district"]
    police_station = row.get("police_station") if has_police_station else None

    if has_police_station and not _is_missing(police_station):
        location_id = f"LOC::{district}::{police_station}"
        label = f"{police_station}, {district}"
    else:
        location_id = f"LOC::{district}"
        label = str(district)

    if location_id not in graph:
        graph.add_node(
            location_id,
            node_type="location",
            label=label,
            district=district,
            police_station=police_station if not _is_missing(police_station) else None,
        )
    if not graph.has_edge(incident_id, location_id):
        graph.add_edge(incident_id, location_id, relation="occurred_at", weight=1)


def _add_person_nodes_and_edges(
    graph: nx.Graph,
    incident_id: Hashable,
    person_ids: tuple[str, ...],
    node_type: str,
    relation: str,
    age_lookup: Mapping[str, int],
    weight_cap: int,
) -> None:
    """
    Adds one persistent node per unique person referenced by the
    incident and one edge per (incident, person) pair. A given
    offender_id / victim_id always maps to the same node across every
    incident it appears in - that persistence is what lets repeat
    offenders/victims surface as high-degree nodes rather than requiring
    special-cased detection logic.

    Weight reflects how many times that person_id appears within this
    single incident's parsed IDs (a data-quality signal, normally 1 for
    the canonical single-offender/single-victim schema, but the parsing
    below tolerates a comma-separated multi-ID cell for forward
    compatibility), capped at weight_cap so a single malformed row
    cannot dominate graph statistics.
    """
    for person_id, multiplicity in Counter(person_ids).items():
        if person_id not in graph:
            age = age_lookup.get(person_id)
            graph.add_node(
                person_id,
                node_type=node_type,
                label=f"{node_type.capitalize()} {person_id}",
                age=age,
            )
        if graph.has_edge(incident_id, person_id):
            # Already linked (e.g. duplicate ID within this same
            # incident's parsed IDs); an undirected simple graph permits
            # only one edge per pair, so no second edge is created here.
            continue
        weight = min(multiplicity, weight_cap)
        graph.add_edge(incident_id, person_id, relation=relation, weight=weight)


def _prune_weak_edges(graph: nx.Graph, min_edge_weight: int) -> nx.Graph:
    """Returns a new graph with edges below min_edge_weight removed, along
    with any node left with no remaining edges."""
    pruned = nx.Graph()
    pruned.add_nodes_from(graph.nodes(data=True))
    for u, v, data in graph.edges(data=True):
        if data.get("weight", 1) >= min_edge_weight:
            pruned.add_edge(u, v, **data)
    isolated = list(nx.isolates(pruned))
    pruned.remove_nodes_from(isolated)
    return pruned


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def _to_iso(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _parse_person_ids(value: Any) -> tuple[str, ...]:
    """
    Normalizes an offender_id/victim_id cell into a tuple of string IDs.
    Accepts a list/tuple, a comma-separated string, a single scalar ID
    (the canonical dataset's actual shape - one offender_id/victim_id
    per row), or a missing value (None / NaN / empty string), the latter
    of which yields an empty tuple so the relationship is simply skipped
    for that row (this is how incidents without a known offender, or
    without a victim_id column at all, are handled).
    """
    if _is_missing(value):
        return ()
    if isinstance(value, (list, tuple, set)):
        return tuple(str(v).strip() for v in value if not _is_missing(v) and str(v).strip())
    if isinstance(value, str):
        return tuple(v.strip() for v in value.split(",") if v.strip())
    return (str(value),)


# ----------------------------------------------------------------------
# Graph -> DataFrames
# ----------------------------------------------------------------------


def _graph_to_dataframes(graph: nx.Graph) -> tuple[pd.DataFrame, pd.DataFrame]:
    degree_centrality = nx.degree_centrality(graph) if graph.number_of_nodes() > 0 else {}

    node_rows: list[dict[str, Any]] = []
    for node_id, data in graph.nodes(data=True):
        node_rows.append(
            {
                "id": node_id,
                "type": data.get("node_type"),
                "label": data.get("label"),
                "degree": graph.degree(node_id),
                "degree_centrality": round(degree_centrality.get(node_id, 0.0), 6),
                "crime_type": data.get("crime_type"),
                "district": data.get("district"),
                "occurrence_datetime": data.get("occurrence_datetime"),
                "police_station": data.get("police_station"),
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "age": data.get("age"),
            }
        )

    edge_rows: list[dict[str, Any]] = [
        {
            "source": u,
            "target": v,
            "relation": data.get("relation"),
            "weight": data.get("weight", 1),
        }
        for u, v, data in graph.edges(data=True)
    ]

    nodes_df = pd.DataFrame(
        node_rows,
        columns=[
            "id",
            "type",
            "label",
            "degree",
            "degree_centrality",
            "crime_type",
            "district",
            "occurrence_datetime",
            "police_station",
            "latitude",
            "longitude",
            "age",
        ],
    )
    edges_df = pd.DataFrame(edge_rows, columns=["source", "target", "relation", "weight"])

    return nodes_df, edges_df
