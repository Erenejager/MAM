FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

# Install ultralytics first (pulls opencv-python), then force-replace with headless variant
RUN pip install --no-cache-dir ultralytics \
 && pip install --no-cache-dir --force-reinstall opencv-python-headless \
 && pip install --no-cache-dir onnxruntime numpy pytest

COPY detect.py .
COPY tests/ tests/

RUN useradd -m -u 1000 appuser
USER appuser

ENTRYPOINT ["python", "detect.py"]
