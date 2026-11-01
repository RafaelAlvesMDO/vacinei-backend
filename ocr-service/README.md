# ocr-service — prova de conceito do OCR (RF004, D25)

Teste isolado do OCR da caderneta física: OpenCV no pré-processamento e `pytesseract` em português na leitura. Ainda não conversa com a API nem com o app. Roda só no Docker, então não é preciso instalar Python nem Tesseract no Windows.

## Configuração

Adicione ao `.env` da raiz do backend (o `.env` não vai para o Git). Use pastas **fora do repositório** e barras normais:

```env
OCR_SAMPLES_DIR=C:/Users/<você>/Documents/ocr-fotos
OCR_OUTPUT_DIR=C:/Users/<você>/Documents/ocr-fotos-saida
```

| Variável | Montada em | Uso |
|---|---|---|
| `OCR_SAMPLES_DIR` | `/amostras` (somente leitura) | Fotos (`.jpg`, `.png`, `.webp`, `.bmp`, `.tif`) e `gabarito.txt` |
| `OCR_OUTPUT_DIR` | `/saida` | Relatórios e imagens intermediárias |

Sem as variáveis, o compose usa `ocr-service/amostras` e `ocr-service/saida`, que o `.gitignore` já ignora. **Nunca** versione fotos de cadernetas: elas têm dados pessoais de saúde (LGPD).

## Execução

```bash
docker compose --profile ocr run --rm --build ocr
```

O serviço fica no perfil `ocr`, então `docker compose up` continua subindo só o banco. Para testar outros modos de segmentação:

```bash
docker compose --profile ocr run --rm ocr python poc_ocr.py --entrada /amostras --saida /saida --psm 3,4,6,11
```

## O que o script faz

1. **Pré-processamento:** redimensiona para 1600–2500 px no lado maior. Depois converte para escala de cinza, corrige a inclinação (mediana do ângulo das linhas quase horizontais, via Hough), remove ruído (`fastNlMeansDenoising`) e binariza de dois jeitos (Otsu e adaptativa).
2. **Leitura:** roda 3 imagens (sem ruído, Otsu e adaptativa) × psm 4, 6 e 11, ou seja, 9 variantes. A "melhor" sai de um score que não usa gabarito (confiança média + campos encontrados), como seria em produção. Os acertos de cada variante contra o gabarito também ficam registrados.
3. **Extração:**
   - **Data:** `dd/mm/aa` ou `dd/mm/aaaa`, tolerando confusões como `O`→`0` e `l`→`1`. Datas precedidas de "Fab"/"Val" perdem prioridade.
   - **Lote:** token alfanumérico depois do rótulo "Lote". Se não houver rótulo, usa um token misto de letras e dígitos.
   - **Vacina:** comparação aproximada (rapidfuzz) com `catalogo_vacinas.json`, que é uma cópia dos nomes do seed com siglas como `SCR`, `VIP` e `VRH`. Vacinas conhecidas que não estão no catálogo (ex.: `ACWY`) são identificadas e marcadas como **fora do catálogo**.
4. **Leitura por campo com âncoras** (`ocr_formulario.py`), que é a técnica de OCR de formulários:
   - **Blocos:** detecta os cartões (retângulos claros sobre o fundo escuro) e descarta os vazios. O critério é a densidade de tinta fora dos rótulos e das linhas impressas: abaixo de 2% o bloco é vazio.
   - **Âncoras:** localiza os rótulos impressos (`VACINA`, `FAB`, `LOTE`, `CÓD`, `VACINADOR`) com o Tesseract (psm 11) e ajusta a eles um modelo do cartão. Esse modelo dá a posição relativa de cada rótulo e linha, e estima os rótulos que o Tesseract não achou.
   - **Recorte:** cada campo é a faixa entre a linha do campo anterior e a do próprio campo, na largura total do bloco, porque a escrita costuma subir e invadir o rótulo. A ordem é:
     - vacina: abaixo de `VACINA`;
     - data: faixa seguinte, sem rótulo;
     - fab, lote e cód: nas linhas dos rótulos;
     - vacinador.
   - **Limpeza:** apaga os rótulos, remove as linhas horizontais (morfologia) e descarta a borda do cartão e as pontas de escrita dos campos vizinhos.
   - **Leitura:** amplia 2,5x, binariza (Otsu e adaptativa) e lê com psm 7 e 8. A data usa whitelist `0123456789/` e o lote, maiúsculas e dígitos. Para a vacina, faz o match aproximado com o catálogo.
   - **Saída:** `07_blocos_e_ancoras.png` mostra blocos, rótulos (azul: lido; roxo: estimado) e faixas. Os recortes brutos e limpos de cada campo ficam em `campos/`.
   - **Modelo do cartão:** as posições foram medidas em um único modelo de caderneta. Outro layout exige medir de novo `MODELO_*` em `ocr_formulario.py`.
5. **Relatórios:**
   - `resumo.md`: desempenho por variante e por imagem, com a página inteira e as âncoras lado a lado.
   - `resultados.json`
   - Uma pasta por imagem com:
     - as etapas (`01_original` … `05b_binaria_adaptativa`);
     - `06_caixas_melhor_variante.png` (verde: confiança ≥ 70, laranja: ≥ 40, vermelho: < 40);
     - o texto bruto de cada variante;
     - `relatorio.md`.

## Gabarito (`gabarito.txt` na pasta das fotos)

Os dois formatos abaixo podem coexistir no mesmo arquivo.

**Formato A**: um campo por linha. As linhas antes de qualquer `imagem:` valem para a única foto da pasta. Para várias fotos, abra cada bloco com `imagem:`.

```
imagem: ocr-teste.jpg
vacina: ACWY
data: 31/01/26
lote: 240VM2033NB (incerto; os dois últimos caracteres podem ser N3 ou NB)
```

**Formato B**: uma foto por linha.

```
foto2.jpg | data=05/08/23 | lote=incerto | vacina=SCR
foto3.jpg | data=1?/0?/2022 incerto | lote=FX92 | vacina=Hepatite B
```

Regras:
- **Campos avaliados:** `vacina`, `data` e `lote`. Os demais (`fab`, `cod`, `vacinador` etc.) aparecem no relatório só como informação.
- **Campos incertos:** um campo é incerto se tiver `incerto` (no fim do valor ou na nota entre parênteses) ou `?`. Ele não conta como acerto nem como erro. Só a parte legível é comparada: `?` vale qualquer caractere, e notas como "os dois últimos caracteres…" viram curingas automaticamente (`240VM2033??`).
