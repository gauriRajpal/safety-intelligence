import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
} from "recharts";
import {
  Flame, Wind, Activity, ShieldAlert, Siren, FileX, Bell, Wrench, Users,
  HardHat, Cctv, Zap, Thermometer, Cpu, Play, Pause, RotateCcw, Gauge,
  TriangleAlert, Radio, CircleDot, Sparkles, Loader2, Droplets, Waves,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   SENTINEL — Industrial Safety Intelligence Console
   Self-contained demo. Simulated IoT / SCADA / PTW / CCTV / shift streams feed
   a rule-based fusion engine that surfaces COMPOUND risks no single sensor flags.
   ────────────────────────────────────────────────────────────────────────── */

const C = {
  deck: "#0A111E",
  panel: "#111C30",
  panel2: "#0E1828",
  grid: "#22324E",
  line: "#1B2840",
  text: "#DCE6F5",
  muted: "#6B82A6",
  cyan: "#38BDF8",
  green: "#34D399",
  amber: "#FBBF24",
  red: "#F87171",
  crit: "#E879F9",
  ok: "#1F3A33",
};

const SEV = {
  normal:   { c: C.green, bg: "rgba(52,211,153,.10)", label: "NOMINAL" },
  elevated: { c: C.amber, bg: "rgba(251,191,36,.12)", label: "ELEVATED" },
  high:     { c: C.red,   bg: "rgba(248,113,113,.13)", label: "HIGH" },
  critical: { c: C.crit,  bg: "rgba(232,121,249,.15)", label: "CRITICAL" },
};
const band = (s) => (s >= 80 ? "critical" : s >= 60 ? "high" : s >= 35 ? "elevated" : "normal");

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const drift = (v, base, k, jitter) => v + (base - v) * k + rnd(-jitter, jitter);
const fmt = (n, d = 0) => Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
const pad = (n) => String(n).padStart(2, "0");

/* ── initial world ───────────────────────────────────────────────────────── */
function initWorld() {
  const start = new Date();
  start.setHours(2, 14, 0, 0); // night shift feel
  return {
    t: 0,
    clock: start,
    scenario: "normal",
    scenarioAge: 0,
    autoIntervene: true,
    shift: { type: "Night", dutyHours: 8.6, fatigue: 0.41, skill: "Mixed" },
    zones: {
      tankB: {
        name: "Tank B — Solvent Store", code: "TK-B", x: 150, y: 90,
        gas: 760, temp: 34, pressure: 2.1, valveTemp: 38, valvePos: 12,
        workersNear: 0, permit: { type: "Hot Work", id: "HW-1183", active: false },
      },
      pumpP2: {
        name: "Pump Station P-2", code: "P-2", x: 430, y: 80,
        vibration: 2.4, temp: 47, load: 64, maintOverdueDays: 0, workersNear: 0,
        permit: { type: "—", id: "—", active: false },
      },
      csC7: {
        name: "Confined Space C-7", code: "CS-7", x: 150, y: 250,
        h2s: 1.6, o2: 20.8, humidity: 58, workersNear: 1,
        permit: { type: "Confined Space", id: "CS-204", active: true },
      },
      bay: {
        name: "Loading Bay", code: "BAY", x: 430, y: 250,
        workersNear: 6, density: 0.34, permit: { type: "—", id: "—", active: false },
      },
    },
    cv: { helmet: 0, jacket: 0, gloves: 0, smoke: false, fire: false, unauthorized: false, density: 0.34 },
    history: [],
    risks: [],
    interventions: [],
    timeline: [{ t: 0, time: "02:14:00", text: "Console online · all streams nominal", kind: "sys" }],
    lastBand: {}, // riskKey -> band, to detect transitions
    failureETA: null,
  };
}

/* ── risk fusion engine ──────────────────────────────────────────────────── */
function computeRisks(w) {
  const z = w.zones, sh = w.shift, cv = w.cv;
  const risks = [];

  // 1) FIRE / EXPLOSION @ Tank B  (gas + hot work + proximity + valve temp)
  {
    const gasN = clamp01((z.tankB.gas - 800) / (9000 - 800));
    const hot = z.tankB.permit.active ? 1 : 0;
    const prox = clamp01(z.tankB.workersNear / 3);
    const vtN = clamp01((z.tankB.valveTemp - 35) / (120 - 35));
    const factors = [
      { label: "CH₄ at TK-B", val: gasN, raw: `${fmt(z.tankB.gas)} ppm`, w: 0.34, icon: Wind },
      { label: "Hot-work permit", val: hot, raw: hot ? z.tankB.permit.id : "none", w: 0.24, icon: Flame },
      { label: "Worker proximity", val: prox, raw: `${z.tankB.workersNear} near valve`, w: 0.16, icon: Users },
      { label: "Valve V-1 temp", val: vtN, raw: `${fmt(z.tankB.valveTemp)} °C`, w: 0.26, icon: Thermometer },
    ];
    pushRisk(risks, "fire", "Fire / Explosion", "Tank B", factors, z.tankB, Flame);
  }

  // 2) EQUIPMENT FAILURE @ Pump P-2  (vibration + temp + overdue maint + load)
  {
    const vibN = clamp01((z.pumpP2.vibration - 2.5) / (12 - 2.5));
    const tN = clamp01((z.pumpP2.temp - 50) / (105 - 50));
    const odN = clamp01(z.pumpP2.maintOverdueDays / 21);
    const loadN = clamp01((z.pumpP2.load - 60) / (100 - 60));
    const factors = [
      { label: "Bearing vibration", val: vibN, raw: `${fmt(z.pumpP2.vibration, 1)} mm/s`, w: 0.34, icon: Waves },
      { label: "Casing temp", val: tN, raw: `${fmt(z.pumpP2.temp)} °C`, w: 0.26, icon: Thermometer },
      { label: "Maint. overdue", val: odN, raw: `${z.pumpP2.maintOverdueDays} d`, w: 0.22, icon: Wrench },
      { label: "Machine load", val: loadN, raw: `${fmt(z.pumpP2.load)} %`, w: 0.18, icon: Gauge },
    ];
    const r = pushRisk(risks, "equip", "Equipment Failure", "Pump P-2", factors, z.pumpP2, Wrench);
    if (r && r.score >= 45) r.eta = Math.max(1, Math.round((100 - r.score) / 7));
  }

  // 3) TOXIC EXPOSURE @ Confined Space C-7  (H2S + O2 deficiency + occupancy)
  {
    const h2sN = clamp01((z.csC7.h2s - 2) / (20 - 2));
    const o2N = clamp01((20.9 - z.csC7.o2) / (20.9 - 16));
    const occ = clamp01(z.csC7.workersNear / 2);
    const factors = [
      { label: "H₂S level", val: h2sN, raw: `${fmt(z.csC7.h2s, 1)} ppm`, w: 0.4, icon: Wind },
      { label: "O₂ deficiency", val: o2N, raw: `${fmt(z.csC7.o2, 1)} %`, w: 0.34, icon: Droplets },
      { label: "Confined occupancy", val: occ, raw: `${z.csC7.workersNear} inside`, w: 0.26, icon: Users },
    ];
    pushRisk(risks, "toxic", "Toxic Exposure", "C-7", factors, z.csC7, Wind);
  }

  // 4) HUMAN ERROR  (night shift + duty hours + fatigue + PPE violations)
  {
    const night = sh.type === "Night" ? 1 : 0.2;
    const dutyN = clamp01((sh.dutyHours - 8) / (12 - 8));
    const fatN = clamp01(sh.fatigue);
    const ppe = cv.helmet + cv.jacket + cv.gloves;
    const ppeN = clamp01(ppe / 5);
    const factors = [
      { label: "Continuous duty", val: dutyN, raw: `${fmt(sh.dutyHours, 1)} h`, w: 0.3, icon: Activity },
      { label: "Fatigue index", val: fatN, raw: `${fmt(fatN * 100)} %`, w: 0.3, icon: Gauge },
      { label: "Night shift", val: night, raw: sh.type, w: 0.16, icon: CircleDot },
      { label: "PPE violations", val: ppeN, raw: `${ppe} active`, w: 0.24, icon: HardHat },
    ];
    pushRisk(risks, "human", "Human Error", "Crew", factors, sh, Users);
  }

  return risks.sort((a, b) => b.score - a.score);
}

function pushRisk(arr, key, category, zone, factors, ref, icon) {
  let base = 0;
  let active = 0;
  let individualAlarms = 0;
  for (const f of factors) {
    base += f.w * f.val;
    if (f.val > 0.4) active += 1;
    if (f.val > 0.85) individualAlarms += 1;
    f.contribution = Math.round(f.w * f.val * 100);
  }
  // synergy: compound co-occurrence amplifies — the core thesis
  const synergy = active >= 3 ? 1.34 : active === 2 ? 1.13 : 1.0;
  const score = Math.round(Math.min(100, base * 100 * synergy));
  if (score < 12) return null;
  const r = { key, category, zone, factors, score, synergy, active, individualAlarms, severity: band(score), icon };
  arr.push(r);
  return r;
}

/* ── intervention recommendations per risk type ─────────────────────────── */
function actionsFor(r, w) {
  const z = w.zones;
  switch (r.key) {
    case "fire":
      return [
        { label: `Suspend permit ${z.tankB.permit.id}`, icon: FileX },
        { label: "Trigger siren · Zone Tank B", icon: Siren },
        { label: "Notify shift supervisor", icon: Bell },
        { label: "Dispatch emergency response", icon: Radio },
      ];
    case "equip":
      return [
        { label: `Create maintenance ticket · ${r.zone}`, icon: Wrench },
        { label: "Throttle pump load to 60%", icon: Gauge },
        { label: "Notify maintenance lead", icon: Bell },
      ];
    case "toxic":
      return [
        { label: "Force-ventilate C-7", icon: Wind },
        { label: `Evacuate confined space (${z.csC7.workersNear})`, icon: Users },
        { label: "Trigger siren · Zone C-7", icon: Siren },
      ];
    case "human":
      return [
        { label: "Suggest crew rotation", icon: Users },
        { label: "Flag PPE re-check at gate", icon: HardHat },
        { label: "Notify shift supervisor", icon: Bell },
      ];
    default:
      return [{ label: "Notify supervisor", icon: Bell }];
  }
}

/* ── natural-language advisory (deterministic, always works) ─────────────── */
function advisory(r, w) {
  if (!r) return "All correlated streams nominal. No compound risk conditions detected. The fusion engine is monitoring 14 tags across 4 zones.";
  const z = w.zones;
  const facts = r.factors.map((f) => `${f.label} ${f.raw}`).join(", ");
  const lead = {
    fire: `Maintenance activity is ongoing near ${r.zone} while methane has climbed to ${fmt(z.tankB.gas)} ppm and valve V-1 is heating. Individually none of these trip an alarm — together they form a credible ignition pathway.`,
    equip: `Pump P-2 shows rising bearing vibration (${fmt(z.pumpP2.vibration, 1)} mm/s) and casing temperature with maintenance ${z.pumpP2.maintOverdueDays} days overdue. The signature matches historical pre-failure patterns.`,
    toxic: `H₂S is rising inside ${r.zone} as oxygen drops, with personnel still inside under permit ${z.csC7.permit.id}. Exposure risk is compounding.`,
    human: `${w.shift.type} crew is ${fmt(w.shift.dutyHours, 1)} h into continuous duty with fatigue at ${fmt(w.shift.fatigue * 100)}% and PPE violations rising on CCTV. Error-likelihood is elevated.`,
  }[r.key];
  const act = {
    fire: "Pause hot work, inspect ventilation, and clear personnel from the valve skid immediately.",
    equip: `Schedule preventive maintenance now — predicted failure window ≈ ${r.eta || 6} h.`,
    toxic: "Force-ventilate and evacuate the space before continuing the permit.",
    human: "Rotate the crew and re-verify PPE before the next task block.",
  }[r.key];
  return `${lead} Contributing signals: ${facts}. Recommendation: ${act}`;
}

/* ── simulation tick ─────────────────────────────────────────────────────── */
function tick(w) {
  // Exclude `risks` from the clone — it holds React icon components that
  // structuredClone can't copy. It's recomputed fresh below anyway.
  const { risks: _omit, ...cloneable } = w;
  const n = structuredClone(cloneable);
  n.risks = [];
  n.t += 1;
  n.clock = new Date(w.clock.getTime() + 6000); // 6 s per tick
  n.scenarioAge += 1;
  const z = n.zones;

  // organic baselines + noise
  z.tankB.gas = drift(z.tankB.gas, 780, 0.08, 40);
  z.tankB.temp = drift(z.tankB.temp, 34, 0.1, 0.6);
  z.tankB.valveTemp = drift(z.tankB.valveTemp, 38, 0.08, 0.8);
  z.tankB.pressure = drift(z.tankB.pressure, 2.1, 0.1, 0.05);
  z.pumpP2.vibration = drift(z.pumpP2.vibration, 2.4, 0.07, 0.15);
  z.pumpP2.temp = drift(z.pumpP2.temp, 47, 0.08, 0.7);
  z.pumpP2.load = drift(z.pumpP2.load, 64, 0.1, 2.5);
  z.csC7.h2s = drift(z.csC7.h2s, 1.6, 0.08, 0.2);
  z.csC7.o2 = drift(z.csC7.o2, 20.8, 0.1, 0.06);
  n.shift.fatigue = clamp01(drift(n.shift.fatigue, n.shift.type === "Night" ? 0.45 : 0.3, 0.04, 0.01));

  // scenario injection
  const age = n.scenarioAge;
  if (n.scenario === "gasHotWork") {
    z.tankB.permit.active = true;
    z.tankB.workersNear = 2;
    if (age < 26) {
      z.tankB.gas = Math.min(9600, z.tankB.gas + rnd(280, 620));
      z.tankB.valveTemp = Math.min(118, z.tankB.valveTemp + rnd(2.4, 5));
    } else n.scenario = "recover";
  } else if (n.scenario === "equipment") {
    z.pumpP2.maintOverdueDays = 14;
    if (age < 30) {
      z.pumpP2.vibration = Math.min(11.5, z.pumpP2.vibration + rnd(0.18, 0.42));
      z.pumpP2.temp = Math.min(102, z.pumpP2.temp + rnd(1.0, 2.4));
      z.pumpP2.load = Math.min(98, z.pumpP2.load + rnd(0.5, 2));
    } else n.scenario = "recover";
  } else if (n.scenario === "toxic") {
    z.csC7.workersNear = 2;
    if (age < 26) {
      z.csC7.h2s = Math.min(19, z.csC7.h2s + rnd(0.5, 1.2));
      z.csC7.o2 = Math.max(16.4, z.csC7.o2 - rnd(0.12, 0.3));
    } else n.scenario = "recover";
  } else if (n.scenario === "fatigue") {
    n.shift.type = "Night";
    if (age < 30) {
      n.shift.dutyHours = Math.min(11.5, n.shift.dutyHours + 0.18);
      n.shift.fatigue = clamp01(n.shift.fatigue + rnd(0.02, 0.05));
      n.cv.helmet = Math.min(2, n.cv.helmet + (Math.random() < 0.18 ? 1 : 0));
      n.cv.gloves = Math.min(2, n.cv.gloves + (Math.random() < 0.14 ? 1 : 0));
    } else n.scenario = "recover";
  } else if (n.scenario === "recover") {
    z.tankB.permit.active = false;
    z.tankB.workersNear = 0;
    z.pumpP2.maintOverdueDays = Math.max(0, z.pumpP2.maintOverdueDays - 1);
    n.shift.dutyHours = Math.max(8.6, n.shift.dutyHours - 0.15);
    n.cv.helmet = Math.max(0, n.cv.helmet - (Math.random() < 0.5 ? 1 : 0));
    n.cv.gloves = Math.max(0, n.cv.gloves - (Math.random() < 0.5 ? 1 : 0));
    if (age > 22) { n.scenario = "normal"; n.scenarioAge = 0; }
  } else {
    // normal — occasional benign PPE blip
    if (Math.random() < 0.06) n.cv.helmet = 1;
    else if (Math.random() < 0.2) n.cv.helmet = 0;
  }

  n.cv.density = z.bay.density = clamp01(drift(z.bay.density, n.scenario === "fatigue" ? 0.6 : 0.34, 0.1, 0.04));
  n.cv.unauthorized = n.scenario === "gasHotWork" && age > 6 && age < 20;
  n.cv.smoke = n.scenario === "gasHotWork" && age > 18 && age < 26;

  // recompute risks
  n.risks = computeRisks(n);
  const top = n.risks[0];

  // history (rolling 44)
  n.history = [...w.history, {
    t: n.t,
    label: `${pad(n.clock.getHours())}:${pad(n.clock.getMinutes())}`,
    ch4: Math.round(z.tankB.gas),
    valveTemp: Math.round(z.tankB.valveTemp),
    vib: Number(z.pumpP2.vibration.toFixed(1)),
    h2s: Number(z.csC7.h2s.toFixed(1)),
    top: top ? top.score : 0,
  }].slice(-44);

  // timeline + interventions on band transitions
  const timeStr = `${pad(n.clock.getHours())}:${pad(n.clock.getMinutes())}:${pad(n.clock.getSeconds())}`;
  n.lastBand = { ...w.lastBand };
  for (const r of n.risks) {
    const prev = w.lastBand[r.key] || "normal";
    const order = ["normal", "elevated", "high", "critical"];
    if (order.indexOf(r.severity) > order.indexOf(prev)) {
      n.timeline = [{ t: n.t, time: timeStr, text: `${r.category} → ${SEV[r.severity].label} (${r.score}%) · ${r.zone}`, kind: r.severity }, ...n.timeline].slice(0, 60);
      if ((r.severity === "high" || r.severity === "critical") && n.autoIntervene) {
        const acts = actionsFor(r, n).slice(0, r.severity === "critical" ? 4 : 2);
        for (const a of acts) {
          n.interventions = [{ id: `${n.t}-${a.label}`, t: n.t, time: timeStr, label: a.label, icon: a.icon.name, status: "executed", risk: r.key }, ...n.interventions].slice(0, 24);
        }
        n.timeline = [{ t: n.t, time: timeStr, text: `⚡ Auto-intervention dispatched · ${r.category}`, kind: "action" }, ...n.timeline].slice(0, 60);
      }
    }
    n.lastBand[r.key] = r.severity;
  }
  return n;
}

/* ── tiny UI atoms ───────────────────────────────────────────────────────── */
function Panel({ title, icon: Icon, children, right, accent = C.cyan, style }) {
  return (
    <section className="sx-panel" style={style}>
      <header className="sx-phead">
        <div className="sx-ptitle">
          {Icon && <Icon size={13} style={{ color: accent }} />}
          <span>{title}</span>
        </div>
        {right}
      </header>
      <div className="sx-pbody">{children}</div>
    </section>
  );
}

function GlobalMeter({ score }) {
  const sev = SEV[band(score)];
  const r = 30, circ = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke={C.line} strokeWidth="7" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={sev.c} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} transform="rotate(-90 38 38)"
          style={{ transition: "stroke-dasharray .6s ease, stroke .4s" }} />
        <text x="38" y="35" textAnchor="middle" fontSize="20" fontWeight="700" fill={C.text} fontFamily="'IBM Plex Mono',monospace">{score}</text>
        <text x="38" y="49" textAnchor="middle" fontSize="8" fill={C.muted} fontFamily="'IBM Plex Mono',monospace">/ 100</text>
      </svg>
      <div>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>PLANT RISK INDEX</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: sev.c, fontFamily: "'IBM Plex Mono',monospace" }}>{sev.label}</div>
      </div>
    </div>
  );
}

/* ── digital twin mimic panel ────────────────────────────────────────────── */
function Mimic({ w, riskByZone }) {
  const z = w.zones;
  const nodes = [z.tankB, z.pumpP2, z.csC7, z.bay];
  const sevOf = (code) => SEV[riskByZone[code] || "normal"];
  return (
    <svg viewBox="0 0 580 330" style={{ width: "100%", height: "100%", display: "block" }}>
      {/* pipes */}
      <g stroke={C.grid} strokeWidth="2" fill="none">
        <path d="M210 110 H 430" />
        <path d="M150 130 V 250" />
        <path d="M430 120 V 250" />
        <path d="M210 270 H 430" />
      </g>
      {/* flow dashes */}
      <g stroke={C.cyan} strokeWidth="1.6" fill="none" opacity="0.5" className="sx-flow">
        <path d="M210 110 H 430" strokeDasharray="4 10" />
        <path d="M150 130 V 250" strokeDasharray="4 10" />
      </g>
      {nodes.map((nd) => {
        const sev = sevOf(nd.code);
        const alarm = sev.label !== "NOMINAL";
        return (
          <g key={nd.code} transform={`translate(${nd.x},${nd.y})`}>
            {alarm && <rect x="-58" y="-30" width="116" height="60" rx="9" fill={sev.bg} className="sx-pulse" />}
            <rect x="-58" y="-30" width="116" height="60" rx="9" fill={C.panel2} stroke={sev.c} strokeWidth={alarm ? 2 : 1.2} />
            <text x="0" y="-10" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text} fontFamily="'IBM Plex Mono',monospace">{nd.code}</text>
            <text x="0" y="6" textAnchor="middle" fontSize="8" fill={C.muted}>{nd.name.split("—")[0].trim().slice(0, 18)}</text>
            <circle cx="-44" cy="-18" r="4" fill={sev.c} className={alarm ? "sx-blink" : ""} />
            {/* workers */}
            {Array.from({ length: Math.min(nd.workersNear || 0, 6) }).map((_, i) => (
              <circle key={i} cx={-34 + i * 12} cy={20} r="3.2" fill={C.cyan} />
            ))}
            {nd.permit?.active && <text x="0" y="24" textAnchor="middle" fontSize="7.5" fill={C.amber} fontFamily="'IBM Plex Mono',monospace">⚑ {nd.permit.id}</text>}
          </g>
        );
      })}
      <text x="14" y="320" fontSize="8.5" fill={C.muted} fontFamily="'IBM Plex Mono',monospace">● live worker positions   ⚑ active permit   ◉ zone risk state</text>
    </svg>
  );
}

/* ── fusion correlation graph — the signature ────────────────────────────── */
function FusionGraph({ risk }) {
  if (!risk) {
    return (
      <div className="sx-empty">
        <Cpu size={26} style={{ color: C.muted, opacity: 0.5 }} />
        <div>Fusion engine idle — correlating 14 tags.<br />No compound condition exceeds threshold.</div>
      </div>
    );
  }
  const sev = SEV[risk.severity];
  const fs = risk.factors;
  const H = Math.max(150, fs.length * 42 + 24);
  const fy = (i) => 22 + i * ((H - 44) / Math.max(fs.length - 1, 1));
  return (
    <div>
      <svg viewBox={`0 0 560 ${H}`} style={{ width: "100%", height: H }}>
        {/* wires into fusion node */}
        {fs.map((f, i) => {
          const active = f.val > 0.4;
          return (
            <path key={i} d={`M168 ${fy(i)} C 240 ${fy(i)}, 250 ${H / 2}, 300 ${H / 2}`}
              fill="none" stroke={active ? sev.c : C.line} strokeWidth={active ? 1.6 + f.val * 2 : 1}
              opacity={active ? 0.85 : 0.35} className={active ? "sx-wire" : ""} />
          );
        })}
        {/* source chips */}
        {fs.map((f, i) => {
          const active = f.val > 0.4;
          return (
            <g key={i} transform={`translate(8 ${fy(i) - 15})`}>
              <rect width="160" height="30" rx="6" fill={C.panel2} stroke={active ? sev.c : C.line} strokeWidth="1" />
              <text x="9" y="13" fontSize="9.5" fill={C.text} fontFamily="'IBM Plex Mono',monospace">{f.label}</text>
              <text x="9" y="24" fontSize="8.5" fill={C.muted} fontFamily="'IBM Plex Mono',monospace">{f.raw}</text>
              <text x="151" y="19" textAnchor="end" fontSize="10" fontWeight="700" fill={active ? sev.c : C.muted} fontFamily="'IBM Plex Mono',monospace">+{f.contribution}</text>
            </g>
          );
        })}
        {/* fusion core */}
        <g transform={`translate(300 ${H / 2 - 26})`}>
          <rect width="92" height="52" rx="9" fill={C.panel2} stroke={sev.c} strokeWidth="2" className="sx-pulse" />
          <text x="46" y="20" textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="'IBM Plex Mono',monospace">FUSION</text>
          <text x="46" y="38" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.text} fontFamily="'IBM Plex Mono',monospace">×{risk.synergy.toFixed(2)}</text>
        </g>
        <path d={`M392 ${H / 2} H 446`} stroke={sev.c} strokeWidth="2.4" fill="none" className="sx-wire" />
        {/* verdict */}
        <g transform={`translate(446 ${H / 2 - 30})`}>
          <rect width="106" height="60" rx="9" fill={sev.bg} stroke={sev.c} strokeWidth="2" />
          <text x="53" y="20" textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="'IBM Plex Mono',monospace">{risk.category}</text>
          <text x="53" y="42" textAnchor="middle" fontSize="22" fontWeight="800" fill={sev.c} fontFamily="'IBM Plex Mono',monospace">{risk.score}%</text>
        </g>
      </svg>
      <div className="sx-thesis">
        <TriangleAlert size={13} style={{ color: sev.c, flexShrink: 0, marginTop: 1 }} />
        <span>
          <b style={{ color: C.text }}>{risk.individualAlarms} of {fs.length}</b> signals breach their own alarm threshold —
          yet <b style={{ color: sev.c }}>{risk.active} co-occurring</b> factors compound into a <b style={{ color: sev.c }}>{sev.label}</b> verdict. This is the risk no single sensor would flag.
        </span>
      </div>
    </div>
  );
}

/* ── main component ──────────────────────────────────────────────────────── */
/* ── backend bridge ──────────────────────────────────────────────────────
   Maps the local simulated world to the FastAPI /analyze contract, and maps
   the ML response back into the exact risk shape the UI already renders. */
const ICON_BY_KEY = { fire: Flame, explosion: Flame, toxic: Wind, equipment: Wrench, human_error: Users };

function frameFromWorld(w) {
  const z = w.zones;
  return {
    zone: "Tank B",
    location_id: "tank-b",
    ch4: z.tankB.gas, valve_temp: z.tankB.valveTemp, valve_pos: z.tankB.valvePos,
    temp: z.tankB.temp, pressure: z.tankB.pressure,
    h2s: z.csC7.h2s, o2: z.csC7.o2, humidity: z.csC7.humidity,
    pump_vibration: z.pumpP2.vibration, pump_temp: z.pumpP2.temp,
    pump_load: z.pumpP2.load, maint_overdue_days: z.pumpP2.maintOverdueDays,
    hot_work_active: z.tankB.permit.active,
    confined_space_active: z.csC7.permit.active, electrical_active: false,
    workers_near_valve: z.tankB.workersNear, workers_in_confined: z.csC7.workersNear,
    worker_density: w.cv.density,
    ppe_violations: w.cv.helmet + w.cv.gloves + w.cv.jacket,
    unauthorized_access: w.cv.unauthorized, smoke_detected: w.cv.smoke, fire_detected: w.cv.fire,
    shift_type: w.shift.type, duty_hours: w.shift.dutyHours, fatigue: w.shift.fatigue,
  };
}

function mapBackendRisk(r) {
  const factors = (r.contributors || []).map((c) => ({
    label: c.label, val: c.value, raw: c.raw, contribution: Math.round(c.value * 100),
  }));
  return {
    key: r.key, category: r.category, zone: r.zone, score: Math.round(r.score),
    severity: r.severity, synergy: r.synergy, active: r.active_factors,
    individualAlarms: factors.filter((f) => f.val > 0.85).length,
    factors, icon: ICON_BY_KEY[r.key] || ShieldAlert,
  };
}

export default function SafetyConsole() {
  const [world, setWorld] = useState(initWorld);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1400);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [useBackend, setUseBackend] = useState(false);
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000");
  const [backendStatus, setBackendStatus] = useState("off"); // off | connecting | ok | error
  const [backendRisks, setBackendRisks] = useState(null);
  const [backendAdvisory, setBackendAdvisory] = useState("");
  const timer = useRef(null);
  const inflight = useRef(false);

  // inject fonts + stylesheet once
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap";
    document.head.appendChild(link);
    const st = document.createElement("style");
    st.textContent = SHEET;
    document.head.appendChild(st);
    return () => { link.remove(); st.remove(); };
  }, []);

  // sim loop
  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setWorld((w) => tick(w)), speed);
    return () => clearInterval(timer.current);
  }, [running, speed]);

  // backend bridge — each tick, send the frame to /analyze and use the ML output
  useEffect(() => {
    if (!useBackend) return;
    if (inflight.current) return;
    inflight.current = true;
    fetch(`${backendUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frameFromWorld(world)),
    })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((data) => {
        setBackendRisks((data.risks || []).map(mapBackendRisk));
        if (data.advisory) setBackendAdvisory(data.advisory);
        setBackendStatus("ok");
      })
      .catch(() => setBackendStatus("error"))
      .finally(() => { inflight.current = false; });
  }, [world, useBackend, backendUrl]);

  // risks shown: backend ML output when connected, else local fusion (fallback)
  const displayRisks = useBackend && backendStatus === "ok" && backendRisks ? backendRisks : world.risks;
  const top = displayRisks[0] || null;
  const globalScore = top ? top.score : 0;
  const riskByZone = useMemo(() => {
    const m = {};
    for (const r of displayRisks) {
      const code = { "Tank B": "TK-B", "Pump P-2": "P-2", "C-7": "CS-7", "Crew": "BAY" }[r.zone];
      if (code && (!m[code] || SEV[r.severity].label !== "NOMINAL")) m[code] = r.severity;
    }
    return m;
  }, [displayRisks]);

  const trigger = (s) => {
    setAiText("");
    setWorld((w) => ({ ...w, scenario: s, scenarioAge: 0 }));
    if (!running) setRunning(true);
  };
  const reset = () => { setWorld(initWorld()); setAiText(""); };

  async function deeperAnalysis() {
    if (!top) return;
    setAiLoading(true); setAiText("");
    const prompt = `You are SENTINEL, an industrial safety AI advisor for a chemical plant control room. Given the live fused-risk snapshot below, write a concise (max 90 words) operations advisory: state the compound mechanism in plain language, why it matters, and 2 specific immediate actions for the shift supervisor. No preamble, no markdown headers.\n\nRISK: ${top.category} at ${top.zone} — score ${top.score}/100 (${SEV[top.severity].label}).\nContributing signals: ${top.factors.map((f) => `${f.label}=${f.raw} (weight ${f.contribution})`).join("; ")}.\nSynergy multiplier ${top.synergy}. Shift: ${world.shift.type}, ${world.shift.dutyHours.toFixed(1)}h duty, fatigue ${(world.shift.fatigue * 100).toFixed(0)}%.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      setAiText(txt || advisory(top, world));
    } catch {
      setAiText(advisory(top, world) + "\n\n[Offline — generated by the on-device advisory template. Connect to a network for live LLM analysis.]");
    } finally {
      setAiLoading(false);
    }
  }

  const clk = world.clock;
  const clockStr = `${pad(clk.getHours())}:${pad(clk.getMinutes())}:${pad(clk.getSeconds())}`;

  return (
    <div className="sx-root">
      {/* TOP BAR */}
      <div className="sx-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="sx-logo"><ShieldAlert size={18} /></div>
          <div>
            <div className="sx-brand">SENTINEL</div>
            <div className="sx-sub">Industrial Safety Intelligence · Plant 04 / Ash Croft</div>
          </div>
        </div>
        <GlobalMeter score={globalScore} />
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div className="sx-clock">
            <div className="sx-clk-t">{clockStr}</div>
            <div className="sx-clk-l">{world.shift.type.toUpperCase()} · TICK {world.t}</div>
          </div>
          <div className="sx-controls">
            <button className="sx-ic" onClick={() => setRunning((r) => !r)} title={running ? "Pause" : "Run"}>
              {running ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className="sx-ic" onClick={reset} title="Reset"><RotateCcw size={14} /></button>
            <select className="sx-sel" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={2400}>0.5×</option><option value={1400}>1×</option><option value={700}>2×</option>
            </select>
          </div>
        </div>
      </div>

      {/* SCENARIO BAR */}
      <div className="sx-scenbar">
        <span className="sx-scenlabel">INJECT SCENARIO</span>
        <button className="sx-scen" onClick={() => trigger("gasHotWork")}><Flame size={12} />Gas + Hot Work</button>
        <button className="sx-scen" onClick={() => trigger("toxic")}><Wind size={12} />Confined-Space Toxic</button>
        <button className="sx-scen" onClick={() => trigger("equipment")}><Wrench size={12} />Pump Degradation</button>
        <button className="sx-scen" onClick={() => trigger("fatigue")}><Users size={12} />Crew Fatigue</button>
        <button className="sx-scen sx-scen-calm" onClick={() => trigger("recover")}><RotateCcw size={12} />Stand Down</button>
        <label className="sx-auto" title="Send each frame to the FastAPI backend and use its ML predictions">
          <input type="checkbox" checked={useBackend} onChange={(e) => { setUseBackend(e.target.checked); setBackendStatus(e.target.checked ? "connecting" : "off"); }} />
          ML BACKEND
          <span style={{ width: 8, height: 8, borderRadius: "50%", marginLeft: 5,
            background: backendStatus === "ok" ? C.green : backendStatus === "error" ? C.red : backendStatus === "connecting" ? C.amber : C.muted }} />
        </label>
        {useBackend && (
          <input className="sx-sel" style={{ width: 190 }} value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)} placeholder="http://localhost:8000" />
        )}
        <label className="sx-auto">
          <input type="checkbox" checked={world.autoIntervene} onChange={(e) => setWorld((w) => ({ ...w, autoIntervene: e.target.checked }))} />
          AUTO-INTERVENE
        </label>
      </div>

      {/* GRID */}
      <div className="sx-grid">
        <Panel title="Plant Digital Twin · Mimic" icon={Activity} style={{ gridArea: "twin" }} accent={C.cyan}>
          <div style={{ height: 300 }}><Mimic w={world} riskByZone={riskByZone} /></div>
        </Panel>

        <Panel title="Predicted Risk Stack" icon={ShieldAlert} style={{ gridArea: "stack" }} accent={C.red}>
          <div className="sx-riskstack">
            {displayRisks.length === 0 && <div className="sx-empty-sm">No active risk predictions.</div>}
            {displayRisks.map((r) => {
              const sev = SEV[r.severity];
              const Icon = r.icon;
              return (
                <div key={r.key} className="sx-riskrow" style={{ borderColor: sev.c, background: sev.bg }}>
                  <Icon size={15} style={{ color: sev.c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sx-rk-cat">{r.category}<span className="sx-rk-zone"> · {r.zone}</span></div>
                    <div className="sx-bar"><span style={{ width: `${r.score}%`, background: sev.c }} /></div>
                    {r.eta && <div className="sx-eta">predicted failure ≈ {r.eta} h</div>}
                  </div>
                  <div className="sx-rk-score" style={{ color: sev.c }}>{r.score}<small>%</small></div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Event Fusion Engine · Compound Correlation" icon={Cpu} style={{ gridArea: "fusion" }} accent={top ? SEV[top.severity].c : C.cyan}>
          <FusionGraph risk={top} />
        </Panel>

        <Panel title="Generative Safety Advisor" icon={Sparkles} style={{ gridArea: "advisor" }} accent={C.crit}
          right={<button className="sx-aibtn" onClick={deeperAnalysis} disabled={!top || aiLoading}>
            {aiLoading ? <Loader2 size={11} className="sx-spin" /> : <Sparkles size={11} />} Ask AI
          </button>}>
          <div className="sx-advisory">{aiText || (useBackend && backendStatus === "ok" && backendAdvisory) || advisory(top, world)}</div>
          {top && <div className="sx-advfoot">{aiText ? "Live LLM analysis · Claude" : (useBackend && backendStatus === "ok") ? "Advisory from ML backend" : "On-device advisory · tap Ask AI for live LLM reasoning"}</div>}
        </Panel>

        <Panel title="Live Sensor Telemetry" icon={Gauge} style={{ gridArea: "charts" }} accent={C.cyan}>
          <MiniChart data={world.history} dataKey="ch4" color={C.amber} label="CH₄ ppm @ TK-B" />
          <MiniChart data={world.history} dataKey="vib" color={C.cyan} label="Vibration mm/s @ P-2" />
          <MiniChart data={world.history} dataKey="top" color={C.red} label="Top fused risk %" />
        </Panel>

        <Panel title="Computer Vision · CCTV" icon={Cctv} style={{ gridArea: "cv" }} accent={C.green}>
          <div className="sx-cvgrid">
            <CvTile ok={world.cv.helmet === 0} icon={HardHat} label="Helmet" v={world.cv.helmet ? `${world.cv.helmet} missing` : "OK"} />
            <CvTile ok={world.cv.gloves === 0} icon={HardHat} label="Gloves" v={world.cv.gloves ? `${world.cv.gloves} missing` : "OK"} />
            <CvTile ok={!world.cv.smoke && !world.cv.fire} icon={Flame} label="Smoke/Fire" v={world.cv.smoke ? "SMOKE" : world.cv.fire ? "FIRE" : "clear"} />
            <CvTile ok={!world.cv.unauthorized} icon={ShieldAlert} label="Access" v={world.cv.unauthorized ? "INTRUSION" : "authorized"} />
            <CvTile ok={world.cv.density < 0.55} icon={Users} label="Density" v={`${fmt(world.cv.density * 100)}%`} />
            <CvTile ok={world.shift.fatigue < 0.6} icon={Activity} label="Fatigue" v={`${fmt(world.shift.fatigue * 100)}%`} />
          </div>
        </Panel>

        <Panel title="Intervention Engine" icon={Zap} style={{ gridArea: "interv" }} accent={C.amber}>
          <div className="sx-interv">
            {world.interventions.length === 0 && <div className="sx-empty-sm">No automated actions dispatched.</div>}
            {world.interventions.map((iv) => (
              <div key={iv.id} className="sx-ivrow">
                <Zap size={12} style={{ color: C.amber, flexShrink: 0 }} />
                <span className="sx-iv-l">{iv.label}</span>
                <span className="sx-iv-s">{iv.status}</span>
                <span className="sx-iv-t">{iv.time}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Incident Timeline" icon={Radio} style={{ gridArea: "timeline" }} accent={C.cyan}>
          <div className="sx-timeline">
            {world.timeline.map((e, i) => {
              const col = e.kind === "action" ? C.amber : SEV[e.kind] ? SEV[e.kind].c : C.muted;
              return (
                <div key={i} className="sx-tlrow">
                  <span className="sx-tl-t">{e.time}</span>
                  <span className="sx-tl-dot" style={{ background: col }} />
                  <span className="sx-tl-x">{e.text}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="sx-foot">SENTINEL is a simulated demonstrator. Fused risk scores are produced by a transparent weighted-synergy model standing in for the production XGBoost / LSTM ensemble. No live plant is connected.</div>
    </div>
  );
}

function MiniChart({ data, dataKey, color, label }) {
  return (
    <div className="sx-chart">
      <div className="sx-chart-l">{label}</div>
      <ResponsiveContainer width="100%" height={56}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.line} vertical={false} />
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.grid}`, borderRadius: 6, fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }} labelStyle={{ color: C.muted }} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CvTile({ ok, icon: Icon, label, v }) {
  const col = ok ? C.green : C.red;
  return (
    <div className="sx-cvtile" style={{ borderColor: ok ? C.line : col }}>
      <Icon size={14} style={{ color: col }} />
      <div className="sx-cv-l">{label}</div>
      <div className="sx-cv-v" style={{ color: col }}>{v}</div>
    </div>
  );
}

/* ── stylesheet ──────────────────────────────────────────────────────────── */
const SHEET = `
.sx-root{font-family:'Space Grotesk',system-ui,sans-serif;background:${C.deck};color:${C.text};
  min-height:100vh;padding:14px;box-sizing:border-box;
  background-image:radial-gradient(circle at 20% 0%,rgba(56,189,248,.05),transparent 40%),radial-gradient(circle at 90% 100%,rgba(232,121,249,.04),transparent 45%);}
.sx-root *{box-sizing:border-box}
.sx-topbar{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;
  background:${C.panel};border:1px solid ${C.grid};border-radius:12px;padding:12px 16px;}
.sx-logo{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:${C.deck};
  background:linear-gradient(135deg,${C.cyan},${C.crit});}
.sx-brand{font-size:18px;font-weight:700;letter-spacing:3px}
.sx-sub{font-size:10px;color:${C.muted};letter-spacing:.5px}
.sx-clock{text-align:right}
.sx-clk-t{font-family:'IBM Plex Mono',monospace;font-size:18px;font-weight:500;color:${C.cyan}}
.sx-clk-l{font-size:9px;color:${C.muted};letter-spacing:1.5px}
.sx-controls{display:flex;gap:6px;align-items:center}
.sx-ic{width:30px;height:30px;border-radius:7px;border:1px solid ${C.grid};background:${C.panel2};color:${C.text};
  display:grid;place-items:center;cursor:pointer}
.sx-ic:hover{border-color:${C.cyan};color:${C.cyan}}
.sx-sel{background:${C.panel2};color:${C.text};border:1px solid ${C.grid};border-radius:7px;padding:6px;font-size:11px;
  font-family:'IBM Plex Mono',monospace;cursor:pointer}
.sx-scenbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0}
.sx-scenlabel{font-size:9px;color:${C.muted};letter-spacing:1.5px;margin-right:2px}
.sx-scen{display:flex;align-items:center;gap:6px;font-family:'Space Grotesk';font-size:12px;font-weight:500;
  background:${C.panel};border:1px solid ${C.grid};color:${C.text};border-radius:8px;padding:7px 12px;cursor:pointer}
.sx-scen:hover{border-color:${C.amber};color:${C.amber}}
.sx-scen-calm:hover{border-color:${C.green};color:${C.green}}
.sx-auto{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:10px;letter-spacing:1px;color:${C.muted};cursor:pointer}
.sx-auto input{accent-color:${C.cyan}}
.sx-grid{display:grid;gap:12px;grid-template-columns:1.35fr 1fr;
  grid-template-areas:
   "twin stack"
   "fusion advisor"
   "charts cv"
   "interv cv"
   "timeline timeline";}
@media(max-width:900px){.sx-grid{grid-template-columns:1fr;grid-template-areas:"twin" "stack" "fusion" "advisor" "charts" "cv" "interv" "timeline";}}
.sx-panel{background:${C.panel};border:1px solid ${C.grid};border-radius:12px;display:flex;flex-direction:column;overflow:hidden}
.sx-phead{display:flex;align-items:center;justify-content:space-between;padding:9px 13px;border-bottom:1px solid ${C.line};background:${C.panel2}}
.sx-ptitle{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;letter-spacing:1px;color:${C.text};text-transform:uppercase}
.sx-pbody{padding:13px;flex:1}
.sx-empty{height:100%;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  color:${C.muted};font-size:11px;text-align:center;font-family:'IBM Plex Mono',monospace;line-height:1.6}
.sx-empty-sm{color:${C.muted};font-size:11px;padding:16px;text-align:center;font-family:'IBM Plex Mono',monospace}
.sx-riskstack{display:flex;flex-direction:column;gap:8px}
.sx-riskrow{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid;border-radius:9px}
.sx-rk-cat{font-size:12px;font-weight:600}
.sx-rk-zone{color:${C.muted};font-weight:400;font-size:11px}
.sx-rk-score{font-family:'IBM Plex Mono',monospace;font-size:19px;font-weight:700}
.sx-rk-score small{font-size:10px;opacity:.7}
.sx-bar{height:5px;border-radius:3px;background:${C.line};margin-top:5px;overflow:hidden}
.sx-bar span{display:block;height:100%;border-radius:3px;transition:width .6s ease}
.sx-eta{font-size:9.5px;color:${C.amber};font-family:'IBM Plex Mono',monospace;margin-top:4px}
.sx-thesis{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.55;color:${C.muted};
  border-top:1px solid ${C.line};padding-top:10px;margin-top:4px}
.sx-advisory{font-size:13px;line-height:1.65;color:${C.text};white-space:pre-wrap;min-height:120px;
  font-family:'Space Grotesk'}
.sx-advfoot{font-size:9.5px;color:${C.muted};letter-spacing:.5px;margin-top:10px;border-top:1px solid ${C.line};padding-top:8px;font-family:'IBM Plex Mono',monospace}
.sx-aibtn{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;letter-spacing:.5px;
  background:${C.panel};border:1px solid ${C.crit};color:${C.crit};border-radius:7px;padding:5px 10px;cursor:pointer}
.sx-aibtn:disabled{opacity:.4;cursor:default;border-color:${C.grid};color:${C.muted}}
.sx-chart{margin-bottom:8px}
.sx-chart-l{font-size:9.5px;color:${C.muted};font-family:'IBM Plex Mono',monospace;margin-bottom:2px;letter-spacing:.5px}
.sx-cvgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.sx-cvtile{border:1px solid;border-radius:9px;padding:9px;display:flex;flex-direction:column;gap:3px;background:${C.panel2}}
.sx-cv-l{font-size:9.5px;color:${C.muted};letter-spacing:.5px}
.sx-cv-v{font-size:11px;font-weight:600;font-family:'IBM Plex Mono',monospace}
.sx-interv{display:flex;flex-direction:column;gap:6px;max-height:170px;overflow-y:auto}
.sx-ivrow{display:flex;align-items:center;gap:8px;font-size:11px;padding:6px 8px;background:${C.panel2};border-radius:7px;border:1px solid ${C.line}}
.sx-iv-l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sx-iv-s{font-size:9px;color:${C.green};text-transform:uppercase;letter-spacing:1px}
.sx-iv-t{font-size:9px;color:${C.muted};font-family:'IBM Plex Mono',monospace}
.sx-timeline{display:flex;flex-direction:column;gap:2px;max-height:200px;overflow-y:auto}
.sx-tlrow{display:flex;align-items:center;gap:10px;font-size:11.5px;padding:5px 4px;border-bottom:1px solid ${C.line}}
.sx-tl-t{font-family:'IBM Plex Mono',monospace;font-size:10px;color:${C.muted};width:58px;flex-shrink:0}
.sx-tl-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.sx-tl-x{color:${C.text}}
.sx-foot{font-size:9.5px;color:${C.muted};text-align:center;margin-top:14px;line-height:1.5;font-family:'IBM Plex Mono',monospace}
.sx-flow{animation:sxdash 1s linear infinite}
@keyframes sxdash{to{stroke-dashoffset:-14}}
.sx-wire{stroke-dasharray:6 5;animation:sxdash 0.7s linear infinite}
.sx-pulse{animation:sxpulse 1.8s ease-in-out infinite}
@keyframes sxpulse{0%,100%{opacity:.55}50%{opacity:1}}
.sx-blink{animation:sxblink 1s step-end infinite}
@keyframes sxblink{50%{opacity:.2}}
.sx-spin{animation:sxspin 1s linear infinite}
@keyframes sxspin{to{transform:rotate(360deg)}}
::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-thumb{background:${C.grid};border-radius:4px}
@media(prefers-reduced-motion:reduce){.sx-flow,.sx-wire,.sx-pulse,.sx-blink,.sx-spin{animation:none}}
`;
