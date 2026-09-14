FROM python:3.14-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-core \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-swa \
    tesseract-ocr-fra \
    ghostscript \
    fonts-dejavu-core \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --shell /usr/sbin/nologin nssf

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && playwright install --with-deps chromium

COPY . .

RUN mkdir -p /app/tmp/nssf_proc && chown -R nssf:nssf /app

USER nssf
ENV HOME=/home/nssf
ENV NSSF_HOST=0.0.0.0
ENV NSSF_PORT=8000
ENV NSSF_TEMP_DIR=/app/tmp/nssf_proc

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl --fail http://127.0.0.1:8000/ || exit 1

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
