import { prisma } from '../../../config/prisma';
import { OcrDose, OcrProvider, OcrResult } from '../../../providers/OcrProvider/OcrProvider';
import { normalizeName } from '../../../utils/normalizeName';

const LOTE_REGEX = /^[A-Za-z0-9]{1,20}$/;

interface CatalogVaccine {
  id: string;
  name: string;
  doses: { id: string; doseNumber: number; doseName: string }[];
}

export type OcrFallbackReason = 'MODELO_NAO_RECONHECIDO' | 'NENHUMA_DOSE_ENCONTRADA';

/**
 * Leitura da caderneta física por foto (RF004 / D25 / D34). Encaminha a imagem ao
 * microsserviço de OCR e converte as sugestões para o catálogo (vaccineId e doseId).
 * Não cria registros: o cidadão confere cada dose e salva pelas rotas de cadastro
 * manual (D30), com `origin: "OCR_ICR"`. Serve para o titular e para os dependentes.
 */
export class RecognizeVaccinationCardService {
  constructor(private ocrProvider = new OcrProvider()) {}

  async execute(image: Buffer, mimeType: string, referenceDate = new Date()) {
    const result = await this.ocrProvider.recognize(image, mimeType);
    const catalog = await this.loadCatalog();
    const today = referenceDate.toISOString().slice(0, 10);

    const doses = result.doses.map((dose) => this.toSuggestion(dose, catalog, today));
    const fallbackReason: OcrFallbackReason | null = !result.model
      ? 'MODELO_NAO_RECONHECIDO'
      : doses.length === 0
        ? 'NENHUMA_DOSE_ENCONTRADA'
        : null;

    return {
      model: result.model ? { id: result.model, name: result.modelName } : null,
      manualFallback: fallbackReason !== null,
      fallbackReason,
      alignment: this.alignmentQuality(result),
      cellsChecked: result.cellsChecked,
      doses,
    };
  }

  private async loadCatalog() {
    const vaccines = await prisma.vaccine.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        aliases: true,
        doses: { select: { id: true, doseNumber: true, doseName: true }, orderBy: { doseNumber: 'asc' } },
      },
    });

    // Nome e aliases normalizados como no D15 (sem acentos, minúsculas e espaços extras)
    const byKey = new Map<string, CatalogVaccine>();
    for (const { aliases, ...vaccine } of vaccines) {
      for (const key of [vaccine.name, ...aliases]) {
        byKey.set(normalizeName(key), vaccine);
      }
    }
    return byKey;
  }

  private toSuggestion(dose: OcrDose, catalog: Map<string, CatalogVaccine>, today: string) {
    const vaccine = dose.vaccine.name ? catalog.get(normalizeName(dose.vaccine.name)) ?? null : null;
    // Dose impressa sem correspondente no catálogo (doseNumber null): o cidadão escolhe na revisão (D34)
    const catalogDose =
      vaccine && dose.doseNumber != null
        ? vaccine.doses.find((item) => item.doseNumber === dose.doseNumber) ?? null
        : null;

    // Data futura ou lote fora do formato do cadastro manual: a sugestão vai vazia
    const date = dose.date.value && dose.date.value <= today ? dose.date.value : null;
    const lote = dose.batch.value && LOTE_REGEX.test(dose.batch.value) ? dose.batch.value.toUpperCase() : null;

    // Confiança dos campos que o OCR de fato sugeriu (os da posição no modelo não contam)
    const readConfidences = [
      ...(date ? [dose.date.confidence] : []),
      ...(lote ? [dose.batch.confidence] : []),
      ...(dose.kind === 'free' && vaccine ? [dose.vaccine.confidence] : []),
    ];

    return {
      cellId: dose.cellId,
      kind: dose.kind === 'free' ? 'FREE' : 'FIXED',
      printedLabel: dose.printedLabel,
      vaccine: {
        id: vaccine?.id ?? null,
        name: vaccine?.name ?? null,
        source: dose.vaccine.source === 'template' ? 'TEMPLATE' : 'OCR',
        confidence: vaccine ? dose.vaccine.confidence : 0,
        crop: dose.vaccine.crop,
      },
      dose: {
        id: catalogDose?.id ?? null,
        doseNumber: catalogDose?.doseNumber ?? null,
        name: catalogDose?.doseName ?? null,
        printedLabel: dose.doseLabel,
      },
      applicationDate: { value: date, confidence: dose.date.confidence, crop: dose.date.crop },
      lote: { value: lote, confidence: dose.batch.confidence, crop: dose.batch.crop },
      cellCrop: dose.cellCrop,
      // Menor confiança entre os campos sugeridos (0 se nenhum foi); vai para `ocrConfidence` ao salvar
      ocrConfidence: readConfidences.length ? Math.round(Math.min(...readConfidences) * 1000) / 1000 : 0,
    };
  }

  private alignmentQuality(result: OcrResult) {
    return result.pages
      .filter((page) => !page.rejected)
      .map((page) => ({ page: page.id, quality: page.quality.toUpperCase() as 'BOA' | 'RAZOAVEL' | 'BAIXA' }));
  }
}

