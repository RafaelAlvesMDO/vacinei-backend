FROM python:3.12-slim

# Tesseract 5 com o modelo de português
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py catalogo_vacinas.json ./
COPY templates ./templates

ENV PYTHONUNBUFFERED=1
# O Tesseract usa uma thread por chamada; o paralelismo fica no pipeline (várias células ao mesmo tempo)
ENV OMP_THREAD_LIMIT=1

EXPOSE 8000

# Serviço HTTP (D25). A prova de conceito roda com: docker compose --profile ocr run --rm ocr
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
