"""Time-Series Prediction — LSTM forecaster (PyTorch).

Predicts the CH4 delta `horizon` steps ahead from a recent window of
[ch4, valve_temp, pressure, temp]. The same architecture extends to temperature
trends / pressure anomalies by swapping the target column in synth.generate_sequences.

Dataset format (data/sequences.npz):
    X: float32 (N, SEQ_LEN, 4)
    y: float32 (N,)              # ppm change over the horizon

Usage: python -m app.ml.train_lstm
Artifacts: models/lstm_gas.pt , models/lstm_meta.json
"""
from __future__ import annotations
import os, json
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
SEQ = os.path.join(ROOT, "data", "sequences.npz")
MODELS = os.path.join(ROOT, "models")
N_FEATURES = 4


def _build():
    import torch
    import torch.nn as nn

    class GasLSTM(nn.Module):
        def __init__(self, n_feat=N_FEATURES, hidden=64, layers=2):
            super().__init__()
            self.lstm = nn.LSTM(n_feat, hidden, layers, batch_first=True, dropout=0.1)
            self.head = nn.Sequential(nn.Linear(hidden, 32), nn.ReLU(), nn.Linear(32, 1))

        def forward(self, x):
            out, _ = self.lstm(x)
            return self.head(out[:, -1, :]).squeeze(-1)

    return GasLSTM


def train(epochs: int = 12, bs: int = 128, lr: float = 1e-3):
    import torch
    from torch.utils.data import TensorDataset, DataLoader

    if not os.path.exists(SEQ):
        raise SystemExit("data/sequences.npz missing — run `python -m app.ml.synth` first")
    d = np.load(SEQ)
    X, y = d["X"], d["y"]
    # per-feature standardization (store stats for inference)
    mean = X.reshape(-1, N_FEATURES).mean(0)
    std = X.reshape(-1, N_FEATURES).std(0) + 1e-6
    Xn = (X - mean) / std
    n_tr = int(len(Xn) * 0.85)

    GasLSTM = _build()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = GasLSTM().to(dev)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    lossf = torch.nn.SmoothL1Loss()

    tr = DataLoader(TensorDataset(torch.tensor(Xn[:n_tr]), torch.tensor(y[:n_tr])),
                    batch_size=bs, shuffle=True)
    Xv = torch.tensor(Xn[n_tr:]).to(dev); yv = torch.tensor(y[n_tr:]).to(dev)

    for ep in range(epochs):
        model.train()
        for xb, yb in tr:
            xb, yb = xb.to(dev), yb.to(dev)
            opt.zero_grad(); loss = lossf(model(xb), yb); loss.backward(); opt.step()
        model.eval()
        with torch.no_grad():
            val = lossf(model(Xv), yv).item()
        print(f"  epoch {ep+1:2d}/{epochs}  val_loss={val:.3f}")

    os.makedirs(MODELS, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(MODELS, "lstm_gas.pt"))
    with open(os.path.join(MODELS, "lstm_meta.json"), "w") as fh:
        json.dump({"mean": mean.tolist(), "std": std.tolist(),
                   "seq_len": int(X.shape[1]), "n_features": N_FEATURES}, fh)
    print("saved models/lstm_gas.pt")


if __name__ == "__main__":
    train()
