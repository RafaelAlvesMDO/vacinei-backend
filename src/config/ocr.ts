// Microsserviço de OCR da caderneta (D25 / D34)
export const ocrConfig = {
  serviceUrl: (process.env.OCR_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  timeoutMs: Number(process.env.OCR_TIMEOUT_MS) || 20000,
  maxImageBytes: (Number(process.env.OCR_MAX_IMAGE_MB) || 8) * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png'],
};
