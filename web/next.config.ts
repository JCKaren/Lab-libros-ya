import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const api = new URL(apiUrl);
const apiWs = `${api.protocol === "https:" ? "wss:" : "ws:"}//${api.host}`;

/** Dominios que necesita el SDK de PayPal (botones, tarjeta y ventana de aprobación). */
const paypal = ["https://*.paypal.com", "https://*.paypalobjects.com"];

/**
 * Content Security Policy. Limita de dónde se cargan scripts y, sobre todo, a dónde
 * puede enviar datos la página (connect-src): un script inyectado no puede exfiltrar
 * el token a un dominio ajeno ni la página puede incrustarse en otro sitio.
 * 'unsafe-inline' en scripts es necesario para los scripts de hidratación de Next
 * sin nonce (las páginas se prerenderizan estáticamente).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ""}${paypal.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  // Portadas definidas por el administrador (solo https, validado en el backend).
  `img-src 'self' data: blob: https:`,
  "font-src 'self'",
  `connect-src 'self' ${api.origin} ${apiWs} ${paypal.join(" ")}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  `frame-src ${paypal.join(" ")}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
