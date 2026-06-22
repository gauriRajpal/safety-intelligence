# SENTINEL — Industrial Safety Intelligence Backend

FastAPI backend that turns the SENTINEL frontend's rule-based scoring into a
real ML pipeline: it fuses IoT / SCADA / PTW / CCTV / shift data into a single
predictive layer and detects **compound** risks that no single sensor flags.

The whole system is reachable through one endpoint — `POST /analyze` — which
runs the full pipeline and returns everything the React console needs.

---

## What's real vs. what needs your data/hardware

Be clear about this when you present — it earns trust.

| Subsystem | State |
|---|---|
| Risk engine (XGBoost, 5 targets) | **Trains and runs** on the included synthetic generator |
| Anomaly detection (Isolation Forest) | **Trains and runs** |
| Time-series forecast (PyTorch LSTM) | **Trains and runs** |
| Event fusion + compound detection | **Runs** (always on, even before training) |
| Intervention engine | **Runs** |
| GenAI advisor (LangChain + Anthropic) | **Runs** with `ANTHROPIC_API_KEY`; deterministic template fallback otherwise |
| Knowledge graph (Neo4j) | **Runs** when Neo4j is up + seeded; boost = 0 otherwise |
| Computer vision (YOLOv11) | **Pipeline + inference service provided.** Needs a labeled dataset + GPU to train — can't be done in a hackathon window |
| Kafka | Optional compose profile; the demo path is synchronous REST |

Models load lazily with a heuristic fallback, so **the API works the moment it
starts** and gets smarter after one training command.

---

## Folder structure

```
sentinel-backend/
├── app/
│   ├── main.py                 FastAPI app + CORS for the SENTINEL dev server
│   ├── config.py               env-driven settings
│   ├── schemas.py              REST contract (FrameIn / AnalyzeResponse)
│   ├── api/
│   │   ├── pipeline.py         end-to-end analyze() pipeline
│   │   └── routes.py           /analyze + granular endpoints
│   ├── ml/
│   │   ├── features.py         FEATURE_ORDER — single source of truth
│   │   ├── synth.py            synthetic data generator (labels encode synergy)
│   │   ├── train_risk.py       XGBoost (one model per risk)
│   │   ├── train_anomaly.py    Isolation Forest
│   │   ├── train_lstm.py       PyTorch LSTM forecaster
│   │   ├── train_all.py        generate data + train everything
│   │   ├── risk_model.py / anomaly_model.py / forecaster.py   inference + fallback
│   │   └── registry.py         lazy singletons
│   ├── fusion/engine.py        unified risk vector + compound detection
│   ├── intervention/engine.py  severity -> prioritized actions
│   ├── advisor/llm.py          prompt template + LangChain/Anthropic + fallback
│   ├── graph/neo4j_client.py   schema, cypher, context_boost()
│   └── db/models.py            SQLAlchemy events/incidents logging
├── cv/
│   ├── train_yolo.py           YOLOv11 training pipeline + data.yaml
│   └── infer_service.py        /cv/detect -> fusion-ready CCTV signals
├── scripts/seed_graph.py       demo Neo4j graph
├── frontend-integration.js     drop-in hook for your React console
├── requirements.txt  Dockerfile  docker-compose.yml  .env.example
```

---

## Quick start (no infra needed)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt          # CV stack is optional, see notes
uvicorn app.main:app --reload --port 8000
```

API is live immediately (heuristic mode). Train the real models:

```bash
python -m app.ml.train_all               # ~1-2 min on CPU
```

Restart and the trained XGBoost/IForest/LSTM artifacts load automatically.
Interactive docs at `http://localhost:8000/docs`.

### Try it
```bash
curl -X POST localhost:8000/analyze -H 'content-type: application/json' -d '{
  "ch4": 6200, "valve_temp": 95, "hot_work_active": true,
  "workers_near_valve": 2, "shift_type": "Night", "duty_hours": 10.5, "fatigue": 0.8
}'
```

---

## Full stack (Docker)

```bash
cp .env.example .env        # add ANTHROPIC_API_KEY for live advisories (optional)
docker compose up --build   # api + postgres + redis + neo4j
# optional: docker compose --profile streaming up   # adds kafka
```

The API container trains models on first boot if none exist. Seed the demo graph:

```bash
docker compose exec api python -m scripts.seed_graph
```

---

## API contract (what the frontend codes against)

| Method | Path | Purpose |
|---|---|---|
| POST | `/analyze` | **Full pipeline** — risk + anomaly + forecast + graph + fusion + interventions + advisory |
| POST | `/predict/risk` | XGBoost scores + per-risk feature importances |
| POST | `/detect/anomaly` | Isolation Forest score + flag |
| POST | `/predict/forecast` | LSTM CH4 trend for the zone |
| POST | `/fuse` | unified risk vector only |
| POST | `/intervene` | recommended actions |
| POST | `/advisor` | natural-language advisory |
| GET | `/graph/context/{location_id}` | graph context + risk boost |
| GET | `/health` | model training status |

`/analyze` response shape: `plant_risk_index`, `top_risk`, `risks[]` (each with
`score`, `severity`, `synergy`, `active_factors`, `contributors[]`), `anomaly`,
`forecast`, `interventions[]`, `advisory`, `graph_boost`, `models`.

---

## Wiring SENTINEL to the backend

See `frontend-integration.js`. In short: map your `world` to a frame with
`frameFromWorld()`, `POST /analyze` each tick, and render `risks[]` /
`advisory`. Wrap the call in try/catch so your existing local `computeRisks()`
stays as an offline fallback.

---

## How each subsystem meets the brief

- **Compound risk:** the synthetic labels and the fusion layer both apply a
  synergy multiplier when ≥3 weak drivers co-occur. XGBoost *learns* that
  interaction from data — high scores arise only from combinations, never one
  sensor. The `contributors[]` + `synergy` fields expose exactly why.
- **Unknown patterns:** Isolation Forest, trained only on nominal states, flags
  in-range-but-jointly-unprecedented combinations no rule anticipates.
- **Prediction, not just detection:** the LSTM forecasts CH4 trend and the
  equipment risk emits a failure-window estimate, so interventions fire *before*
  escalation.
- **Graph intelligence:** Neo4j adds context the sensors can't see (who's
  present, their experience, prior incidents here) as an additive risk boost.
- **Explainable action:** the advisor narrates the mechanism in plain language;
  the intervention engine maps severity to auditable, prioritized actions.
```
