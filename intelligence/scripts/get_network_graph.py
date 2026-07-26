import sys
import os
import json
import pandas as pd

# Add project root to sys.path so intelligence module can be imported
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
if project_root not in sys.path:
    sys.path.append(project_root)

from intelligence.models.network_graph_builder import process

def main():
    try:
        # Read from stdin
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"error": "No input data provided"}))
            return
            
        incidents = json.loads(input_data)
        if not incidents:
            print(json.dumps({"nodes": [], "edges": []}))
            return

        df = pd.DataFrame(incidents)
        
        # Map JS DB schema to the schema expected by the network_graph_builder
        # Expected: incident_id, crime_type, district, occurrence_datetime
        # Actual: fir_number, case_type, district_id, created_at/updated_at
        column_mapping = {
            "fir_number": "incident_id",
            "case_type": "crime_type",
            "district_id": "district",
            "station_id": "police_station"
        }
        
        # If created_at is available but not occurrence_datetime
        if "created_at" in df.columns and "occurrence_datetime" not in df.columns:
            df["occurrence_datetime"] = df["created_at"]
        elif "occurrence_datetime" not in df.columns:
            df["occurrence_datetime"] = "2026-01-01T00:00:00Z"
            
        df = df.rename(columns=column_mapping)
        
        # Ensure required columns exist, fill with defaults if missing
        required_cols = ["incident_id", "crime_type", "district", "occurrence_datetime"]
        for col in required_cols:
            if col not in df.columns:
                df[col] = "UNKNOWN"

        nodes_df, edges_df = process(df)
        
        # Convert NaN to None for JSON serialization
        nodes_df = nodes_df.replace({pd.NA: None, float('nan'): None})
        edges_df = edges_df.replace({pd.NA: None, float('nan'): None})
        
        result = {
            "nodes": nodes_df.to_dict(orient="records"),
            "edges": edges_df.to_dict(orient="records")
        }
        
        print(json.dumps(result))
    except Exception as e:
        import traceback
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}))

if __name__ == "__main__":
    main()
