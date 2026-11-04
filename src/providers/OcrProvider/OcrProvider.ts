import { ocrConfig } from '../../config/ocr';
import { AppError } from '../../errors/AppError';

export interface OcrField<T = string> {
  value: T | null;
  confidence: number;
  crop: string | null;
}

export interface OcrDose {
  cellId: string;
  page: string;
  kind: 'fixed' | 'free';
  printedLabel: string;
  vaccine: { name: string | null; source: 'template' | 'ocr'; confidence: number; crop: string | null };
  doseNumber: number | null;
  doseLabel: string | null;
  date: OcrField;
  batch: OcrField;
  cellCrop: string | null;
  inkDensity: number;
}

export interface OcrPage {
  id: string;
  inliers: number;
  quality: 'boa' | 'razoavel' | 'baixa';
  structureMatch: number;
  rejected?: string;
}

export interface OcrResult {
  model: string | null;
  modelName: string | null;
  pages: OcrPage[];
  cellsChecked: number;
  cellsFilled: number;
  doses: OcrDose[];
}

/**
 * Cliente do microsserviço de OCR (D25). A imagem vai só em memória: não é gravada
 * em disco nem em log (LGPD). Qualquer falha vira um erro com `code`, para o app
 * oferecer o cadastro manual (RNF12).
 */
export class OcrProvider {
  async recognize(image: Buffer, mimeType: string): Promise<OcrResult> {
    const form = new FormData();
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    form.append('image', new Blob([new Uint8Array(image)], { type: mimeType }), `caderneta.${extension}`);

    let response: Response;
    try {
      response = await fetch(`${ocrConfig.serviceUrl}/ocr`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(ocrConfig.timeoutMs),
      });
    } catch (error) {
      const name = (error as Error).name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AppError('A leitura da caderneta demorou demais. Cadastre as doses manualmente.', 504, 'OCR_TIMEOUT');
      }
      console.error('OCR indisponível:', (error as Error).message);
      throw new AppError('Leitura automática indisponível no momento. Cadastre as doses manualmente.', 503, 'OCR_INDISPONIVEL');
    }

    if (response.status === 422 || response.status === 415) {
      throw new AppError('Não foi possível abrir a imagem enviada.', 422, 'IMAGEM_INVALIDA');
    }
    if (response.status === 413) {
      throw new AppError('A imagem excede o tamanho máximo permitido.', 413, 'IMAGEM_GRANDE');
    }
    if (!response.ok) {
      console.error(`OCR respondeu ${response.status}`);
      throw new AppError('Leitura automática indisponível no momento. Cadastre as doses manualmente.', 502, 'OCR_ERRO');
    }

    return (await response.json()) as OcrResult;
  }
}
