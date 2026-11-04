"""OCR por modelos de caderneta (D34).

1. Identificação: compara a foto com a referência de cada página de cada modelo (SIFT + RANSAC).
   Abaixo do mínimo de correspondências, nenhum modelo é reconhecido e o app cai no cadastro manual.
2. Alinhamento: homografia da referência para a foto; a foto é retificada numa tela proporcional
   à referência, maior que ela, para os recortes manterem a resolução da foto.
3. Células: cada célula do cells.json é reajustada localmente (a dobra da caderneta deixa erros de
   alguns pixels), a tinta à mão é separada da impressão e as células vazias são descartadas.
4. Leitura: só nas células preenchidas. Vacina e dose impressas vêm da posição; data e lote (e a
   vacina, nos blocos livres) vêm do OCR, sempre com o recorte para o cidadão conferir.
"""

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

from leitura_campos import densidade, ler_campo, mascara_tinta, png_base64
from poc_ocr import Catalogo
from textos import ascii_simples

PASTA = Path(__file__).parent
PASTA_TEMPLATES = PASTA / "templates"

MIN_INLIERS = int(os.getenv("OCR_MIN_INLIERS", "40"))
MIN_ESTRUTURA = float(os.getenv("OCR_MIN_STRUCTURE", "0.30"))
LIMIAR_TINTA_CELULA = float(os.getenv("OCR_CELL_INK", "0.006"))
LIMIAR_CONFIANCA = float(os.getenv("OCR_MIN_CONFIDENCE", "0.45"))
LADO_CANVAS = int(os.getenv("OCR_CANVAS_SIDE", "2400"))
TRABALHADORES = int(os.getenv("OCR_WORKERS", "4"))
LADO_MATCH = 1600
LADO_MAX_ENTRADA = 4000
RAZAO_LOWE = 0.75


class Pagina:
    def __init__(self, modelo, dados_modelo, pagina, sift):
        self.modelo = modelo
        self.nome_modelo = dados_modelo["name"]
        self.layouts = dados_modelo["layouts"]
        self.id = pagina["id"]
        self.celulas = pagina["cells"]
        self.ref = cv2.imread(str(PASTA_TEMPLATES / modelo / pagina["reference"]))
        if self.ref is None:
            raise RuntimeError(f"Referência ausente: {modelo}/{pagina['reference']}")
        cinza = cv2.cvtColor(self.ref, cv2.COLOR_BGR2GRAY)
        # Referências pequenas (tabelas da Caderneta da Criança) são ampliadas para render mais pontos
        f = min(2.0, LADO_MATCH / max(cinza.shape))
        kp, self.desc = sift.detectAndCompute(cv2.resize(cinza, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC), None)
        self.pontos = np.float32([k.pt for k in kp]) / f


_sift = cv2.SIFT_create(nfeatures=6000)
_paginas = []
_catalogo = Catalogo(PASTA / "catalogo_vacinas.json")


def carregar_modelos():
    if _paginas:
        return _paginas
    for pasta in sorted(p for p in PASTA_TEMPLATES.iterdir() if (p / "cells.json").exists()):
        dados = json.loads((pasta / "cells.json").read_text(encoding="utf-8"))
        for pagina in dados["pages"]:
            _paginas.append(Pagina(dados["id"], dados, pagina, _sift))
    return _paginas


def modelos_disponiveis():
    vistos = {}
    for p in carregar_modelos():
        vistos.setdefault(p.modelo, {"id": p.modelo, "name": p.nome_modelo, "pages": []})["pages"].append(
            {"id": p.id, "cells": len(p.celulas)})
    return list(vistos.values())


# ---------------------------------------------------------------------------
# Identificação e alinhamento
# ---------------------------------------------------------------------------

def _quad_valido(H, w, h):
    cantos = cv2.perspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2), H)
    cantos = cantos.reshape(-1, 2)
    return cv2.isContourConvex(cantos.astype(np.float32)) and cv2.contourArea(cantos) > 1000


def identificar(foto_cinza):
    """Correspondências da foto com cada página. Devolve a lista de candidatos, do melhor ao pior."""
    f = min(1.0, LADO_MATCH / max(foto_cinza.shape))
    pequena = cv2.resize(foto_cinza, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    kp, desc = _sift.detectAndCompute(pequena, None)
    if desc is None or len(kp) < 10:
        return []
    pontos_foto = np.float32([k.pt for k in kp]) / f
    matcher = cv2.BFMatcher(cv2.NORM_L2)
    candidatos = []
    for pagina in carregar_modelos():
        pares = matcher.knnMatch(pagina.desc, desc, k=2)
        bons = [m for m, n in (p for p in pares if len(p) == 2) if m.distance < RAZAO_LOWE * n.distance]
        cand = {"pagina": pagina, "model": pagina.modelo, "page": pagina.id, "matches": len(bons), "inliers": 0}
        candidatos.append(cand)
        if len(bons) < 8:
            continue
        src = pagina.pontos[[m.queryIdx for m in bons]]
        dst = pontos_foto[[m.trainIdx for m in bons]]
        H, mascara = cv2.findHomography(src, dst, cv2.RANSAC, 3.0 / f, maxIters=5000, confidence=0.995)
        if H is None:
            continue
        h, w = pagina.ref.shape[:2]
        if not _quad_valido(H, w, h):
            continue
        dentro = mascara.ravel().astype(bool)
        proj = cv2.perspectiveTransform(dst[dentro].reshape(-1, 1, 2), np.linalg.inv(H)).reshape(-1, 2)
        erro = float(np.sqrt(np.mean(np.sum((proj - src[dentro]) ** 2, axis=1)))) if dentro.any() else None
        cand.update(H=H, inliers=int(dentro.sum()), inlierRatio=round(float(dentro.mean()), 3),
                    reprojectionError=round(erro, 2) if erro is not None else None)
    return sorted(candidatos, key=lambda c: c["inliers"], reverse=True)


def _sem_sobreposicao(candidatos, forma):
    """Páginas do mesmo modelo têm a mesma grade e os mesmos rótulos, então uma página pode casar
    em parte com a foto de outra. Duas páginas reais ocupam regiões diferentes da foto: se a
    projeção de uma cobre a de outra com mais inliers, ela é descartada."""
    h, w = forma[:2]
    mantidos, mascaras = [], []
    for c in candidatos:  # já em ordem decrescente de inliers
        rh, rw = c["pagina"].ref.shape[:2]
        quad = cv2.perspectiveTransform(np.float32([[0, 0], [rw, 0], [rw, rh], [0, rh]]).reshape(-1, 1, 2), c["H"])
        m = np.zeros((h, w), np.uint8)
        cv2.fillConvexPoly(m, quad.reshape(-1, 2).astype(np.int32), 1)
        area = max(1, int(m.sum()))
        if any(int((m & outra).sum()) / area > 0.3 for outra in mascaras):
            continue
        mantidos.append(c)
        mascaras.append(m)
    return mantidos


def _estrutura_alinhada(ref_cinza, foto_cinza, cobertura):
    """Fração das bordas impressas da referência que reaparecem na foto alinhada (0 a 1)."""
    br = cv2.Canny(cv2.GaussianBlur(ref_cinza, (5, 5), 0), 40, 120) > 0
    bf = cv2.Canny(cv2.GaussianBlur(foto_cinza, (5, 5), 0), 40, 120)
    bf = cv2.dilate(bf, np.ones((7, 7), np.uint8)) > 0
    br &= cobertura
    return float((br & bf).sum()) / max(1, int(br.sum()))


def alinhar(foto, cand):
    pagina = cand["pagina"]
    h, w = pagina.ref.shape[:2]
    s = LADO_CANVAS / max(w, h)
    tamanho = (int(round(w * s)), int(round(h * s)))
    M = cand["H"] @ np.diag([1 / s, 1 / s, 1.0])  # tela -> foto
    flags = cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP
    alinhada = cv2.warpPerspective(foto, M, tamanho, flags=flags, borderMode=cv2.BORDER_CONSTANT,
                                   borderValue=(255, 255, 255))
    cobertura = cv2.warpPerspective(np.full(foto.shape[:2], 255, np.uint8), M, tamanho, flags=cv2.INTER_NEAREST |
                                    cv2.WARP_INVERSE_MAP) > 0
    ref = cv2.resize(pagina.ref, tamanho, interpolation=cv2.INTER_CUBIC)
    return alinhada, ref, cobertura, s


def _qualidade(inliers, estrutura, erro):
    if estrutura >= 0.6 and inliers >= 100 and (erro or 99) <= 3:
        return "boa"
    if estrutura >= 0.45:
        return "razoavel"
    return "baixa"


# ---------------------------------------------------------------------------
# Células
# ---------------------------------------------------------------------------

def _ajuste_local(alinhada_cinza, ref_cinza, x, y, w, h):
    """Desloca a célula para onde a impressão da referência casa melhor na foto (±6% do tamanho)."""
    m = int(0.06 * max(w, h))
    H, W = ref_cinza.shape
    if x - m < 0 or y - m < 0 or x + w + m > W or y + h + m > H:
        return 0, 0, 0.0
    modelo = cv2.GaussianBlur(ref_cinza[y:y + h, x:x + w], (5, 5), 0)
    busca = cv2.GaussianBlur(alinhada_cinza[y - m:y + h + m, x - m:x + w + m], (5, 5), 0)
    r = cv2.matchTemplate(busca, modelo, cv2.TM_CCOEFF_NORMED)
    _, score, _, (bx, by) = cv2.minMaxLoc(r)
    if score < 0.3:
        return 0, 0, float(score)
    return bx - m, by - m, float(score)


def _caixa_campo(rel, w, h):
    x0, y0, x1, y1 = rel
    return int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)


def _processar_celula(pagina, cel, tela, depurar):
    alinhada, cinza, ref_cinza, cobertura, s = tela
    x, y, w, h = (int(round(v * s)) for v in cel["box"])
    if cobertura[y:y + h, x:x + w].mean() < 0.9:
        return {"cel": cel, "fora": True}
    dx, dy, score = _ajuste_local(cinza, ref_cinza, x, y, w, h)
    fx, fy = x + dx, y + dy
    foto_cel = alinhada[fy:fy + h, fx:fx + w]
    tinta = mascara_tinta(foto_cel, ref_cinza[y:y + h, x:x + w], s)
    dens = densidade(tinta, margem=0.05)
    info = {"cel": cel, "box": (fx, fy, w, h), "ajuste": (dx, dy, round(score, 2)), "densidade": dens,
            "preenchida": dens >= LIMIAR_TINTA_CELULA}
    if not info["preenchida"]:
        return info
    campos, depuracao = {}, {}
    for campo, rel in pagina.layouts[cel["layout"]]["campos"].items():
        cx0, cy0, cx1, cy1 = _caixa_campo(rel, w, h)
        dep = {} if depurar else None
        campos[campo] = ler_campo(campo, foto_cel[cy0:cy1, cx0:cx1], tinta[cy0:cy1, cx0:cx1], _catalogo,
                                  LIMIAR_CONFIANCA, dep)
        if depurar:
            dep["foto"] = foto_cel[cy0:cy1, cx0:cx1]
            dep["tinta"] = 255 - tinta[cy0:cy1, cx0:cx1]
            depuracao[campo] = dep
    info.update(campos=campos, depuracao=depuracao, recorte=png_base64(foto_cel, 360))
    return info


def _dose(pagina, info):
    cel, campos = info["cel"], info["campos"]
    if cel["vaccine"]:
        vacina = {"name": cel["vaccine"], "source": "template", "confidence": 1.0, "crop": None}
    else:
        lido = campos.get("vaccine", {"value": None, "confidence": 0.0, "crop": None})
        vacina = {"name": lido["value"], "source": "ocr", "confidence": lido["confidence"], "crop": lido["crop"]}
    vazio = {"value": None, "confidence": 0.0, "crop": None}
    return {
        "cellId": cel["id"],
        "page": pagina.id,
        "kind": cel["kind"],
        "printedLabel": cel["printed"],
        "vaccine": vacina,
        "doseNumber": cel["doseNumber"],
        "doseLabel": cel["doseLabel"],
        "date": {k: v for k, v in campos.get("date", vazio).items() if k != "empty"},
        "batch": {k: v for k, v in campos.get("batch", vazio).items() if k != "empty"},
        "cellCrop": info["recorte"],
        "inkDensity": round(info["densidade"], 4),
    }


# ---------------------------------------------------------------------------
# Ponto de entrada
# ---------------------------------------------------------------------------

def decodificar(dados: bytes):
    img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    lado = max(img.shape[:2])
    if lado > LADO_MAX_ENTRADA:
        f = LADO_MAX_ENTRADA / lado
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
    return img


def processar(dados: bytes, pasta_depuracao: Path | None = None):
    t0 = time.perf_counter()
    tempos = {}
    foto = decodificar(dados)
    if foto is None:
        raise ValueError("Imagem inválida ou formato não suportado.")
    cinza = cv2.cvtColor(foto, cv2.COLOR_BGR2GRAY)
    candidatos = identificar(cinza)
    tempos["identificacao"] = round((time.perf_counter() - t0) * 1000)
    resumo_cand = [{k: c.get(k) for k in ("model", "page", "matches", "inliers")} for c in candidatos]
    resultado = {"model": None, "modelName": None, "pages": [], "candidates": resumo_cand,
                 "cellsChecked": 0, "cellsFilled": 0, "doses": []}
    aceitos = [c for c in candidatos if c["inliers"] >= MIN_INLIERS]
    if aceitos:
        modelo = aceitos[0]["model"]
        aceitos = _sem_sobreposicao([c for c in aceitos if c["model"] == modelo], foto.shape)
    if pasta_depuracao:
        pasta_depuracao.mkdir(parents=True, exist_ok=True)

    paginas_ok = []
    for cand in aceitos:
        t1 = time.perf_counter()
        alinhada, ref, cobertura, s = alinhar(foto, cand)
        estrutura = _estrutura_alinhada(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY),
                                        cv2.cvtColor(alinhada, cv2.COLOR_BGR2GRAY), cobertura)
        pag = {"id": cand["page"], "inliers": cand["inliers"], "inlierRatio": cand["inlierRatio"],
               "reprojectionError": cand["reprojectionError"], "structureMatch": round(estrutura, 3),
               "coverage": round(float(cobertura.mean()), 3),
               "quality": _qualidade(cand["inliers"], estrutura, cand["reprojectionError"])}
        tempos[f"alinhamento_{cand['page']}"] = round((time.perf_counter() - t1) * 1000)
        if estrutura < MIN_ESTRUTURA:
            pag["rejected"] = "estrutura impressa não confere após o alinhamento"
            resultado["pages"].append(pag)
            continue
        paginas_ok.append((cand, pag, alinhada, ref, cobertura, s))
        resultado["pages"].append(pag)

    if not paginas_ok:
        tempos["total"] = round((time.perf_counter() - t0) * 1000)
        resultado["timingsMs"] = tempos
        if pasta_depuracao:
            _gravar_resultado(resultado, pasta_depuracao)
        return resultado

    resultado["model"] = paginas_ok[0][0]["model"]
    resultado["modelName"] = paginas_ok[0][0]["pagina"].nome_modelo
    t2 = time.perf_counter()
    depurar = pasta_depuracao is not None
    with ThreadPoolExecutor(max_workers=TRABALHADORES) as ex:
        for cand, pag, alinhada, ref, cobertura, s in paginas_ok:
            pagina = cand["pagina"]
            tela = (alinhada, cv2.cvtColor(alinhada, cv2.COLOR_BGR2GRAY), cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY),
                    cobertura, s)
            infos = list(ex.map(lambda cel: _processar_celula(pagina, cel, tela, depurar), pagina.celulas))
            avaliadas = [i for i in infos if not i.get("fora")]
            resultado["cellsChecked"] += len(avaliadas)
            preenchidas = [i for i in avaliadas if i["preenchida"]]
            resultado["cellsFilled"] += len(preenchidas)
            resultado["doses"] += [_dose(pagina, i) for i in preenchidas]
            if depurar:
                _depurar_pagina(pasta_depuracao, cand, alinhada, infos)
    tempos["celulas"] = round((time.perf_counter() - t2) * 1000)
    tempos["total"] = round((time.perf_counter() - t0) * 1000)
    resultado["timingsMs"] = tempos
    if depurar:
        _gravar_resultado(resultado, pasta_depuracao)
    return resultado


# ---------------------------------------------------------------------------
# Depuração (só na PoC e nas ferramentas; o serviço HTTP nunca grava imagens)
# ---------------------------------------------------------------------------

def _depurar_pagina(pasta: Path, cand, alinhada, infos):
    vis = alinhada.copy()
    for i in infos:
        if i.get("fora"):
            continue
        x, y, w, h = i["box"]
        cor = (0, 170, 0) if i["preenchida"] else (160, 160, 160)
        cv2.rectangle(vis, (x, y), (x + w, y + h), cor, 3 if i["preenchida"] else 1)
        cv2.putText(vis, f"{i['cel']['id'].split('-')[-1]} {i['densidade']:.3f}", (x + 6, y + 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, cor, 2)
        if not i["preenchida"]:
            continue
        for campo, dep in i["depuracao"].items():
            base = f"{cand['page']}_{i['cel']['id']}_{campo}"
            cv2.imwrite(str(pasta / f"{base}_1_foto.png"), dep["foto"])
            cv2.imwrite(str(pasta / f"{base}_2_tinta.png"), dep["tinta"])
            if "imagem_ocr" in dep:
                cv2.imwrite(str(pasta / f"{base}_3_ocr.png"), dep["imagem_ocr"])
            dep.pop("foto", None), dep.pop("tinta", None), dep.pop("imagem_ocr", None)
        (pasta / f"{cand['page']}_{i['cel']['id']}_leituras.json").write_text(
            json.dumps({c: d for c, d in i["depuracao"].items()}, ensure_ascii=False, indent=2), encoding="utf-8")
    cv2.imwrite(str(pasta / f"alinhada_{cand['page']}.jpg"), vis, [cv2.IMWRITE_JPEG_QUALITY, 85])


def _gravar_resultado(resultado, pasta: Path):
    def sem_imagens(v):
        if isinstance(v, dict):
            return {k: ("<png>" if isinstance(x, str) and x.startswith("data:image") else sem_imagens(x))
                    for k, x in v.items()}
        if isinstance(v, list):
            return [sem_imagens(x) for x in v]
        return v

    (pasta / "resultado.json").write_text(json.dumps(sem_imagens(resultado), ensure_ascii=False, indent=2),
                                          encoding="utf-8")


__all__ = ["processar", "carregar_modelos", "modelos_disponiveis", "ascii_simples"]
