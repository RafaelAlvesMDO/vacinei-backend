# ocr-service — OCR da caderneta física (RF004, D25, D34)

Microsserviço Python (FastAPI + OpenCV + `pytesseract` em português) que lê a foto de uma caderneta e sugere as doses. Só o backend chama o serviço; o app nunca fala com ele diretamente. Roda só no Docker, então não é preciso instalar Python nem Tesseract no Windows.

**LGPD:** o serviço HTTP processa a imagem em memória e não grava nada em disco nem em log (só métricas: modelo, células e tempo). **Nunca** versione fotos de cadernetas preenchidas; o repositório guarda só as referências **em branco** dos modelos.

## Como funciona (D34)

O sistema reconhece um conjunto fechado de **modelos de caderneta**. Foto de outro modelo, ou leitura sem confiança, cai no cadastro manual (RNF12).

1. **Identificação:** pontos SIFT da foto × referência de cada página de cada modelo, com teste de razão de Lowe e homografia por RANSAC. A página precisa de pelo menos `OCR_MIN_INLIERS` correspondências (padrão 40). Páginas do mesmo modelo que se sobrepõem na foto são descartadas, porque as tabelas da Caderneta da Criança têm a mesma grade e os mesmos rótulos.
2. **Alinhamento:** a foto é retificada sobre a referência numa tela de 2400 px no lado maior. Depois do alinhamento, mede-se quanto das bordas impressas da referência reaparece na foto (`structureMatch`). Abaixo de 0,30 a página é rejeitada. A qualidade (`boa`, `razoavel`, `baixa`) combina inliers, `structureMatch` e erro de reprojeção.
3. **Células:** cada célula do `cells.json` é reajustada localmente (±6%) por correlação com a referência, porque a dobra da caderneta deixa erros de alguns pixels. A tinta à mão é o que fica escuro na foto e fora da impressão da referência (dilatada para tolerar o alinhamento). Manchas amareladas pouco escuras são ignoradas. Com densidade de tinta abaixo de `OCR_CELL_INK` (0,6%), a célula é vazia.
4. **Leitura:** só nas células preenchidas.
   - **Vacina e dose impressas:** vêm da posição da célula.
   - **Data e lote:** o OCR lê cada faixa do layout. A data usa whitelist de dígitos; o lote, maiúsculas e dígitos.
   - **Blocos livres:** a vacina manuscrita é lida com o método da rodada 2 da PoC (`leitura_ancoras.py`, que reaproveita `ocr_formulario.py`). As âncoras vêm dos rótulos impressos; a faixa VACINA é limpa de rótulos e linhas, binarizada (Otsu e adaptativa) e lida com psm 7 e 8. O texto é comparado de forma aproximada com `catalogo_vacinas.json` (nomes e aliases do seed). Como o Tesseract é sensível à escala, o bloco é testado em algumas alturas (`OCR_VACCINE_BLOCK_HEIGHTS`, padrão 600, 700, 500 e 800 px) e a leitura para no primeiro match exato. A confiança da vacina é a do match com o catálogo: 1,0 exato, 0,9 com uma letra trocada.
   - **Lote no modelo de Maceió:** a faixa começa acima da linha do FAB, porque na prática o lote é escrito sobre ela. A data de fabricação escrita no FAB pode entrar no recorte.
   - **Confiança:** abaixo de `OCR_MIN_CONFIDENCE` (0,45), o valor vai `null`. O recorte da foto vai sempre junto, para o cidadão conferir.

> **Limitação conhecida:** o Tesseract não reconhece dígitos manuscritos (medido na PoC e de novo na etapa 8). Na prática, hoje o serviço identifica o modelo e encontra as células preenchidas, mas devolve data e lote vazios com o recorte. Letras de forma, como a sigla da vacina, às vezes são lidas: na foto do cartão de Maceió, "ACWY" casou só nas alturas de 600 e 700 px, ou seja, é um acerto frágil. A troca do motor de leitura (ex.: TrOCR) é melhoria futura e não muda o contrato.

## Modelos (`templates/<modelo>/`)

| Modelo | Páginas | Células |
|---|---|---|
| `caderneta-crianca-ms` | `ate-12-meses`, `a-partir-12-meses` (tabelas de vacinas da Caderneta da Criança, MS) | 19 + 13, todas com vacina/dose impressas |
| `caderneta-maceio-jovens-adultos` | `principal` (cartão aberto, as duas páginas) | 16 impressas + 16 livres (`VACINA:` manuscrita) |

Cada pasta tem as referências (`reference*.png`) e o `cells.json`:
- **`box`:** `[x, y, largura, altura]` em pixels da referência.
- **`kind`:** `fixed` (vacina e dose impressas) ou `free` (bloco livre).
- **`layout`:** nome do layout, cujos `campos` são faixas em fração da célula `[x0, y0, x1, y1]`.
- **`vaccine`:** nome exato do catálogo (ou `null` no bloco livre).
- **`doseNumber`:** dose do catálogo. Fica `null` quando a dose impressa não existe no catálogo; o cidadão escolhe na revisão.
- **`doseLabel` / `printed`:** o que está impresso na caderneta.

### Mapeamentos especiais (D34)
- **Febre Amarela "Dose única" / "Dose":** → 1ª Dose. "Dose de reforço" → Reforço.
- **VOP 1º/2º Reforço:** → doses 4 e 5 da Poliomielite Inativada (VIP).
- **Hepatite B 1ª/2ª/3ª (adulto) e HPV 2ª dose:** `doseNumber: null`. Esquemas por faixa etária são melhoria futura.

### Ferramentas (`templates_tool.py`)

```bash
# Desenha o cells.json sobre as referências (rótulos de vacina/dose e faixas dos campos) em OCR_OUTPUT_DIR/templates
docker compose --profile ocr run --rm ocr python templates_tool.py desenhar todos --saida /saida/templates

# Detecta a grade (blocos claros no modelo de Maceió, linhas da tabela no da Criança) e regrava o cells.json
docker compose --profile ocr run --rm ocr python templates_tool.py gerar-cells todos

# Roda o pipeline numa foto e grava as imagens de depuração (alinhamento, recortes, máscaras de tinta)
docker compose --profile ocr run --rm ocr python templates_tool.py testar /amostras/foto.jpg --saida /saida/teste
```

A referência de Maceió foi gerada da foto do cartão com `templates_tool.py referencia-maceio`. O comando apaga os blocos preenchidos (detectados pela tinta de caneta azul), pinta cada um com a cor do bloco e copia por cima o conteúdo impresso de um bloco vazio vizinho. Pontas de escrita fora da borda saem por *inpaint*. A foto original não vai para o repositório.

`gerar-cells` usa os rótulos de `ROTULOS` no script, em ordem de leitura, e para com erro se a quantidade de células detectadas não bater com a esperada.

**Novo modelo:**
1. Coloque a referência limpa em `templates/<modelo>/`.
2. Acrescente o modelo em `MODELOS` e os rótulos em `ROTULOS` no `templates_tool.py`.
3. Rode `gerar-cells` e confira o resultado com `desenhar`.

## Serviço HTTP

Sobe com o banco: `docker compose up -d` (serviço `ocr-api`, porta 8000).

- **`GET /health`:** situação do serviço e modelos carregados.
- **`POST /ocr`:** multipart com o campo `image` (JPEG/PNG, até `OCR_MAX_IMAGE_MB`, padrão 8 MB). Erros: `415` (tipo), `413` (tamanho) e `422` (imagem que não abre).

Resposta (os recortes são `data:image/png;base64,...` em escala de cinza):

```json
{
  "model": "caderneta-maceio-jovens-adultos",
  "modelName": "Caderneta de Vacinação de Jovens e Adultos (Prefeitura de Maceió)",
  "pages": [{ "id": "principal", "inliers": 2494, "inlierRatio": 0.871, "reprojectionError": 0.17,
              "structureMatch": 0.978, "coverage": 1.0, "quality": "boa" }],
  "candidates": [{ "model": "...", "page": "...", "matches": 2865, "inliers": 2494 }],
  "cellsChecked": 32,
  "cellsFilled": 1,
  "doses": [{
    "cellId": "principal-05", "page": "principal", "kind": "free", "printedLabel": "Bloco livre",
    "vaccine": { "name": null, "source": "ocr", "confidence": 0.0, "crop": "data:image/png;base64,..." },
    "doseNumber": null, "doseLabel": null,
    "date":  { "value": null, "confidence": 0.0, "crop": "data:image/png;base64,..." },
    "batch": { "value": null, "confidence": 0.0, "crop": "data:image/png;base64,..." },
    "cellCrop": "data:image/png;base64,...",
    "inkDensity": 0.0834
  }],
  "timingsMs": { "identificacao": 1199, "alinhamento_principal": 41, "celulas": 967, "total": 2208 }
}
```

Sem modelo reconhecido: `model: null` e `doses: []`. A data sai em ISO (`AAAA-MM-DD`).

| Variável | Padrão | Uso |
|---|---|---|
| `OCR_MAX_IMAGE_MB` | 8 | Tamanho máximo da imagem |
| `OCR_MIN_INLIERS` | 40 | Correspondências mínimas para reconhecer uma página |
| `OCR_MIN_STRUCTURE` | 0.30 | Fração mínima da impressão reencontrada após o alinhamento |
| `OCR_CELL_INK` | 0.006 | Densidade de tinta mínima para a célula estar preenchida |
| `OCR_INK_DARKNESS` | 0.28 | Escuridão mínima de um pixel de tinta à mão |
| `OCR_MIN_CONFIDENCE` | 0.45 | Confiança mínima para sugerir um valor |
| `OCR_CANVAS_SIDE` | 2400 | Lado maior da tela de alinhamento |
| `OCR_VACCINE_BLOCK_HEIGHTS` | 600,700,500,800 | Alturas do bloco livre testadas na leitura da vacina |
| `OCR_WORKERS` | 4 | Células lidas em paralelo |

## Testes com fotos reais

Adicione ao `.env` da raiz do backend (o `.env` não vai para o Git). Use pastas **fora do repositório** e barras normais:

```env
OCR_SAMPLES_DIR=C:/Users/<você>/Documents/ocr-fotos
OCR_OUTPUT_DIR=C:/Users/<você>/Documents/ocr-fotos-saida
```

| Variável | Montada em | Uso |
|---|---|---|
| `OCR_SAMPLES_DIR` | `/amostras` (somente leitura) | Fotos (`.jpg`, `.png`, `.webp`, `.bmp`, `.tif`) e gabaritos |
| `OCR_OUTPUT_DIR` | `/saida` | Relatórios e imagens intermediárias |

Sem as variáveis, o compose usa `ocr-service/amostras` e `ocr-service/saida`, que o `.gitignore` já ignora.

### Avaliação por modelos (`avaliar_templates.py`)

```bash
docker compose --profile ocr run --rm --build ocr python avaliar_templates.py --entrada /amostras --saida /saida/avaliacao
```

Para cada foto `X.jpg`, lê o gabarito `X.txt` (mesmo nome, na mesma pasta), com várias doses por imagem:

```
modelo: caderneta-maceio-jovens-adultos
dose: vacina=ACWY | dose=Reforço | data=31/01/26 | lote=240VM2033NB (incerto; os dois últimos caracteres podem ser N3 ou NB)
dose: vacina=Influenza | dose=Dose anual | data=12/05/2025 | lote=?
```

- **`modelo: nenhum`:** para fotos que não devem ser reconhecidas.
- **`celula=principal-05`:** opcional, fixa a célula do `cells.json`. Sem ela, a dose esperada é pareada com a encontrada de mesma vacina e dose; um bloco livre sem vacina lida serve como último recurso.
- **Campos avaliados:** `vacina`, `dose`, `data` e `lote`, com as mesmas regras de `incerto` e `?` do gabarito da PoC (abaixo).

**O relatório** (`resumo.md` e `resultados.json`) traz por imagem:
- o modelo identificado × o esperado;
- a qualidade do alinhamento de cada página;
- as células preenchidas encontradas × esperadas e os falsos positivos;
- o acerto de cada campo de cada dose.

As imagens de depuração ficam numa pasta por foto.

### PoC da página inteira e das âncoras (`poc_ocr.py`)

A primeira prova de conceito, antes dos modelos, continua disponível:

```bash
docker compose --profile ocr run --rm --build ocr
docker compose --profile ocr run --rm ocr python poc_ocr.py --entrada /amostras --saida /saida --psm 3,4,6,11
```

1. **Pré-processamento:** redimensiona para 1600–2500 px, converte para cinza, corrige a inclinação (Hough), remove ruído e binariza com Otsu e adaptativa.
2. **Leitura:** 3 imagens × psm 4, 6 e 11. A melhor variante sai de um score sem gabarito.
3. **Extração:** data (`dd/mm/aa[aa]`, tolerando `O`→`0`, `l`→`1`), lote (depois do rótulo "Lote" ou token misto) e vacina (match aproximado com o catálogo).
4. **Âncoras (`ocr_formulario.py`):** detecta os blocos do cartão, localiza os rótulos impressos com o Tesseract e lê cada faixa isolada.
5. **Relatórios:** `resumo.md`, `resultados.json` e uma pasta por imagem.

**Gabarito da PoC** (`gabarito.txt` na pasta das fotos):

```
imagem: ocr-teste.jpg
vacina: ACWY
data: 31/01/26
lote: 240VM2033NB (incerto; os dois últimos caracteres podem ser N3 ou NB)

foto2.jpg | data=05/08/23 | lote=incerto | vacina=SCR
```

- **Campos incertos:** um campo é incerto se tiver `incerto` (no fim do valor ou na nota entre parênteses) ou `?`. Não conta como acerto nem como erro.
- **Parte legível:** só ela é comparada. `?` vale qualquer caractere, e notas como "os dois últimos caracteres…" viram curingas (`240VM2033??`).
