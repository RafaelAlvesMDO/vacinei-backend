"""Tinta à mão e leitura de um campo recortado de uma célula alinhada ao modelo (D34).

A foto já chega alinhada à referência do modelo. A tinta impressa (rótulos, linhas, barras da data)
vem da própria referência e é descontada; o que sobra, escuro e sem cor de mancha, é escrita à mão.
"""

import base64
import os
import re
import statistics
from datetime import date

import cv2
import numpy as np
import pytesseract
from pytesseract import Output

from poc_ocr import Catalogo, interpretar_data_campo, normalizar_lote

# Escuridão mínima (0 = papel, 1 = preto) para um pixel contar como tinta à mão
LIMIAR_ESCURIDAO = float(os.getenv("OCR_INK_DARKNESS", "0.28"))
# Na referência, a impressão é marcada com um limiar mais baixo para cobrir as bordas suaves dos traços
LIMIAR_IMPRESSO = 0.15
# Fração mínima de tinta no recorte do campo para tentar ler
LIMIAR_TINTA_CAMPO = float(os.getenv("OCR_FIELD_INK", "0.004"))
ALTURA_ALVO = 48  # altura da escrita, em px, entregue ao Tesseract
MAIUSCULAS_DIGITOS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
LOTE_VALIDO = re.compile(r"^[A-Z0-9]{4,20}$")


def escuridao(cinza, janela):
    """1 - cinza/fundo, com o fundo estimado pelo máximo local (papel), robusto a sombra e iluminação."""
    janela = max(5, janela | 1)
    fundo = cv2.dilate(cinza, cv2.getStructuringElement(cv2.MORPH_RECT, (janela, janela)))
    fundo = cv2.GaussianBlur(fundo, (janela, janela), 0).astype(np.float32)
    return np.clip(1.0 - cinza.astype(np.float32) / np.maximum(fundo, 1.0), 0.0, 1.0)


def mascara_tinta(foto_bgr, ref_cinza, escala):
    """Tinta à mão na célula: escura na foto, fora da impressão da referência e sem cor de mancha."""
    janela = int(25 * escala)
    esc_foto = escuridao(cv2.cvtColor(foto_bgr, cv2.COLOR_BGR2GRAY), janela)
    esc_ref = escuridao(ref_cinza, janela)
    # Tolerância de alinhamento: a impressão é dilatada alguns pixels
    tol = max(3, int(round(2.5 * escala)))
    impresso = cv2.dilate((esc_ref > LIMIAR_IMPRESSO).astype(np.uint8),
                          cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * tol + 1, 2 * tol + 1))) > 0
    hsv = cv2.cvtColor(foto_bgr, cv2.COLOR_BGR2HSV)
    # Manchas de umidade/oxidação: amareladas e pouco escuras
    mancha = (hsv[..., 0] >= 8) & (hsv[..., 0] <= 35) & (hsv[..., 1] >= 35) & (esc_foto < 0.5)
    escuro = (esc_foto > LIMIAR_ESCURIDAO) & ~mancha
    tinta = (escuro & ~impresso).astype(np.uint8) * 255
    # Religa os traços que cruzam a impressão (ex.: a escrita sobre a linha do campo): só os pixels
    # escuros da área impressa que ficam entre dois pedaços de escrita
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, int(2 * escala)), max(5, int(5 * escala))))
    ponte = cv2.morphologyEx(tinta, cv2.MORPH_CLOSE, k) > 0
    tinta[ponte & impresso & escuro] = 255
    # Remove pontos isolados (ruído, poeira, restos de borda)
    n, rot, st, _ = cv2.connectedComponentsWithStats(tinta, 8)
    area_min = max(6, int(4 * escala * escala))
    manter = np.zeros(n, np.uint8)
    manter[1:][st[1:, cv2.CC_STAT_AREA] >= area_min] = 255
    return manter[rot]


def densidade(mascara, margem=0.0):
    h, w = mascara.shape
    my, mx = int(h * margem), int(w * margem)
    m = mascara[my:h - my, mx:w - mx]
    return float(np.count_nonzero(m)) / max(1, m.size)


def png_base64(img, largura_max):
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if img.shape[1] > largura_max:
        f = largura_max / img.shape[1]
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".png", img, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return "data:image/png;base64," + base64.b64encode(buf.tobytes()).decode() if ok else None


def _recortar_escrita(tinta):
    """Recorte justo da escrita, sem as pontas que encostam no alto/baixo da faixa (campo vizinho)."""
    h, w = tinta.shape
    n, rot, st, _ = cv2.connectedComponentsWithStats(tinta, 8)
    manter = np.zeros(n, np.uint8)
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        encosta = y <= 1 or y + bh >= h - 1
        if encosta and bh < 0.35 * h:
            continue
        manter[i] = 255
    limpa = manter[rot]
    ys, xs = np.nonzero(limpa)
    if len(xs) == 0:
        return None, None
    return limpa, (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def _preparar(img_bin_preto_no_branco, altura):
    f = float(np.clip(ALTURA_ALVO / max(1, altura), 1.0, 4.0))
    img = cv2.resize(img_bin_preto_no_branco, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
    _, img = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY)
    return cv2.copyMakeBorder(img, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)


def _tesseract(img, psm, whitelist=None):
    config = f"--oem 1 --psm {psm} --dpi 300"
    if whitelist:
        config += f" -c tessedit_char_whitelist={whitelist}"
    d = pytesseract.image_to_data(img, lang="por", config=config, output_type=Output.DICT)
    palavras = [(t.strip(), float(c)) for t, c in zip(d["text"], d["conf"]) if (t or "").strip()]
    confs = [c for _, c in palavras if c >= 0]
    return " ".join(t for t, _ in palavras), (statistics.mean(confs) / 100 if confs else 0.0)


def _data_iso(texto):
    valor = interpretar_data_campo(texto)  # dd/mm/aaaa ou None
    if not valor:
        return None
    d, m, a = (int(p) for p in valor.split("/"))
    try:
        return date(a, m, d).isoformat()
    except ValueError:
        return None


def _interpretar(campo, texto, catalogo: Catalogo):
    """(valor, extras) da leitura de um campo, ou (None, {}) se não for um valor plausível."""
    if campo == "date":
        return _data_iso(texto), {}
    if campo == "batch":
        valor = normalizar_lote(texto).replace("?", "")
        return (valor if LOTE_VALIDO.match(valor) and any(c.isdigit() for c in valor) else None), {}
    vac = catalogo.identificar(texto)
    if not vac or not vac["no_catalogo"]:
        return None, {}
    return vac["nome"], {"similaridade": vac["similaridade"] / 100}


TENTATIVAS = {
    "date": [(7, "0123456789"), (8, "0123456789"), (13, "0123456789")],
    "batch": [(7, MAIUSCULAS_DIGITOS), (8, MAIUSCULAS_DIGITOS)],
    "vaccine": [(7, MAIUSCULAS_DIGITOS + "-"), (8, MAIUSCULAS_DIGITOS + "-")],
}


def ler_campo(campo, foto_bgr, tinta, catalogo: Catalogo, limiar_confianca, depuracao=None):
    """Lê um campo. Devolve {value, confidence, crop} e, na depuração, as leituras brutas."""
    resultado = {"value": None, "confidence": 0.0, "crop": png_base64(foto_bgr, 320)}
    if densidade(tinta) < LIMIAR_TINTA_CAMPO:
        resultado["empty"] = True
        return resultado
    limpa, caixa = _recortar_escrita(tinta)
    if caixa is None:
        resultado["empty"] = True
        return resultado
    x0, y0, x1, y1 = caixa
    p = 6
    h, w = limpa.shape
    recorte = 255 - limpa[max(0, y0 - p):min(h, y1 + p), max(0, x0 - p):min(w, x1 + p)]
    img = _preparar(recorte, y1 - y0)
    if depuracao is not None:
        depuracao["imagem_ocr"] = img
    melhor = None
    leituras = []
    for psm, whitelist in TENTATIVAS[campo]:
        texto, conf = _tesseract(img, psm, whitelist)
        valor, extras = _interpretar(campo, texto, catalogo)
        if campo == "vaccine" and valor:
            conf = min(conf, extras.get("similaridade", conf)) if conf else extras.get("similaridade", 0.0)
        leituras.append({"psm": psm, "texto": texto, "valor": valor, "conf": round(conf, 3)})
        if valor and (melhor is None or conf > melhor[1]):
            melhor = (valor, conf)
        if valor and conf >= 0.8:
            break
    if depuracao is not None:
        depuracao["leituras"] = leituras
    if melhor:
        resultado["confidence"] = round(melhor[1], 3)
        # Baixa confiança: o campo vai vazio e o cidadão preenche olhando o recorte (RF004)
        if melhor[1] >= limiar_confianca:
            resultado["value"] = melhor[0]
    return resultado
