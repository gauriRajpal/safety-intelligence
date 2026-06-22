"""One command to generate data and train every model.

    python -m app.ml.train_all
"""
from app.ml import synth, train_risk, train_anomaly, train_lstm


def main():
    print("[1/4] generating synthetic data ...")
    synth.main()
    print("[2/4] training XGBoost risk models ...")
    train_risk.train()
    print("[3/4] training Isolation Forest ...")
    train_anomaly.train()
    print("[4/4] training LSTM forecaster ...")
    train_lstm.train()
    print("done. restart the API to pick up new artifacts.")


if __name__ == "__main__":
    main()
