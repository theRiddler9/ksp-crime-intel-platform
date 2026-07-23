/**
 * Subprocess Execution Bridge for Python Intelligence Models
 */

const { spawn } = require('child_process');
const path = require('path');

async function runPythonScript(scriptPath, inputData, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const fullPath = path.resolve(__dirname, '../../intelligence', scriptPath);
    let outputData = '';
    let errorData = '';

    const pyProcess = spawn('python', [fullPath], {
      windowsHide: true
    });

    const timer = setTimeout(() => {
      pyProcess.kill();
      resolve({
        success: false,
        error: `Python process timed out after ${timeoutMs}ms`,
        fallbackUsed: true
      });
    }, timeoutMs);

    pyProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    pyProcess.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && outputData.trim()) {
        try {
          const parsed = JSON.parse(outputData);
          resolve({ success: true, result: parsed });
        } catch (e) {
          resolve({
            success: false,
            error: `Failed to parse Python output: ${e.message}`,
            rawOutput: outputData,
            fallbackUsed: true
          });
        }
      } else {
        resolve({
          success: false,
          error: errorData || `Python script exited with code ${code}`,
          fallbackUsed: true
        });
      }
    });

    pyProcess.stdin.write(JSON.stringify(inputData));
    pyProcess.stdin.end();
  });
}

// Fallback JS algorithms if Python environment is unavailable
function fallbackMoSimilarity(newIncident, existingIncidents) {
  const newTags = new Set(newIncident.mo_tags || []);
  const matches = [];

  for (const inc of existingIncidents) {
    if (inc.fir_number === newIncident.fir_number) continue;
    const existingTags = new Set(inc.mo_tags || []);
    const intersection = new Set([...newTags].filter(x => existingTags.has(x)));
    const union = new Set([...newTags, ...existingTags]);

    const jaccardScore = union.size === 0 ? 0 : intersection.size / union.size;
    if (jaccardScore >= 0.4) {
      matches.push({
        source_fir: newIncident.fir_number,
        target_fir: inc.fir_number,
        shared_mo_tags: Array.from(intersection),
        similarity_score: parseFloat(jaccardScore.toFixed(4)),
        case_type: inc.case_type,
        district_id: inc.district_id
      });
    }
  }

  return matches.sort((a, b) => b.similarity_score - a.similarity_score);
}

function fallbackHotspotClustering(incidents) {
  const clusters = new Map();

  incidents.forEach(inc => {
    // Spatial grid grouping (~1km grid: lat rounded to 2 decimals)
    const latGrid = parseFloat(inc.latitude).toFixed(2);
    const lngGrid = parseFloat(inc.longitude).toFixed(2);
    const gridKey = `${inc.station_id || 'STATION'}_${latGrid}_${lngGrid}`;

    if (!clusters.has(gridKey)) {
      clusters.set(gridKey, {
        grid_key: gridKey,
        station_id: inc.station_id,
        district_id: inc.district_id,
        centroid: { lat: parseFloat(inc.latitude), lng: parseFloat(inc.longitude) },
        incident_count: 0,
        case_types: new Set(),
        firs: []
      });
    }

    const c = clusters.get(gridKey);
    c.incident_count += 1;
    c.case_types.add(inc.case_type);
    c.firs.push(inc.fir_number);
  });

  const hotspots = [];
  clusters.forEach(val => {
    if (val.incident_count >= 3) { // 3+ incidents in grid = hotspot
      hotspots.push({
        hotspot_id: `HS_${val.grid_key}`,
        station_id: val.station_id,
        district_id: val.district_id,
        latitude: val.centroid.lat,
        longitude: val.centroid.lng,
        incident_count: val.incident_count,
        case_types: Array.from(val.case_types),
        risk_score: parseFloat(Math.min(1.0, 0.4 + val.incident_count * 0.1).toFixed(2)),
        firs: val.firs
      });
    }
  });

  return hotspots.sort((a, b) => b.risk_score - a.risk_score);
}

module.exports = {
  runPythonScript,
  fallbackMoSimilarity,
  fallbackHotspotClustering
};
