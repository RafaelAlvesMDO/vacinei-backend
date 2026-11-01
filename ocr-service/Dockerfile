FROM python:3.12-slim

# Tesseract 5 com o modelo de português
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-por libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY poc_ocr.py catalogo_vacinas.json ./

ENV PYTHONUNBUFFERED=1

CMD ["python", "poc_ocr.py", "--entrada", "/amostras", "--saida", "/saida"]
