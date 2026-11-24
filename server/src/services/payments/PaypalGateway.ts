import { formatAmount } from '../../utils/money';
import { logger } from '../../utils/logger';
import { PaymentGatewayError, type CaptureResult, type CreateProviderOrderInput, type PaymentGateway } from './PaymentGateway';

interface PaypalCapture {
  id: string;
  status: string;
  amount?: { value: string; currency_code: string };
}

interface PaypalOrder {
  id: string;
  status: string;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    payments?: { captures?: PaypalCapture[] };
  }>;
}

/** Cliente de PayPal Orders API v2. Las credenciales solo viven en el backend. */
export class PaypalGateway implements PaymentGateway {
  readonly name = 'paypal';
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly apiBase: string,
  ) {}

  async createOrder(input: CreateProviderOrderInput) {
    const order = await this.request<PaypalOrder>('/v2/checkout/orders', {
      method: 'POST',
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.referenceId,
            custom_id: input.referenceId,
            description: input.description.slice(0, 127),
            amount: { currency_code: input.currency, value: formatAmount(input.amount) },
          },
        ],
      },
    });
    return { providerOrderId: order.id };
  }

  async captureOrder(providerOrderId: string): Promise<CaptureResult> {
    const id = encodeURIComponent(providerOrderId);
    try {
      const order = await this.request<PaypalOrder>(`/v2/checkout/orders/${id}/capture`, {
        method: 'POST',
        body: {},
        // Idempotencia del lado de PayPal: repetir la misma captura no cobra dos veces.
        requestId: `capture-${providerOrderId}`,
      });
      return this.toCaptureResult(order);
    } catch (err) {
      if (err instanceof PaypalApiError && err.issue === 'ORDER_ALREADY_CAPTURED') {
        return this.getCaptureStatus(providerOrderId);
      }
      // 4xx de PayPal (no aprobada, tarjeta rechazada...): definitivo, no hubo cobro.
      if (err instanceof PaypalApiError && err.status >= 400 && err.status < 500) {
        return { state: 'FAILED', rawStatus: err.issue };
      }
      throw err;
    }
  }

  async getCaptureStatus(providerOrderId: string): Promise<CaptureResult> {
    const id = encodeURIComponent(providerOrderId);
    return this.toCaptureResult(await this.request<PaypalOrder>(`/v2/checkout/orders/${id}`, { method: 'GET' }));
  }

  async refund(captureId: string, amount: number, currency: string): Promise<void> {
    const id = encodeURIComponent(captureId);
    await this.request(`/v2/payments/captures/${id}/refund`, {
      method: 'POST',
      body: { amount: { value: formatAmount(amount), currency_code: currency } },
      requestId: `refund-${captureId}`,
    });
  }

  private toCaptureResult(order: PaypalOrder): CaptureResult {
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    let state: CaptureResult['state'] = 'FAILED';
    if (capture?.status === 'COMPLETED' && order.status === 'COMPLETED') state = 'COMPLETED';
    else if (capture?.status === 'PENDING') state = 'PENDING';
    return {
      state,
      captureId: capture?.id,
      amount: capture?.amount ? Number(capture.amount.value) : undefined,
      currency: capture?.amount?.currency_code,
      referenceId: unit?.custom_id ?? unit?.reference_id,
      rawStatus: capture?.status ?? order.status,
    };
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.error(`PayPal OAuth falló con estado ${res.status}`);
      throw new PaymentGatewayError('No se pudo autenticar con PayPal', res.status >= 500);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }

  private async request<T>(path: string, options: { method: 'GET' | 'POST'; body?: unknown; requestId?: string }): Promise<T> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (options.requestId) headers['PayPal-Request-Id'] = options.requestId;

    let res: Response;
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method: options.method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new PaymentGatewayError('No se pudo contactar a PayPal', true);
    }

    const data = (await res.json().catch(() => ({}))) as T & { name?: string; details?: Array<{ issue?: string }> };
    if (!res.ok) {
      const issue = data.details?.[0]?.issue ?? data.name ?? 'UNKNOWN';
      logger.warn(`PayPal ${options.method} ${path.split('/').slice(0, 4).join('/')} -> ${res.status} ${issue}`);
      throw new PaypalApiError(issue, res.status);
    }
    return data;
  }
}

export class PaypalApiError extends PaymentGatewayError {
  constructor(
    public readonly issue: string,
    public readonly status: number,
  ) {
    super(`PayPal respondió ${issue}`, status >= 500);
  }
}
