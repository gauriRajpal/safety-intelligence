"""Risk Prediction Engine — training pipeline (XGBoost).

Trains one XGBRegressor per risk target (fire/explosion/toxic/equipment/
human_error). One model per target keeps per-risk feature importances
interpretable, which matters for a safety system you must explain to auditors.

Usage:
    python -m app.ml.train_risk
Artifacts: models/risk_xgb.joblib , models/risk_meta.json
"""
from __future__ import annotations
import os, json, time
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
import xgboost as xgb
import joblib

from app.ml.features import FEATURE_ORDER, RISK_TARGETS

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
DATA = os.path.join(ROOT, "data", "tabular.csv")
MODELS = os.path.join(ROOT, "models")


def train():
    if not os.path.exists(DATA):
        raise SystemExit("data/tabular.csv missing — run `python -m app.ml.synth` first")
    df = pd.read_csv(DATA)
    X = df[FEATURE_ORDER].values
    Xtr, Xte, idx_tr, idx_te = train_test_split(X, df.index, test_size=0.2, random_state=42)

    os.makedirs(MODELS, exist_ok=True)
    models, metrics, importances = {}, {}, {}
    for tgt in RISK_TARGETS:
        ytr = df.loc[idx_tr, tgt].values
        yte = df.loc[idx_te, tgt].values
        model = xgb.XGBRegressor(
            n_estimators=400, max_depth=6, learning_rate=0.05,
            subsample=0.9, colsample_bytree=0.9, n_jobs=4,
            objective="reg:squarederror", random_state=42,
        )
        model.fit(Xtr, ytr)
        pred = np.clip(model.predict(Xte), 0, 100)
        metrics[tgt] = {"mae": round(float(mean_absolute_error(yte, pred)), 2),
                        "r2": round(float(r2_score(yte, pred)), 3)}
        importances[tgt] = {f: round(float(w), 4)
                            for f, w in zip(FEATURE_ORDER, model.feature_importances_)}
        models[tgt] = model
        print(f"  {tgt:12s}  MAE={metrics[tgt]['mae']:5.2f}  R2={metrics[tgt]['r2']}")

    joblib.dump(models, os.path.join(MODELS, "risk_xgb.joblib"))
    with open(os.path.join(MODELS, "risk_meta.json"), "w") as fh:
        json.dump({"trained_at": time.time(), "features": FEATURE_ORDER,
                   "metrics": metrics, "importances": importances}, fh, indent=2)
    print("saved models/risk_xgb.joblib")


if __name__ == "__main__":
    train()
