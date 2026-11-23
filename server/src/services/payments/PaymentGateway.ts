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

export interface CaptureResult {
  completed: boolean;
  captureId?: string;
  amount?: number;
  currency?: string;
  referenceId?: string;
  rawStatus: string;
}

export interface PaymentGateway {
  readonly name: string;
  createOrder(input: CreateProviderOrderInput): Promise<{ providerOrderId: string }>;
  captureOrder(providerOrderId: string): Promise<CaptureResult>;
}

export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}
