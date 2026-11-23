import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { BOOK_CATEGORIES, BOOK_FORMATS } from '../domain/catalog';

const localizedText = (maxlength: number) =>
  new Schema(
    {
      es: { type: String, required: true, trim: true, maxlength },
      en: { type: String, required: true, trim: true, maxlength },
    },
    { _id: false },
  );

const bookSchema = new Schema(
  {
    title: { type: localizedText(150), required: true },
    author: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: localizedText(600), required: true },
    category: { type: String, enum: BOOK_CATEGORIES, required: true, index: true },
    format: { type: String, enum: BOOK_FORMATS, required: true, index: true },
    isbn: { type: String, trim: true, default: '' },
    price: { type: Number, required: true, min: 0.01 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    coverUrl: { type: String, default: '' },
    downloadUrl: { type: String, default: '' },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type BookAttrs = InferSchemaType<typeof bookSchema>;
export type BookDocument = HydratedDocument<BookAttrs>;
export const BookModel = model('Book', bookSchema);
