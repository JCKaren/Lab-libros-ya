/** Error de dominio con código HTTP y código de máquina estable para el frontend. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = 'No autenticado') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'No tienes permiso para esta acción') {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(resource: string) {
    return new AppError(404, 'NOT_FOUND', `${resource} no encontrado`);
  }
  static conflict(code: string, message: string) {
    return new AppError(409, code, message);
  }
  static badGateway(code: string, message: string) {
    return new AppError(502, code, message);
  }
}
