import type { AuthUser } from '../domain/entities';
import type { OrderRepository } from '../repositories/OrderRepository';
import { AppError } from '../utils/AppError';
import type { TokenService } from './TokenService';

/** Descargas permitidas por e-book comprado. */
export const DOWNLOAD_LIMIT = 5;

/**
 * Entrega de e-books mediante enlaces firmados de corta duración:
 * el navegador nunca recibe el enlace permanente en las respuestas de la API,
 * cada descarga se cuenta y tiene límite, y el enlace caduca en minutos.
 *
 * Límite conocido: al redirigir, el destino final queda visible. Para proteger
 * el archivo de verdad, `downloadUrl` debe apuntar a almacenamiento privado
 * con URLs prefirmadas (S3/R2/GCS); este servicio es el punto para integrarlo.
 */
export class DownloadService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly tokens: TokenService,
  ) {}

  /** Emite un enlace firmado para el dueño de un pedido pagado. */
  async issue(user: AuthUser, orderId: string, bookId: string): Promise<{ path: string; downloadsLeft: number }> {
    const order = await this.orders.findById(orderId);
    if (!order || order.userId !== user.id) throw AppError.notFound('Pedido');
    if (order.paymentStatus !== 'PAID') throw AppError.conflict('ORDER_NOT_PAID', 'El pedido aún no está pagado');
    const item = order.items.find((i) => i.bookId === bookId && i.format === 'ebook' && i.downloadUrl);
    if (!item) throw AppError.notFound('Descarga');

    const counted = await this.orders.registerDownload(orderId, bookId, DOWNLOAD_LIMIT);
    if (!counted) throw AppError.conflict('DOWNLOAD_LIMIT_REACHED', 'Alcanzaste el máximo de descargas de este libro');

    const token = this.tokens.signDownload({ orderId, bookId, userId: user.id });
    return { path: `/api/downloads/${token}`, downloadsLeft: Math.max(0, DOWNLOAD_LIMIT - counted.downloads) };
  }

  /** Resuelve un enlace firmado a la URL del archivo, revalidando el pedido. */
  async resolve(token: string): Promise<string> {
    const claims = this.tokens.verifyDownload(token);
    if (!claims) throw new AppError(410, 'DOWNLOAD_EXPIRED', 'El enlace de descarga venció; genera uno nuevo desde "Mis pedidos"');
    const order = await this.orders.findById(claims.orderId);
    const item = order?.items.find((i) => i.bookId === claims.bookId && i.format === 'ebook');
    if (!order || order.userId !== claims.userId || order.paymentStatus !== 'PAID' || !item?.downloadUrl) {
      throw AppError.notFound('Descarga');
    }
    return item.downloadUrl;
  }
}
