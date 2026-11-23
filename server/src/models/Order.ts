import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { BOOK_FORMATS } from '../domain/catalog';
import { ORDER_PAYMENT_STATUSES, ORDER_STATUSES } from '../domain/orderStatus';

const orderItemSchema = new Schema(
  {
    book: { type: Types.ObjectId, ref: 'Book', required: true },
    // Snapshot: el pedido conserva título y precio aunque el libro cambie después.
    title: {
      es: { type: String, required: true },
      en: { type: String, required: true },
    },
    author: { type: String, required: true },
    format: { type: String, enum: BOOK_FORMATS, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
    downloadUrl: { type: String },
  },
  { _id: false },
);

const shippingAddressSchema = new Schema(
  {
    recipient: { type: String, required: true, trim: true, maxlength: 100 },
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
  },
  { _id: false },
);

const shipmentSchema = new Schema(
  {
    carrier: { type: String, trim: true, maxlength: 60 },
    trackingNumber: { type: String, trim: true, maxlength: 60 },
    shippedAt: { type: Date },
    deliveredAt: { type: Date },
  },
  { _id: false },
);

const statusChangeSchema = new Schema(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, required: true, default: Date.now },
    by: { type: Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, required: true },
    items: { type: [orderItemSchema], required: true },
    requiresShipping: { type: Boolean, required: true },
    shippingAddress: { type: shippingAddressSchema },
    shipment: { type: shipmentSchema, default: {} },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'PENDING_PAYMENT', index: true },
    paymentStatus: { type: String, enum: ORDER_PAYMENT_STATUSES, required: true, default: 'UNPAID' },
    paidAt: { type: Date },
    history: { type: [statusChangeSchema], default: [] },
  },
  { timestamps: true },
);

orderSchema.index({ requiresShipping: 1, status: 1, updatedAt: -1 });

export type OrderAttrs = InferSchemaType<typeof orderSchema>;
export type OrderDocument = HydratedDocument<OrderAttrs>;
export const OrderModel = model('Order', orderSchema);
