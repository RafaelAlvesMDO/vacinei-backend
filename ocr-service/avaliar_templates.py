"""Avaliação do OCR por modelos de caderneta (D34) com gabarito por imagem.

Para cada foto X.jpg na pasta de entrada, lê o gabarito X.txt (mesmo nome) e mede:
modelo identificado, qualidade do alinhamento, células preenchidas encontradas e o acerto de
vacina, dose, data e lote de cada dose esperada.

Gabarito (X.txt):
    modelo: caderneta-maceio-jovens-adultos      # ou "nenhum" para foto que não deve ser reconhecida
    dose: vacina=ACWY | dose=Reforço | data=31/01/26 | lote=240VM2033NB (incerto; os dois últimos caracteres podem ser N3 ou NB)
    dose: vacina=Influenza | dose=Dose anual | data=12/05/2025 | lote=?
    dose: celula=principal-05 | vacina=HPV | data=10/03/2024     # celula= (opcional) fixa a célula do cells.json

Regras de "incerto" e "?" iguais às do gabarito da PoC (poc_ocr.py).

Uso: python avaliar_templates.py --entrada /amostras --saida /saida/avaliacao
"""

import argparse
import json
import re
from datetime import datetime
from pathlib import Path

from pipeline import processar
from poc_ocr import EXTENSOES, Catalogo, comparar, interpretar_valor
from textos import normalizar, sem_acentos

CATALOGO = Catalogo(Path(__file__).parent / "catalogo_vacinas.json")
CAMPOS = ("vacina", "dose", "data", "lote")
ICONE = {"acerto": "✅", "erro": "❌", "incerto": "⚠️"}


def ler_gabarito(caminho: Path):
    if not caminho.exists():
        return None
    bruto = caminho.read_bytes()
    try:
        texto = bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = bruto.decode("cp1252")
    gab = {"modelo": None, "doses": []}
    for linha in texto.splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or ":" not in linha:
            continue
        chave, valor = linha.split(":", 1)
        chave, valor = sem_acentos(chave).strip().lower(), valor.strip()
        if chave == "modelo":
            gab["modelo"] = None if valor.lower() in ("nenhum", "nenhuma", "-", "") else valor
        elif chave == "dose":
            dose = {}
            for parte in valor.split("|"):
                mm = re.match(r"^\s*([\wÀ-ú]+)\s*[=:]\s*(.*)$", parte)
                if mm:
                    dose[sem_acentos(mm.group(1)).lower()] = interpretar_valor(mm.group(2))
            gab["doses"].append(dose)
    return gab


PALAVRAS_DOSE = [
    (r"\b(1|1A|1O|PRIMEIRA|PRIMEIRO)\b", "1"), (r"\b(2|2A|2O|SEGUNDA|SEGUNDO)\b", "2"),
    (r"\b(3|3A|3O|TERCEIRA|TERCEIRO)\b", "3"), (r"\bREFORCO\b", "R"), (r"\b(UNICA|UMA)\b", "U"),
    (r"\bANUAL\b", "A"), (r"\bNASCER\b", "N"),
]


def chave_dose(texto):
    """Forma comparável do rótulo de dose: "1ª Dose", "Primeira dose" e "1" viram "1"."""
    if not texto:
        return ""
    n = normalizar(texto.replace("ª", "A").replace("º", "O"))
    partes = [k for padrao, k in PALAVRAS_DOSE if re.search(padrao, n)]
    return "".join(sorted(set(partes))) or n


def vacina_canonica(texto):
    if not texto:
        return None
    v = CATALOGO.identificar(texto)
    return v["nome"] if v else texto


def iso_para_br(valor):
    if not valor:
        return None
    a, m, d = valor.split("-")
    return f"{d}/{m}/{a}"


def parear(esperadas, encontradas):
    """Pareia cada dose esperada com a encontrada mais parecida (vacina > dose > data)."""
    livres = list(range(len(encontradas)))
    pares = []
    for i, esp in enumerate(esperadas):
        vac = vacina_canonica(esp.get("vacina", {}).get("valor"))
        dose = chave_dose(esp.get("dose", {}).get("valor"))
        melhor, nota = None, 0
        celula = esp.get("celula", {}).get("valor")
        for j in livres:
            enc = encontradas[j]
            s = 8 if celula and enc["cellId"] == celula else 0
            # Bloco livre sem vacina lida: candidato fraco, usado só se nada melhor aparecer
            if enc["kind"] == "free" and not enc["vaccine"]["name"]:
                s += 2
            if vac and enc["vaccine"]["name"] == vac:
                s += 4
            if dose and chave_dose(enc["doseLabel"]) == dose:
                s += 2
            data_esp = esp.get("data", {}).get("valor")
            if data_esp and enc["date"]["value"] and iso_para_br(enc["date"]["value"]).endswith(data_esp[-2:]):
                s += 1
            if s > nota:
                melhor, nota = j, s
        if melhor is not None and nota >= 2:
            livres.remove(melhor)
        else:
            melhor = None
        pares.append((i, melhor))
    return pares, livres


def avaliar_dose(esp, enc):
    r = {}
    for campo in CAMPOS:
        if campo not in esp:
            continue
        e = esp[campo]
        if enc is None:
            r[campo] = {"status": "incerto" if e["incerto"] else "erro", "esperado": e["valor"], "lido": "—"}
            continue
        if campo == "dose":
            lido = enc["doseLabel"] or ""
            ok = bool(lido) and chave_dose(lido) == chave_dose(e["valor"])
            r[campo] = {"status": "incerto" if e["incerto"] else ("acerto" if ok else "erro"),
                        "esperado": e["valor"], "lido": lido or "—"}
            continue
        if campo == "vacina":
            extraido = {"valor": enc["vaccine"]["name"]} if enc["vaccine"]["name"] else None
        elif campo == "data":
            extraido = {"valor": iso_para_br(enc["date"]["value"])} if enc["date"]["value"] else None
        else:
            extraido = {"valor": enc["batch"]["value"]} if enc["batch"]["value"] else None
        r[campo] = comparar(campo, extraido, e, CATALOGO)
    return r


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--entrada", default="/amostras")
    ap.add_argument("--saida", default="/saida/avaliacao")
    a = ap.parse_args()
    entrada, saida = Path(a.entrada), Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    fotos = sorted(p for p in entrada.iterdir() if p.suffix.lower() in EXTENSOES)
    resultados = []
    for foto in fotos:
        print(f"→ {foto.name}")
        gab = ler_gabarito(foto.with_suffix(".txt"))
        res = processar(foto.read_bytes(), pasta_depuracao=saida / foto.stem)
        item = {"imagem": foto.name, "gabarito": gab is not None, "modelo": res["model"],
                "paginas": res["pages"], "celulas_avaliadas": res["cellsChecked"],
                "celulas_preenchidas": res["cellsFilled"], "tempo_ms": res["timingsMs"].get("total")}
        if gab is not None:
            item["modelo_esperado"] = gab["modelo"]
            item["modelo_ok"] = res["model"] == gab["modelo"]
            pares, sobras = parear(gab["doses"], res["doses"])
            item["doses"] = [{"esperada": {k: v["valor"] for k, v in gab["doses"][i].items()},
                              "celula": res["doses"][j]["cellId"] if j is not None else None,
                              "campos": avaliar_dose(gab["doses"][i], res["doses"][j] if j is not None else None)}
                             for i, j in pares]
            item["celulas_esperadas"] = len(gab["doses"])
            item["celulas_pareadas"] = sum(j is not None for _, j in pares)
            item["falsos_positivos"] = [res["doses"][j]["cellId"] for j in sobras]
        resultados.append(item)
    (saida / "resultados.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8")
    escrever_resumo(saida, resultados)
    print(f"Relatório em {saida / 'resumo.md'}")


def escrever_resumo(saida: Path, resultados):
    L = [f"# Avaliação do OCR por modelos de caderneta (D34)", "",
         f"Gerado em {datetime.now():%d/%m/%Y %H:%M}. Imagens: {len(resultados)}.", ""]
    com_gab = [r for r in resultados if r["gabarito"]]
    if com_gab:
        tot = {c: [0, 0] for c in CAMPOS}
        for r in com_gab:
            for d in r.get("doses", []):
                for c, v in d["campos"].items():
                    if v["status"] != "incerto":
                        tot[c][1] += 1
                        tot[c][0] += v["status"] == "acerto"
        L += ["## Totais", "",
              f"- Modelo identificado corretamente: {sum(r['modelo_ok'] for r in com_gab)}/{len(com_gab)}",
              f"- Células preenchidas encontradas: {sum(r['celulas_pareadas'] for r in com_gab)}/"
              f"{sum(r['celulas_esperadas'] for r in com_gab)} "
              f"(falsos positivos: {sum(len(r['falsos_positivos']) for r in com_gab)})"]
        L += [f"- {c.capitalize()}: {a}/{t}" for c, (a, t) in tot.items()]
        L.append("")
    L += ["## Por imagem", "",
          "| Imagem | Modelo | Esperado | Alinhamento | Preenchidas (esperadas) | Falsos positivos | Tempo |",
          "|---|---|---|---|---|---|---|"]
    for r in resultados:
        alin = ", ".join(f"{p['id']}: {p['quality']} ({p['inliers']} inliers, estrutura {p['structureMatch']})"
                         for p in r["paginas"]) or "—"
        esperado = ("—" if not r["gabarito"] else
                    f"{r['modelo_esperado'] or 'nenhum'} {'✅' if r['modelo_ok'] else '❌'}")
        esperadas = f" ({r['celulas_esperadas']})" if r["gabarito"] else ""
        fp = ", ".join(r.get("falsos_positivos", [])) or "—"
        L.append(f"| {r['imagem']} | {r['modelo'] or 'nenhum'} | {esperado} | {alin} | "
                 f"{r['celulas_preenchidas']}{esperadas} | {fp} | {r['tempo_ms']} ms |")
    for r in com_gab:
        if not r.get("doses"):
            continue
        L += ["", f"### {r['imagem']}", "", "| Dose esperada | Célula | Vacina | Dose | Data | Lote |",
              "|---|---|---|---|---|---|"]
        for d in r["doses"]:
            esp = " · ".join(f"{v}" for v in d["esperada"].values() if v)
            cel = [f"{ICONE[v['status']]} {v.get('lido', '—')}" if c in d["campos"] else "—"
                   for c in CAMPOS for v in [d["campos"].get(c, {})]]
            L.append(f"| {esp} | {d['celula'] or 'não encontrada'} | " + " | ".join(cel) + " |")
    (saida / "resumo.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
