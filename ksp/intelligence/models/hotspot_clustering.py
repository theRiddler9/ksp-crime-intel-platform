#!/usr/bin/env python3
"""
Hotspot Spatial-Temporal Clustering Module for KSP Crime Intel Platform
Processes official KSP ERD incident records and computes spatial hotspot risk scores.
"""

import sys
import json
from collections import defaultdict

def compute_hotspots(incidents):
    grid = defaultdict(lambda: {"count": 0, "incidents": [], "lat_sum": 0.0, "lng_sum": 0.0, "case_types": set(), "station_id": "", "district_id": ""})

    for inc in incidents:
        lat = float(inc.get("latitude", 0))
        lng = float(inc.get("longitude", 0))
        station_id = inc.get("PoliceStationName") or inc.get("station_id") or "STATION_HAL"
        district_id = inc.get("DistrictName") or inc.get("district_id") or "BENGALURU_CITY"
        case_type = inc.get("CrimeMinorHeadName") or inc.get("case_type") or "General"
        fir_no = inc.get("CrimeNo") or inc.get("fir_number") or inc.get("CaseNo") or ""

        # ~500m spatial grid rounding (2 decimal places = ~1.1km grid)
        lat_grid = round(lat, 2)
        lng_grid = round(lng, 2)
        grid_key = f"{station_id}_{lat_grid}_{lng_grid}"

        cell = grid[grid_key]
        cell["count"] += 1
        cell["lat_sum"] += lat
        cell["lng_sum"] += lng
        cell["incidents"].append(fir_no)
        cell["case_types"].add(case_type)
        cell["station_id"] = station_id
        cell["district_id"] = district_id

    hotspots = []
    for key, cell in grid.items():
        if cell["count"] >= 3:
            avg_lat = round(cell["lat_sum"] / cell["count"], 6)
            avg_lng = round(cell["lng_sum"] / cell["count"], 6)
            risk_score = round(min(1.0, 0.45 + (cell["count"] * 0.08)), 2)

            hotspots.append({
                "hotspot_id": f"HS_{key}",
                "station_id": cell["station_id"],
                "district_id": cell["district_id"],
                "latitude": avg_lat,
                "longitude": avg_lng,
                "incident_count": cell["count"],
                "case_types": list(cell["case_types"]),
                "risk_score": risk_score,
                "firs": cell["incidents"]
            })

    hotspots.sort(key=lambda x: x["risk_score"], reverse=True)
    return hotspots

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps([]))
            return

        payload = json.loads(raw_input)
        incidents = payload.get("incidents", payload) if isinstance(payload, dict) else payload

        hotspots = compute_hotspots(incidents)
        print(json.dumps(hotspots))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
