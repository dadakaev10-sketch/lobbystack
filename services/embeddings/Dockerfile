FROM python:3.11-slim-bookworm@sha256:0a310eeecf4e1f5a0743f9a6520c90c88d089c903ca5fd283f501e3a805f5f89
WORKDIR /app
COPY requirements.txt requirements.lock ./
RUN pip install --no-cache-dir torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.lock
COPY *.py *.json LICENSE-2.0.txt ./
RUN mkdir /cache && chown 1000:1000 /cache
ENV HF_HOME=/cache OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false HF_HUB_DISABLE_TELEMETRY=1 PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--limit-concurrency", "16", "--timeout-keep-alive", "5", "--no-access-log"]
