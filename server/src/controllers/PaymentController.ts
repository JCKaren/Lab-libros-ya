import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth';
import { customerOrderView } from '../presenters/views';
import type { PaymentService } from '../services/payments/PaymentService';
import { capturePaymentSchema, createPaymentSchema, parse } from '../validators/schemas';

export class PaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly currency: string,
  ) {}

  config = (_req: Request, res: Response) => {
    res.json(this.payments.getPublicConfig(this.currency));
  };

  createOrder = async (req: Request, res: Response) => {
    const { orderId } = parse(createPaymentSchema, req.body);
    res.status(201).json(await this.payments.createProviderOrder(currentUser(req), orderId));
  };

  capture = async (req: Request, res: Response) => {
    const { orderId, providerOrderId } = parse(capturePaymentSchema, req.body);
    const order = await this.payments.capture(currentUser(req), orderId, providerOrderId);
    res.json({ order: customerOrderView(order) });
  };
}
