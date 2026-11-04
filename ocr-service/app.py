"""Serviço HTTP do OCR (D25 / D34). Chamado só pelo backend, nunca pelo app.

POST /ocr     multipart com o campo "image" (jpeg/png). Devolve o modelo reconhecido e as doses
              sugeridas, cada campo com o recorte da foto. A imagem é processada em memória e
              descartada: nada é gravado em disco (LGPD).
GET  /health  situação do serviço e modelos carregados.
"""

import logging
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from pipeline import carregar_modelos, modelos_disponiveis, processar

TAMANHO_MAX = int(float(os.getenv("OCR_MAX_IMAGE_MB", "8")) * 1024 * 1024)
TIPOS = {"image/jpeg", "image/jpg", "image/png"}

log = logging.getLogger("uvicorn.error")
app = FastAPI(title="VACINEI!? OCR", version="1.0.0")


@app.on_event("startup")
def iniciar():
    paginas = carregar_modelos()
    log.info("OCR pronto: %d páginas de modelos carregadas", len(paginas))


@app.get("/health")
def health():
    return {"status": "ok", "models": modelos_disponiveis()}


@app.post("/ocr")
async def ocr(image: UploadFile = File(...)):
    if image.content_type not in TIPOS:
        raise HTTPException(415, "Envie uma imagem JPEG ou PNG.")
    dados = await image.read(TAMANHO_MAX + 1)
    if len(dados) > TAMANHO_MAX:
        raise HTTPException(413, "Imagem maior que o limite permitido.")
    try:
        resultado = await run_in_threadpool(processar, dados)
    except ValueError as erro:
        raise HTTPException(422, str(erro)) from erro
    finally:
        del dados
    # Log só com métricas, sem conteúdo lido (LGPD)
    log.info("ocr model=%s cells=%s filled=%s total_ms=%s", resultado["model"], resultado["cellsChecked"],
             resultado["cellsFilled"], resultado.get("timingsMs", {}).get("total"))
    return resultado
