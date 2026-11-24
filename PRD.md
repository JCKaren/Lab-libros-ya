# PRD · Libros Ya

Documento de requisitos y criterios de aceptación para las pruebas automatizadas (TestSprite) y manuales.

## 1. Producto
Libros Ya es una tienda en línea de libros. Vende e-books (descarga digital) y libros impresos (con envío), gestiona el catálogo y el stock, y gestiona los envíos.
- Aplicación web: https://lab-libros-ya-production.up.railway.app
- API REST: https://graceful-perfection-production-5788c32e.up.railway.app/api
- Estado de la API: GET /health → {"status":"ok","db":"up"}
- Idioma por defecto: Español (botón ES/EN en la barra superior)
- Pagos: PayPal Sandbox, sin dinero real
- Tiempo real: Socket.IO sobre el mismo dominio de la API

## 2. Roles
| Rol | Puede | No puede |
|---|---|---|
| Visitante | Ver inicio y catálogo, agregar al carrito, registrarse, iniciar sesión | Pagar, ver pedidos, entrar a /admin |
| Cliente | Lo del visitante + crear pedidos, pagar con PayPal, ver Mis pedidos, descargar e-books pagados, cancelar pedidos no pagados | Entrar a /admin o /admin/catalog, cambiar estados de envío |
| Administrador | Tablero de envíos (/admin), catálogo y stock (/admin/catalog) | Comprar: el botón Ir a pagar está deshabilitado |
(Credenciales en la configuración de login de TestSprite.)

## 3. Rutas
| Ruta | Acceso | Contenido |
|---|---|---|
| / | público | Portada con Explorar catálogo y Crear cuenta |
| /catalog | público | Libros activos, búsqueda, filtros por categoría y formato |
| /cart | público (pagar requiere cliente) | Líneas, datos de envío si hay impresos, total |
| /login, /register | público | Formularios de acceso |
| /checkout/{id} | cliente dueño | Resumen del pedido y botones de PayPal |
| /orders | cliente | Historial, estados en vivo, guía de envío, descargas |
| /admin | administrador | Kanban: Pendiente → Preparando → Enviado → Entregado |
| /admin/catalog | administrador | Crear libro, ajustar stock, ocultar, eliminar, totales |

## 4. Requisitos funcionales
### RF-01 Entrada pública
- Portada y /catalog cargan sin sesión y sin errores.
- Barra superior: Catálogo, Carrito, Ingresar, Crear cuenta. No muestra Mis pedidos, Envíos ni Catálogo y stock.
- El catálogo y los pedidos no exponen la URL permanente del e-book. "Descargar" pide un enlace firmado de 5 minutos, con un máximo de 5 descargas por libro; luego el botón se desactiva.
### RF-02 Acceso
- Credenciales válidas: cliente llega a /catalog, administrador a /admin. Barra muestra Salir (y nombre en pantallas anchas).
- Credenciales inválidas o correo inexistente: mismo mensaje "Correo o contraseña incorrectos."
- El registro crea siempre un cliente. Contraseña de al menos 10 caracteres, con letras y números, que no contenga el correo.
- Cerrar sesión invalida el token en el servidor. Si un usuario cambia de rol o se elimina, sus sesiones dejan de valer de inmediato.
- Salir cierra la sesión. Al recargar, la sesión se mantiene.
### RF-03 Roles
- Cliente en /admin o /admin/catalog ve "No tienes acceso a esta sección."
- Visitante en /orders o /admin es redirigido a /login.
- 403 si un cliente llama a GET /api/orders/shipping, POST /api/books o PATCH /api/orders/{id}/status.
### RF-04 Catálogo
- Filtros por categoría (Ficción, No ficción, Ciencia, Tecnología, Infantil) o formato (E-book, Impreso) muestran solo libros que cumplen.
- Búsqueda por título, autor o ISBN. "Orwell" encuentra 1984.
- Stock 0: "Agotado" y Añadir deshabilitado. Impreso con stock ≤ 3: "Últimas N unidades".
- Libro oculto no aparece en el catálogo público.
### RF-05 Carrito
- Añadir incrementa el contador del Carrito.
- En /cart: −/+, escribir cantidad, Quitar.
- Subtotal = precio × cantidad. Total = suma de líneas.
- Cantidad máxima = stock: + deshabilitado y "Máximo disponible: N".
- Con impresos: Quién recibe, Dirección, Ciudad, Teléfono. Solo e-books: aviso de entrega digital, sin dirección.
- El carrito se conserva al recargar.
### RF-06 Pedido y precio
- El backend recalcula precios y total; price/total alterados en POST /api/orders se ignoran.
- Cantidad ≤ 0, carrito vacío o teléfono inválido → 400 VALIDATION_ERROR.
- Impreso sin dirección → 400 ADDRESS_REQUIRED.
- Más unidades que el stock → 400 OUT_OF_STOCK.
- El pedido nace Pendiente de pago.
### RF-07 Pago PayPal Sandbox
- En /checkout/{id}, los botones de PayPal (cuenta o tarjeta) completan el pago con la cuenta Personal de Sandbox o tarjeta de prueba.
- Pago aprobado: "¡Compra confirmada! ...". Pagado una sola vez: repetir captura no cobra ni descuenta stock otra vez.
- Con impresos pasa a Pendiente (envíos). Solo e-book pasa a Entregado y aparece Descargar en Mis pedidos.
- El stock baja en la cantidad comprada.
- Cerrar/cancelar PayPal: no queda pagado y aparece "Cancelaste el pago. Tu pedido sigue pendiente; puedes reintentar."
- Cancelar pedido → Cancelado; un pedido cancelado no se puede pagar.
### RF-08 Historial
- Mis pedidos lista solo los pedidos del cliente.
- Pedido de otro usuario (/checkout/{id} o GET /api/orders/{id}) → 404/error, sin datos ajenos.
### RF-09 Envíos y tiempo real
- En /admin, pedidos pagados con impresos aparecen en Pendiente sin recargar.
- Un paso a la vez (arrastrar o ←/→). Sin saltos; Entregado es final.
- Al pasar a Enviado: diálogo de transportadora y número de guía.
- Mis pedidos en otra sesión muestra nuevo estado, transportadora y guía sin recargar.
### RF-10 Catálogo y stock (admin)
- Crear libro con título y descripción ES/EN, autor, categoría, formato, precio > 0, stock ≥ 0 lo agrega a la lista.
- Ajustar +N/−N cambia el stock; ajuste que deja stock negativo muestra error y no cambia nada.
- Desmarcar Visible en catálogo oculta el libro del catálogo público.
- Cuando un cliente compra, el stock de la lista se actualiza en vivo.
### RF-11 Despliegue
- F5 en /catalog, /cart, /orders, /admin, /checkout/{id} carga la página correcta, sin 404 ni pérdida de sesión.
- ES/EN cambia todos los textos y la preferencia se conserva al recargar.

## 5. Reglas para las pruebas
- Solo PayPal Sandbox. Datos personales ficticios.
- Las compras descuentan stock real; el admin lo repone.
- No eliminar libros semilla; crear un libro propio para pruebas destructivas.
- Rate limit de login/registro por IP cada 15 min: "Demasiados intentos. Espera unos minutos." es problema de ambiente.
- Kanban: usar botones ←/→.

## 6. Fuera de alcance
Pagos reales, correos, recuperación de contraseña, costos de envío e impuestos.
