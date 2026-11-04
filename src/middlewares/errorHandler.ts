import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { AppError } from '../errors/AppError';

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Erros operacionais conhecidos da aplicação
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
      ...(error.code && { code: error.code }),
    });
  }

  // Upload de arquivo (multer): tamanho, quantidade ou campo inesperado
  if (error instanceof MulterError) {
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      status: 'error',
      message: tooLarge
        ? 'A imagem excede o tamanho máximo permitido.'
        : 'Envie uma única imagem no campo "image".',
      code: tooLarge ? 'IMAGEM_GRANDE' : 'UPLOAD_INVALIDO',
    });
  }

  // Erros de validação do Zod
  if (error instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Falha na validação dos dados',
      issues: error.format(),
    });
  }

  // Erros conhecidos do Prisma ORM (ex: violação de unicidade)
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || [];
      return res.status(409).json({
        status: 'error',
        message: `Registro duplicado: campo (${target.join(', ')}) já está em uso.`,
      });
    }

    if (error.code === 'P2025') {
      return res.status(404).json({
        status: 'error',
        message: 'Registro não encontrado no banco de dados.',
      });
    }
  }

  // Log detalhado no console para depuração
  console.error('Unhandled Internal Server Error:', error);

  // Erro interno não esperado (500)
  return res.status(500).json({
    status: 'error',
    message: 'Erro interno no servidor.',
  });
}
