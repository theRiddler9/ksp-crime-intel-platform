#!/usr/bin/env python3
"""
Incident Anomaly Detector for KSP Crime Intel Platform
Flags anomalous incidents (rare crime types in station, high property loss outliers).
"""

import sys
import json

def detect_incident_anomalies(incidents):
    anomalies = []
    station_counts = {}

    for inc in incidents:
        st = inc.get("PoliceStationName") or inc.get("station_id") or "STATION_UNKNOWN"
        ctype = inc.get("CrimeMinorHeadName") or inc.get("case_type") or "Theft"
        station_counts[(st, ctype)] = station_counts.get((st, ctype), 0) + 1

    for inc in incidents:
        st = inc.get("PoliceStationName") or inc.get("station_id") or "STATION_UNKNOWN"
        ctype = inc.get("CrimeMinorHeadName") or inc.get("case_type") or "Theft"
        loss = float(inc.get("property_loss_val", 0))
        fir_no = inc.get("CrimeNo") or inc.get("fir_number") or inc.get("CaseNo") or ""

        # Flag rare crime type occurrence in station (<2 cases total)
        if station_counts.get((st, ctype), 0) <= 1:
            anomalies.append({
                "fir_number": fir_no,
                "anomaly_type": "RARE_CRIME_TYPE_IN_JURISDICTION",
                "station_id": st,
                "case_type": ctype,
                "confidence_score": 0.82,
                "reason": f"First occurrence of {ctype} in station {st} within 30 days."
            })

        # Flag high property loss outlier (> 400,000 INR)
        if loss >= 400000:
            anomalies.append({
                "fir_number": fir_no,
                "anomaly_type": "HIGH_PROPERTY_LOSS_OUTLIER",
                "station_id": st,
                "property_loss_val": loss,
                "confidence_score": 0.91,
                "reason": f"Property loss valuation ₹{loss:,.2f} exceeds 95th percentile threshold."
            })

    return anomalies

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps([]))
            return
        payload = json.loads(raw_input)
        incidents = payload.get("incidents", payload) if isinstance(payload, dict) else payload

        anomalies = detect_incident_anomalies(incidents)
        print(json.dumps(anomalies))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
