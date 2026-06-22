FROM python:3.11-slim

WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONPATH=/srv

# system deps for xgboost/torch wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Slim image: install everything except the heavy CV stack (run CV separately).
RUN pip install --no-cache-dir $(grep -vE 'ultralytics|pillow|python-multipart' requirements.txt)

COPY app ./app
COPY scripts ./scripts

EXPOSE 8000
# Train on first boot if no artifacts exist, then serve.
CMD ["sh", "-c", "[ -f models/risk_xgb.joblib ] || python -m app.ml.train_all; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
