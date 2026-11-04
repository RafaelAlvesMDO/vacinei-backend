"""Prova de conceito do OCR da caderneta física (RF004, D25).

Processa todas as imagens de uma pasta: pré-processa com OpenCV, lê com
pytesseract em várias configurações, extrai data, lote e vacina e compara
com o gabarito.txt da pasta. Teste isolado: não fala com a API nem com o app.
"""

import argparse
import json
import math
import re
import statistics
import sys
import unicodedata
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import pytesseract
from pytesseract import Output
from rapidfuzz import fuzz
from rapidfuzz.distance import Levenshtein

from ocr_formulario import CAMPOS as CAMPOS_FORMULARIO
from ocr_formulario import ler_formulario

EXTENSOES = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
CAMPOS_AVALIADOS = ("vacina", "data", "lote")
LADO_MAXIMO = 2500
LADO_MINIMO = 1600
LIMIAR_NOME = 85
LIMIAR_SIGLA_APROX = 90


# ---------------------------------------------------------------------------
# Utilidades de texto
# ---------------------------------------------------------------------------

def sem_acentos(texto: str) -> str:
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def normalizar(texto: str) -> str:
    """Maiúsculas, sem acentos e só com letras, dígitos e espaços."""
    texto = sem_acentos(texto).upper()
    texto = re.sub(r"[^A-Z0-9]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def normalizar_lote(texto: str) -> str:
    return re.sub(r"[^A-Z0-9?]", "", sem_acentos(texto).upper())


def bate_com_curinga(lido: str, padrao: str) -> bool:
    """Compara só as posições legíveis: '?' no padrão aceita qualquer caractere."""
    if len(lido) != len(padrao):
        return False
    return all(p == "?" or p == c for c, p in zip(lido, padrao))


# ---------------------------------------------------------------------------
# Catálogo de vacinas
# ---------------------------------------------------------------------------

class Catalogo:
    def __init__(self, caminho: Path):
        dados = json.loads(caminho.read_text(encoding="utf-8"))
        self.entradas = []
        for grupo, no_catalogo in (("catalogo", True), ("fora_do_catalogo", False)):
            for item in dados[grupo]:
                apelidos = {normalizar(a) for a in item["apelidos"]} | {normalizar(item["nome"])}
                self.entradas.append({
                    "nome": item["nome"],
                    "no_catalogo": no_catalogo,
                    "apelidos": sorted(a for a in apelidos if a),
                })

    @staticmethod
    def _eh_sigla(apelido: str) -> bool:
        return " " not in apelido and len(apelido) <= 5

    def identificar(self, texto: str):
        """Retorna o melhor candidato do catálogo (ou da lista de conhecidas fora dele)."""
        linhas = [normalizar(l) for l in texto.splitlines()]
        linhas = [l for l in linhas if l]
        tokens = {t for l in linhas for t in l.split()}
        melhor = None
        for entrada in self.entradas:
            for apelido in entrada["apelidos"]:
                score, trecho = 0.0, ""
                if self._eh_sigla(apelido):
                    if apelido in tokens:
                        score, trecho = 100.0, apelido
                    elif len(apelido) >= 4:
                        for t in tokens:
                            if abs(len(t) - len(apelido)) <= 1 and Levenshtein.distance(t, apelido) == 1:
                                score, trecho = float(LIMIAR_SIGLA_APROX), t
                                break
                else:
                    for linha in linhas:
                        if len(linha) >= len(apelido):
                            s = fuzz.partial_ratio(apelido, linha)
                        else:
                            s = fuzz.ratio(apelido, linha)
                        if s > score:
                            score, trecho = s, linha
                    if score < LIMIAR_NOME:
                        score = 0.0
                if score <= 0:
                    continue
                chave = (score, len(apelido))
                if melhor is None or chave > melhor["_chave"]:
                    melhor = {
                        "_chave": chave,
                        "nome": entrada["nome"],
                        "no_catalogo": entrada["no_catalogo"],
                        "apelido": apelido,
                        "trecho_lido": trecho,
                        "similaridade": round(score, 1),
                    }
        if melhor:
            melhor.pop("_chave")
        return melhor


# ---------------------------------------------------------------------------
# Pré-processamento (OpenCV)
# ---------------------------------------------------------------------------

def redimensionar(img):
    h, w = img.shape[:2]
    maior = max(h, w)
    if maior > LADO_MAXIMO:
        f = LADO_MAXIMO / maior
        return cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_AREA), f
    if maior < LADO_MINIMO:
        f = LADO_MINIMO / maior
        return cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC), f
    return img, 1.0


def estimar_inclinacao(cinza):
    """Mediana do ângulo das linhas quase horizontais (bordas da tabela e linhas de texto)."""
    bordas = cv2.Canny(cinza, 50, 150)
    w = cinza.shape[1]
    linhas = cv2.HoughLinesP(bordas, 1, np.pi / 180, threshold=100,
                             minLineLength=max(50, w // 8), maxLineGap=10)
    if linhas is None:
        return 0.0, 0
    angulos = []
    for x1, y1, x2, y2 in linhas[:, 0]:
        a = math.degrees(math.atan2(y2 - y1, x2 - x1))
        if abs(a) < 20:
            angulos.append(a)
    if not angulos:
        return 0.0, 0
    return float(statistics.median(angulos)), len(angulos)


def rotacionar(img, angulo):
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angulo, 1.0)
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def preprocessar(img, pasta_saida: Path):
    etapas = {}
    img, fator = redimensionar(img)
    cv2.imwrite(str(pasta_saida / "01_original.png"), img)

    cinza = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cv2.imwrite(str(pasta_saida / "02_cinza.png"), cinza)

    angulo, n_linhas = estimar_inclinacao(cinza)
    if abs(angulo) >= 0.3:
        cinza = rotacionar(cinza, angulo)
    cv2.imwrite(str(pasta_saida / "03_inclinacao_corrigida.png"), cinza)

    limpa = cv2.fastNlMeansDenoising(cinza, None, h=10, templateWindowSize=7, searchWindowSize=21)
    cv2.imwrite(str(pasta_saida / "04_sem_ruido.png"), limpa)

    _, otsu = cv2.threshold(limpa, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    cv2.imwrite(str(pasta_saida / "05a_binaria_otsu.png"), otsu)

    adaptativa = cv2.adaptiveThreshold(limpa, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                       cv2.THRESH_BINARY, 31, 15)
    cv2.imwrite(str(pasta_saida / "05b_binaria_adaptativa.png"), adaptativa)

    etapas["sem_ruido"] = limpa
    etapas["otsu"] = otsu
    etapas["adaptativa"] = adaptativa
    info = {
        "fator_escala": round(fator, 3),
        "tamanho_processado": f"{img.shape[1]}x{img.shape[0]}",
        "inclinacao_graus": round(angulo, 2),
        "linhas_usadas_na_inclinacao": n_linhas,
    }
    return etapas, info


# ---------------------------------------------------------------------------
# Leitura (pytesseract)
# ---------------------------------------------------------------------------

def ler(img, psm: int):
    """Monta o texto a partir do image_to_data, guardando a posição de cada palavra."""
    dados = pytesseract.image_to_data(img, lang="por", config=f"--oem 1 --psm {psm}",
                                      output_type=Output.DICT)
    palavras, partes, linha_atual, pos = [], [], None, 0
    for i, txt in enumerate(dados["text"]):
        txt = (txt or "").strip()
        if not txt:
            continue
        conf = float(dados["conf"][i])
        chave_linha = (dados["block_num"][i], dados["par_num"][i], dados["line_num"][i])
        if linha_atual is not None:
            sep = " " if chave_linha == linha_atual else "\n"
            partes.append(sep)
            pos += 1
        linha_atual = chave_linha
        palavras.append({
            "texto": txt, "conf": conf, "ini": pos, "fim": pos + len(txt),
            "caixa": (dados["left"][i], dados["top"][i], dados["width"][i], dados["height"][i]),
        })
        partes.append(txt)
        pos += len(txt)
    texto = "".join(partes)
    confs = [p["conf"] for p in palavras if p["conf"] >= 0]
    return {
        "texto": texto,
        "palavras": palavras,
        "conf_media": round(statistics.mean(confs), 1) if confs else 0.0,
    }


def conf_do_trecho(palavras, ini, fim):
    confs = [p["conf"] for p in palavras if p["ini"] < fim and p["fim"] > ini and p["conf"] >= 0]
    return round(statistics.mean(confs), 1) if confs else None


# ---------------------------------------------------------------------------
# Extração de campos
# ---------------------------------------------------------------------------

CONFUSAO_DIGITOS = str.maketrans({
    "O": "0", "o": "0", "Q": "0", "D": "0",
    "I": "1", "l": "1", "|": "1", "i": "1", "!": "1",
    "S": "5", "s": "5", "Z": "2", "z": "2", "B": "8", "b": "6", "G": "6",
})
C = r"[0-9OoQDIl|i!SsZzBbG]"
RE_DATA = re.compile(
    rf"(?<![0-9A-Za-z])({C}{{1,2}})\s?[/\-.\\]\s?({C}{{1,2}})\s?[/\-.\\]\s?({C}{{2}}(?:{C}{{2}})?)(?![0-9A-Za-z])"
)
RE_ROTULO_LOTE = re.compile(r"\b(?:L[O0]TE|LT)\b\.?:?", re.IGNORECASE)
RE_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-/.]*")


def montar_data(d, mes, a):
    """Valida dia, mês e ano (2 ou 4 dígitos) e devolve dd/mm/aaaa, ou None."""
    if not (d.isdigit() and mes.isdigit() and a.isdigit()) or len(a) not in (2, 4):
        return None
    dia, mes_i, ano = int(d), int(mes), int(a)
    if len(a) == 2:
        ano += 2000 if ano <= datetime.now().year % 100 + 1 else 1900
    if not (1 <= dia <= 31 and 1 <= mes_i <= 12 and 1950 <= ano <= 2035):
        return None
    return f"{dia:02d}/{mes_i:02d}/{ano}"


def extrair_datas(texto):
    candidatos = []
    for m in RE_DATA.finditer(texto):
        bruto = m.group(0)
        if sum(ch.isdigit() for ch in bruto) < 4:
            continue
        valor = montar_data(*(g.translate(CONFUSAO_DIGITOS) for g in m.groups()))
        if not valor:
            continue
        antes = normalizar(texto[max(0, m.start() - 14):m.start()])
        candidatos.append({
            "valor": valor,
            "lido": bruto,
            "ini": m.start(), "fim": m.end(),
            "rotulo_fab_val": bool(re.search(r"\b(FAB|VAL|VENC|VALIDADE)\b", antes)),
        })
    return candidatos


def extrair_lote(texto, datas, catalogo_tokens):
    faixas_data = [(d["ini"], d["fim"]) for d in datas]

    def valido(tok, ini):
        n = normalizar_lote(tok)
        if len(n) < 4 or not any(ch.isdigit() for ch in n):
            return False
        if any(a <= ini < b for a, b in faixas_data) or RE_DATA.fullmatch(tok):
            return False
        return n not in catalogo_tokens

    for rot in RE_ROTULO_LOTE.finditer(texto):
        for i, m in enumerate(RE_TOKEN.finditer(texto, rot.end())):
            if i >= 3:
                break
            if valido(m.group(0), m.start()):
                return {"valor": normalizar_lote(m.group(0)), "lido": m.group(0),
                        "ini": m.start(), "fim": m.end(), "metodo": "após o rótulo 'lote'"}
    for m in RE_TOKEN.finditer(texto):
        n = normalizar_lote(m.group(0))
        letras = sum(ch.isalpha() for ch in n)
        digitos = sum(ch.isdigit() for ch in n)
        if len(n) >= 5 and letras >= 1 and digitos >= 2 and valido(m.group(0), m.start()):
            return {"valor": n, "lido": m.group(0), "ini": m.start(), "fim": m.end(),
                    "metodo": "token alfanumérico (sem rótulo)"}
    return None


def extrair_campos(leitura, catalogo: Catalogo, catalogo_tokens):
    texto, palavras = leitura["texto"], leitura["palavras"]
    campos = {}

    datas = extrair_datas(texto)
    preferidas = [d for d in datas if not d["rotulo_fab_val"]] or datas
    if preferidas:
        d = preferidas[0]
        campos["data"] = {"valor": d["valor"], "lido": d["lido"],
                          "conf": conf_do_trecho(palavras, d["ini"], d["fim"]),
                          "outras_datas": [x["valor"] for x in datas if x is not d]}

    lote = extrair_lote(texto, datas, catalogo_tokens)
    if lote:
        campos["lote"] = {"valor": lote["valor"], "lido": lote["lido"], "metodo": lote["metodo"],
                          "conf": conf_do_trecho(palavras, lote["ini"], lote["fim"])}

    vac = catalogo.identificar(texto)
    if vac:
        trecho = vac["trecho_lido"]
        conf = None
        alvo = [p for p in palavras if normalizar(p["texto"]) and normalizar(p["texto"]) in trecho]
        if alvo:
            conf = round(statistics.mean(p["conf"] for p in alvo if p["conf"] >= 0), 1) if any(
                p["conf"] >= 0 for p in alvo) else None
        campos["vacina"] = {"valor": vac["nome"], "lido": trecho, "no_catalogo": vac["no_catalogo"],
                            "similaridade": vac["similaridade"], "conf": conf}
    return campos


def interpretar_data_campo(texto):
    """Data lida sozinha no recorte: aceita barras, espaços ou só dígitos (barra lida como 1 ou 7)."""
    datas = extrair_datas(texto)
    if datas:
        return datas[0]["valor"]
    dig = re.sub(r"\D", "", texto.translate(CONFUSAO_DIGITOS))
    candidatos = [dig] if len(dig) in (6, 8) else []
    if len(dig) in (8, 10) and dig[2] in "17" and dig[5] in "17":
        candidatos.append(dig[:2] + dig[3:5] + dig[6:])
    for s in candidatos:
        valor = montar_data(s[:2], s[2:4], s[4:])
        if valor:
            return valor
    return None


def interpretar_leitura(campo, texto, catalogo: Catalogo):
    """Devolve (valor, válido, extras) para a leitura de um campo isolado."""
    if campo == "data":
        valor = interpretar_data_campo(texto)
        return valor, valor is not None, {}
    if campo == "lote":
        valor = normalizar_lote(texto)
        return valor, len(valor) >= 4 and any(ch.isdigit() for ch in valor), {}
    if campo == "vacina":
        vac = catalogo.identificar(texto)
        if not vac:
            return normalizar(texto), False, {}
        return vac["nome"], True, {"no_catalogo": vac["no_catalogo"], "similaridade": vac["similaridade"]}
    valor = texto.strip()
    return valor, bool(valor), {}


def interpretar_formulario(blocos, catalogo: Catalogo):
    """Escolhe, para cada campo, a leitura válida de maior confiança entre binarizações e psm."""
    for b in blocos:
        if not b["com_escrita"]:
            continue
        escolhidos = {}
        for campo, info in b["campos"].items():
            for lt in info["leituras"]:
                lt["valor"], lt["valido"], lt["extras"] = interpretar_leitura(campo, lt["texto"], catalogo)
            if not info["leituras"]:
                continue
            melhor = max(info["leituras"], key=lambda lt: (lt["valido"], lt["conf"] or 0))
            info["escolhida"] = f"{melhor['binarizacao']}_psm{melhor['psm']}"
            if melhor["valido"]:
                escolhidos[campo] = {"valor": melhor["valor"], "lido": melhor["texto"], "conf": melhor["conf"],
                                     "metodo": f"âncoras ({info['escolhida']})", **melhor["extras"]}
        b["campos_extraidos"] = escolhidos
    return blocos


# ---------------------------------------------------------------------------
# Gabarito
# ---------------------------------------------------------------------------

NUMEROS = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5}


def interpretar_valor(bruto: str):
    bruto = bruto.strip()
    valor, nota = bruto, ""
    m = re.match(r"^(.*?)\s*\((.*)\)\s*$", bruto)
    if m:
        valor, nota = m.group(1).strip(), m.group(2).strip()
    incerto = bool(re.search(r"\bincert[oa]\b", nota, re.IGNORECASE))
    if re.search(r"\bincert[oa]\s*$", valor, re.IGNORECASE):
        valor = re.sub(r"\s*\bincert[oa]\s*$", "", valor, flags=re.IGNORECASE)
        incerto = True
    if valor.lower() in ("incerto", "incerta", "?"):
        valor, incerto = "", True
    if "?" in valor:
        incerto = True

    padrao = valor if "?" in valor else ""
    if incerto and valor and not padrao:
        # Ex.: "os dois últimos caracteres podem ser N3 ou NB" vira "240VM2033??"
        mm = re.search(r"(\w+)\s+(ultim|primeir)\w*\s+caracter", sem_acentos(nota).lower())
        if mm:
            n = NUMEROS.get(mm.group(1), int(mm.group(1)) if mm.group(1).isdigit() else 0)
            if 0 < n < len(valor):
                padrao = valor[:-n] + "?" * n if mm.group(2) == "ultim" else "?" * n + valor[n:]
    return {"valor": valor, "incerto": incerto, "nota": nota, "padrao_legivel": padrao}


def ler_gabarito(caminho: Path):
    """Aceita dois formatos (podem coexistir):
    A) "campo: valor", uma linha por campo; "imagem: x.jpg" abre o bloco de outra foto.
       Linhas antes de qualquer "imagem:" valem para a única imagem da pasta.
    B) "foto.jpg | data=... | lote=... | vacina=...", uma linha por foto.
    """
    if not caminho.exists():
        return {}, None
    bruto = caminho.read_bytes()
    try:
        conteudo = bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        conteudo = bruto.decode("cp1252")

    gabaritos, atual = {}, None
    for linha in conteudo.splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#"):
            continue
        if "|" in linha:
            partes = [p.strip() for p in linha.split("|")]
            campos = {}
            for p in partes[1:]:
                m = re.match(r"^([\wÀ-ú]+)\s*[=:]\s*(.*)$", p)
                if m:
                    campos[sem_acentos(m.group(1)).lower()] = interpretar_valor(m.group(2))
            gabaritos[partes[0].lower()] = campos
            continue
        m = re.match(r"^([\wÀ-ú]+)\s*:\s*(.*)$", linha)
        if not m:
            continue
        chave = sem_acentos(m.group(1)).lower()
        if chave in ("imagem", "arquivo", "foto"):
            atual = m.group(2).strip().lower()
            gabaritos.setdefault(atual, {})
            continue
        destino = atual if atual is not None else "_sem_imagem"
        gabaritos.setdefault(destino, {})[chave] = interpretar_valor(m.group(2))
    return gabaritos, caminho


def gabarito_da_imagem(gabaritos, nome_arquivo, total_imagens):
    nome = nome_arquivo.lower()
    stem = Path(nome).stem
    for chave, campos in gabaritos.items():
        if chave in (nome, stem):
            return campos
    if "_sem_imagem" in gabaritos and total_imagens == 1:
        return gabaritos["_sem_imagem"]
    return None


# ---------------------------------------------------------------------------
# Comparação
# ---------------------------------------------------------------------------

def _forma_data(texto, digitos_ano=None):
    partes = re.split(r"[/\-.]", texto.strip())
    if len(partes) != 3:
        return texto.strip()
    d, m, a = partes
    d, m = d.zfill(2), m.zfill(2)
    if digitos_ano == 2 and len(a) == 4:
        a = a[2:]
    elif digitos_ano == 4 and len(a) == 2 and "?" not in a:
        a = "20" + a
    return f"{d}/{m}/{a}"


def comparar(campo, extraido, esperado, catalogo: Catalogo):
    lido = extraido["valor"] if extraido else ""
    if campo == "data":
        partes = re.split(r"[/\-.]", esperado["valor"])
        dig_ano = len(partes[2]) if len(partes) == 3 else None
        esp = _forma_data(esperado["valor"], dig_ano)
        padrao = _forma_data(esperado["padrao_legivel"], dig_ano) if esperado["padrao_legivel"] else ""
        lido_cmp = _forma_data(lido, dig_ano) if lido else ""
    elif campo == "lote":
        esp, padrao = normalizar_lote(esperado["valor"]), normalizar_lote(esperado["padrao_legivel"])
        lido_cmp = lido
    else:
        alvo = catalogo.identificar(esperado["valor"])
        esp = alvo["nome"] if alvo else esperado["valor"]
        padrao = ""
        lido_cmp = lido

    similaridade = round(fuzz.ratio(lido_cmp, esp), 1) if lido_cmp and esp else 0.0
    r = {"esperado": esperado["valor"], "esperado_normalizado": esp, "lido": lido_cmp or "—",
         "similaridade": similaridade, "nota": esperado["nota"]}
    if not esperado["incerto"]:
        r["status"] = "acerto" if lido_cmp and lido_cmp == esp else "erro"
        return r
    r["status"] = "incerto"
    if padrao and lido_cmp:
        r["parte_legivel"] = padrao
        r["parte_legivel_confere"] = bate_com_curinga(lido_cmp, padrao)
    elif padrao:
        r["parte_legivel"] = padrao
        r["parte_legivel_confere"] = False
    return r


def avaliar(campos, gabarito, catalogo):
    if not gabarito:
        return None
    resultado = {}
    for campo in CAMPOS_AVALIADOS:
        if campo in gabarito:
            resultado[campo] = comparar(campo, campos.get(campo), gabarito[campo], catalogo)
    return resultado


def placar(avaliacao):
    if not avaliacao:
        return None
    contaveis = [r for r in avaliacao.values() if r["status"] != "incerto"]
    legiveis = [r for r in avaliacao.values() if "parte_legivel_confere" in r]
    return {
        "acertos": sum(r["status"] == "acerto" for r in contaveis),
        "contaveis": len(contaveis),
        "legivel_confere": sum(r["parte_legivel_confere"] for r in legiveis),
        "legivel_total": len(legiveis),
    }


# ---------------------------------------------------------------------------
# Relatórios
# ---------------------------------------------------------------------------

ICONE = {"acerto": "✅ acerto", "erro": "❌ erro", "incerto": "⚠️ incerto"}


def score_sem_gabarito(leitura, campos):
    """Critério que funcionaria em produção, sem gabarito: confiança média + campos encontrados."""
    return round(0.5 * leitura["conf_media"] + 0.5 * 100 * len(campos) / len(CAMPOS_AVALIADOS), 1)


def fmt(v):
    return "—" if v is None or v == "" else str(v)


def relatorio_formulario(blocos, ancoras, gabarito):
    l = ["## Leitura por campo (âncoras)", "",
         "Blocos detectados no `07_blocos_e_ancoras.png` (verde: com escrita, cinza: vazio; rótulos em azul "
         "quando lidos pelo Tesseract e em roxo quando estimados pelo modelo do cartão). Recortes em `campos/`.", "",
         "| Bloco | Posição | Densidade de tinta | Rótulos lidos | Situação |", "|---|---|---|---|---|"]
    for b in blocos:
        x, y, w, h = b["caixa"]
        lidos = [r for r, a in b["rotulos"].items() if not a["estimado"]]
        l.append(f"| {b['indice']} | x={x}, y={y}, {w}x{h} | {b['densidade_tinta']} "
                 f"| {', '.join(lidos) or '—'} | {'com escrita' if b['com_escrita'] else 'vazio (descartado)'} |")
    l.append("")
    escritos = [b for b in blocos if b["com_escrita"]]
    if not escritos:
        return l + ["Nenhum bloco com escrita.", ""]

    for b in escritos:
        avaliado = ancoras and ancoras["bloco"] == b["indice"]
        l += [f"### Bloco {b['indice']}" + (" (comparado com o gabarito)" if avaliado and gabarito else ""), "",
              "| Campo | Leituras (binarização/psm: texto [conf]) | Valor escolhido | Conf. | Esperado | Resultado |",
              "|---|---|---|---|---|---|"]
        aval = (ancoras["avaliacao"] or {}) if avaliado else {}
        for campo in CAMPOS_FORMULARIO:
            info = b["campos"][campo]
            if info["vazio"]:
                leituras = "_recorte vazio_"
            else:
                leituras = "<br>".join(
                    f"{lt['binarizacao']}/psm{lt['psm']}: `{lt['texto'] or '∅'}` [{fmt(lt['conf'])}]"
                    + ("" if lt["valido"] else " ✗") for lt in info["leituras"])
            c = b["campos_extraidos"].get(campo)
            valor = "—" if not c else c["valor"]
            if c and campo == "vacina" and not c.get("no_catalogo", True):
                valor += " ⚠️ fora do catálogo"
            esperado, resultado = "—", "—"
            if campo in aval:
                r = aval[campo]
                esperado, resultado = r["esperado"], ICONE[r["status"]]
                if "parte_legivel" in r:
                    resultado += f" (`{r['parte_legivel']}` {'confere' if r['parte_legivel_confere'] else 'não confere'})"
            elif avaliado and gabarito and campo in gabarito:
                esperado, resultado = fmt(gabarito[campo]["valor"]), "informativo"
            l.append(f"| {campo} | {leituras} | {valor} | {fmt(c['conf'] if c else None)} | {esperado} | {resultado} |")
        if avaliado and ancoras["placar"]:
            p = ancoras["placar"]
            l += ["", f"Placar das âncoras: **{p['acertos']}/{p['contaveis']}** campos legíveis; "
                      f"parte legível dos incertos: {p['legivel_confere']}/{p['legivel_total']}."]
        l.append("")
    return l


def relatorio_imagem(nome, info, variantes, melhor, gabarito, blocos, ancoras):
    l = [f"# Relatório OCR — {nome}", ""]
    l += ["## Pré-processamento", "",
          f"- Tamanho processado: {info['tamanho_processado']} (fator de escala {info['fator_escala']})",
          f"- Inclinação corrigida: {info['inclinacao_graus']}° "
          f"({info['linhas_usadas_na_inclinacao']} linhas usadas na estimativa)",
          "- Etapas salvas: `01_original`, `02_cinza`, `03_inclinacao_corrigida`, `04_sem_ruido`, "
          "`05a_binaria_otsu`, `05b_binaria_adaptativa`, `06_caixas_melhor_variante`", ""]

    l += ["## Variantes testadas", "",
          "| Variante | Conf. média | Campos achados | Score (sem gabarito) | Acertos no gabarito | Parte legível confere |",
          "|---|---|---|---|---|---|"]
    for v in variantes:
        p = v["placar"]
        acertos = f"{p['acertos']}/{p['contaveis']}" if p else "—"
        legivel = f"{p['legivel_confere']}/{p['legivel_total']}" if p and p["legivel_total"] else "—"
        destaque = " **(melhor)**" if v is melhor else ""
        l.append(f"| `{v['id']}`{destaque} | {v['leitura']['conf_media']} | {len(v['campos'])}/3 "
                 f"| {v['score']} | {acertos} | {legivel} |")
    l += ["", "A melhor variante é escolhida pelo score sem gabarito (como seria em produção).", ""]

    l += [f"## Campos extraídos (`{melhor['id']}`)", "",
          "| Campo | Valor | Lido como | Confiança OCR | Observação |", "|---|---|---|---|---|"]
    for campo in CAMPOS_AVALIADOS:
        c = melhor["campos"].get(campo)
        if not c:
            l.append(f"| {campo} | não encontrado | — | — | — |")
            continue
        obs = ""
        if campo == "vacina":
            obs = f"similaridade {c['similaridade']}%"
            if not c["no_catalogo"]:
                obs += "; **vacina fora do catálogo do seed**"
        elif campo == "data" and c.get("outras_datas"):
            obs = "outras datas: " + ", ".join(c["outras_datas"])
        elif campo == "lote":
            obs = c["metodo"]
        l.append(f"| {campo} | {c['valor']} | `{c['lido']}` | {fmt(c.get('conf'))} | {obs} |")
    l.append("")

    if gabarito:
        l += ["## Comparação com o gabarito", "",
              "| Campo | Esperado | Lido | Resultado | Parte legível | Similaridade | Nota |",
              "|---|---|---|---|---|---|---|"]
        for campo, r in (melhor["avaliacao"] or {}).items():
            legivel = "—"
            if "parte_legivel" in r:
                legivel = f"`{r['parte_legivel']}` → {'confere' if r['parte_legivel_confere'] else 'não confere'}"
            l.append(f"| {campo} | {r['esperado']} | {r['lido']} | {ICONE[r['status']]} | {legivel} "
                     f"| {r['similaridade']}% | {fmt(r['nota'])} |")
        info_extra = {k: v for k, v in gabarito.items() if k not in CAMPOS_AVALIADOS}
        if info_extra:
            l += ["", "Campos só informativos (não avaliados):", ""]
            for k, v in info_extra.items():
                inc = " _(incerto)_" if v["incerto"] else ""
                nota = f" — {v['nota']}" if v["nota"] else ""
                l.append(f"- **{k}:** {fmt(v['valor'])}{inc}{nota}")
        l.append("")
    else:
        l += ["## Comparação com o gabarito", "", "Sem gabarito para esta imagem.", ""]

    l += relatorio_formulario(blocos, ancoras, gabarito)

    l += ["## Texto bruto por variante (leitura da página inteira)", ""]
    for v in variantes:
        l += [f"### `{v['id']}`", "", "```", v["leitura"]["texto"] or "(vazio)", "```", ""]
    return "\n".join(l)


def desenhar_caixas(img, palavras, caminho):
    saida = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) if img.ndim == 2 else img.copy()
    for p in palavras:
        x, y, w, h = p["caixa"]
        cor = (0, 170, 0) if p["conf"] >= 70 else (0, 165, 255) if p["conf"] >= 40 else (0, 0, 255)
        cv2.rectangle(saida, (x, y), (x + w, y + h), cor, 2)
    cv2.imwrite(str(caminho), saida)


# ---------------------------------------------------------------------------
# Execução
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Prova de conceito do OCR da caderneta (VACINEI!?)")
    ap.add_argument("--entrada", default="/amostras")
    ap.add_argument("--saida", default="/saida")
    ap.add_argument("--gabarito", default=None, help="padrão: <entrada>/gabarito.txt")
    ap.add_argument("--psm", default="4,6,11", help="modos de segmentação do Tesseract")
    args = ap.parse_args()

    entrada, saida = Path(args.entrada), Path(args.saida)
    saida.mkdir(parents=True, exist_ok=True)
    psms = [int(x) for x in args.psm.split(",") if x.strip()]
    catalogo = Catalogo(Path(__file__).with_name("catalogo_vacinas.json"))
    catalogo_tokens = {a.replace(" ", "") for e in catalogo.entradas for a in e["apelidos"]}

    imagens = sorted(p for p in entrada.iterdir() if p.is_file() and p.suffix.lower() in EXTENSOES)
    ignoradas = sorted(p.name for p in entrada.iterdir()
                       if p.is_file() and p.suffix.lower() == ".heic")
    gabaritos, arq_gab = ler_gabarito(Path(args.gabarito) if args.gabarito else entrada / "gabarito.txt")

    print(f"Tesseract {pytesseract.get_tesseract_version()} | {len(imagens)} imagem(ns) | psm {psms}")
    if not imagens:
        print(f"Nenhuma imagem em {entrada}.")
        return 1

    resultados = []
    for caminho in imagens:
        print(f"→ {caminho.name}")
        pasta = saida / caminho.stem
        pasta.mkdir(parents=True, exist_ok=True)
        img = cv2.imread(str(caminho), cv2.IMREAD_COLOR)
        if img is None:
            print("  não foi possível abrir a imagem")
            resultados.append({"imagem": caminho.name, "erro": "não foi possível abrir"})
            continue

        etapas, info = preprocessar(img, pasta)
        gabarito = gabarito_da_imagem(gabaritos, caminho.name, len(imagens))

        variantes = []
        for nome_img, imagem in etapas.items():
            for psm in psms:
                leitura = ler(imagem, psm)
                campos = extrair_campos(leitura, catalogo, catalogo_tokens)
                avaliacao = avaliar(campos, gabarito, catalogo)
                v = {"id": f"{nome_img}_psm{psm}", "imagem": nome_img, "psm": psm,
                     "leitura": leitura, "campos": campos, "avaliacao": avaliacao,
                     "placar": placar(avaliacao), "score": score_sem_gabarito(leitura, campos)}
                variantes.append(v)
                (pasta / f"texto_{v['id']}.txt").write_text(leitura["texto"], encoding="utf-8")
                print(f"  {v['id']:<22} conf {leitura['conf_media']:>5}  campos {len(campos)}/3")

        melhor = max(variantes, key=lambda v: v["score"])
        desenhar_caixas(etapas[melhor["imagem"]], melhor["leitura"]["palavras"],
                        pasta / "06_caixas_melhor_variante.png")

        blocos = interpretar_formulario(ler_formulario(etapas["sem_ruido"], pasta), catalogo)
        escritos = [b for b in blocos if b["com_escrita"]]
        # O gabarito descreve uma dose: compara com o primeiro bloco escrito (ordem de leitura)
        ancoras = None
        if escritos:
            campos_anc = escritos[0]["campos_extraidos"]
            aval_anc = avaliar(campos_anc, gabarito, catalogo)
            confs = [c["conf"] for c in campos_anc.values() if c.get("conf") is not None]
            ancoras = {"bloco": escritos[0]["indice"], "campos": campos_anc, "avaliacao": aval_anc,
                       "placar": placar(aval_anc),
                       "conf_media": round(statistics.mean(confs), 1) if confs else 0.0}
        print(f"  âncoras: {len(blocos)} bloco(s), {len(escritos)} com escrita"
              + (f", campos {len(ancoras['campos'])}" if ancoras else ""))

        (pasta / "relatorio.md").write_text(
            relatorio_imagem(caminho.name, info, variantes, melhor, gabarito, blocos, ancoras),
            encoding="utf-8")

        resultados.append({
            "imagem": caminho.name, "preprocessamento": info, "tem_gabarito": bool(gabarito),
            "blocos": blocos, "ancoras": ancoras,
            "melhor_variante": melhor["id"],
            "variantes": [{
                "id": v["id"], "conf_media": v["leitura"]["conf_media"], "score": v["score"],
                "campos": v["campos"], "avaliacao": v["avaliacao"], "placar": v["placar"],
            } for v in variantes],
        })

    escrever_resumo(saida, resultados, arq_gab, gabaritos, ignoradas, len(imagens))
    (saida / "resultados.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=2),
                                           encoding="utf-8")
    print(f"Pronto. Veja {saida / 'resumo.md'}")
    return 0


def escrever_resumo(saida, resultados, arq_gab, gabaritos, ignoradas, total_imagens):
    l = ["# Resumo da prova de conceito do OCR", "",
         f"- Gerado em: {datetime.now().isoformat(timespec='seconds')}",
         f"- Imagens processadas: {len(resultados)}",
         f"- Gabarito: {arq_gab.name if arq_gab else 'não encontrado'}"]
    if "_sem_imagem" in gabaritos and total_imagens > 1:
        l.append("- **Atenção:** o gabarito tem campos sem `imagem:` e há mais de uma foto; "
                 "esses campos foram ignorados. Adicione `imagem: nome.jpg` antes deles.")
    if ignoradas:
        l.append(f"- Ignoradas (HEIC não suportado, converta para JPG): {', '.join(ignoradas)}")
    l.append("")

    por_variante = {}
    for r in resultados:
        for v in r.get("variantes", []):
            agg = por_variante.setdefault(v["id"], {"acertos": 0, "contaveis": 0, "leg": 0,
                                                     "leg_tot": 0, "conf": [], "melhor": 0})
            agg["conf"].append(v["conf_media"])
            agg["melhor"] += r["melhor_variante"] == v["id"]
            if v["placar"]:
                agg["acertos"] += v["placar"]["acertos"]
                agg["contaveis"] += v["placar"]["contaveis"]
                agg["leg"] += v["placar"]["legivel_confere"]
                agg["leg_tot"] += v["placar"]["legivel_total"]
        anc = r.get("ancoras")
        if anc:
            agg = por_variante.setdefault("ancoras_por_campo", {"acertos": 0, "contaveis": 0, "leg": 0,
                                                                "leg_tot": 0, "conf": [], "melhor": 0})
            agg["conf"].append(anc["conf_media"])
            if anc["placar"]:
                agg["acertos"] += anc["placar"]["acertos"]
                agg["contaveis"] += anc["placar"]["contaveis"]
                agg["leg"] += anc["placar"]["legivel_confere"]
                agg["leg_tot"] += anc["placar"]["legivel_total"]

    l += ["## Desempenho por variante (todas as imagens)", "",
          "`ancoras_por_campo` é a leitura campo a campo pelos rótulos; as demais leem a página inteira.", "",
          "| Variante | Conf. média | Acertos (campos legíveis) | Parte legível dos incertos | Vezes escolhida |",
          "|---|---|---|---|---|"]
    for vid, a in sorted(por_variante.items(),
                         key=lambda kv: (-kv[1]["acertos"], -kv[1]["leg"], -statistics.mean(kv[1]["conf"]))):
        acertos = f"{a['acertos']}/{a['contaveis']}" if a["contaveis"] else "—"
        leg = f"{a['leg']}/{a['leg_tot']}" if a["leg_tot"] else "—"
        l.append(f"| `{vid}` | {round(statistics.mean(a['conf']), 1)} | {acertos} | {leg} | {a['melhor']} |")
    l.append("")

    l += ["## Por imagem: página inteira (melhor variante sem gabarito) × âncoras", "",
          "| Imagem | Abordagem | Data | Lote | Vacina | Placar |", "|---|---|---|---|---|---|"]

    def linha(imagem, abordagem, c, p):
        vac = c.get("vacina")
        vac_txt = "—" if not vac else vac["valor"] + ("" if vac.get("no_catalogo", True) else " ⚠️ fora do catálogo")
        data = c["data"]["valor"] if "data" in c else "—"
        lote = c["lote"]["valor"] if "lote" in c else "—"
        placar_txt = f"{p['acertos']}/{p['contaveis']}" if p else "sem gabarito"
        return f"| {imagem} | {abordagem} | {data} | {lote} | {vac_txt} | {placar_txt} |"

    for r in resultados:
        if "erro" in r:
            l.append(f"| {r['imagem']} | erro: {r['erro']} | | | | |")
            continue
        v = next(x for x in r["variantes"] if x["id"] == r["melhor_variante"])
        l.append(linha(r["imagem"], f"`{v['id']}`", v["campos"], v["placar"]))
        anc = r.get("ancoras")
        if anc:
            l.append(linha(r["imagem"], f"âncoras (bloco {anc['bloco']})", anc["campos"], anc["placar"]))
        else:
            l.append(f"| {r['imagem']} | âncoras | nenhum bloco com escrita | | | |")
    l.append("")
    l.append("Detalhes, texto bruto e imagens intermediárias em `<nome-da-imagem>/relatorio.md`.")
    (saida / "resumo.md").write_text("\n".join(l), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
