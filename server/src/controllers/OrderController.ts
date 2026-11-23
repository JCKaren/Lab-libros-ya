import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth';
import { adminOrderView, customerOrderView } from '../presenters/views';
import type { OrderService } from '../services/OrderService';
import { createOrderSchema, idParamSchema, parse, updateStatusSchema } from '../validators/schemas';

export class OrderController {
  constructor(private readonly orders: OrderService) {}

  create = async (req: Request, res: Response) => {
    const order = await this.orders.create(currentUser(req), parse(createOrderSchema, req.body));
    res.status(201).json({ order: customerOrderView(order) });
  };

  listMine = async (req: Request, res: Response) => {
    const orders = await this.orders.listMine(currentUser(req));
    res.json({ orders: orders.map(customerOrderView) });
  };

  get = async (req: Request, res: Response) => {
    const user = currentUser(req);
    const order = await this.orders.getVisible(user, parse(idParamSchema, req.params).id);
    res.json({ order: user.role === 'administrador' ? adminOrderView(order) : customerOrderView(order) });
  };

  listShipping = async (_req: Request, res: Response) => {
    const orders = await this.orders.listShipping();
    res.json({ orders: orders.map(adminOrderView) });
  };

  changeStatus = async (req: Request, res: Response) => {
    const { id } = parse(idParamSchema, req.params);
    const { status, carrier, trackingNumber } = parse(updateStatusSchema, req.body);
    const order = await this.orders.changeStatus(currentUser(req), id, status, { carrier, trackingNumber });
    res.json({ order: adminOrderView(order) });
  };

  cancel = async (req: Request, res: Response) => {
    const order = await this.orders.cancelUnpaid(currentUser(req), parse(idParamSchema, req.params).id);
    res.json({ order: customerOrderView(order) });
  };
}
