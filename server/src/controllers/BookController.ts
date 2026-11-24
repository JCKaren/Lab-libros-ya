import type { Request, Response } from 'express';
import { publicBookView } from '../presenters/views';
import type { BookService } from '../services/BookService';
import { bookQuerySchema, bookSchema, bookUpdateSchema, idParamSchema, parse, stockAdjustSchema } from '../validators/schemas';

export class BookController {
  constructor(private readonly books: BookService) {}

  /** Público. Con `?all=true` y sesión de administrador incluye libros inactivos y enlaces de descarga. */
  list = async (req: Request, res: Response) => {
    const query = parse(bookQuerySchema, req.query);
    const admin = this.isAdmin(req);
    const books = await this.books.list({
      category: query.category,
      format: query.format,
      search: query.q,
      includeInactive: admin && query.all === 'true',
    });
    res.json({ books: admin ? books : books.map(publicBookView) });
  };

  get = async (req: Request, res: Response) => {
    const admin = this.isAdmin(req);
    const book = await this.books.get(parse(idParamSchema, req.params).id, { includeInactive: admin });
    res.json({ book: admin ? book : publicBookView(book) });
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json({ book: await this.books.create(parse(bookSchema, req.body)) });
  };

  update = async (req: Request, res: Response) => {
    const { id } = parse(idParamSchema, req.params);
    res.json({ book: await this.books.update(id, parse(bookUpdateSchema, req.body)) });
  };

  adjustStock = async (req: Request, res: Response) => {
    const { id } = parse(idParamSchema, req.params);
    const { delta } = parse(stockAdjustSchema, req.body);
    res.json({ book: await this.books.adjustStock(id, delta) });
  };

  remove = async (req: Request, res: Response) => {
    await this.books.remove(parse(idParamSchema, req.params).id);
    res.status(204).end();
  };

  /** `req.auth` lo llena `optionalAuth` con una sesión ya validada contra la base de datos. */
  private isAdmin(req: Request): boolean {
    return req.auth?.role === 'administrador';
  }
}
