import { connectDatabase, disconnectDatabase } from '../config/db';
import { BookModel } from '../models/Book';
import { UserModel } from '../models/User';
import type { BookInput } from '../repositories/BookRepository';
import { BcryptPasswordHasher } from '../services/PasswordHasher';
import { logger } from '../utils/logger';

/** Portadas de Open Library por ISBN; si no existen, el frontend dibuja una portada ilustrada. */
const cover = (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;

type SeedBook = Omit<BookInput, 'coverUrl' | 'active' | 'downloadUrl'> & { downloadUrl?: string };

const BOOKS: SeedBook[] = [
  {
    title: { es: 'Cien años de soledad', en: 'One Hundred Years of Solitude' },
    author: 'Gabriel García Márquez',
    description: {
      es: 'La saga de los Buendía en Macondo, obra cumbre del realismo mágico.',
      en: 'The saga of the Buendía family in Macondo, a masterpiece of magical realism.',
    },
    category: 'ficcion', format: 'ebook', isbn: '9780307474728', price: 9.99, stock: 120,
  },
  {
    title: { es: 'El amor en los tiempos del cólera', en: 'Love in the Time of Cholera' },
    author: 'Gabriel García Márquez',
    description: {
      es: 'Un amor que espera más de cincuenta años en una ciudad del Caribe.',
      en: 'A love that waits more than fifty years in a Caribbean city.',
    },
    category: 'ficcion', format: 'impreso', isbn: '9780307387264', price: 18.5, stock: 14,
  },
  {
    title: { es: '1984', en: '1984' },
    author: 'George Orwell',
    description: {
      es: 'La distopía clásica sobre la vigilancia y el control de la verdad.',
      en: 'The classic dystopia about surveillance and the control of truth.',
    },
    category: 'ficcion', format: 'ebook', isbn: '9780451524935', price: 7.99, stock: 200,
  },
  {
    title: { es: 'Orgullo y prejuicio', en: 'Pride and Prejudice' },
    author: 'Jane Austen',
    description: {
      es: 'Elizabeth Bennet y el señor Darcy en la Inglaterra del siglo XIX. Dominio público.',
      en: 'Elizabeth Bennet and Mr. Darcy in 19th-century England. Public domain.',
    },
    category: 'ficcion', format: 'ebook', isbn: '9780141439518', price: 2.99, stock: 500,
    downloadUrl: 'https://www.gutenberg.org/ebooks/1342',
  },
  {
    title: { es: 'Sapiens: de animales a dioses', en: 'Sapiens: A Brief History of Humankind' },
    author: 'Yuval Noah Harari',
    description: {
      es: 'Una breve historia de la humanidad, de la revolución cognitiva a la actualidad.',
      en: 'A brief history of humankind, from the cognitive revolution to today.',
    },
    category: 'no_ficcion', format: 'impreso', isbn: '9780062316097', price: 22, stock: 9,
  },
  {
    title: { es: 'Hábitos atómicos', en: 'Atomic Habits' },
    author: 'James Clear',
    description: {
      es: 'Cambios pequeños, resultados extraordinarios: cómo construir buenos hábitos.',
      en: 'Tiny changes, remarkable results: how to build good habits.',
    },
    category: 'no_ficcion', format: 'ebook', isbn: '9780735211292', price: 13.99, stock: 80,
  },
  {
    title: { es: 'Breve historia del tiempo', en: 'A Brief History of Time' },
    author: 'Stephen Hawking',
    description: {
      es: 'Del big bang a los agujeros negros, explicado para todos.',
      en: 'From the big bang to black holes, explained for everyone.',
    },
    category: 'ciencia', format: 'ebook', isbn: '9780553380163', price: 11.5, stock: 60,
  },
  {
    title: { es: 'Cosmos', en: 'Cosmos' },
    author: 'Carl Sagan',
    description: {
      es: 'Un viaje por el universo y el lugar de la humanidad en él.',
      en: 'A journey through the universe and humanity’s place in it.',
    },
    category: 'ciencia', format: 'impreso', isbn: '9780345539434', price: 19.9, stock: 2,
  },
  {
    title: { es: 'Código limpio', en: 'Clean Code' },
    author: 'Robert C. Martin',
    description: {
      es: 'Manual de buenas prácticas para escribir software legible y mantenible.',
      en: 'A handbook of agile software craftsmanship.',
    },
    category: 'tecnologia', format: 'ebook', isbn: '9780132350884', price: 29.99, stock: 75,
  },
  {
    title: { es: 'Patrones de diseño', en: 'Design Patterns' },
    author: 'Gamma, Helm, Johnson, Vlissides',
    description: {
      es: 'Los 23 patrones clásicos de diseño orientado a objetos.',
      en: 'The 23 classic patterns of reusable object-oriented software.',
    },
    category: 'tecnologia', format: 'impreso', isbn: '9780201633610', price: 45, stock: 6,
  },
  {
    title: { es: 'El principito', en: 'The Little Prince' },
    author: 'Antoine de Saint-Exupéry',
    description: {
      es: 'Un piloto, un pequeño príncipe y lo esencial que es invisible a los ojos.',
      en: 'A pilot, a little prince and what is essential being invisible to the eye.',
    },
    category: 'infantil', format: 'impreso', isbn: '9780156012195', price: 12, stock: 25,
  },
  {
    title: { es: 'Harry Potter y la piedra filosofal', en: "Harry Potter and the Philosopher's Stone" },
    author: 'J. K. Rowling',
    description: {
      es: 'Un niño descubre que es mago en su primer año en Hogwarts.',
      en: 'A boy discovers he is a wizard in his first year at Hogwarts.',
    },
    category: 'infantil', format: 'impreso', isbn: '9788478884452', price: 16, stock: 0,
  },
];

/** Cuentas ficticias de prueba (no usar datos personales reales). */
const USERS = [
  { name: 'Admin Libros Ya', email: 'admin@librosya.com', role: 'administrador' as const, password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!' },
  { name: 'Cliente Demo', email: 'cliente@librosya.com', role: 'cliente' as const, password: process.env.SEED_CLIENT_PASSWORD ?? 'Cliente123!' },
];

async function seed(): Promise<void> {
  await connectDatabase();
  const hasher = new BcryptPasswordHasher();

  for (const { downloadUrl, stock, ...book } of BOOKS) {
    // Upsert por ISBN; en libros ya existentes no se pisa el stock que haya gestionado el administrador.
    await BookModel.updateOne(
      { isbn: book.isbn },
      {
        $set: { ...book, coverUrl: cover(book.isbn), downloadUrl: downloadUrl ?? '' },
        $setOnInsert: { stock, active: true },
      },
      { upsert: true, runValidators: true },
    );
  }
  logger.info(`Libros sembrados: ${BOOKS.length}`);

  for (const u of USERS) {
    if (await UserModel.exists({ email: u.email })) continue;
    await UserModel.create({ name: u.name, email: u.email, role: u.role, passwordHash: await hasher.hash(u.password) });
    logger.info(`Usuario de prueba creado: ${u.email} (${u.role})`);
  }

  await disconnectDatabase();
}

seed().catch(async (err: Error) => {
  logger.error(`Seed falló: ${err.message}`);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
