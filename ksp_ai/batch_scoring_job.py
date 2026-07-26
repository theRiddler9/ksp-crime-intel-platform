"""
intelligence/pipelines/batch_scoring_job.py

Batch orchestrator for the KSP Crime Intelligence Platform.
Executes spatial, temporal, relational, and anomaly models sequentially,
then aggregates them into a final risk score.
"""

import os
import time
import json
import logging
import argparse
import datetime
from pathlib import Path

import numpy as np
import pandas as pd

# Import actual analytical modules
from intelligence.models import (
    hotspot_clustering,
    trend_anomaly_detector,
    network_graph_builder,
    mo_similarity_matcher,
    incident_anomaly_detector,
    risk_scoring_model,
)

logger = logging.getLogger("BatchScoringJob")

# ---------------------------------------------------------
# ATOMIC I/O HELPERS
# ---------------------------------------------------------
class PipelineJSONEncoder(json.JSONEncoder):
    """Safely serialize Numpy types, Datetimes, and Paths."""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        if isinstance(obj, Path):
            return str(obj)
        return super().default(obj)


def write_dataframe_atomic(df: pd.DataFrame, path: Path) -> None:
    """Write DataFrame to a temp file, then atomically replace the target."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        df.to_csv(tmp_path, index=False)
        os.replace(tmp_path, path)
        logger.info(f"Successfully exported {len(df)} rows to {path.name}")
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise


def write_json_atomic(data: dict, path: Path) -> None:
    """Write JSON dict to a temp file, then atomically replace the target."""
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, cls=PipelineJSONEncoder, indent=4)
        os.replace(tmp_path, path)
        logger.info(f"Successfully exported pipeline summary to {path.name}")
    except Exception:
        if tmp_path.exists():
            tmp_path.unlink()
        raise


# ---------------------------------------------------------
# ORCHESTRATION PIPELINE
# ---------------------------------------------------------
def run_pipeline(input_path: str, output_dir: str, continue_on_error: bool) -> dict:
    pipeline_start_time = time.time()
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    
    summary = {
        "pipeline_status": "started",
        "dataset": str(input_path),
        "records_processed": 0,
        "started_at": datetime.datetime.now().isoformat(),
        "completed_at": None,
        "total_runtime_seconds": 0.0,
        "modules": {}
    }

    # 1. LOAD & VALIDATE DATASET
    logger.info(f"Loading dataset from {input_path}")
    try:
        input_file = Path(input_path)
        if not input_file.exists():
            raise FileNotFoundError(f"Input file not found: {input_path}")
            
        df = pd.read_csv(input_file)
        if df.empty:
            raise ValueError("Input dataset is empty.")
        if "incident_id" not in df.columns:
            raise ValueError("Critical validation failed: 'incident_id' column missing.")
        if df["incident_id"].isna().all():
            raise ValueError("Critical validation failed: 'incident_id' is entirely null.")
            
        summary["records_processed"] = len(df)
        logger.info(f"Loaded {len(df)} records.")
        
    except Exception as e:
        logger.error(f"Failed to load or validate dataset: {e}")
        summary["pipeline_status"] = "failed"
        summary["completed_at"] = datetime.datetime.now().isoformat()
        summary["total_runtime_seconds"] = round(time.time() - pipeline_start_time, 2)
        write_json_atomic(summary, out_path / "pipeline_execution_summary.json")
        raise

    # Tracking module outputs needed for Stage 2 (Risk Scoring)
    cluster_stats_df = None
    trend_stats_df = None
    anomalies_df = None
    trend_summary_df = None
    spike_events_df = None

    # Helper for module execution tracking
    def init_module_summary():
        return {"status": "pending", "runtime_seconds": 0.0, "outputs": [], "error": None}

    try:
        # ---------------------------------------------------------
        # STAGE 1A: Hotspot Clustering
        # ---------------------------------------------------------
        logger.info("--- Starting Hotspot Clustering ---")
        mod_key = "hotspot_clustering"
        summary["modules"][mod_key] = init_module_summary()
        t0 = time.time()
        try:
            assignments_df, cluster_stats_df = hotspot_clustering.process(df)
            
            if not isinstance(assignments_df, pd.DataFrame) or not isinstance(cluster_stats_df, pd.DataFrame):
                raise TypeError("Hotspot clustering outputs must be pandas DataFrames.")
            
            write_dataframe_atomic(assignments_df, out_path / "crime_cluster_assignments.csv")
            write_dataframe_atomic(cluster_stats_df, out_path / "hotspot_clusters.csv")
            
            summary["modules"][mod_key].update({
                "status": "success",
                "outputs": ["crime_cluster_assignments.csv", "hotspot_clusters.csv"]
            })
        except Exception as e:
            logger.exception(f"Hotspot Clustering failed: {e}")
            summary["modules"][mod_key]["status"] = "failed"
            summary["modules"][mod_key]["error"] = str(e)
            if not continue_on_error: raise
        finally:
            summary["modules"][mod_key]["runtime_seconds"] = round(time.time() - t0, 3)

        # ---------------------------------------------------------
        # STAGE 1B: Trend & Anomaly Detection
        # ---------------------------------------------------------
        logger.info("--- Starting Trend Detection ---")
        mod_key = "trend_detection"
        summary["modules"][mod_key] = init_module_summary()
        t0 = time.time()
        try:
            trend_outputs = trend_anomaly_detector.process(df)
            
            if not isinstance(trend_outputs, dict):
                raise TypeError("Trend detection output must be a dictionary.")

            # Explicit Mapping
            trend_export_map = {
                "trend_summary": "trend_summary.csv",
                "anomalies": "crime_anomalies.csv",
                "statistics": "trend_statistics.csv",
                "spike_events": "spike_events.csv",
                "weekly": "weekly_trends.csv",
                "monthly": "monthly_trends.csv",
                "day_of_week": "day_of_week_summary.csv",
                "district_ranking": "district_ranking.csv"
            }
            
            exported_files = []
            for key, filename in trend_export_map.items():
                if key in trend_outputs:
                    df_out = trend_outputs[key]
                    if not isinstance(df_out, pd.DataFrame):
                        raise TypeError(f"Trend output '{key}' is not a pandas DataFrame.")
                    write_dataframe_atomic(df_out, out_path / filename)
                    exported_files.append(filename)

            # Retain refs for Risk Scoring
            trend_stats_df = trend_outputs.get("statistics")
            anomalies_df = trend_outputs.get("anomalies")
            trend_summary_df = trend_outputs.get("trend_summary")
            spike_events_df = trend_outputs.get("spike_events")

            summary["modules"][mod_key].update({"status": "success", "outputs": exported_files})
        except Exception as e:
            logger.exception(f"Trend Detection failed: {e}")
            summary["modules"][mod_key]["status"] = "failed"
            summary["modules"][mod_key]["error"] = str(e)
            if not continue_on_error: raise
        finally:
            summary["modules"][mod_key]["runtime_seconds"] = round(time.time() - t0, 3)

        # ---------------------------------------------------------
        # STAGE 1C: Network Graph Builder
        # ---------------------------------------------------------
        logger.info("--- Starting Network Graph Builder ---")
        mod_key = "network_graph"
        summary["modules"][mod_key] = init_module_summary()
        t0 = time.time()
        try:
            nodes_df, edges_df = network_graph_builder.process(df)
            
            if not isinstance(nodes_df, pd.DataFrame) or not isinstance(edges_df, pd.DataFrame):
                raise TypeError("Network graph builder outputs must be pandas DataFrames.")

            write_dataframe_atomic(nodes_df, out_path / "network_nodes.csv")
            write_dataframe_atomic(edges_df, out_path / "network_edges.csv")
            
            summary["modules"][mod_key].update({
                "status": "success",
                "outputs": ["network_nodes.csv", "network_edges.csv"]
            })
        except Exception as e:
            logger.exception(f"Network Graph Builder failed: {e}")
            summary["modules"][mod_key]["status"] = "failed"
            summary["modules"][mod_key]["error"] = str(e)
            if not continue_on_error: raise
        finally:
            summary["modules"][mod_key]["runtime_seconds"] = round(time.time() - t0, 3)

        # ---------------------------------------------------------
        # STAGE 1D: MO Similarity Matcher
        # ---------------------------------------------------------
        logger.info("--- Starting MO Similarity Matcher ---")
        mod_key = "mo_similarity"
        summary["modules"][mod_key] = init_module_summary()
        t0 = time.time()
        try:
            mo_matches_df = mo_similarity_matcher.process(df)
            
            if not isinstance(mo_matches_df, pd.DataFrame):
                raise TypeError("MO similarity matcher output must be a pandas DataFrame.")

            write_dataframe_atomic(mo_matches_df, out_path / "mo_matches.csv")
            summary["modules"][mod_key].update({"status": "success", "outputs": ["mo_matches.csv"]})
        except Exception as e:
            logger.exception(f"MO Similarity Matcher failed: {e}")
            summary["modules"][mod_key]["status"] = "failed"
            summary["modules"][mod_key]["error"] = str(e)
            if not continue_on_error: raise
        finally:
            summary["modules"][mod_key]["runtime_seconds"] = round(time.time() - t0, 3)

        # ---------------------------------------------------------
        # STAGE 1E: Incident Anomaly Detector
        # ---------------------------------------------------------
        logger.info("--- Starting Incident Anomaly Detector ---")
        mod_key = "incident_anomaly"
        summary["modules"][mod_key] = init_module_summary()
        t0 = time.time()
        try:
            incident_anomalies_df = incident_anomaly_detector.process(df)
            
            if not isinstance(incident_anomalies_df, pd.DataFrame):
                raise TypeError("Incident anomaly detector output must be a pandas DataFrame.")

            write_dataframe_atomic(incident_anomalies_df, out_path / "incident_anomalies.csv")
            summary["modules"][mod_key].update({"status": "success", "outputs": ["incident_anomalies.csv"]})
        except Exception as e:
            logger.exception(f"Incident Anomaly Detector failed: {e}")
            summary["modules"][mod_key]["status"] = "failed"
            summary["modules"][mod_key]["error"] = str(e)
            if not continue_on_error: raise
        finally:
            summary["modules"][mod_key]["runtime_seconds"] = round(time.time() - t0, 3)

        # ---------------------------------------------------------
        # STAGE 2: Risk Scoring (Requires Hotspot + Trend)
        # ---------------------------------------------------------
        logger.info("--- Starting District Risk Scoring ---")
        mod_key = "risk_scoring"
        summary["modules"][mod_key] = init_module_summary()
        t0 = time.time()
        
        # Explicit dependency checks
        hotspot_status = summary["modules"].get("hotspot_clustering", {}).get("status")
        trend_status = summary["modules"].get("trend_detection", {}).get("status")
        
        if hotspot_status != "success" or trend_status != "success":
            logger.warning("Risk Scoring SKIPPED due to missing dependencies from Hotspot or Trend modules.")
            summary["modules"][mod_key]["status"] = "skipped"
            summary["modules"][mod_key]["error"] = "Skipped because hotspot_clustering or trend_detection failed/skipped."
        else:
            try:
                risk_scores_df, feature_importance_df = risk_scoring_model.process(
                    incidents_df=df,
                    cluster_stats_df=cluster_stats_df,
                    trend_stats_df=trend_stats_df,
                    anomalies_df=anomalies_df,
                    trend_summary_df=trend_summary_df,
                    spike_events_df=spike_events_df
                )
                
                if not isinstance(risk_scores_df, pd.DataFrame) or not isinstance(feature_importance_df, pd.DataFrame):
                    raise TypeError("Risk scoring outputs must be pandas DataFrames.")
                
                write_dataframe_atomic(risk_scores_df, out_path / "district_risk_scores.csv")
                write_dataframe_atomic(feature_importance_df, out_path / "risk_feature_importance.csv")
                
                summary["modules"][mod_key].update({
                    "status": "success",
                    "outputs": ["district_risk_scores.csv", "risk_feature_importance.csv"]
                })
            except Exception as e:
                logger.exception(f"Risk Scoring failed: {e}")
                summary["modules"][mod_key]["status"] = "failed"
                summary["modules"][mod_key]["error"] = str(e)
                if not continue_on_error: raise
            finally:
                summary["modules"][mod_key]["runtime_seconds"] = round(time.time() - t0, 3)

    finally:
        # ---------------------------------------------------------
        # WRAP UP
        # ---------------------------------------------------------
        summary["completed_at"] = datetime.datetime.now().isoformat()
        summary["total_runtime_seconds"] = round(time.time() - pipeline_start_time, 2)
        
        # Determine final pipeline status
        all_statuses = [m["status"] for m in summary["modules"].values()]
        if not all_statuses:
            summary["pipeline_status"] = "failed"
        elif all(s == "success" for s in all_statuses):
            summary["pipeline_status"] = "completed"
        elif "success" in all_statuses:
            summary["pipeline_status"] = "partial_success"
        else:
            summary["pipeline_status"] = "failed"

        write_json_atomic(summary, out_path / "pipeline_execution_summary.json")
        logger.info(f"Pipeline finished with status: {summary['pipeline_status']} in {summary['total_runtime_seconds']}s")
    
    return summary


def main():
    parser = argparse.ArgumentParser(description="KSP Batch Scoring Pipeline Orchestrator")
    parser.add_argument("--input", type=str, default="synthetic_crimes.csv", help="Path to input dataset.")
    parser.add_argument("--output-dir", type=str, default="outputs", help="Directory to save pipeline outputs.")
    parser.add_argument("--log-level", type=str, default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    parser.add_argument("--continue-on-error", action="store_true", help="Continue executing remaining modules if one fails.")
    
    args = parser.parse_args()
    
    # Configure logging exactly as requested
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    
    run_pipeline(args.input, args.output_dir, args.continue_on_error)


if __name__ == "__main__":
    main()