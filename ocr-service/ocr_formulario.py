"""OCR de formulário: lê o cartão da caderneta campo a campo.

Detecta os blocos (cartões claros sobre o fundo escuro), descarta os vazios,
localiza os rótulos impressos com o Tesseract e os usa como âncoras para
recortar a faixa de cada campo. Cada recorte é limpo (linhas impressas e
rótulos removidos), ampliado e lido sozinho com psm 7 e 8.
"""

import re
import statistics
import unicodedata
from pathlib import Path

import cv2
import numpy as np
import pytesseract
from pytesseract import Output
from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

ROTULOS = ("VACINA", "FAB", "LOTE", "COD", "VACINADOR")
CAMPOS = ("vacina", "data", "fab", "lote", "cod", "vacinador")

# Modelo do cartão, medido na caderneta de referência: posição vertical como fração
# da altura do bloco. Usado para ajustar as âncoras encontradas e estimar as que faltam.
MODELO_ROTULO_Y = {"VACINA": 0.142, "FAB": 0.449, "LOTE": 0.560, "COD": 0.672, "VACINADOR": 0.776}
MODELO_LINHA_Y = {"vacina": 0.242, "data": 0.358, "fab": 0.470, "lote": 0.578, "cod": 0.682, "vacinador": 0.896}
# Início e largura do rótulo (com ".:") como fração da largura do bloco
MODELO_ROTULO_X = {"VACINA": (0.11, 0.37), "FAB": (0.11, 0.22), "LOTE": (0.11, 0.30),
                   "COD": (0.11, 0.27), "VACINADOR": (0.11, 0.62)}

ESCALA_CAMPO = 2.5
LIMIAR_TINTA_BLOCO = 0.02
LIMIAR_TINTA_CAMPO = 0.004
PSMS_CAMPO = (7, 8)
MAIUSCULAS_DIGITOS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
WHITELIST = {"data": "0123456789/", "lote": MAIUSCULAS_DIGITOS, "fab": "0123456789/",
             "cod": MAIUSCULAS_DIGITOS + ":"}


def _normalizar(texto):
    texto = "".join(c for c in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(c))
    return re.sub(r"[^A-Z0-9]", "", texto.upper())


# ---------------------------------------------------------------------------
# Blocos
# ---------------------------------------------------------------------------

def detectar_blocos(cinza):
    """Retângulos claros, grandes e com formato de cartão, em ordem de leitura."""
    h, w = cinza.shape
    _, claro = cv2.threshold(cv2.GaussianBlur(cinza, (5, 5), 0), 0, 255,
                             cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    claro = cv2.morphologyEx(claro, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)))
    contornos, _ = cv2.findContours(claro, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blocos = []
    for c in contornos:
        x, y, bw, bh = cv2.boundingRect(c)
        area_caixa = bw * bh
        if not (0.02 * w * h <= area_caixa <= 0.5 * w * h):
            continue
        if cv2.contourArea(c) / area_caixa < 0.75 or not (0.8 <= bh / bw <= 3.0):
            continue
        blocos.append((x, y, bw, bh))
    if not blocos:
        return []
    altura_tipica = statistics.median(b[3] for b in blocos)
    return sorted(blocos, key=lambda b: (round(b[1] / (0.5 * altura_tipica)), b[0]))


def _tinta(cinza):
    """Máscara da tinta (branco = traço) com limiar adaptativo, robusto à iluminação irregular."""
    bloco = max(15, (min(cinza.shape) // 12) | 1)
    return cv2.adaptiveThreshold(cv2.GaussianBlur(cinza, (3, 3), 0), 255,
                                 cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, bloco, 15)


def _linhas_horizontais(tinta, fracao=0.2):
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, int(tinta.shape[1] * fracao)), 1))
    return cv2.morphologyEx(tinta, cv2.MORPH_OPEN, k)


def _ys_das_linhas(tinta):
    mascara = _linhas_horizontais(tinta)
    n, _, st, _ = cv2.connectedComponentsWithStats(mascara, 8)
    ys = sorted(st[i, cv2.CC_STAT_TOP] + st[i, cv2.CC_STAT_HEIGHT] / 2 for i in range(1, n)
                if st[i, cv2.CC_STAT_WIDTH] >= 0.2 * tinta.shape[1])
    agrupadas = []
    for y in ys:
        if agrupadas and y - agrupadas[-1][-1] <= 6:
            agrupadas[-1].append(y)
        else:
            agrupadas.append([y])
    return [statistics.mean(g) for g in agrupadas]


def _fracao_dentro(caixa, caixas, folga):
    x, y, w, h = caixa
    melhor = 0.0
    for rx, ry, rw, rh in caixas:
        ix = max(0, min(x + w, rx + rw + folga) - max(x, rx - folga))
        iy = max(0, min(y + h, ry + rh + folga) - max(y, ry - folga))
        melhor = max(melhor, ix * iy / max(1, w * h))
    return melhor


def limpar(tinta, caixas_rotulo, escala=1.0, bordas_campo=False):
    """Remove linhas horizontais impressas, rótulos, ruído e, nos recortes de campo,
    restos encostados nas bordas (borda do cartão e pontas da escrita dos campos vizinhos)."""
    tinta = tinta.copy()
    # Apaga a área de cada rótulo; o que sobrar dele sai no filtro de componentes abaixo
    for rx, ry, rw, rh in caixas_rotulo:
        tinta[max(0, int(ry)):max(0, int(ry + rh)), max(0, int(rx)):max(0, int(rx + rw))] = 0
    linhas = _linhas_horizontais(tinta, fracao=1 / 6)
    linhas = cv2.dilate(linhas, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, int(3 * escala)))))
    sem_linhas = cv2.subtract(tinta, linhas)
    # Religa os traços à mão que a remoção da linha cortou
    sem_linhas = cv2.morphologyEx(sem_linhas, cv2.MORPH_CLOSE,
                                  cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, int(6 * escala)))))
    n, rotulos_cc, st, _ = cv2.connectedComponentsWithStats(sem_linhas, 8)
    H, W = sem_linhas.shape
    manter = np.zeros(n, dtype=np.uint8)
    area_min = max(12, int(10 * escala * escala))
    folga = 6 * escala
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < area_min:
            continue
        if h <= 4 * escala and w >= 2 * h:  # resto achatado de linha impressa
            continue
        if _fracao_dentro((x, y, w, h), caixas_rotulo, folga) >= 0.6:
            continue
        if bordas_campo:
            if (x <= 1 or x + w >= W - 1) and w < 0.03 * W:  # borda do cartão
                continue
            if (y <= 1 or y + h >= H - 1) and h < 0.2 * H:  # ponta de escrita do campo vizinho
                continue
        manter[i] = 255
    return manter[rotulos_cc]


# ---------------------------------------------------------------------------
# Âncoras
# ---------------------------------------------------------------------------

def _pontuar_rotulo(palavra):
    n = _normalizar(palavra)
    if len(n) < 2:
        return None, 0
    melhor, score = None, 0
    for r in ROTULOS:
        if len(r) == 3:
            s = 100 - 25 * Levenshtein.distance(n[:4], r) if len(n) <= 5 else 0
        else:
            s = fuzz.ratio(n, r)
        if s > score:
            melhor, score = r, s
    return (melhor, score) if score >= 75 else (None, 0)


def localizar_rotulos(g):
    """Lê o bloco com psm 11 em duas binarizações e guarda o melhor candidato de cada rótulo."""
    _, otsu = cv2.threshold(cv2.GaussianBlur(g, (3, 3), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adapt = 255 - _tinta(g)
    achados = {}
    for img in (otsu, adapt):
        d = pytesseract.image_to_data(img, lang="por", config="--oem 1 --psm 11", output_type=Output.DICT)
        for i, txt in enumerate(d["text"]):
            if not (txt or "").strip() or d["left"][i] > 0.5 * g.shape[1]:
                continue
            r, score = _pontuar_rotulo(txt)
            if not r:
                continue
            caixa = (d["left"][i], d["top"][i], d["width"][i], d["height"][i])
            if r not in achados or score > achados[r]["score"]:
                achados[r] = {"caixa": caixa, "score": score, "texto": txt.strip(), "estimado": False}
    return achados


def _ajustar_modelo(achados, bh):
    """Ajusta y = a + b * posição_relativa aos rótulos achados, descartando os incoerentes."""
    pontos = {r: a["caixa"][1] + a["caixa"][3] / 2 for r, a in achados.items()}
    while True:
        if len(pontos) >= 2:
            rel = np.array([MODELO_ROTULO_Y[r] for r in pontos])
            ys = np.array(list(pontos.values()))
            b, a = np.polyfit(rel, ys, 1)
            if not (0.6 * bh <= b <= 1.6 * bh):
                b, a = float(bh), float(np.median(ys - bh * rel))
        elif len(pontos) == 1:
            r, y = next(iter(pontos.items()))
            b, a = float(bh), y - bh * MODELO_ROTULO_Y[r]
        else:
            return 0.0, float(bh), []
        residuos = {r: abs(y - (a + b * MODELO_ROTULO_Y[r])) for r, y in pontos.items()}
        pior = max(residuos, key=residuos.get)
        if len(pontos) >= 3 and residuos[pior] > 0.04 * b:
            pontos.pop(pior)
            continue
        descartados = [r for r in achados if r not in pontos]
        return float(a), float(b), descartados


def ancorar(g, achados):
    bh, bw = g.shape
    a, b, descartados = _ajustar_modelo(achados, bh)
    for r in descartados:
        achados.pop(r)
    alturas = [x["caixa"][3] for x in achados.values()]
    lh = statistics.median(alturas) if alturas else 0.045 * b

    rotulos = {}
    for r in ROTULOS:
        if r in achados:
            rotulos[r] = achados[r]
            continue
        x0, largura = MODELO_ROTULO_X[r]
        cy = a + b * MODELO_ROTULO_Y[r]
        rotulos[r] = {"caixa": (int(x0 * bw), int(cy - lh / 2), int(largura * bw), int(lh)),
                      "score": 0, "texto": "", "estimado": True}
    # Inclui o ".:" depois do rótulo na área a apagar
    for r in rotulos.values():
        x, y, w, h = r["caixa"]
        r["caixa_apagar"] = (x, y, int(w + 0.6 * lh), h)

    linhas = _ys_das_linhas(_tinta(g))
    base = {}
    for campo in CAMPOS:
        esperado = a + b * MODELO_LINHA_Y[campo]
        perto = [y for y in linhas if abs(y - esperado) <= 0.03 * b]
        base[campo] = min(perto, key=lambda y: abs(y - esperado)) if perto else esperado

    def centro(r):
        x, y, w, h = rotulos[r]["caixa"]
        return y + h / 2

    topo = {"vacina": centro("VACINA"), "data": base["vacina"], "fab": base["data"],
            "lote": base["fab"], "cod": base["lote"], "vacinador": centro("VACINADOR")}
    fundo = dict(base)
    fundo["vacinador"] = base["vacinador"] + 2 * lh
    faixas = {}
    for campo in CAMPOS:
        y0 = int(max(0, topo[campo] - 0.15 * lh))
        y1 = int(min(bh, fundo[campo] + 0.35 * lh))
        faixas[campo] = (y0, y1)
    return rotulos, faixas, {"a": round(a, 1), "b": round(b, 1), "altura_rotulo": round(lh, 1),
                             "linhas_detectadas": len(linhas)}


# ---------------------------------------------------------------------------
# Leitura por campo
# ---------------------------------------------------------------------------

def _preparar_campo(g, faixa, rotulos, binarizacao):
    y0, y1 = faixa
    margem = 3
    recorte = g[y0:y1, margem:g.shape[1] - margem]
    ampliado = cv2.resize(recorte, None, fx=ESCALA_CAMPO, fy=ESCALA_CAMPO, interpolation=cv2.INTER_CUBIC)
    if binarizacao == "otsu":
        _, tinta = cv2.threshold(cv2.GaussianBlur(ampliado, (5, 5), 0), 0, 255,
                                 cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    else:
        bloco = int(31 * ESCALA_CAMPO) | 1
        tinta = cv2.adaptiveThreshold(cv2.GaussianBlur(ampliado, (5, 5), 0), 255,
                                      cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, bloco, 15)
    e = ESCALA_CAMPO
    caixas = [((x - margem) * e, (y - y0) * e, w * e, h * e)
              for x, y, w, h in (r["caixa_apagar"] for r in rotulos.values())]
    limpa = limpar(tinta, caixas, e, bordas_campo=True)
    densidade = float(np.count_nonzero(limpa)) / limpa.size
    ys, xs = np.nonzero(limpa)
    if len(xs) == 0:
        return recorte, None, densidade
    p = int(8 * e)
    limpa = limpa[max(0, ys.min() - p):ys.max() + p, max(0, xs.min() - p):xs.max() + p]
    final = cv2.copyMakeBorder(255 - limpa, 25, 25, 25, 25, cv2.BORDER_CONSTANT, value=255)
    return recorte, final, densidade


def _ler(img, campo, psm):
    config = f"--oem 1 --psm {psm} --dpi 300"
    if campo in WHITELIST:
        config += f" -c tessedit_char_whitelist={WHITELIST[campo]}"
    d = pytesseract.image_to_data(img, lang="por", config=config, output_type=Output.DICT)
    palavras = [(t.strip(), float(c)) for t, c in zip(d["text"], d["conf"]) if (t or "").strip()]
    confs = [c for _, c in palavras if c >= 0]
    return " ".join(t for t, _ in palavras), (round(statistics.mean(confs), 1) if confs else None)


def ler_bloco(g, indice, pasta: Path, rotulos, faixas):
    campos = {}
    for campo in CAMPOS:
        leituras = []
        vazio = True
        for binarizacao in ("otsu", "adaptativa"):
            recorte, final, densidade = _preparar_campo(g, faixas[campo], rotulos, binarizacao)
            if binarizacao == "otsu":
                cv2.imwrite(str(pasta / f"bloco{indice}_{campo}_1_recorte.png"), recorte)
            if final is None or densidade < LIMIAR_TINTA_CAMPO:
                continue
            vazio = False
            cv2.imwrite(str(pasta / f"bloco{indice}_{campo}_2_limpo_{binarizacao}.png"), final)
            for psm in PSMS_CAMPO:
                texto, conf = _ler(final, campo, psm)
                leituras.append({"binarizacao": binarizacao, "psm": psm, "texto": texto, "conf": conf})
        campos[campo] = {"faixa": faixas[campo], "vazio": vazio, "leituras": leituras}
    return campos


def ler_formulario(cinza, pasta_saida: Path):
    """Ponto de entrada: devolve os blocos detectados e, para os com escrita, as leituras por campo."""
    pasta = pasta_saida / "campos"
    pasta.mkdir(exist_ok=True)
    blocos = []
    for i, (x, y, bw, bh) in enumerate(detectar_blocos(cinza), start=1):
        g = cinza[y:y + bh, x:x + bw]
        achados = localizar_rotulos(g)
        rotulos, faixas, ajuste = ancorar(g, achados)
        # Tinta fora dos rótulos e das linhas impressas, abaixo de "VACINA"
        caixas = [r["caixa_apagar"] for r in rotulos.values()]
        topo = int(max(0, rotulos["VACINA"]["caixa"][1] + rotulos["VACINA"]["caixa"][3]))
        limpa = limpar(_tinta(g), caixas)[topo:]
        densidade = float(np.count_nonzero(limpa)) / max(1, limpa.size)
        bloco = {"indice": i, "caixa": (x, y, bw, bh), "densidade_tinta": round(densidade, 4),
                 "com_escrita": densidade >= LIMIAR_TINTA_BLOCO, "ajuste": ajuste,
                 "rotulos": {r: {k: v for k, v in a.items() if k != "caixa_apagar"} for r, a in rotulos.items()},
                 "_faixas": faixas}
        if bloco["com_escrita"]:
            bloco["campos"] = ler_bloco(g, i, pasta, rotulos, faixas)
        blocos.append(bloco)
    _desenhar(cinza, blocos, pasta_saida / "07_blocos_e_ancoras.png")
    for b in blocos:
        b.pop("_faixas")
    return blocos


def _desenhar(cinza, blocos, caminho):
    img = cv2.cvtColor(cinza, cv2.COLOR_GRAY2BGR)
    cores = {"vacina": (255, 0, 255), "data": (0, 140, 255), "fab": (160, 160, 0),
             "lote": (0, 0, 255), "cod": (255, 120, 0), "vacinador": (0, 160, 0)}
    for b in blocos:
        x, y, bw, bh = b["caixa"]
        cv2.rectangle(img, (x, y), (x + bw, y + bh), (0, 200, 0) if b["com_escrita"] else (150, 150, 150), 3)
        cv2.putText(img, f"{b['indice']} ({b['densidade_tinta']:.3f})", (x + 8, y + 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 120, 0) if b["com_escrita"] else (120, 120, 120), 2)
        for r in b["rotulos"].values():
            rx, ry, rw, rh = r["caixa"]
            cor = (200, 0, 200) if r["estimado"] else (255, 0, 0)
            cv2.rectangle(img, (x + rx, y + ry), (x + rx + rw, y + ry + rh), cor, 2)
        if not b["com_escrita"]:
            continue
        for campo, (y0, y1) in b["_faixas"].items():
            cv2.rectangle(img, (x + 3, y + y0), (x + bw - 3, y + y1), cores[campo], 1)
            cv2.putText(img, campo, (x + bw - 110, y + y0 + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, cores[campo], 1)
    cv2.imwrite(str(caminho), img)
