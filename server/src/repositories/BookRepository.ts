import { isValidObjectId } from 'mongoose';
import type { BookCategory, BookFormat } from '../domain/catalog';
import type { Book } from '../domain/entities';
import { BookModel, type BookDocument } from '../models/Book';

export type BookInput = Omit<Book, 'id'>;

export interface BookFilter {
  category?: BookCategory;
  format?: BookFormat;
  search?: string;
  onlyActive?: boolean;
}

export interface StockLine {
  bookId: string;
  quantity: number;
}

export interface BookRepository {
  list(filter: BookFilter): Promise<Book[]>;
  findById(id: string): Promise<Book | null>;
  findManyByIds(ids: string[]): Promise<Book[]>;
  create(input: BookInput): Promise<Book>;
  update(id: string, input: Partial<BookInput>): Promise<Book | null>;
  delete(id: string): Promise<boolean>;
  /** Descuenta stock solo si alcanza (atómico). Devuelve null si no había suficiente. */
  decrementStock(line: StockLine): Promise<Book | null>;
  incrementStock(line: StockLine): Promise<Book | null>;
}

const toBook = (doc: BookDocument): Book => ({
  id: doc.id,
  title: { es: doc.title.es, en: doc.title.en },
  author: doc.author,
  description: { es: doc.description.es, en: doc.description.en },
  category: doc.category,
  format: doc.format,
  isbn: doc.isbn ?? '',
  price: doc.price,
  stock: doc.stock,
  coverUrl: doc.coverUrl ?? '',
  downloadUrl: doc.downloadUrl ?? '',
  active: doc.active ?? true,
});

/** Escapa la búsqueda del usuario para usarla de forma segura en una expresión regular. */
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class MongoBookRepository implements BookRepository {
  async list(filter: BookFilter) {
    const query: Record<string, unknown> = {};
    if (filter.category) query.category = filter.category;
    if (filter.format) query.format = filter.format;
    if (filter.onlyActive) query.active = true;
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');
      query.$or = [{ 'title.es': rx }, { 'title.en': rx }, { author: rx }, { isbn: rx }];
    }
    const docs = await BookModel.find(query).sort({ 'title.es': 1 }).limit(200);
    return docs.map(toBook);
  }

  async findById(id: string) {
    if (!isValidObjectId(id)) return null;
    const doc = await BookModel.findById(id);
    return doc ? toBook(doc) : null;
  }

  async findManyByIds(ids: string[]) {
    const docs = await BookModel.find({ _id: { $in: ids.filter((id) => isValidObjectId(id)) } });
    return docs.map(toBook);
  }

  async create(input: BookInput) {
    return toBook(await BookModel.create(input));
  }

  async update(id: string, input: Partial<BookInput>) {
    if (!isValidObjectId(id)) return null;
    const doc = await BookModel.findByIdAndUpdate(id, input, { returnDocument: 'after', runValidators: true });
    return doc ? toBook(doc) : null;
  }

  async delete(id: string) {
    if (!isValidObjectId(id)) return false;
    return (await BookModel.deleteOne({ _id: id })).deletedCount === 1;
  }

  async decrementStock({ bookId, quantity }: StockLine) {
    const doc = await BookModel.findOneAndUpdate(
      { _id: bookId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { returnDocument: 'after' },
    );
    return doc ? toBook(doc) : null;
  }

  async incrementStock({ bookId, quantity }: StockLine) {
    const doc = await BookModel.findByIdAndUpdate(bookId, { $inc: { stock: quantity } }, { returnDocument: 'after' });
    return doc ? toBook(doc) : null;
  }
}
