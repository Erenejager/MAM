# Scoreboard Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Dockerised CLI that detects and crops scoreboard regions from JPEG frames, returning one JSON row per input frame.

**Architecture:** A single `detect.py` script loaded as the Docker ENTRYPOINT processes a directory of frames in one pass — loads the ONNX model once, iterates sorted frames, clips bbox to integer pixels, writes crops and a `results.json`. Contract tests run inside the same image via `--entrypoint pytest`.

**Tech Stack:** Python 3.11-slim, Ultralytics (ONNX backend), onnxruntime-cpu, opencv-python-headless, pytest

---

## File Map

| File | Role |
|------|------|
| `tools/scoreboard-detector/requirements.txt` | Python dependencies |
| `tools/scoreboard-detector/detect.py` | CLI entrypoint — arg parsing, validation, frame loop, JSON output |
| `tools/scoreboard-detector/Dockerfile` | Image definition |
| `tools/scoreboard-detector/tests/conftest.py` | `--model-path` pytest option |
| `tools/scoreboard-detector/tests/test_contract.py` | 5 contract tests |

---

### Task 1: Scaffold directory and requirements.txt

**Files:**
- Create: `tools/scoreboard-detector/requirements.txt`
- Create: `tools/scoreboard-detector/tests/.gitkeep`

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p /home/clawdbot/MAM/tools/scoreboard-detector/tests
touch /home/clawdbot/MAM/tools/scoreboard-detector/tests/.gitkeep
```

- [ ] **Step 2: Write requirements.txt**

`tools/scoreboard-detector/requirements.txt`:
```
ultralytics
onnxruntime-cpu
opencv-python-headless
numpy
pytest
```

- [ ] **Step 3: Commit**

```bash
git add tools/scoreboard-detector/
git commit -m "chore(scoreboard-detector): scaffold directory and requirements"
```

---

### Task 2: Write conftest.py

**Files:**
- Create: `tools/scoreboard-detector/tests/conftest.py`

- [ ] **Step 1: Write conftest.py**

`tools/scoreboard-detector/tests/conftest.py`:
```python
def pytest_addoption(parser):
    parser.addoption("--model-path", default=None, help="Path to ONNX model for frame tests")


import pytest

@pytest.fixture
def model_path(request):
    return request.config.getoption("--model-path")
```

- [ ] **Step 2: Commit**

```bash
git add tools/scoreboard-detector/tests/conftest.py
git commit -m "test(scoreboard-detector): add pytest --model-path option"
```

---

### Task 3: Write contract tests

**Files:**
- Create: `tools/scoreboard-detector/tests/test_contract.py`

- [ ] **Step 1: Write test_contract.py**

`tools/scoreboard-detector/tests/test_contract.py`:
```python
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

DETECT_PY = Path(__file__).parent.parent / "detect.py"


def run_detect(model, input_dir, output_dir):
    cmd = [
        sys.executable, str(DETECT_PY),
        "--model", str(model),
        "--input", str(input_dir),
        "--output", str(output_dir),
    ]
    return subprocess.run(cmd, capture_output=True, text=True)


def make_blank_jpeg(path, width=10, height=10):
    img = np.zeros((height, width, 3), dtype=np.uint8)
    cv2.imwrite(str(path), img)


def test_missing_model_exits_1(tmp_path):
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    result = run_detect("/nonexistent/model.onnx", input_dir, tmp_path)
    assert result.returncode == 1


def test_missing_input_exits_1(tmp_path):
    result = run_detect("/nonexistent/model.onnx", "/nonexistent/input", tmp_path)
    assert result.returncode == 1


def test_corrupt_frame_exits_0(tmp_path, model_path):
    if model_path is None:
        pytest.skip("--model-path not provided")
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    (input_dir / "bad.jpg").write_bytes(b"not an image at all")
    result = run_detect(model_path, input_dir, output_dir)
    assert result.returncode == 0
    rows = json.loads((output_dir / "results.json").read_text())
    assert len(rows) == 1
    assert rows[0]["error"] == "decode_failed"
    assert rows[0]["visible"] is False


def test_one_row_per_frame(tmp_path, model_path):
    if model_path is None:
        pytest.skip("--model-path not provided")
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    make_blank_jpeg(input_dir / "frame_001.jpg")
    result = run_detect(model_path, input_dir, output_dir)
    assert result.returncode == 0
    rows = json.loads((output_dir / "results.json").read_text())
    assert len(rows) == 1
    assert rows[0]["frame"] == "frame_001.jpg"


def test_required_fields(tmp_path, model_path):
    if model_path is None:
        pytest.skip("--model-path not provided")
    input_dir = tmp_path / "input"
    input_dir.mkdir()
    output_dir = tmp_path / "output"
    output_dir.mkdir()
    make_blank_jpeg(input_dir / "frame_001.jpg")
    result = run_detect(model_path, input_dir, output_dir)
    assert result.returncode == 0
    rows = json.loads((output_dir / "results.json").read_text())
    required = {
        "frame", "visible", "confidence", "bbox",
        "crop_path", "image_width", "image_height", "source",
    }
    for row in rows:
        missing = required - row.keys()
        assert not missing, f"row missing fields: {missing}"
```

- [ ] **Step 2: Commit**

```bash
git add tools/scoreboard-detector/tests/test_contract.py
git commit -m "test(scoreboard-detector): contract tests for CLI behavior and output schema"
```

---

### Task 4: Write detect.py

**Files:**
- Create: `tools/scoreboard-detector/detect.py`

- [ ] **Step 1: Write detect.py**

`tools/scoreboard-detector/detect.py`:
```python
import argparse
import json
import sys
from pathlib import Path

import cv2


def parse_args():
    parser = argparse.ArgumentParser(description="Detect and crop scoreboard regions from frames.")
    parser.add_argument("--model", required=True, help="Path to .onnx model file")
    parser.add_argument("--input", required=True, help="Directory of JPEG/PNG frames")
    parser.add_argument("--output", required=True, help="Directory for crops and results.json")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold (default 0.25)")
    return parser.parse_args()


def clip_bbox(x1, y1, x2, y2, img_w, img_h):
    x1 = max(0, int(round(x1)))
    y1 = max(0, int(round(y1)))
    x2 = min(img_w, int(round(x2)))
    y2 = min(img_h, int(round(y2)))
    return x1, y1, x2, y2


def process_frame(model, frame_path, output_dir, conf_threshold):
    frame_name = frame_path.name
    img = cv2.imread(str(frame_path))

    if img is None:
        print(f"WARN {frame_name} decode_failed", file=sys.stderr)
        return {
            "frame": frame_name,
            "visible": False,
            "confidence": None,
            "bbox": None,
            "crop_path": None,
            "image_width": None,
            "image_height": None,
            "source": "yolo",
            "error": "decode_failed",
        }

    img_h, img_w = img.shape[:2]
    results = model.predict(img, conf=conf_threshold, verbose=False)

    detections = []
    if results and len(results[0].boxes) > 0:
        for box in results[0].boxes:
            conf = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()
            detections.append((conf, xyxy))

    if not detections:
        return {
            "frame": frame_name,
            "visible": False,
            "confidence": None,
            "bbox": None,
            "crop_path": None,
            "image_width": img_w,
            "image_height": img_h,
            "source": "yolo",
        }

    # Sort by confidence descending, take highest; ignore the rest (v1)
    detections.sort(key=lambda d: d[0], reverse=True)
    best_conf, best_xyxy = detections[0]
    x1, y1, x2, y2 = clip_bbox(*best_xyxy, img_w, img_h)

    if x2 <= x1 or y2 <= y1:
        return {
            "frame": frame_name,
            "visible": False,
            "confidence": None,
            "bbox": None,
            "crop_path": None,
            "image_width": img_w,
            "image_height": img_h,
            "source": "yolo",
        }

    crop = img[y1:y2, x1:x2]
    crop_name = f"{frame_path.stem}_crop.jpg"
    cv2.imwrite(str(output_dir / crop_name), crop)

    return {
        "frame": frame_name,
        "visible": True,
        "confidence": round(best_conf, 4),
        "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
        "crop_path": crop_name,
        "image_width": img_w,
        "image_height": img_h,
        "source": "yolo",
    }


def main():
    args = parse_args()
    model_path = Path(args.model)
    input_dir = Path(args.input)
    output_dir = Path(args.output)

    if not model_path.exists():
        print(f"ERROR model not found: {model_path}", file=sys.stderr)
        sys.exit(1)

    if not input_dir.is_dir():
        print(f"ERROR input dir not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    if not output_dir.is_dir():
        print(f"ERROR output dir not found: {output_dir}", file=sys.stderr)
        sys.exit(1)

    probe = output_dir / ".write_test"
    try:
        probe.touch()
        probe.unlink()
    except OSError:
        print(f"ERROR output dir not writable: {output_dir}", file=sys.stderr)
        sys.exit(1)

    frames = sorted(
        list(input_dir.glob("*.jpg"))
        + list(input_dir.glob("*.jpeg"))
        + list(input_dir.glob("*.png"))
    )

    if not frames:
        print(f"ERROR no frames found in {input_dir}", file=sys.stderr)
        sys.exit(1)

    from ultralytics import YOLO  # deferred so missing-model check runs without torch import
    model = YOLO(str(model_path))

    rows = [process_frame(model, f, output_dir, args.conf) for f in frames]

    (output_dir / "results.json").write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add tools/scoreboard-detector/detect.py
git commit -m "feat(scoreboard-detector): implement detect.py CLI"
```

---

### Task 5: Write Dockerfile

**Files:**
- Create: `tools/scoreboard-detector/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

`tools/scoreboard-detector/Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

# Install ultralytics first (pulls opencv-python), then force-replace with headless variant
RUN pip install --no-cache-dir ultralytics \
 && pip install --no-cache-dir --force-reinstall opencv-python-headless \
 && pip install --no-cache-dir onnxruntime-cpu numpy pytest

COPY detect.py .
COPY tests/ tests/

ENTRYPOINT ["python", "detect.py"]
```

- [ ] **Step 2: Commit**

```bash
git add tools/scoreboard-detector/Dockerfile
git commit -m "feat(scoreboard-detector): add Dockerfile"
```

---

### Task 6: Build the Docker image

**Files:** none (build step)

- [ ] **Step 1: Build the image**

```bash
cd /home/clawdbot/MAM
docker build -t scoreboard-detector tools/scoreboard-detector/
```

Expected: build completes without error. The `--force-reinstall opencv-python-headless` step should be visible in the output.

- [ ] **Step 2: Verify the image exists**

```bash
docker images scoreboard-detector
```

Expected output contains a `scoreboard-detector` row with a recent `CREATED` timestamp.

---

### Task 7: Run contract tests inside Docker

**Files:** none (test step)

- [ ] **Step 1: Run all contract tests with model mounted**

```bash
docker run --rm \
  --entrypoint pytest \
  -v /home/clawdbot/MAM/models/scoreboard-yolo:/models:ro \
  scoreboard-detector \
  tests/ -v \
  --model-path /models/best.onnx
```

Expected output:
```
tests/test_contract.py::test_missing_model_exits_1 PASSED
tests/test_contract.py::test_missing_input_exits_1 PASSED
tests/test_contract.py::test_corrupt_frame_exits_0 PASSED
tests/test_contract.py::test_one_row_per_frame PASSED
tests/test_contract.py::test_required_fields PASSED

5 passed in ...s
```

- [ ] **Step 2: If any test fails, fix detect.py and rebuild**

For a code fix in `detect.py`, rebuild and rerun:
```bash
docker build -t scoreboard-detector tools/scoreboard-detector/ && \
docker run --rm \
  --entrypoint pytest \
  -v /home/clawdbot/MAM/models/scoreboard-yolo:/models:ro \
  scoreboard-detector tests/ -v --model-path /models/best.onnx
```

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add tools/scoreboard-detector/detect.py
git commit -m "fix(scoreboard-detector): contract test fixes"
```

---

### Task 8: Run smoke test against real frames

**Files:** none (validation step)

- [ ] **Step 1: Ensure smoke frames exist**

```bash
ls /tmp/v2-ocr-sampling-audio-aware-smoke/
```

If the directory is empty or missing, regenerate it:
```bash
cd /home/clawdbot/MAM
node backend/scripts/audit-v2-ocr-sampling-plan.mjs \
  /tmp/media-analysis-v2-reaction-like-promotion-2026-04-30-v3/media_analysis_v2/result.json \
  /home/clawdbot/.mam/storage/3936415e-cded-4b32-a264-03b12a33d73f \
  --limit=1 --min-score=0.52 \
  --extract-frames=/tmp/v2-ocr-sampling-audio-aware-smoke
```

- [ ] **Step 2: Create output directory**

```bash
mkdir -p /tmp/v2-scoreboard-crops
```

- [ ] **Step 3: Run smoke test**

```bash
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v /home/clawdbot/MAM/models/scoreboard-yolo:/models:ro \
  -v /tmp/v2-ocr-sampling-audio-aware-smoke:/input:ro \
  -v /tmp/v2-scoreboard-crops:/output \
  scoreboard-detector \
  --model /models/best.onnx \
  --input /input \
  --output /output
```

Expected: exit 0.

- [ ] **Step 4: Inspect results**

```bash
python3 -m json.tool /tmp/v2-scoreboard-crops/results.json
```

Verify:
- One row per input frame
- `visible: true` rows have a `crop_path` filename and a corresponding `.jpg` file in `/tmp/v2-scoreboard-crops/`
- `image_width` and `image_height` match the actual frame dimensions
- `bbox` values are within `[0, image_width]` × `[0, image_height]`
- Files are owned by `clawdbot` (not root)

- [ ] **Step 5: Visually inspect a crop**

```bash
ls /tmp/v2-scoreboard-crops/*.jpg
```

Open one crop and confirm it contains a scoreboard region, not a random image patch.

---

### Task 9: Final commit

- [ ] **Step 1: Confirm all files are committed**

```bash
git status tools/scoreboard-detector/
```

Expected: nothing to commit.

- [ ] **Step 2: Tag the working image (optional but useful)**

```bash
docker tag scoreboard-detector scoreboard-detector:v1
```

No commit needed for this step.
