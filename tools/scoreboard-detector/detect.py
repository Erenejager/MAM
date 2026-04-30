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
