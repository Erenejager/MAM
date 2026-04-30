# Scoreboard Detector — Design Spec

Date: 2026-04-30

## Purpose

Detect and crop scoreboard regions from JPEG frames extracted by the media-analysis-v2 OCR sampling pipeline. Detection only — no OCR. Crops feed a downstream score-text extraction step.

## Scope

- Input: directory of JPEG frames (output of `audit-v2-ocr-sampling-plan.mjs --extract-frames`)
- Output: per-frame JSON (bbox, confidence, crop JPEG, visibility flag) + saved crop files
- Deployment: Docker CLI on Hetzner server, CPU-only, one-shot invocation per asset batch

## Repository Layout

```
tools/scoreboard-detector/
  Dockerfile
  detect.py
  requirements.txt
  tests/
    test_contract.py

models/scoreboard-yolo/
  best.onnx          ← primary inference model (CPU, onnxruntime)
  best.pt            ← kept on disk, not used by container
```

## Docker Image

Base: `python:3.11-slim`

Python dependencies (`requirements.txt`):
- `ultralytics` (Ultralytics YOLO framework, ONNX backend)
- `onnxruntime-cpu`
- `opencv-python-headless`
- `numpy`

Build note: install `opencv-python-headless` after `ultralytics` with `--force-reinstall` to prevent ultralytics from pulling in the GUI opencv variant.

ENTRYPOINT: `["python", "detect.py"]`

## CLI

```bash
docker run --rm \
  -v /home/clawdbot/MAM/models/scoreboard-yolo:/models:ro \
  -v /path/to/frames:/input:ro \
  -v /path/to/output:/output \
  scoreboard-detector \
  --model /models/best.onnx \
  --input /input \
  --output /output
```

Arguments:
- `--model` — path to `.onnx` model file (required)
- `--input` — directory of JPEG/PNG frames (required)
- `--output` — directory for crops and `results.json` (required)

Optional:
- `--conf` — confidence threshold, default `0.25`

## Model Details

- Architecture: YOLOv8n, single class (scoreboard)
- Input shape: `(1, 3, 640, 640)` BCHW
- Output shape: `(1, 5, 8400)` — 4 bbox coords + 1 confidence
- Source: exported from `best.pt` via `yolo export format=onnx imgsz=640 opset=12`

## Data Flow

1. Glob all `.jpg` / `.jpeg` / `.png` files in `--input`, sorted by filename
2. Load model once via `YOLO(model_path)` (Ultralytics ONNX backend)
3. For each frame:
   - Read image, record `image_width` and `image_height` in original pixels
   - Run `model.predict(frame, conf=threshold, verbose=False)`
   - Take highest-confidence detection if any
   - If detected: crop bbox region, save to `{output}/{frame_stem}_crop.jpg`, set `visible: true`
   - If not detected: set `visible: false`, no crop written
   - If decode fails: emit `error: "decode_failed"`, log `WARN {frame} decode_failed` to stderr
4. Write `results.json` to `--output/`

Bbox coordinates are in original image pixels (not 640-resized space). Ultralytics rescales automatically.

## Output Format

Single `results.json` array, one entry per input frame:

```json
[
  {
    "frame": "frame_0042.jpg",
    "visible": true,
    "confidence": 0.91,
    "bbox": { "x1": 120, "y1": 30, "x2": 410, "y2": 95 },
    "crop_path": "frame_0042_crop.jpg",
    "image_width": 1280,
    "image_height": 720,
    "source": "yolo"
  },
  {
    "frame": "frame_0043.jpg",
    "visible": false,
    "confidence": null,
    "bbox": null,
    "crop_path": null,
    "image_width": null,
    "image_height": null,
    "source": "yolo",
    "error": "decode_failed"
  }
]
```

Required fields on every row: `frame`, `visible`, `confidence`, `bbox`, `crop_path`, `image_width`, `image_height`, `source`.

`crop_path` is a filename only (e.g. `frame_0042_crop.jpg`), not a container path. The caller reconstructs the full host path from its own output directory.
Optional field: `error` (only present on failure rows).

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Model file not found | Exit 1, message to stderr, no `results.json` |
| Input dir not found or empty | Exit 1, message to stderr, no `results.json` |
| Output dir not writable | Exit 1, message to stderr, no `results.json` |
| Frame decode failure | Exit 0, row with `error: "decode_failed"`, `WARN {frame} decode_failed` to stderr |
| Uncaught exception | Exit 1, traceback to stderr, no `results.json` |

Stderr warning format: `WARN {frame} {reason}` — concise and machine-readable.

## Testing

### Manual smoke test (validates real model)

```bash
docker run --rm \
  -v /home/clawdbot/MAM/models/scoreboard-yolo:/models:ro \
  -v /tmp/v2-ocr-sampling-audio-aware-smoke:/input:ro \
  -v /tmp/v2-scoreboard-crops:/output \
  scoreboard-detector \
  --model /models/best.onnx \
  --input /input \
  --output /output

cat /tmp/v2-scoreboard-crops/results.json | python3 -m json.tool
```

Success: exit 0, one row per input frame, crop JPEGs written for visible detections.

### pytest contract tests (validates CLI behavior and output schema)

File: `tools/scoreboard-detector/tests/test_contract.py`

Tests:
- `test_missing_model_exits_1` — nonexistent model path → exit 1
- `test_missing_input_exits_1` — nonexistent input dir → exit 1
- `test_corrupt_frame_exits_0` — garbage bytes as `.jpg` → exit 0, one row, `error: "decode_failed"`
- `test_one_row_per_frame` — synthetic 10×10 blank JPEG → exit 0, exactly one row
- `test_required_fields` — same run, assert all required fields present on every row

Run inside the image:
```bash
docker run --rm scoreboard-detector pytest tests/
```

Missing-model/input tests fail fast (no model load). Frame tests load the ONNX model once (~2s). Expected total: 5–8s.

## Output Directories

| Phase | Path |
|-------|------|
| Audit / smoke | `/tmp/v2-scoreboard-crops/` |
| Production (per asset) | `{STORAGE_ROOT}/{asset-uuid}/scoreboard-crops/` |

## Pipeline Integration

The Node.js pipeline calls the detector via `child_process.execFile('docker', [...])`. On exit 0, it reads `results.json`. On exit 1, the batch is treated as failed — OCR evidence for that asset is skipped or retried.
