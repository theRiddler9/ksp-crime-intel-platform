import sys
import os
import json
from flask import Flask, request, jsonify

# Ensure we can import from the intelligence folder
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_dir, '..', '..'))
if project_root not in sys.path:
    sys.path.append(project_root)

# Import the model logic from the intelligence folder
from intelligence.models.mo_similarity_matcher import match_mo_similarity
from intelligence.models.hotspot_clustering import compute_hotspots
from intelligence.models.incident_anomaly_detector import detect_incident_anomalies
from intelligence.models.trend_anomaly_detector import detect_trend_anomalies

app = Flask(__name__)

@app.route('/api/mo_similarity', methods=['POST'])
def mo_similarity():
    try:
        payload = request.get_json()
        target = payload.get("target_incident", {})
        pool = payload.get("incidents_pool", [])
        matches = match_mo_similarity(target, pool)
        return jsonify(matches), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/hotspot_clustering', methods=['POST'])
def hotspot_clustering():
    try:
        payload = request.get_json()
        incidents = payload.get("incidents", payload) if isinstance(payload, dict) else payload
        hotspots = compute_hotspots(incidents)
        return jsonify(hotspots), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/incident_anomaly', methods=['POST'])
def incident_anomaly():
    try:
        payload = request.get_json()
        incidents = payload.get("incidents", payload) if isinstance(payload, dict) else payload
        anomalies = detect_incident_anomalies(incidents)
        return jsonify(anomalies), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/trend_anomaly', methods=['POST'])
def trend_anomaly():
    try:
        payload = request.get_json()
        incidents = payload.get("incidents", payload) if isinstance(payload, dict) else payload
        anomalies = detect_trend_anomalies(incidents)
        return jsonify(anomalies), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
