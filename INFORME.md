# Informe de resultados de pruebas · Libros Ya

Laboratorio *Generación de aplicaciones con IA*, Fundamentos en S.I., UdeA 2026.
Fecha de ejecución: 23 de noviembre de 2026.

## 1. Resumen

| | |
|---|---|
| Herramienta | TestSprite, proyecto **Libros Ya**, tipo *Live Web App · Frontend UI* |
| Ambiente probado | Producción en Railway: https://lab-libros-ya-production.up.railway.app (API: https://graceful-perfection-production-5788c32e.up.railway.app) |
| Versión probada | `main` en el commit `2296ec5` (incluye `898fca4 fix: security fixes` y el PR #1) |
| Cuenta usada | `cliente@librosya.com` (rol cliente), entorno *default* |
| Requisitos de referencia | [PRD.md](PRD.md) |
| Casos diseñados | 21 (16 de cliente/visitante y 5 de administrador) |
| Casos ejecutados | 16 |
| Resultado | **16 aprobados · 0 fallidos · 0 bloqueados · tasa de éxito 100 %** |
| Casos sin ejecutar | 5 de administrador (ver §5) |

**Decisión de liberación:** la versión desplegada cumple los flujos de visitante y cliente del PRD (RF-01 a RF-08 y RF-11) sin defectos abiertos. Los flujos de administrador (RF-09 y RF-10) no tienen todavía evidencia automatizada en TestSprite y quedan como limitación conocida.

## 2. Proceso seguido

Se siguió la sección 11 de la guía:

1. **Primera exploración (cuenta de otra integrante).** El agente de TestSprite exploró la app, propuso un plan de 20 casos y reportó posibles defectos ([00a](docs/evidencia/00a-plan-inicial-20-casos.png), [00b](docs/evidencia/00b-plan-inicial-20-casos.png), [00c](docs/evidencia/00c-plan-inicial-20-casos.png)). No se pudo ejecutar porque el espacio de trabajo no tenía créditos.
2. **Revisión del plan contra el PRD actualizado.** Algunos casos estaban desactualizados. El registro ya exige 10 caracteres con letras y números, no 8. El pago debe usar *Orgullo y prejuicio*, el único e-book con archivo de descarga. Se ajustaron las expectativas y se añadieron las reglas de prueba del PRD: no eliminar libros semilla y tratar el rate limit como problema de ambiente.
3. **Corrección de defectos antes de ejecutar** (ver §4). Los cambios se integraron por Pull Request y se desplegaron en Railway.
4. **Nuevo proyecto en TestSprite** con el PRD adjunto y la cuenta de cliente ([01](docs/evidencia/01-testsprite-proyecto.png)). El agente exploró la app ([02](docs/evidencia/02-testsprite-exploracion.png)) y propuso 16 casos ([03](docs/evidencia/03-testsprite-plan.png)). Se revisaron y se ejecutaron con *Run All*.
5. **Resultado:** 16/16 aprobados ([04](docs/evidencia/04-testsprite-resultado-16-16.png)).

## 3. Resultados por caso

| Área | Caso | Requisito | Resultado |
|---|---|---|---|
| Entrada pública | Visitante ve portada y catálogo sin opciones privadas ("Crear cuenta" visible) | RF-01 | ✅ Aprobado |
| Acceso | Credenciales inválidas muestran "Correo o contraseña incorrectos." | RF-02 | ✅ Aprobado |
| Acceso | Registro aplica la política de contraseña y crea siempre un cliente | RF-02 | ✅ Aprobado |
| Acceso | La sesión se mantiene al recargar y "Salir" la cierra | RF-02 | ✅ Aprobado |
| Roles | Cliente en /admin y /admin/catalog ve "No tienes acceso a esta sección." | RF-03 | ✅ Aprobado |
| Roles | Visitante en /orders o /admin es redirigido a /login | RF-03 | ✅ Aprobado |
| Catálogo | Búsqueda por autor y título | RF-04 | ✅ Aprobado |
| Catálogo | Filtros por categoría y formato | RF-04 | ✅ Aprobado |
| Carrito | La cantidad no supera el stock ("Máximo disponible: N") | RF-05 | ✅ Aprobado |
| Carrito | Datos de envío solo cuando hay libros impresos | RF-05 | ✅ Aprobado |
| Carrito | Subtotales, total y carrito conservado al recargar | RF-05 | ✅ Aprobado |
| Pedidos | Crear un pedido de e-book y cancelarlo | RF-06, RF-07 | ✅ Aprobado |
| Pedidos | Un pedido impreso exige dirección de envío | RF-06 | ✅ Aprobado |
| Pago | Pagar "Orgullo y prejuicio" con tarjeta de PayPal Sandbox y descargarlo | RF-07 | ✅ Aprobado |
| Despliegue | F5 en rutas internas sin 404 ni pérdida de sesión | RF-11 | ✅ Aprobado |
| Despliegue | ES/EN traduce la app y se conserva al recargar | RF-11 | ✅ Aprobado |

Como no hubo fallos, no fue necesario clasificar ninguno (defecto funcional, ambiente, dato de prueba o falso positivo).

**Pruebas automáticas del backend, complementarias:** `npm test` en `server/` ejecuta 60 pruebas (unitarias de precios, estados de pedido y pagos, y de integración de la API), y todas pasan. Cubren reglas que la suite de interfaz no puede ver:
- el cálculo de precios en el servidor;
- que una captura repetida no cobre ni descuente stock dos veces;
- que otro usuario no pueda pagar ni descargar un pedido ajeno;
- que cerrar sesión invalide el token;
- CORS y los límites de peticiones (429, 413, 409).

## 4. Defectos encontrados y corregidos

| # | Defecto (detectado en la exploración de TestSprite) | Requisito | Corrección | Verificación |
|---|---|---|---|---|
| D1 | En *Mis pedidos*, los e-books entregados mostraban "Enlace de descarga disponible pronto" en vez de "Descargar". | RF-07 | Commit `898fca4`: descargas con enlace firmado de 5 minutos y máximo 5 descargas por libro. | Caso *Pago* ✅ |
| D2 | La barra superior sin sesión no mostraba "Crear cuenta". | RF-01 | PR #1 (`0939fad`): enlace "Crear cuenta" junto a "Ingresar" en `Navbar.tsx`. | Caso *Entrada pública* ✅; también lo confirmó la exploración |
| D3 | Los formularios de registro y de crear libro no se enviaban y no decían por qué. Solo aparecía el globo nativo del navegador, que el agente no ve. | RF-02, RF-10 | PR #1: los formularios usan `noValidate` y muestran un mensaje en la página. El registro valida la misma política que el backend (10+ caracteres, letras y números, sin el correo). El formulario de libro lista los campos que faltan (`lib/formValidation.ts`). | Caso *Registro* ✅; formulario de libro verificado solo en local |
| D4 | Al iniciar sesión como administrador con un `?next=/orders` viejo, se llegaba a "No tienes acceso a esta sección." en vez de a /admin. | RF-02 | PR #1: `safeNext` en `AuthForm.tsx` descarta destinos que el rol no puede abrir. El admin va a /admin y el cliente nunca es enviado a /admin. | Revisión de código; no hay caso automatizado (requiere cuenta admin) |

Antes de desplegar se verificó que compilaran el servidor y la web (`tsc`), que el lint estuviera limpio, que el build de Next funcionara y que pasaran las 60 pruebas del servidor.

**Problema de ambiente resuelto:** en la primera exploración, PayPal Sandbox rechazó la tarjeta de prueba (…6329) con "Tu banco no ha podido verificar tu VISA-6329". En la ejecución final, con país de facturación Estados Unidos, el pago se aprobó.

## 5. Limitaciones conocidas

1. **Casos de administrador sin ejecutar (5).** Indicadores "Últimas N unidades"/"Agotado", crear y eliminar un libro, ocultar un libro, ajustar stock con +N y rechazar un stock negativo, y que el administrador no pueda pagar. Están diseñados, pero requieren un segundo entorno en TestSprite con la cuenta `admin@librosya.com`. RF-09 y RF-10 quedan sin evidencia automatizada.
2. **Fuera del alcance de la suite de interfaz:**
   - Cancelar dentro de la ventana de PayPal.
   - Tablero Kanban con transportadora y guía.
   - Actualización en vivo del pedido para el cliente (WebSockets).
   - Stock actualizado en vivo en la vista del administrador.
   - Pedidos de otro usuario.
   - Llamadas directas a la API: 403, precios alterados y códigos 400. Estas necesitan un proyecto TestSprite de tipo *Backend API*; parte de esas reglas sí las cubren las pruebas automáticas del backend (§3).
3. **El despliegue automático GitHub → Railway no funciona.** Los servicios muestran "Could not load branches" y "Auto deploy unavailable" ([06](docs/evidencia/06-railway-github-desconectado.png)): la app de Railway perdió acceso al repositorio. Un *Redeploy* desde el panel solo repetía el commit viejo ([05](docs/evidencia/05-railway-redeploy-commit-viejo.png)). El 23/11 se desplegó `main` (`2296ec5`) con la CLI de Railway (`railway up`), primero la API y luego la web. Para volver al despliegue automático, la dueña del repo debe dar acceso a la app de Railway en GitHub (*Settings → Applications → Railway → Repository access*).
4. **Contraseñas de prueba en el historial de Git.** Versiones anteriores del seed tenían contraseñas por defecto escritas en el código. El código actual ya no las incluye, pero siguen en el historial. Hay que rotarlas con `server/src/scripts/setPassword.ts` después de las pruebas.
5. **Aviso de hidratación de React** (error minificado #418) en la consola del navegador en producción. No afecta el funcionamiento ni hizo fallar ningún caso.
6. **Descargas de e-books:** solo *Orgullo y prejuicio* (dominio público) tiene archivo de descarga en los datos semilla. Los demás e-books muestran "Enlace de descarga disponible pronto" hasta que el administrador les asigne una URL.

## 6. Datos que dejaron las pruebas

- Cuentas `qa+<timestamp>@example.com`, creadas por el caso de registro. La app no permite borrarlas desde la interfaz.
- Pedidos #21B300 (cancelado) y #21B301 (pagado), de la exploración.
- El stock de *Orgullo y prejuicio* bajó con cada compra de prueba.
- El libro de prueba oculto "QA Libro Exploracion 1", de la primera exploración. Debe eliminarse desde *Catálogo y stock*.

## 7. Evidencia

Las capturas están en [`docs/evidencia/`](docs/evidencia/):

| Archivo | Contenido |
|---|---|
| `00a`–`00c-plan-inicial-20-casos.png` | Plan inicial de 20 casos (primera exploración) |
| `01-testsprite-proyecto.png` | Configuración del proyecto en TestSprite (URL, tipo y cuenta de prueba) |
| `02-testsprite-exploracion.png` | Exploración del agente y sus notas |
| `03-testsprite-plan.png` | Plan de 16 casos antes de ejecutar |
| `04-testsprite-resultado-16-16.png` | Resultado de la ejecución: 16/16 aprobados |
| `05-railway-redeploy-commit-viejo.png` | Redeploy que repetía el commit viejo |
| `06-railway-github-desconectado.png` | Railway sin acceso al repositorio de GitHub |

El reporte completo, con los pasos y las capturas de cada caso, está en el proyecto **Libros Ya** de TestSprite → *Test Runs* → ejecución del 23 de noviembre, 9:27 PM.
