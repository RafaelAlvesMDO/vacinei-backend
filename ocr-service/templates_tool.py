"""Ferramentas dos modelos de caderneta (D34).

Comandos:
  referencia-maceio FOTO   Gera templates/caderneta-maceio-jovens-adultos/reference.png a partir da
                           foto do cartão aberto, apagando os blocos preenchidos (dados pessoais).
  gerar-cells MODELO       Detecta a grade na(s) referência(s) e grava o cells.json com os rótulos de
                           vacina e dose definidos em ROTULOS (ordem de leitura).
  desenhar MODELO|todos    Desenha o cells.json sobre a referência e salva em --saida para conferência.
  testar FOTO...           Roda o pipeline completo e grava as imagens de depuração em --saida.

Exemplo (Docker):
  docker compose --profile ocr run --rm ocr python templates_tool.py desenhar todos --saida /saida/templates
"""

import argparse
import json
import statistics
import sys
from pathlib import Path

import cv2
import numpy as np

from textos import ascii_simples

PASTA_TEMPLATES = Path(__file__).parent / "templates"

# Layouts dos campos, em fração da caixa da célula: [x0, y0, x1, y1].
# No modelo de Maceió, a faixa do lote começa acima da linha do FAB: na prática o lote é escrito
# sobre ela (como no bloco do ACWY). A data de fabricação escrita no FAB pode entrar no recorte.
# As faixas vão da linha do campo anterior até um pouco abaixo da linha do próprio campo,
# porque a escrita à mão costuma subir e invadir o rótulo.
LAYOUTS = {
    "maceio-fixo": {
        "descricao": "Bloco com vacina e dose impressas: data (__/__/__), FAB, LOTE, CÓD e VACINADOR",
        "campos": {"date": [0.03, 0.15, 0.97, 0.32], "batch": [0.03, 0.33, 0.97, 0.57]},
    },
    "maceio-livre": {
        "descricao": "Bloco livre: VACINA manuscrita, data, FAB, LOTE, CÓD e VACINADOR",
        "campos": {"vaccine": [0.03, 0.14, 0.97, 0.27], "date": [0.03, 0.25, 0.97, 0.38],
                   "batch": [0.03, 0.39, 0.97, 0.60]},
    },
    "crianca-ms": {
        "descricao": "Célula da Caderneta da Criança: Data, Lote, Lab.Produt., Unidade e Ass.",
        "campos": {"date": [0.02, 0.0, 0.98, 0.24], "batch": [0.02, 0.17, 0.98, 0.42]},
    },
}


def _cel(vacina, dose_numero, dose_rotulo, impresso=None):
    return {"vaccine": vacina, "doseNumber": dose_numero, "doseLabel": dose_rotulo,
            "printed": impresso or (f"{vacina} · {dose_rotulo}" if vacina else "Bloco livre")}


HEPB, PENTA, VIP = "Hepatite B", "Pentavalente (DTP/HB/Hib)", "Poliomielite Inativada (VIP)"
PNEUMO10, MENC, ROTA = "Pneumocócica 10-Valente", "Meningocócica C Conjugada", "Rotavírus Humano (VRH)"
FA, SCR, HPV, COVID = "Febre Amarela", "Tríplice Viral (SCR)", "HPV Quadrivalente", "COVID-19"

# Rótulos em ordem de leitura (linhas de cima para baixo, células da esquerda para a direita).
# doseNumber null: a dose impressa não existe no catálogo (D34) e o cidadão escolhe na revisão.
ROTULOS = {
    "caderneta-maceio-jovens-adultos": {
        "principal": [
            # Página esquerda (blocos impressos) e direita (16 blocos livres), linha a linha
            _cel(COVID, 1, "Primeira dose"), _cel(COVID, 2, "Segunda dose"),
            _cel("Influenza (Gripe)", 1, "Dose anual"), _cel(FA, 1, "Dose única"),
            *[_cel(None, None, None)] * 4,
            _cel("Dupla Adulto (dT)", 1, "Primeira dose"), _cel("Dupla Adulto (dT)", 2, "Segunda dose"),
            _cel("Dupla Adulto (dT)", 3, "Terceira dose"), _cel("Dupla Adulto (dT)", 4, "Reforço"),
            *[_cel(None, None, None)] * 4,
            _cel(HEPB, None, "Primeira dose"), _cel(HEPB, None, "Segunda dose"),
            _cel(HEPB, None, "Terceira dose"), _cel("Meningocócica ACWY", 1, "Reforço", "Meningo. ACWY · Reforço"),
            *[_cel(None, None, None)] * 4,
            _cel(SCR, 1, "Primeira dose"), _cel(SCR, 2, "Segunda dose"),
            _cel(HPV, 1, "Primeira dose"), _cel(HPV, None, "Segunda dose"),
            *[_cel(None, None, None)] * 4,
        ],
    },
    "caderneta-crianca-ms": {
        "ate-12-meses": [
            _cel("BCG", 1, "Dose única"), _cel(HEPB, 1, "Dose ao nascer"),
            _cel(PENTA, 1, "1ª Dose"), _cel(PENTA, 2, "2ª Dose"), _cel(PENTA, 3, "3ª Dose"),
            _cel(ROTA, 1, "1ª Dose"), _cel(ROTA, 2, "2ª Dose"),
            _cel(PNEUMO10, 1, "1ª Dose"), _cel(PNEUMO10, 2, "2ª Dose"),
            _cel(VIP, 1, "1ª Dose"), _cel(VIP, 2, "2ª Dose"), _cel(VIP, 3, "3ª Dose"),
            _cel(MENC, 1, "1ª Dose"), _cel(MENC, 2, "2ª Dose"),
            _cel(FA, 1, "Dose"), _cel(SCR, 1, "1ª Dose"),
            _cel(COVID, 1, "1ª Dose"), _cel(COVID, 2, "2ª Dose"), _cel(COVID, 3, "3ª Dose"),
        ],
        "a-partir-12-meses": [
            _cel(PNEUMO10, 3, "Reforço"), _cel(MENC, 3, "Reforço"),
            _cel("DTP (Tríplice Bacteriana)", 1, "1º Reforço"), _cel("DTP (Tríplice Bacteriana)", 2, "2º Reforço"),
            # VOP impressa: mapeada para os reforços da VIP (doses 4 e 5), D34
            _cel(VIP, 4, "1º Reforço", "VOP · 1º Reforço"), _cel(VIP, 5, "2º Reforço", "VOP · 2º Reforço"),
            _cel("Tetra Viral (SCRV)", 1, "Uma dose"),
            _cel("Varicela", 1, "Uma dose"), _cel(FA, 2, "Dose de reforço"), _cel("Hepatite A", 1, "Uma dose"),
            _cel(HPV, 1, "Dose"), _cel(HPV, None, "Dose"),
            _cel("Pneumocócica 23-Valente", 1, "Uma dose", "Pneumocócica 23V (povos indígenas) · Uma dose"),
        ],
    },
}

MODELOS = {
    "caderneta-maceio-jovens-adultos": {
        "name": "Caderneta de Vacinação de Jovens e Adultos (Prefeitura de Maceió)",
        "paginas": {"principal": "reference.png"},
    },
    "caderneta-crianca-ms": {
        "name": "Caderneta da Criança (Ministério da Saúde) — tabela de vacinas",
        "paginas": {"ate-12-meses": "reference-ate-12-meses.png",
                    "a-partir-12-meses": "reference-a-partir-12-meses.png"},
    },
}


# ---------------------------------------------------------------------------
# Detecção da grade
# ---------------------------------------------------------------------------

def detectar_blocos_claros(img):
    """Blocos claros (cartões) sobre o fundo escuro do modelo de Maceió, em ordem de leitura."""
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    claro = ((hsv[..., 2] > 150) & (hsv[..., 1] < 80)).astype(np.uint8) * 255
    claro = cv2.morphologyEx(claro, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # Abertura vertical maior separa os blocos dos títulos impressos logo acima deles
    claro = cv2.morphologyEx(claro, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 25)))
    contornos, _ = cv2.findContours(claro, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    blocos = []
    for c in contornos:
        x, y, bw, bh = cv2.boundingRect(c)
        if not (0.004 * w * h <= bw * bh <= 0.05 * w * h):
            continue
        if cv2.contourArea(c) / (bw * bh) < 0.8 or not (1.1 <= bh / bw <= 2.0):
            continue
        blocos.append([int(x), int(y), int(bw), int(bh)])
    return ordenar_leitura(blocos)


def ordenar_leitura(caixas):
    if not caixas:
        return []
    altura = statistics.median(c[3] for c in caixas)
    caixas = sorted(caixas, key=lambda c: c[1])
    linhas, atual = [], [caixas[0]]
    for c in caixas[1:]:
        if c[1] - atual[0][1] <= 0.5 * altura:
            atual.append(c)
        else:
            linhas.append(atual)
            atual = [c]
    linhas.append(atual)
    return [c for linha in linhas for c in sorted(linha, key=lambda c: c[0])]


def detectar_grade_tabela(img):
    """Células de dados da tabela da Caderneta da Criança, pelas linhas da grade.

    As células de dados são as regiões brancas fechadas pela grade, altas (Data/Lote/...) e sem cor;
    os cabeçalhos coloridos são baixos e a ilustração é saturada, então ficam de fora.
    """
    h, w = img.shape[:2]
    cinza = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    tinta = cv2.adaptiveThreshold(cinza, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 8)
    horiz = cv2.morphologyEx(tinta, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, w // 25), 1)))
    vert = cv2.morphologyEx(tinta, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(15, h // 14))))
    # Bordas entre faixas de cor (cabeçalhos) também separam células
    bordas = cv2.Canny(cv2.GaussianBlur(img, (3, 3), 0), 60, 160)
    bordas_h = cv2.morphologyEx(bordas, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (max(30, w // 25), 1)))
    grade = cv2.dilate(horiz | vert | bordas_h, np.ones((2, 2), np.uint8))
    n, rotulos, st, _ = cv2.connectedComponentsWithStats(255 - grade, 4)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    candidatas = []
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if bw < 0.06 * w or bh < 0.1 * h or bw > 0.4 * w:
            continue
        regiao = rotulos[y:y + bh, x:x + bw] == i
        if regiao.mean() < 0.85:
            continue
        if float(np.mean(hsv[y:y + bh, x:x + bw, 1][regiao])) > 50:
            continue
        candidatas.append([int(x), int(y), int(bw), int(bh)])
    if not candidatas:
        return []
    # Cabeçalhos brancos (ex.: "DTP", "Varicela") são baixos e a célula de texto decorativo
    # ("Proteja a criança...") é bem mais alta que as de dados
    altura = statistics.median(c[3] for c in candidatas)
    return ordenar_leitura([c for c in candidatas if 0.7 * altura <= c[3] <= 1.4 * altura])


# ---------------------------------------------------------------------------
# Referência do modelo de Maceió
# ---------------------------------------------------------------------------

def tinta_azul(img):
    """Caneta azul: bem mais saturada que o azul-marinho impresso (saturação mediana ~75)."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return (hsv[..., 0] >= 105) & (hsv[..., 0] <= 135) & (hsv[..., 1] >= 110) & (hsv[..., 2] < 190)


def referencia_maceio(foto: Path, recorte):
    img = cv2.imread(str(foto))
    if img is None:
        sys.exit(f"Não consegui abrir {foto}")
    x0, y0, x1, y1 = recorte
    img = img[y0:y1, x0:x1].copy()
    blocos = detectar_blocos_claros(img)
    azul = tinta_azul(img)
    # Margem interna: os cantos arredondados mostram o fundo azul-marinho, que é mais saturado
    densidades = [float(azul[y + 8:y + h - 8, x + 8:x + w - 8].mean()) for x, y, w, h in blocos]
    preenchidos = [i for i, d in enumerate(densidades) if d > 0.01]
    vazios = [i for i in range(len(blocos)) if i not in preenchidos]
    print(f"{len(blocos)} blocos; preenchidos (tinta azul): {preenchidos}")
    for i in preenchidos:
        x, y, w, h = blocos[i]
        # Doador: bloco vazio mais próximo na mesma coluna (mesmo tipo de bloco)
        doador = min(vazios, key=lambda j: abs(blocos[j][0] - x) * 5 + abs(blocos[j][1] - y))
        dx, dy, dw, dh = blocos[doador]
        cor = np.median(img[dy + dh // 2 - 5:dy + dh // 2 + 5, dx + 10:dx + dw - 10].reshape(-1, 3), axis=0)
        # Pinta o bloco com a cor dele e copia o conteúdo impresso do bloco doador, redimensionado
        m = 3
        img[y + m:y + h - m, x + m:x + w - m] = cor
        doado = cv2.resize(img[dy + m:dy + dh - m, dx + m:dx + dw - m], (w - 2 * m, h - 2 * m),
                           interpolation=cv2.INTER_AREA)
        img[y + m:y + h - m, x + m:x + w - m] = doado
        # Pontas de escrita que passaram da borda do bloco: inpaint numa moldura de 20 px em volta
        f = 20
        ry0, ry1, rx0, rx1 = max(0, y - f), min(img.shape[0], y + h + f), max(0, x - f), min(img.shape[1], x + w + f)
        regiao = img[ry0:ry1, rx0:rx1]
        hsv = cv2.cvtColor(regiao, cv2.COLOR_BGR2HSV)
        escuro_azul = (hsv[..., 0] >= 100) & (hsv[..., 0] <= 140) & (hsv[..., 1] >= 90) & (hsv[..., 2] < 120)
        moldura = np.ones(regiao.shape[:2], bool)
        moldura[y - ry0 + m:y - ry0 + h - m, x - rx0 + m:x - rx0 + w - m] = False
        # Fundo azul-marinho impresso tem valor ~70-90; a caneta sobre o fundo é parecida, então o critério
        # é a vizinhança imediata do bloco (5 px) e o traço sobre a área clara da borda
        perto = np.zeros_like(moldura)
        perto[max(0, y - ry0 - 6):y - ry0 + h + 6, max(0, x - rx0 - 6):x - rx0 + w + 6] = True
        mascara = (moldura & perto & (escuro_azul | (cv2.cvtColor(regiao, cv2.COLOR_BGR2GRAY) < 60))).astype(np.uint8)
        mascara = cv2.dilate(mascara * 255, np.ones((5, 5), np.uint8))
        img[ry0:ry1, rx0:rx1] = cv2.inpaint(regiao, mascara, 5, cv2.INPAINT_TELEA)
        print(f"  bloco {i} {blocos[i]} apagado com o conteúdo do bloco {doador} {blocos[doador]}")
    azul = tinta_azul(img)
    restante = max(float(azul[y + 8:y + h - 8, x + 8:x + w - 8].mean()) for x, y, w, h in blocos)
    print(f"maior densidade de tinta azul restante num bloco: {restante:.5f}")
    destino = PASTA_TEMPLATES / "caderneta-maceio-jovens-adultos" / "reference.png"
    destino.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(destino), img)
    print(f"referência gravada em {destino} ({img.shape[1]}x{img.shape[0]})")


# ---------------------------------------------------------------------------
# cells.json
# ---------------------------------------------------------------------------

def gerar_cells(modelo):
    info = MODELOS[modelo]
    pasta = PASTA_TEMPLATES / modelo
    paginas = []
    for pagina, arquivo in info["paginas"].items():
        img = cv2.imread(str(pasta / arquivo))
        if img is None:
            sys.exit(f"Referência ausente: {pasta / arquivo}")
        if modelo.startswith("caderneta-maceio"):
            caixas, layout_fixo, layout_livre = detectar_blocos_claros(img), "maceio-fixo", "maceio-livre"
        else:
            caixas, layout_fixo, layout_livre = detectar_grade_tabela(img), "crianca-ms", "crianca-ms"
        rotulos = ROTULOS[modelo][pagina]
        if len(caixas) != len(rotulos):
            sys.exit(f"{modelo}/{pagina}: detectei {len(caixas)} células, esperava {len(rotulos)}. "
                     "Confira com o comando desenhar e ajuste a detecção.")
        celulas = []
        for i, (caixa, rot) in enumerate(zip(caixas, rotulos), start=1):
            livre = rot["vaccine"] is None
            celulas.append({
                "id": f"{pagina}-{i:02d}",
                "box": caixa,
                "kind": "free" if livre else "fixed",
                "layout": layout_livre if livre else layout_fixo,
                **rot,
            })
        paginas.append({"id": pagina, "reference": arquivo, "size": [img.shape[1], img.shape[0]],
                        "cells": celulas})
        print(f"{modelo}/{pagina}: {len(celulas)} células")
    usados = {c["layout"] for p in paginas for c in p["cells"]}
    dados = {
        "id": modelo,
        "name": info["name"],
        "_comentario": "Gerado por templates_tool.py gerar-cells. box = [x, y, largura, altura] em pixels da "
                       "referência; campos do layout em fração da célula [x0, y0, x1, y1]. doseNumber null = "
                       "dose impressa sem correspondente no catálogo (D34).",
        "layouts": {k: v for k, v in LAYOUTS.items() if k in usados},
        "pages": paginas,
    }
    (pasta / "cells.json").write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


CORES = {"date": (0, 140, 255), "batch": (0, 0, 220), "vaccine": (200, 0, 200)}


def desenhar(modelo, saida: Path, escala=None):
    pasta = PASTA_TEMPLATES / modelo
    dados = json.loads((pasta / "cells.json").read_text(encoding="utf-8"))
    saida.mkdir(parents=True, exist_ok=True)
    for pagina in dados["pages"]:
        img = cv2.imread(str(pasta / pagina["reference"]))
        f = escala or max(1.0, 2000 / max(img.shape[:2]))
        img = cv2.resize(img, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
        for cel in pagina["cells"]:
            x, y, w, h = (int(round(v * f)) for v in cel["box"])
            cor = (0, 160, 0) if cel["kind"] == "fixed" else (200, 120, 0)
            cv2.rectangle(img, (x, y), (x + w, y + h), cor, 2)
            for campo, (a0, b0, a1, b1) in dados["layouts"][cel["layout"]]["campos"].items():
                cv2.rectangle(img, (int(x + a0 * w), int(y + b0 * h)), (int(x + a1 * w), int(y + b1 * h)),
                              CORES[campo], 1)
            texto = [cel["id"]]
            if cel["vaccine"]:
                texto += [ascii_simples(cel["vaccine"])[:22],
                          ascii_simples(f"{cel['doseLabel']} (dose {cel['doseNumber'] or '?'})")]
            else:
                texto.append("livre")
            for k, linha in enumerate(texto):
                pos = (x + 4, y + h - 8 - 16 * (len(texto) - 1 - k))
                cv2.putText(img, linha, pos, cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 3, cv2.LINE_AA)
                cv2.putText(img, linha, pos, cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
        destino = saida / f"{modelo}__{pagina['id']}.png"
        cv2.imwrite(str(destino), img)
        print(f"desenho gravado em {destino}")


def testar(fotos, saida: Path):
    from pipeline import processar  # importa aqui: carrega os modelos só quando necessário

    for foto in fotos:
        dados = Path(foto).read_bytes()
        pasta = saida / Path(foto).stem
        resultado = processar(dados, pasta_depuracao=pasta)
        resumo = {k: v for k, v in resultado.items() if k != "doses"}
        resumo["doses"] = [{k: (v if not isinstance(v, dict) else {kk: vv for kk, vv in v.items() if kk != "crop"})
                            for k, v in d.items() if k != "cellCrop"} for d in resultado["doses"]]
        print(json.dumps(resumo, ensure_ascii=False, indent=2))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("referencia-maceio")
    p.add_argument("foto")
    p.add_argument("--recorte", default="20,0,1565,1100", help="x0,y0,x1,y1 do cartão na foto")
    p = sub.add_parser("gerar-cells")
    p.add_argument("modelo", choices=list(MODELOS) + ["todos"])
    p = sub.add_parser("desenhar")
    p.add_argument("modelo", choices=list(MODELOS) + ["todos"])
    p.add_argument("--saida", default="/saida/templates")
    p = sub.add_parser("testar")
    p.add_argument("fotos", nargs="+")
    p.add_argument("--saida", default="/saida/teste-pipeline")
    a = ap.parse_args()
    modelos = list(MODELOS) if getattr(a, "modelo", None) == "todos" else [getattr(a, "modelo", None)]
    if a.cmd == "referencia-maceio":
        referencia_maceio(Path(a.foto), [int(v) for v in a.recorte.split(",")])
    elif a.cmd == "gerar-cells":
        for m in modelos:
            gerar_cells(m)
    elif a.cmd == "desenhar":
        for m in modelos:
            desenhar(m, Path(a.saida))
    elif a.cmd == "testar":
        testar(a.fotos, Path(a.saida))


if __name__ == "__main__":
    main()
