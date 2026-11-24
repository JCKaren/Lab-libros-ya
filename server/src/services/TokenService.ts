import jwt, { type SignOptions } from 'jsonwebtoken';

/** Audiencias separadas: un token de descarga nunca sirve como sesión ni al revés. */
const SESSION_AUDIENCE = 'librosya:session';
const DOWNLOAD_AUDIENCE = 'librosya:download';

/** Lo que el token afirma; el rol y el nombre se leen siempre de la base de datos. */
export interface SessionClaims {
  userId: string;
  version: number;
  /** Expiración en segundos (epoch). */
  exp: number;
}

export interface DownloadClaims {
  orderId: string;
  bookId: string;
  userId: string;
}

export interface TokenService {
  signSession(user: { id: string; tokenVersion: number }): string;
  /** Devuelve los claims si la firma, audiencia y expiración son válidas; null en cualquier otro caso. */
  verifySession(token: string): SessionClaims | null;
  signDownload(claims: DownloadClaims): string;
  verifyDownload(token: string): DownloadClaims | null;
}

export class JwtTokenService implements TokenService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: string,
    private readonly downloadTtlSeconds = 300,
  ) {}

  signSession(user: { id: string; tokenVersion: number }): string {
    return jwt.sign({ ver: user.tokenVersion }, this.secret, {
      subject: user.id,
      audience: SESSION_AUDIENCE,
      expiresIn: this.expiresIn as SignOptions['expiresIn'],
      algorithm: 'HS256',
    });
  }

  verifySession(token: string): SessionClaims | null {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'], audience: SESSION_AUDIENCE });
      if (typeof payload === 'string' || !payload.sub || typeof payload.ver !== 'number' || !payload.exp) return null;
      return { userId: payload.sub, version: payload.ver, exp: payload.exp };
    } catch {
      return null;
    }
  }

  signDownload(claims: DownloadClaims): string {
    return jwt.sign({ oid: claims.orderId, bid: claims.bookId }, this.secret, {
      subject: claims.userId,
      audience: DOWNLOAD_AUDIENCE,
      expiresIn: this.downloadTtlSeconds,
      algorithm: 'HS256',
    });
  }

  verifyDownload(token: string): DownloadClaims | null {
    try {
      const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'], audience: DOWNLOAD_AUDIENCE });
      if (typeof payload === 'string' || !payload.sub || typeof payload.oid !== 'string' || typeof payload.bid !== 'string') return null;
      return { orderId: payload.oid, bookId: payload.bid, userId: payload.sub };
    } catch {
      return null;
    }
  }
}
