export class AppError extends Error {
  public readonly message: string;
  public readonly statusCode: number;
  // Código estável para o cliente tratar o erro sem depender do texto (ex.: OCR_TIMEOUT)
  public readonly code?: string;

  constructor(message: string, statusCode = 400, code?: string) {
    super(message);
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
