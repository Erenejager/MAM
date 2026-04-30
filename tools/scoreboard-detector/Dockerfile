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
