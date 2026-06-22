// frontend-integration — drop-in hook for SENTINEL.
//
// In your existing console, you currently compute risk locally in computeRisks().
// To use the backend instead, POST each tick's frame to /analyze and render the
// response. Keep your local fusion as an offline fallback (try/catch below).
//
// 1) Add to your React app:  src/useSentinel.js  (this file)
// 2) Map your `world` object to the backend frame shape (see frameFromWorld).
// 3) Call analyze(frame) inside your tick and store the result in state.

const API = import.meta.env.VITE_SENTINEL_API || "http://localhost:8000";

export function frameFromWorld(w) {
  const z = w.zones;
  return {
    zone: "Tank B",
    location_id: "tank-b",                 // matches scripts/seed_graph.py
    ch4: z.tankB.gas,
    valve_temp: z.tankB.valveTemp,
    valve_pos: z.tankB.valvePos,
    temp: z.tankB.temp,
    pressure: z.tankB.pressure,
    h2s: z.csC7.h2s,
    o2: z.csC7.o2,
    humidity: z.csC7.humidity,
    pump_vibration: z.pumpP2.vibration,
    pump_temp: z.pumpP2.temp,
    pump_load: z.pumpP2.load,
    maint_overdue_days: z.pumpP2.maintOverdueDays,
    hot_work_active: z.tankB.permit.active,
    confined_space_active: z.csC7.permit.active,
    electrical_active: false,
    workers_near_valve: z.tankB.workersNear,
    workers_in_confined: z.csC7.workersNear,
    worker_density: w.cv.density,
    ppe_violations: w.cv.helmet + w.cv.gloves + w.cv.jacket,
    unauthorized_access: w.cv.unauthorized,
    smoke_detected: w.cv.smoke,
    fire_detected: w.cv.fire,
    shift_type: w.shift.type,
    duty_hours: w.shift.dutyHours,
    fatigue: w.shift.fatigue,
  };
}

export async function analyze(frame) {
  const res = await fetch(`${API}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(frame),
  });
  if (!res.ok) throw new Error(`backend ${res.status}`);
  return res.json(); // { plant_risk_index, top_risk, risks[], anomaly, forecast, interventions[], advisory, ... }
}

// Example wiring inside your tick:
//
//   const frame = frameFromWorld(nextWorld);
//   try {
//     const r = await analyze(frame);
//     nextWorld.risks = r.risks.map(mapBackendRiskToUI);  // your existing shape
//     nextWorld.backendAdvisory = r.advisory;
//   } catch (e) {
//     // backend offline -> keep local computeRisks() result
//   }
//
// The backend risk objects already include `contributors`, `synergy`,
// `active_factors`, `severity`, and `zone`, so your Fusion Correlation graph and
// Risk Stack can render them with minimal changes.
