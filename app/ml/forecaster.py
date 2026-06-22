"""Gas forecaster inference. Keeps a short rolling window per zone and predicts
the CH4 change over the forecast horizon. Falls back to a linear-trend estimate
if the trained LSTM is unavailable."""
from __future__ import annotations
import os, json
from collections import defaultdict, deque
import numpy as np

MODELS = os.path.join(os.path.dirname(__file__), "..", "..", "models")
N_FEATURES = 4


class Forecaster:
    def __init__(self):
        self.model = None
        self.meta = None
        self.ready = False
        self.buffers = defaultdict(lambda: deque(maxlen=20))
        meta_p = os.path.join(MODELS, "lstm_meta.json")
        wt_p = os.path.join(MODELS, "lstm_gas.pt")
        if os.path.exists(meta_p) and os.path.exists(wt_p):
            try:
                import torch
                from app.ml.train_lstm import _build
                self.meta = json.load(open(meta_p))
                self.buffers = defaultdict(lambda: deque(maxlen=self.meta["seq_len"]))
                self.model = _build()()
                self.model.load_state_dict(torch.load(wt_p, map_location="cpu"))
                self.model.eval()
                self.ready = True
            except Exception as e:  # pragma: no cover
                print("Forecaster load failed:", e)

    def observe(self, zone: str, feat: dict):
        self.buffers[zone].append([feat["ch4"], feat["valve_temp"], feat["pressure"], feat["temp"]])

    def forecast(self, zone: str) -> dict:
        buf = self.buffers.get(zone)
        if not buf or len(buf) < 4:
            return {"ch4_delta_30m": 0.0, "trend": "stable", "trained": self.ready}
        arr = np.array(buf, dtype=np.float32)
        if self.ready and len(buf) == self.meta["seq_len"]:
            import torch
            mean = np.array(self.meta["mean"]); std = np.array(self.meta["std"])
            xn = ((arr - mean) / std).astype(np.float32)
            with torch.no_grad():
                delta = float(self.model(torch.tensor(xn).unsqueeze(0))[0])
        else:
            # linear trend fallback
            ch4 = arr[:, 0]
            delta = float((ch4[-1] - ch4[0]) / max(len(ch4) - 1, 1) * 5)
        trend = "rising" if delta > 150 else "falling" if delta < -150 else "stable"
        return {"ch4_delta_30m": round(delta, 1), "trend": trend, "trained": self.ready}
