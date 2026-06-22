"""Computer Vision inference service.

Accepts an image, runs YOLOv11, and maps raw detections into the CCTV signals the
Event Fusion Layer consumes (ppe_violations, worker count, smoke/fire). Mount this
on the main API or run standalone; either way the OUTPUT is a partial frame you
merge into the /analyze payload.

If best.pt is absent it falls back to the pretrained yolo11n.pt (person/smoke
classes only) so the endpoint still responds.

Run standalone: uvicorn cv.infer_service:app --port 8001
"""
from __future__ import annotations
import io, os
from fastapi import FastAPI, UploadFile, File

app = FastAPI(title="SENTINEL CV Service")
_model = None
WEIGHTS = "runs/detect/train/weights/best.pt"


def model():
    global _model
    if _model is None:
        from ultralytics import YOLO
        _model = YOLO(WEIGHTS if os.path.exists(WEIGHTS) else "yolo11n.pt")
    return _model


def _to_signals(names: list[str]) -> dict:
    counts: dict[str, int] = {}
    for n in names:
        counts[n] = counts.get(n, 0) + 1
    violations = counts.get("no_helmet", 0) + counts.get("no_gloves", 0) + counts.get("no_vest", 0)
    return {
        "ppe_violations": violations,
        "workers_near_valve": counts.get("person", 0),
        "smoke_detected": counts.get("smoke", 0) > 0,
        "fire_detected": counts.get("fire", 0) > 0,
        "detections": counts,
    }


@app.post("/cv/detect")
async def detect(file: UploadFile = File(...)):
    from PIL import Image
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    res = model().predict(img, verbose=False)[0]
    names = [res.names[int(c)] for c in res.boxes.cls.tolist()] if res.boxes is not None else []
    return _to_signals(names)


@app.get("/health")
def health():
    return {"status": "ok", "weights": WEIGHTS if os.path.exists(WEIGHTS) else "yolo11n.pt (pretrained)"}
