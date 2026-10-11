import { Request, Response, NextFunction } from 'express';
import { ensureAuthenticated } from './ensureAuthenticated';

// Autenticação opcional: sem header segue anônimo; com header, o token precisa ser válido
export function optionalAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.headers.authorization) {
    return next();
  }

  return ensureAuthenticated(req, res, next);
}
