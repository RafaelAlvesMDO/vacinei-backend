"""Leitura da vacina manuscrita nos blocos livres com o método da rodada 2 da PoC (D34).

Reaproveita sem mudanças o código de ocr_formulario.py (âncoras pelos rótulos impressos, faixa do
campo, limpeza de rótulos e linhas, Otsu + adaptativa, psm 7 e 8) e o match aproximado com o
catálogo e os aliases de poc_ocr.py (interpretar_leitura). A diferença é a entrada: o bloco já
alinhado ao modelo, com o mesmo pré-processamento da PoC (redução de ruído).

O Tesseract é sensível à escala da escrita: na foto do cartão de Maceió (bloco com ~140x220 px), o
"ACWY" só casou com o bloco ampliado para 600 e 700 px de altura. Por isso a leitura tenta algumas
alturas, com as âncoras calculadas uma vez, e para no primeiro match exato com o catálogo.
"""

import os

import cv2

from ocr_formulario import LIMIAR_TINTA_CAMPO, _ler, _preparar_campo, ancorar, localizar_rotulos
from poc_ocr import Catalogo, interpretar_leitura

ALTURAS_BLOCO = [int(v) for v in os.getenv("OCR_VACCINE_BLOCK_HEIGHTS", "600,700,500,800").split(",")]


def _escalar_caixa(caixa, f):
    return tuple(int(round(v * f)) for v in caixa)


def ler_vacina_bloco(cinza_bloco, catalogo: Catalogo, depuracao=None):
    """Devolve (nome do catálogo ou None, confiança 0-1, recorte em cinza da faixa VACINA)."""
    base = None
    tentativas = []
    melhor = None
    recorte_saida = None
    for altura in ALTURAS_BLOCO:
        f = altura / cinza_bloco.shape[0]
        g = cv2.resize(cinza_bloco, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC if f > 1 else cv2.INTER_AREA)
        g = cv2.fastNlMeansDenoising(g, None, h=10, templateWindowSize=7, searchWindowSize=21)
        if base is None:
            # Âncoras (rótulos impressos) na primeira escala; nas outras, só reescaladas
            rotulos, faixas, _ = ancorar(g, localizar_rotulos(g))
            base = (altura, rotulos, faixas)
        else:
            k = altura / base[0]
            rotulos = {r: {**a, "caixa": _escalar_caixa(a["caixa"], k),
                           "caixa_apagar": _escalar_caixa(a["caixa_apagar"], k)} for r, a in base[1].items()}
            faixas = {c: _escalar_caixa(v, k) for c, v in base[2].items()}
        for binarizacao in ("otsu", "adaptativa"):
            recorte, final, densidade = _preparar_campo(g, faixas["vacina"], rotulos, binarizacao)
            if recorte_saida is None:
                recorte_saida = recorte
            if final is None or densidade < LIMIAR_TINTA_CAMPO:
                continue
            for psm in (7, 8):
                texto, conf = _ler(final, "vacina", psm)
                valor, valido, extras = interpretar_leitura("vacina", texto, catalogo)
                ok = valido and extras.get("no_catalogo", False)
                tentativas.append({"altura": altura, "binarizacao": binarizacao, "psm": psm, "texto": texto,
                                   "conf": conf, "valor": valor if ok else None,
                                   "similaridade": extras.get("similaridade")})
                if ok:
                    chave = (extras["similaridade"], conf or 0)
                    if melhor is None or chave > melhor[0]:
                        melhor = (chave, valor)
        if melhor and melhor[0][0] >= 100:
            break
    if depuracao is not None:
        depuracao["leituras"] = tentativas
    if not melhor:
        return None, 0.0, recorte_saida
    # A confiança da vacina é a qualidade do match com o catálogo (1,0 exato; 0,9 com uma letra trocada)
    return melhor[1], round(melhor[0][0] / 100, 3), recorte_saida
