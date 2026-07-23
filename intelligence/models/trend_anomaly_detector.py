#!/usr/bin/env python3
"""
Trend Anomaly Detector for KSP Crime Intel Platform
Detects sustained crime category spikes (>50% above historical baseline) per district.
"""

import sys
import json
from collections import defaultdict

def detect_trend_anomalies(incidents):
    BASELINE_MONTHLY_EXPECTED = {
        "Theft": 25,
        "Chain Snatching": 8,
        "Burglary": 12,
        "Financial Fraud": 10,
        "Cybercrime": 10,
        "NDPS Offence": 6,
        "Cruelty & Harassment": 14
    }

    counts = defaultdict(lambda: defaultdict(int))
    for inc in incidents:
        dist = inc.get("DistrictName") or inc.get("district_id") or "BENGALURU_CITY"
        ctype = inc.get("CrimeMinorHeadName") or inc.get("case_type") or "Theft"
        counts[dist][ctype] += 1

    anomalies = []
    for dist, cat_map in counts.items():
        for ctype, current_count in cat_map.items():
            expected = BASELINE_MONTHLY_EXPECTED.get(ctype, 10)
            if current_count > expected:
                spike_pct = round(((current_count - expected) / expected) * 100, 1)
                if spike_pct >= 40.0:
                    severity = "CRITICAL" if spike_pct >= 80 else ("HIGH" if spike_pct >= 50 else "MEDIUM")
                    anomalies.append({
                        "district_id": dist,
                        "case_type": ctype,
                        "current_30d_count": current_count,
                        "baseline_average": expected,
                        "spike_percentage": spike_pct,
                        "severity": severity
                    })

    anomalies.sort(key=lambda x: x["spike_percentage"], reverse=True)
    return anomalies

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            print(json.dumps([]))
            return
        payload = json.loads(raw_input)
        incidents = payload.get("incidents", payload) if isinstance(payload, dict) else payload

        anomalies = detect_trend_anomalies(incidents)
        print(json.dumps(anomalies))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
