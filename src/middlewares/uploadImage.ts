import multer from 'multer';
import { ocrConfig } from '../config/ocr';
import { AppError } from '../errors/AppError';

/**
 * Upload de uma única imagem (campo "image") só em memória: o arquivo nunca vai
 * para o disco e é descartado ao fim da requisição (LGPD, D34).
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ocrConfig.maxImageBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ocrConfig.allowedMimeTypes.includes(file.mimetype)) {
      return callback(new AppError('Envie uma imagem JPEG ou PNG.', 415, 'FORMATO_INVALIDO'));
    }
    return callback(null, true);
  },
}).single('image');
