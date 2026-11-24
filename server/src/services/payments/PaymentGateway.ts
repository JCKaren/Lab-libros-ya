/**
 * Patrón Strategy: el servicio de pagos depende de esta abstracción y no de PayPal.
 * Agregar otro proveedor (Stripe, Wompi...) = una nueva clase, sin tocar el servicio.
 */
export interface CreateProviderOrderInput {
  referenceId: string;
  amount: number;
  currency: string;
  description: string;
}

/**
 * Resultado de una captura:
 * - COMPLETED: dinero cobrado.
 * - PENDING: el proveedor la tiene en revisión; se concilia más tarde.
 * - FAILED: rechazada o no capturable (definitivo, no hubo cobro).
 */
export type CaptureState = 'COMPLETED' | 'PENDING' | 'FAILED';

export interface CaptureResult {
  state: CaptureState;
  captureId?: string;
  amount?: number;
  currency?: string;
  referenceId?: string;
  rawStatus: string;
}

export interface PaymentGateway {
  readonly name: string;
  createOrder(input: CreateProviderOrderInput): Promise<{ providerOrderId: string }>;
  /** Idempotente: repetir la captura de la misma orden no cobra dos veces. */
  captureOrder(providerOrderId: string): Promise<CaptureResult>;
  /** Consulta el estado actual sin capturar (conciliación de pagos pendientes). */
  getCaptureStatus(providerOrderId: string): Promise<CaptureResult>;
  /** Reembolsa un cobro que no se pudo confirmar. Idempotente por captureId. */
  refund(captureId: string, amount: number, currency: string): Promise<void>;
}

export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    /** true = resultado incierto (red/5xx): el cobro pudo haber ocurrido; hay que conciliar. */
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
