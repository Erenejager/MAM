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
