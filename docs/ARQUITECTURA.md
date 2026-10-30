# Divina Store MX — Arquitectura y conexiones

**Actualizado:** 29 de octubre de 2026 · **Admin:** v1.3
**Sitio:** https://www.divinastore.com.mx · **Repo:** `angelicatrejoarrieta61-bit/GIT-DE-DIVINA` (rama `main`)

Este documento explica cómo está armado el sitio y con qué se conecta, para que quien lo siga editando no tenga que adivinar. Está escrito a partir del código real. Sustituye a `DEVELOPER_GUIDE.md` y `ESTRUCTURA_PROYECTO.md` (mayo 2026), que quedaron desactualizados (por ejemplo, mencionan una columna `sku` que no existe).

---

## 1. En una frase

Tienda en React (una sola página, SPA) alojada en **Vercel**, con datos en **Supabase**, cobro con **Clip**, correos con **Resend** y un buscador de proveedores que consulta Google Shopping a través de **Bright Data**. Se vende **sin inventario**: llega un pedido, el dueño busca dónde comprar el producto y decide él. Nada se compra ni se busca solo.

## 2. Mapa de conexiones

```
Navegador (React SPA)
 ├── Supabase (llave anónima)      datos de tienda, sesión del admin, imágenes
 ├── SDK de Clip (script externo)  convierte la tarjeta en un token
 └── /api/*  (funciones de Vercel, aquí viven las llaves secretas)
      ├── charge-clip       → API de Clip (cobro)
      ├── clip-verify       → API de Clip (confirmar cobros, solo admin)
      ├── send-email        → Resend (correos) + Supabase
      ├── sourcing-search   → Bright Data (Google Shopping MX) + Supabase
      └── admin-users       → Supabase con llave de servicio
```

Regla de oro: **ninguna llave secreta va en el navegador**. Todo lo que empieza con `VITE_` es público; lo demás solo existe en las funciones `/api`.

## 3. Tecnología

| Pieza | Qué se usa |
|---|---|
| Interfaz | React 19, TypeScript 5.8, Vite 6, react-router 7 |
| Estilos | CSS propio por componente (BEM). Tailwind está instalado pero casi no se usa |
| Estado del carrito | zustand con persistencia en `localStorage` (`divina-cart`) |
| Iconos | lucide-react |
| Base de datos, sesión, archivos | Supabase (Postgres, Auth, Storage, Realtime) |
| Servidor | Funciones serverless de Vercel en `/api` (Node 24) |
| Pagos | Clip México |
| Correo | Resend |
| Búsqueda de proveedores | Bright Data, zona SERP |
| Escáner de código de barras | @zxing/browser |
| SEO | react-helmet-async + prerenderizado en el build |

## 4. Carpetas que importan

```
api/                    funciones del servidor (Vercel)
src/
  App.tsx               todas las rutas
  main.tsx              arranque
  components/           Header, Footer, CartDrawer, StoreThemeProvider, Seo…
  sections/             bloques del Home (Hero, Categorías, Más vendidos)
  pages/                páginas públicas
  pages/admin/          panel de administración
  pages/blog/           blog público
  lib/                  conexión y lógica compartida (ver sección 5)
  store/cartStore.ts    carrito y cupón aplicado (valida contra la tabla coupons)
  styles/index.css      estilos globales y variables (éste es el que se carga)
scripts/                sitemap y prerenderizado SEO (corren en el build)
supabase/migrations/    SQL que se ejecuta a mano en Supabase
public/                 imágenes fijas (checkout, favicon, og-image)
```

**Ojo con la raíz del repo:** tiene más de 500 archivos sueltos (`.liquid`, `.json` de idiomas, copias como `App-1.tsx`, `index-2.html`). Son restos de un tema de Shopify y de respaldos; **el build no los usa**. Solo cuentan `index.html`, `package.json`, `vercel.json`, `vite.config.ts`, los `tsconfig*` y las carpetas de arriba. `src/index.css` tampoco se carga (el bueno es `src/styles/index.css`).

## 5. Archivos de lógica (`src/lib`)

| Archivo | Para qué |
|---|---|
| `supabase.ts` | Cliente de Supabase, URLs de imágenes con tamaño (`getImageUrl`, `getImageSrcSet`), subida de imágenes |
| `queries.ts` | Lecturas y escrituras de productos, colecciones, pedidos y `store_config` |
| `storeBoot.ts` | Copia local de la configuración (arranque sin brinco), fondo de página, loader inicial |
| `sourcing.ts` | Tipos y utilidades del buscador de proveedores para el panel (reexporta `sourcingCore.js`) |
| `sourcingCore.js` (+ `.d.ts`) | **Lógica única de abastecimiento** (panel y servidor): coincidencia exacta, mensualidades, paquetes, vendedor de marketplace, proveedores autorizados, margen, piso de ganancia y precio objetivo. JS puro para que lo importen las funciones de Vercel |
| `sourcingServer.js` (+ `.d.ts`) | Solo servidor: Google Shopping vía Bright Data, directorio de tiendas, revisión de productos, verificación de pedidos, demanda y oportunidades |
| `autoApi.ts` | Panel ↔ `/api/sourcing-auto` y reglas de la automatización en `store_config` |
| `productEvents.ts` | Registra visitas y "agregar al carrito" por producto (`product_events`); no cuenta bots ni la vista previa del admin |
| `blog-queries.ts` | Lecturas y escrituras del blog |
| `promoterTracking.ts` | Guarda el código de promotora (`?ref=`) 30 días |
| `analytics.ts` | Eventos de Google Analytics |
| `coupons.ts` | Códigos de descuento: validación pública (`validateCoupon`), regla de cálculo (`couponDiscount`), CRUD del admin, usos y generador de códigos |
| `seoRules.js` (+ `seoRules.d.ts`) | **Única fuente de SEO**: títulos, descripciones vendedoras, Product schema, URL de colección, schema de la tienda y montos de envío. JS puro porque también lo usa el build en Node |
| `shipping.ts` | Regla de envío del carrito/checkout (reexporta los montos de `seoRules.js`) |

## 6. Base de datos (Supabase)

| Tabla | Contenido |
|---|---|
| `products` | Catálogo. Columnas clave: `name, slug, brand, price, compare_price, image_url, images, collection_id, in_stock, stock, tags, ean, cost_price, fulfillment`. **No existe `sku`.** |
| `collections` | Categorías: `name, slug, image_url, description, sort_order` |
| `orders` | Pedidos. `status`: `pending` (sin pagar), `paid` (por enviar), `shipped`, `delivered`, `cancelled`. Envío: `shipping_carrier`, `tracking_number`, `tracking_url`, `shipped_at`. Avisos: `admin_notified_at`, `customer_notified_at`, `shipping_notified_at`. `internal_note` (nota que no ve el cliente). Cobro Clip: `clip_payment_id, clip_status, clip_status_code, clip_receipt_no, clip_auth_code, clip_card, clip_amount, clip_approved_at, clip_verified_at, clip_raw` — **solo los escribe el servidor** (un trigger ignora cambios del navegador y de la sesión del admin). Cupón: `coupon_code`, `discount_amount` |
| `coupons` | Códigos de descuento: `code` (único, mayúsculas), `description`, `discount_type` (`percent`/`fixed`), `discount_value`, `min_subtotal`, `max_uses`, `starts_at`, `ends_at`, `active`. Solo la lee y edita el admin; el público valida con la función `validate_coupon` |
| `store_config` | Configuración llave–valor de toda la tienda (ver sección 8) |
| `subscribers` | Correos del newsletter |
| `contact_messages` | Mensajes de los formularios de contacto |
| `blog_posts` | Artículos del blog |
| `promoters` | Programa de promotoras y sus códigos |
| `sourcing_searches` | Historial de búsquedas de proveedores |
| `sourcing_offers` | Ofertas encontradas en cada búsqueda |
| `sourcing_merchants` | Directorio de tiendas: sitio, días de envío, costo, confianza |
| `product_sources` | Proveedor elegido para un producto del catálogo |
| `transactions` | Solo la usan funciones de Clip antiguas (ver sección 9) |

**Imágenes:** bucket de Storage `divina-assets`.

**Etiquetas de producto (`tags`)** con significado especial:
- `TOP_HOME` — aparece en "Más vendidos" del Home
- `BADGE:<TEXTO>` — etiqueta visible sobre la foto (ej. `BADGE:NUEVO`)
- `REL_<slug>` — producto relacionado
- `bajo-pedido` — se compra al proveedor cuando hay venta

**Permisos (RLS):** las migraciones de este repo dan acceso total a cualquier usuario con sesión iniciada: no hay roles, sesión iniciada = administrador. Las reglas de las tablas más antiguas (`products`, `orders`, `subscribers`…) se crearon directo en Supabase y no están en el repo; revisarlas ahí antes de cambiarlas. Si algún día se da acceso a clientes con cuenta, esto hay que cambiarlo.

**Migraciones:** los archivos de `supabase/migrations/` **no se aplican solos**. Se pegan y ejecutan en Supabase → SQL Editor. Todos están escritos para poder correrse más de una vez.

## 7. Rutas

**Públicas:** `/`, `/catalogo`, `/coleccion/:slug`, `/producto/:slug`, `/blog`, `/blog/:slug`, `/quienes-somos`, `/contacto`, `/programa-promocion`, `/info/:slug` (páginas creadas desde el admin), `/checkout`, `/pago-exitoso`, `/pago-error`, `/mi-pedido` (estado y seguimiento del pedido; ícono junto al carrito).

**Admin** (requiere sesión de Supabase; entrada en `/admin/login`):

| Ruta | Pantalla |
|---|---|
| `/admin` | Resumen: ventas del mes, por surtir, sin foto, mensajes |
| `/admin/reportes` | Pedidos y clientes: resumen, filtros, borrar, enviar con guía, etiqueta, campañas |
| `/admin/productos` | Catálogo unificado: precio, marca, fotos, badge, Home |
| `/admin/abastecimiento` | Buscador de proveedores · pestaña Tiendas (proveedores autorizados y días de entrega) |
| `/admin/automatizacion` | **Precios automáticos** (Catálogo): productos vigilados, pedidos por comprar (verificación en vivo) y reglas |
| `/admin/oportunidades` | **Oportunidades y resultados** (Catálogo): qué conviene vender y métricas por producto |
| `/admin/cupones` | **Códigos de descuento** (Ventas): crear, generar, editar, pausar y borrar cupones |
| `/admin/reportes?pagos=clip` | Abre el modal **Pagos Clip** dentro de Pedidos (el antiguo `/admin/config?section=clip-payments` redirige aquí) |
| `/admin/config?section=…` | Diseño de la tienda (General, Home, colecciones, páginas) |
| `/admin/mensajes`, `/admin/newsletter`, `/admin/blog` | Clientes y contenido |
| `/admin/promotores`, `/admin/usuarios` | Promotoras y usuarios |

Como es una SPA, `vercel.json` redirige esas rutas a `/` para que no den 404 al abrirlas directo. **Si se agrega una ruta nueva con parámetro, hay que añadirla ahí.**

## 8. Cómo funciona la configuración de la tienda

Casi todo lo visual sale de la tabla `store_config`: logo, tipografías, textos e imagen del hero, posición de la tarjeta de cristal, menú, footer, orden del Home, fondo de página.

1. `StoreThemeProvider` lee la configuración y la convierte en variables CSS (`--logo-h`, `--hero-x`, `--page-bg`, fuentes…).
2. Se guarda una copia en `localStorage` (`divina_store_config_v1`). En la siguiente visita la tienda arranca con esa copia y después la refresca, por eso ya no brinca ni muestra textos provisionales.
3. En el admin, `AdminConfig.tsx` muestra la tienda en un iframe y le manda cada cambio con `postMessage` (`ADMIN_PREVIEW_UPDATE`); así se ve en vivo antes de guardar.
4. `AdminConfig` **guarda solo**, un segundo después de cada cambio, y escribe **todas** las llaves que tiene cargadas.

**Trampa importante:** por el punto 4, si otro componente escribe en `store_config` mientras `AdminConfig` está abierto, el autoguardado lo pisa. Para evitarlo, quien escriba desde fuera debe avisar con el evento `ADMIN_PATCH_EVENT` (definido en `AdminLayout.tsx`), que `AdminConfig` fusiona en su estado.

**Llaves nuevas más usadas:**
- `admin_custom_sections` — secciones creadas con "Añadir" (colección o página)
- `page_<slug>_title`, `page_<slug>_body` — contenido de páginas `/info/<slug>`
- `page_bg_mode` (`default` / `solid` / `gradient`), `page_bg_c1`, `page_bg_c2`, `page_bg_c3`, `page_bg_angle` — fondo de la tienda
- `home_layout_order` — orden de bloques del Home

## 9. Pagos (Clip)

Flujo actual, en `CheckoutPage.tsx`:

1. El SDK de Clip (cargado en `index.html`) pinta el formulario de tarjeta con `VITE_CLIP_API_KEY`.
2. Al pagar, el SDK devuelve un **token** de la tarjeta. Los datos de la tarjeta nunca pasan por nuestro servidor.
3. Se crea el pedido en `orders` con estado `pending`.
4. Se llama a `/api/charge-clip`, que cobra en `api.payclip.com/payments` con las llaves secretas.
5. `charge-clip` guarda en el pedido lo que respondió Clip (aprobado, pendiente o rechazado) en las columnas `clip_*`: id del pago, estado, `status_detail.code`, `receipt_no`, tarjeta (marca, últimos 4, banco), monto y fecha. Si Clip aprueba, **marca el pedido como `paid` desde el servidor**. El navegador también lo marca, como respaldo, pero eso no habilita el envío.
6. **Pago no aprobado** (rechazo, error o `pending` con verificación del banco 3-D Secure): `charge-clip` responde 402 `payment_failed` y **cancela ese pedido** (`status = cancelled`, motivo en `internal_note`) para que no quede "En proceso". La clienta ve solo: **"Tu compra no fue satisfactoria. Intenta con otra tarjeta."** Decisión (29-oct-2026): **3-D Secure no se implementa.**
7. El checkout y `/pago-exitoso` piden a `/api/send-email` el aviso `order-paid` (ver sección 11).
8. **Confirmación con Clip** (`/api/clip-verify`, requiere sesión del admin): consulta `GET https://api.payclip.com/payments/{id}` y actualiza las columnas `clip_*`. Si Clip aprueba un pedido que seguía "Sin pagar", lo pasa a pagado y manda los avisos. Pedidos la llama sola al abrir (para los cobros sin estado final) y desde los botones "Consultar a Clip" / "Verificar todo con Clip".
9. **Después de pagar** (`/pago-exitoso?order=<id>`): agradecimiento y, al final, el **resumen completo** (número copiable, avance Pagado → Preparando → En camino → Entregado, productos con foto, subtotal, descuento, envío, total y dirección). El pedido queda guardado en el navegador para verlo en **Mi pedido**. Si alguien abre la página con un pedido no pagado, dice "Tu compra no fue satisfactoria".

**Número de autorización:** la documentación pública de Clip no lista un campo de código de autorización; se guarda `receipt_no` (recibo de Clip) y, si Clip llega a mandar `authorization_code`, también. La respuesta completa (sin el token) queda en `clip_raw` para revisar qué campos manda Clip en realidad.

**Código antiguo que sigue en el repo y no usa el checkout actual:** `api/clip-payment.ts`, `api/clip-card-token.ts`, `api/clip-installments.ts`, `api/clip-webhook.ts`, `api/create-payment.ts`, `api/test-clip.ts` y `src/hooks/useClipPayment.ts`. Antes de borrarlos, confirmar en el panel de Clip que no haya un webhook apuntando a `clip-webhook`.

**Envío** (`src/lib/shipping.ts`, única fuente de la regla): **$120 MXN con IVA** por pedido si los productos (ya con cupón) suman menos de **$999**; desde $999 es gratis. Se suma al total que se cobra en Clip y que se guarda en `orders.total`. El carrito y el checkout muestran Subtotal, Descuento, Envío (o "Gratis") y una barra de "te faltan $X para envío gratis"; la ficha de producto dice "Envío $120 · gratis desde $999". No hay columna aparte para el envío en `orders`.

**Cupón:** se administra en `/admin/cupones` (ver sección 9 bis). El descuento se aplica a los productos **antes** del envío, así que puede cambiar si el pedido llega o no a envío gratis.

## 9 bis. Códigos de descuento (`/admin/cupones`)

Archivos: `src/pages/admin/AdminCoupons.tsx` + `AdminCoupons.css` (clases `.cpn-*`), `src/lib/coupons.ts`, `src/store/cartStore.ts`. Migración: `supabase/migrations/20261025120000_coupons.sql`.

- **Tipos:** porcentaje (1–100 %) o monto fijo en pesos. El descuento nunca supera el subtotal de productos.
- **Condiciones opcionales:** compra mínima, límite de usos, fecha de inicio y de fin. Interruptor Activo/Pausado.
- **Usos:** se cuentan en `orders.coupon_code` **solo con pedidos pagados, enviados o entregados**. Si se cambia el código de un cupón ya usado, el conteo empieza en cero (el admin lo avisa).
- **Estados en la lista:** Vigente, Programado, Pausado, Vencido, Agotado; fichas de vigentes, usos pagados, descuento otorgado y ventas con cupón; buscador, filtros, copiar código, editar, borrar con confirmación, "Generar código" (formato `DIVINA-XXXXXX`, sin 0/O/1/I).
- **En la tienda:** carrito y checkout llaman a `validate_coupon(código, subtotal)` (función `security definer`; el público no puede listar la tabla). Mayúsculas/espacios no importan. Mensajes: no válido, pausado, aún no vigente, vencido, agotado, compra mínima.
- **Revalidación:** el cupón guardado en el carrito se vuelve a validar al abrir el carrito, al entrar al checkout y **justo antes de cobrar**. Si ya no aplica, se quita y se avisa; el cobro no sigue hasta que la clienta vea el nuevo total. Si el carrito baja del mínimo, el cupón se conserva pero no descuenta y se muestra el aviso.
- **Pedido:** se guardan `coupon_code` y `discount_amount`. Si la migración no se ha corrido, el pedido se guarda sin esas columnas (no se detiene la venta) y la tienda acepta solo `DESCUENTO202610` (10 %) como respaldo.
- **Carritos viejos:** la versión anterior guardaba `discountPercentage` en `localStorage` (`divina-cart`); el store la convierte sola al formato nuevo (versión 1).
- **Límite actual:** el servidor (`/api/charge-clip`) cobra el monto que manda el navegador y no recalcula precios ni cupón. Ver sección 18.

## 10. Buscador de proveedores (Abastecimiento)

**Objetivo:** dado un producto, encontrar en qué tiendas de México se vende, a qué precio, y cuánto margen deja. Solo busca cuando el administrador presiona Buscar.

**Recorrido de una búsqueda:**

1. `AdminSourcing.tsx` envía a `/api/sourcing-search` el texto (nombre, marca o código de barras) junto con el token de sesión del admin.
2. La función valida la sesión, aplica un límite de uso y revisa si esa búsqueda ya se hizo en las últimas **6 horas**; si es así, devuelve lo guardado sin gastar consulta.
3. Si no, hace **dos consultas a Google México en paralelo** vía Bright Data: la búsqueda normal (`google.com/search?q=…&gl=mx`), de donde toma el carrusel **"Productos patrocinados"** (`top_pla`, `jackpot_pla`, `bottom_pla`; ahí suele salir Amazon MX), y la pestaña Shopping (`udm=28`, campo `shopping`). Junta ambas, quita duplicados (misma tienda, título y precio) y, si una de las dos falla, usa la otra. Las búsquedas guardadas antes de `CACHE_VALID_FROM` no se reutilizan. La respuesta trae `sources` (cuántos productos vinieron de patrocinados y de Shopping, y el error si alguno falló) y la pantalla lo muestra junto a "Consultado hace…".
4. Limpia los datos: precio en pesos, piezas por paquete, nombre de la tienda y su sitio web cuando se conoce.
5. Guarda la búsqueda (`sourcing_searches`), las ofertas (`sourcing_offers`) y actualiza el directorio de tiendas (`sourcing_merchants`).
6. De vuelta en el navegador, `src/lib/sourcing.ts` clasifica cada oferta como **exacta**, **probable** o **no confirmada** (compara marca, tamaño, variante), suma el envío de la tienda y calcula el margen contra el precio de venta, descontando la comisión de Clip.
7. Desde ahí el producto se puede agregar al catálogo (con sus fotos) o vincular a uno existente.

**Lo que Bright Data entrega por oferta:** título, precio, precio anterior, tienda, calificación, número de reseñas, imagen pequeña y un enlace a la página de Google.

**Lo que NO entrega** (límites reales, no errores):
- El enlace directo a la tienda. Por eso el botón "Verificar" abre una búsqueda de Google limitada al sitio de la tienda.
- Código de barras, costo de envío ni días de entrega. Esos datos de envío se capturan a mano una vez por tienda en la pestaña Tiendas.
- Google a veces responde con captcha o tarda. La función hace **un solo intento** con un tope de 55 s; si falla, se vuelve a presionar Buscar. (Una versión con reintentos automáticos se preparó pero no está en `main`.)

**Costo:** cada búsqueda nueva consume saldo de Bright Data. El caché de 6 horas existe para no pagar dos veces lo mismo.

**Comparador (desde 29-oct-2026, `sourcingCore.js`):** además de marca, línea, tamaño, SPF y forma:
- **Mensualidades** ("12 x $45", "$45/mes", "3 MSI"): se detectan; si se conoce el número de pagos se calcula el total. Una oferta en mensualidades nunca cuenta como costo ni como precio de mercado.
- **Paquetes** ("2 piezas", "pack de 3", "2 x 50 ml", "x2", "trío"): se compara por pieza. Un "kit de 2" del mismo producto es paquete, no otra variante.
- **Excluidos siempre:** usado, reacondicionado, réplica, imitación, genérico, tester, muestra, decant, sin caja, caducado. Tamaño mini/viaje es otra variante.
- **Vendedor de marketplace** ("Amazon.com.mx - Vendedor X") se guarda en `sourcing_offers.seller`.
- **Tu propia tienda** ("Divina") nunca cuenta como competencia ni proveedor.
- **Dos precios juntos** ("$600.00 $300.00", lista tachada + oferta): se toma el más bajo y el otro queda como precio anterior (caso real: CeraVe Gel Limpiador 473 ml en Amazon salía a $600 en lugar de $300).
- **Precio real de hoy:** Google a veces pone el precio de lista como principal y la oferta aparte ("MXN 300.00 ahora"). `effectivePrice` toma la oferta ("ahora $X" = X; "ahorra $X" = principal − X; nunca mensualidades) y guarda el de lista como precio anterior. En la tabla se ve el precio de hoy con **−%** y el anterior tachado; el aviso indica que la oferta se revisa cada N horas y tu precio se ajusta solo.
- **Resultados como en Google, sin ocultar nada (29-oct-2026):** se muestran **todas** las ofertas que devuelve Google Shopping. Primero el mismo producto (exactas y probables) del **precio actual más barato al más caro**; abajo, atenuados y con etiqueta, otros tamaños o productos. Nada se oculta por defecto (filtros opcionales). Sin recuadros de foto vacíos ni textos de "sin dato".
- **Tamaño de la liga:** un número suelto de la búsqueda ("… Espumoso 473", típico de las ligas de Amazon) se toma como tamaño: un anuncio que no dice tamaño sigue siendo **Exacta**; uno con otro tamaño (88 ml, 236 ml) es **No confirmada**.
- **Precio sugerido = costo + ganancia a media banda:** si no escribes precio, la **Ganancia** se calcula con el precio que deja la mitad de la banda (`auto_min_margin_pct`–`auto_max_margin_pct`, 25–35 % → 30 %) sobre la oferta exacta más barata. Ya no se usa el precio de mercado. **+ Mi stock** está disponible en cualquier oferta con precio y propone ese precio para la oferta elegida, con el rango mínimo–máximo.
- **Buscar por enlace:** en Abastecimiento se puede pegar el enlace de Amazon, Mercado Libre u otra tienda; se convierte en la búsqueda del producto (`queryFromUrl`).
- **Guarda lo que elegiste:** con **+ Mi stock** (o "Agregar a mis productos") se guarda en `products.search_query` **la misma búsqueda que hiciste** (si pegaste una liga, la búsqueda que salió de ella) y en `product_sources` la oferta elegida (tienda, título, liga, costo). La revisión automática repite esa búsqueda y sigue esa oferta. El producto queda con `auto_price = true` y se revisa en los siguientes 10 min.

## 10 bis. Abastecimiento automático (`/admin/automatizacion`, `/admin/oportunidades`)

Migración: `supabase/migrations/20261029120000_sourcing_auto.sql` (se aplica sola con la Action de GitHub). Función: `api/sourcing-auto.ts` (60 s). Lógica: `src/lib/sourcingServer.js` + `sourcingCore.js`.

**1. Proveedores válidos.** Solo se le compra a tiendas `authorized = true` (empresas grandes; se marcan solas Amazon MX, Mercado Libre, Liverpool, Palacio, Sephora, Sanborns, Walmart, Bodega Aurrera, Sam's, Costco, Chedraui, Soriana, Farmacias del Ahorro, San Pablo, Benavides, Guadalajara, Coppel e ISDIN), no descartadas y que **entreguen en `auto_max_delivery_days` días (1 = día siguiente)**. Los días de entrega y el costo de envío se capturan una vez por tienda en Abastecimiento → Tiendas; **sin días capturados la tienda no se usa**. Campos nuevos: `authorized`, `is_marketplace`, `conditions`.

**2. Revisión cada 5 h de la misma oferta.** Supabase `pg_cron` (job `divina-sourcing-tick`, cada 10 min) llama a `https://www.divinastore.com.mx/api/sourcing-auto?job=tick` con el header `x-cron-token` (secreto generado en la base, tabla `private.app_secrets`; solo la llave de servicio puede validarlo con `sourcing_cron_token_ok`). Cada llamada revisa hasta 3 productos **bajo pedido, con oferta elegida y Automatizar encendido** cuya última revisión tenga más de `auto_check_hours` horas. Por producto (`checkProduct`):
1. Repite la búsqueda guardada (`search_query`; si no hay, el título de la oferta elegida y luego marca + nombre; máx. 2 búsquedas) y localiza **la misma oferta** (`findTrackedOffer`: misma tienda —Amazon MX = Amazon.com.mx— y mismo producto: misma liga o título con ≥ 60 % de las mismas palabras, sin otro tamaño/variante; gana el título más parecido). El precio es el de hoy, con la oferta aplicada.
2. Si ya no aparece: **otra tienda autorizada (o marcada confiable)** con el mismo producto exacto, la más barata → se cambia el proveedor ("Cambió de proveedor: A → B").
3. Si no hay ninguna: se **retira de la venta** (`in_stock = false`, `auto_hidden = true`) y vuelve sola cuando la oferta reaparece. Si Google no responde, no se toca nada y se reintenta.
Ya **no** se exigen días de entrega capturados para revisar. Historial en `product_price_checks`; cambios de precio en `product_price_changes`.

**3. Precio automático por costo** (`bandPrice`; `products.auto_price` = **Automatizar**, encendido por defecto):
- La venta **sigue al costo** conservando tu ganancia en pesos: si la oferta sube $100, tu venta sube $100 + la comisión de Clip; si baja, baja igual.
- Siempre con ganancia **entre `auto_min_margin_pct` y `auto_max_margin_pct`** (25–35 %, sobre la venta, ya con costo, envío del proveedor, colchón de envío y comisión de Clip). Si el movimiento la saca de ese rango, se ajusta al límite. Producto nuevo: mitad de la banda (30 %).
- Con **Automatizar apagado** no se revisa en automático; "Revisar" solo actualiza el costo: no cambia el precio ni lo retira.
- Se actualizan `products.price`, `cost_price`, `sourcing_status/note/checked_at` y la oferta en `product_sources`.
- Ejemplo con tus márgenes (Clip 5 %, colchón $20): CeraVe Gel Espumoso 473 ml en Amazon a **$300** → rango **$458–$533**, sugerido **$492**.

**Pantalla Precios automáticos → Productos vigilados:** columnas **Venta · Costo · Ganancia ($ y %) · Proveedor (tienda y título de la oferta) · Vínculo (Ver oferta) · Estado (Al día / Sin oferta · retirado / Google no respondió / Por revisar, hace cuánto y próxima revisión) · Automatizar** (interruptor). Acciones por fila: **Revisar** (ahora), **Editar** (precio de venta con el rango de la banda, búsqueda con la que se revisa, historial de revisiones y cambios, *Cambiar oferta en Abastecimiento*, *Dejar de vigilar*) y **Eliminar** (con confirmación). Botón **Agregar desde Abastecimiento**. Reglas: ganancia mínima, ganancia máxima y cada cuántas horas.

**4. Protección de cada venta.**
- `/api/charge-clip` **recalcula el total en el servidor** con los precios actuales de `products`, el cupón validado (`validate_coupon`) y la regla de envío; rechaza con 409 si algún producto ya no está disponible o si el total cambió, y **cobra el total del servidor**, nunca el del navegador.
- El carrito y el checkout traen precio y existencia actuales al abrirse (`refreshPrices`) y avisan qué cambió.
- **Pedidos por comprar** (Precios automáticos → pestaña 2): botón **Verificar proveedor** consulta en vivo y decide por pedido: *Comprar* (mismo proveedor, margen sano), *Cambiar de proveedor* (otro válido) o *Suspender* (sin proveedor o comprar deja pérdida). Se guarda en `order_supplier_checks`.
- Cada pedido guarda `est_cost` y `est_profit` (trigger con el costo del proveedor principal al momento de la venta).

**5. Demanda y oportunidades** (`sourcing_opportunities`, job `divina-opportunities` diario 07:20 CDMX):
- Ideas nuevas desde tus **temas** (`auto_opportunity_seeds`) con el autocompletado público de Google.
- Se evalúan hasta `auto_opportunities_per_day` al día (cada una = 1 búsqueda de Bright Data, caché 6 h).
- **Demanda 0–100**: posición en el autocompletado, reseñas, **reseñas nuevas entre revisiones** (lo más cercano a ventas reales que da Google), calificación y competencia. Aparecer mucho no cuenta como vender.
- **Verificado** = proveedor válido + precio sugerido competitivo (≤ mercado + 5 %) + ≥ 20 reseñas + demanda ≥ 35. Lo demás queda como **candidato**.
- **Publicar** abre Abastecimiento con la búsqueda lista; desde ahí se da de alta con su proveedor y queda vigilado.

**6. Resultados** (`product_events` + función `product_metrics(días)`): visitas y "agregar al carrito" por producto (sin datos personales), pedidos, unidades, ventas y ganancia estimada. Sugerencia por producto (Impulsar · Se queda en carrito · Revisar precio o retirar · Observar). **Destacar** agrega/quita la etiqueta `TOP_HOME` (sección "Más vendidos" del Home).

**Reglas** en `store_config` (editables en Precios automáticos → Reglas): `auto_min_margin_pct` (25), `auto_max_margin_pct` (35; clave nueva, se crea sola al guardar Reglas, sin SQL), `auto_check_hours` (5), `auto_enabled` (true), `auto_opportunities_per_day` (6), `auto_opportunity_seeds`. Siguen existiendo para Oportunidades y Pedidos por comprar: `auto_min_margin_mxn` (100), `auto_undercut_pct` (2), `auto_max_change_pct` (35), `auto_max_delivery_days` (1).

**Costo en Bright Data:** ≈ productos automatizados × (24 / horas de revisión) × 1–2 búsquedas al día + oportunidades por día. Ej.: 40 productos cada 5 h ≈ 192–384/día.

**Límites reales:** Google Shopping no confirma existencia exacta ni entrega a un CP; por eso la regla es "proveedor autorizado que entrega al día siguiente" y la verificación en vivo antes de comprar. Las funciones de Vercel van en **12**, el máximo del plan gratuito: una función nueva obliga a juntar o borrar otra (candidata: `api/test-clip.ts`).

## 11. Correo (Resend)

Todo pasa por `/api/send-email`, según el campo `type`:

| `type` | Cuándo | Requiere sesión de admin |
|---|---|---|
| `contact` | Formulario de contacto | No |
| `newsletter` | Alta al newsletter | No |
| `promoter-welcome` | Alta de promotora | No |
| `test`, `campaign` | Envíos desde el admin | Sí |
| `order-paid` | Pedido pagado: aviso a ti + confirmación al cliente. Solo si el pedido está `paid` en la base y una sola vez (usa `admin_notified_at` / `customer_notified_at`) | No |
| `order-shipped` | Aviso de envío al cliente según la forma de entrega (paquetería con guía · entrega personal · directo del proveedor). 2 intentos | Sí |
| `order-lookup` | Consulta pública del pedido para `/pago-exitoso` y `/mi-pedido`: por `orderId`, o por `number` (8 caracteres) + `email`. Devuelve solo lo que ve el cliente (sin teléfono, pago ni notas) | No |
| `order-mail-check` | ¿Llegó la confirmación? Consulta en Resend (`emails.get`) los pedidos de los últimos 7 días: *entregado* → listo · *error al enviar* → reintenta (hasta 6) · *rebotó* → 1 reintento si es el primer envío y después te avisa por correo. Lo llama el cron cada 10 min (`sourcing-auto?job=tick`) y Pedidos al abrir | Token del cron o sesión |
| `order-resend` | Reenviar la confirmación al cliente; opcional corregir su correo | Sí |

**Confirmación al cliente** (`order-paid`): 3 intentos; guarda `customer_email_id` (id de Resend), `customer_email_status` (`sent` · `delivered` · `delayed` · `bounced` · `error`) y `customer_email_tries`. Si no se puede enviar o rebota, te llega **un** aviso "El cliente no recibió la confirmación" (`customer_email_alerted_at`). Columnas en `supabase/migrations/20261029200000_orders_followup.sql`; sin la migración todo funciona igual, solo no se guarda el estado del correo. Los correos al cliente traen el botón **Ver mi pedido** (`/mi-pedido?id=<id>`). Nota: hay 12 funciones (límite de Vercel Hobby), por eso la consulta del pedido vive en `send-email`.

Remitente: `admin@divinastore.com.mx`. Los avisos de contacto llegan a `info@divinastore.com.mx`. Los avisos de **pedido nuevo** llegan al correo (o correos separados por coma) guardado en `store_config.orders_notify_email`, que se edita en Pedidos → Ajustes.

## 11 bis. Pedidos (`/admin/reportes`)

Archivo: `src/pages/admin/AdminOrderReports.tsx` + `AdminOrders.css` (clases `.ord-*`).

- **Resumen en fichas:** ventas pagadas, ticket promedio, por enviar, sin pagar, clientes; con selector de periodo (hoy, 7 días, 30 días, este mes, todo). Las fichas "Por enviar" y "Sin pagar" filtran la tabla.
- **Buscador:** cliente, correo, teléfono, # de pedido, guía o producto.
- **Selección múltiple** y **Borrar** (individual o en lote, con confirmación). Borrar es permanente.
- **Enviar pedido** (botón con texto en cada pedido pagado; "Envío" para editar): elige la **forma de entrega**:
  - **Paquetería**: paquetería (u "Otra" con nombre), guía obligatoria y enlace de rastreo opcional.
  - **Entrega personal**: sin guía; casilla "Ya lo entregué" para pasarlo directo a Entregado.
  - **Directo del proveedor** (la marca o tienda se lo envía al cliente): proveedor sugerido desde Precios automáticos (`product_sources`), guía y rastreo opcionales. Al cliente se le dice que sale del almacén de la marca/distribuidor y que puede llegar con su empaque.
  Se guarda en `shipping_carrier` ("Entrega personal" / "Directo de: Amazon MX" / paquetería), pasa a `shipped` (o `delivered`) y, con la casilla, avisa al cliente por correo.
- **Etiqueta** (etiqueta 4×6" imprimible en ventana nueva): remitente desde Pedidos → Ajustes (`ship_from_*` en `store_config`) y destinatario del pedido. No es una guía de paquetería: la guía se compra en la paquetería y su número se captura en "Enviar pedido".
- **Detalle del pedido:** productos con foto, dirección (copiar), correo, WhatsApp, registro de avisos con el **estado del correo al cliente** (Le llegó · Enviado, esperando entrega · Entrega retrasada · No le llegó (rebotó) · No se pudo enviar), **Reenviar confirmación** y **Corregir correo** (guarda el correo nuevo y reenvía), "reenviarme el aviso" y nota interna.

**Mi pedido (`/mi-pedido`, `src/pages/MyOrderPage.tsx`):** ícono de caja junto al carrito (todas las páginas). Muestra los pedidos comprados en ese navegador (`localStorage` `divina-my-orders`, máx. 10) y permite buscar cualquiera con **número de pedido + correo**. Con `?id=` abre ese pedido (liga de los correos). Componente compartido `src/components/OrderView.tsx` + `src/pages/OrderPages.css` (prefijo `op-`), lógica en `src/lib/orderPublic.ts`.
- **Pago Clip (columna):** Aprobado / En proceso / Rechazado / Cancelado / Reembolsado / Sin verificar / Sin cobro / Monto distinto, con el número de autorización o recibo. Clic = consultar a Clip.
- **Candado de envío:** "Enviar pedido" y los estados Enviado/Entregado solo se habilitan si Clip reporta **Aprobado** y el monto cobrado coincide con el total. En el detalle hay "Enviar de todos modos" (con confirmación) por si ya se revisó en el panel de Clip; solo dura mientras la página esté abierta.
- **Pagos Clip (botón y modal):** cobrado en Clip, en proceso, con problema (rechazados, reembolsados, monto distinto o "pagado sin cobro"), sin verificar; tabla con tarjeta, autorización/recibo, monto, estado y última consulta; "Verificar todo con Clip". Fichas del resumen "Cobrado en Clip" y "Por confirmar" lo abren.
- **Clientes:** agrupados por correo; compras y total cuentan solo pedidos pagados. "Enviar email" o "Enviar campaña" abre `/admin/newsletter?para=correo1,correo2` con esos clientes ya seleccionados; si alguno no está en `subscribers`, el aviso permite agregarlo.

## 12. Blog

- Público: `/blog` y `/blog/:slug`, leyendo `blog_posts`.
- El generador de `/admin/blog` **no es inteligencia artificial**: arma borradores con plantillas sobre 9 temas de ingredientes. Permite elegir tema, evita títulos repetidos y genera título, resumen y URL para SEO.
- Los "estudios" que citan las plantillas no están verificados. Revisar antes de publicar.
- Existe una migración (`20260528211435_enable_cron_blog.sql`) que programa una publicación automática cada 3 días llamando a una función `generate-blog-post` de Supabase. **Esa función no está en este repo**; verificar en Supabase si la tarea sigue activa.

## 13. Promotoras

Un enlace con `?ref=CODIGO` guarda el código 30 días en el navegador. En el checkout el código se llena solo y se guarda en el pedido (`promoter_code`). Se administra en `/admin/promotores`.

## 14. SEO y build

`npm run build` hace tres cosas, en orden:

1. `scripts/generate-sitemap.mjs` — lee Supabase y genera `sitemap.xml`.
2. `vite build` — compila la aplicación.
3. `scripts/prerender-seo.mjs` — crea un HTML por producto, colección, artículo y página con su título, descripción y datos estructurados ya escritos, para que Google y las redes los lean sin ejecutar JavaScript.

Consecuencia: un producto nuevo funciona de inmediato en la tienda, pero **su HTML prerenderizado se genera hasta el siguiente deploy** (en el navegador su SEO ya sale completo desde que se crea).

**Reglas (`src/lib/seoRules.js`, octubre 2026)** — se aplican solas a cada producto, también a los nuevos, sin IA ni costo:
- **Título:** marca + nombre limpio (sin MAYÚSCULAS sueltas, "ml" en minúscula, conectores en minúscula, sin ", Original" al final), recortado a ~58 caracteres en coma o palabra + " | Divina Store".
- **Descripción (≤ 158):** "Compra {producto} original a $precio (antes $X si hay descuento ≥ 1 %). {primer beneficio}. Pago seguro con tarjeta. Envío a todo México: $120, gratis desde $999." Se recorta por prioridad (beneficio → "Compra" → pago → nombre).
- **Product schema:** imágenes con URL absoluta, `sku` (id), `gtin` si hay EAN válido, `brand`, `category`, `Offer` con precio, `InStock`, `NewCondition`, envío ($120 o $0 si el producto vale ≥ $999, MX) y **sin devoluciones** (`MerchantReturnNotPermitted`). No se inventan reseñas ni calificaciones.
- **Colecciones:** una sola URL, la del menú: `/coleccion/<nombre>` (cremas-faciales, limpiadores, fotoprotectores, grooming). El slug interno (`cremas-serums`, `…-copia`) sigue abriendo la página pero su canonical apunta a la del menú; el sitemap sólo lleva la del menú.
- **Tienda:** schema `Store` en todas las páginas con `sameAs` = redes del footer (Facebook, X, Instagram) leídas en el build. Sin `SearchAction` (no existe ruta de búsqueda). Sin la frase "hasta 30 % más barato" (retirada por decisión del dueño).
- **Sin duplicados:** el HTML trae el bloque `SEO_PRERENDER_*` para bots sin JavaScript; `src/main.tsx` lo retira al arrancar y Helmet escribe los mismos datos → un solo canonical y un solo Product schema.
- **H1:** todas las páginas tienen uno. Home: título del hero + texto oculto (sólo Google y lectores de pantalla) "Skincare 100% original en México…". Colección y Quiénes somos: H1 oculto si el título se apaga desde el admin.
- **Sitemap:** incluye fotos de cada producto (`image:image`) para Google Imágenes. `lang="es-MX"`.
- **Peso:** el admin se descarga sólo al entrar a `/admin` (`React.lazy`). JS inicial de la tienda: 1,359 KB → 638 KB (408 → 186 KB gzip).

## 15. Variables de entorno (Vercel → Settings → Environment Variables)

Nunca se guardan en el repositorio.

| Variable | Dónde se usa | Pública |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Navegador y build | Sí |
| `VITE_CLIP_API_KEY` | Formulario de tarjeta | Sí |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics | Sí |
| `SUPABASE_URL` | Funciones `/api` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | `sourcing-search`, `admin-users`, `send-email` (avisos de pedido), `charge-clip` (marcar pagado), `clip-verify` | **No** |
| `CLIP_API_KEY`, `CLIP_SECRET` | Cobro y `clip-verify` (prueba `CLIP_API_KEY`; si Clip responde 401/403, usa `CLIP_SECRET`) | **No** |
| `RESEND_API_KEY` | Correo | **No** |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE` | Buscador de proveedores | **No** |
| `SUPABASE_SERVICE_KEY`, `CLIP_API_URL`, `CLIP_API_URL_SECURE` | Solo el código antiguo de Clip | No |

## 16. Cómo se publica un cambio

1. Editar en la carpeta local del repo (`C:\Proyectos\GIT-DIVINA`).
2. Si el cambio trae un `.sql` nuevo, va en `supabase/migrations/`: la Action `.github/workflows/supabase-migrations.yml` lo aplica sola al hacer push (requiere los secretos `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`). Resultado en la pestaña Actions de GitHub.
3. GitHub Desktop → Commit → Push a `main`.
4. Vercel publica solo en uno o dos minutos.

Para trabajar en local: `npm install`, crear un `.env` con las variables `VITE_*` y `npm run dev` (puerto 3000). Las funciones `/api` no corren con `npm run dev`; para probarlas se usa `vercel dev` o el sitio publicado.

`npm run lint` revisa tipos. Hoy marca 3 errores viejos (en `ProductPage.tsx`, `BlogPage.tsx` y `BlogPostPage.tsx`) que no impiden el build.

## 17. Reglas para no romper nada

- **Antes de usar una columna, confirmar que existe.** Ya pasó con `sku`: el catálogo dejó de cargar.
- **No escribir en `store_config` a espaldas de `AdminConfig`** (sección 8).
- **Ruta nueva con parámetro → agregarla en `vercel.json`.**
- **Los estilos del admin van con prefijo** (`.adm-`, `.src-`, `.cat-`, `.ord-`, `.cpn-`, `.aut-`) y los del checkout con `.cv2__`, para no chocar con la tienda.
- **Los textos de la tienda son blancos.** Un fondo claro los vuelve ilegibles; el admin avisa.
- **Probar en navegador real** a 1440, ~1180 y 390 px antes de publicar.

## 17 bis. Diseño de la tienda (octubre 2026)

- **Paleta de marca** en `src/styles/index.css`: `--b-green-*` (verde profundo), `--b-sage*` (salvia), `--b-charcoal`, `--b-graphite`, `--b-cream`.
- Toda la tienda pública va dentro de `<div class="store">` (en `App.tsx`). Ahí el acento antiguo `--c-lime` se redefine a salvia, así que cualquier estilo viejo que use `var(--c-lime)` toma el color nuevo. **El admin queda fuera** y conserva el lima.
- **Forma "hoja"** (`--b-leaf`, `--b-leaf-alt`): dos esquinas amplias y dos casi rectas, tomada del logo. La usan las tarjetas de producto, las de categoría y la tarjeta del hero.
- **Encabezado:** transparente sobre la foto; al bajar se vuelve barra sólida (`.header--scrolled`).
- **Redes sociales** (`src/components/SocialIcons.tsx`): Facebook, X e Instagram. Los enlaces se capturan en Admin → Footer → Redes sociales (`footer_facebook_url`, `footer_x_url`, `footer_instagram_url`; el antiguo `footer_twitter_url` sirve de respaldo para X). Se muestran en el footer y como columna vertical a la izquierda del hero del Home (en celular, centrada sobre la foto). Solo aparece el ícono que tiene enlace.
- **Footer en tres pisos:** newsletter, marca + enlaces, barra legal. El newsletter guarda en `subscribers` con `source: 'footer'`.
- **Checkout editable** en Admin → Tu tienda → **Checkout (pago)** (`/admin/config?section=checkout`). Llaves `checkout_*` en `store_config`: imágenes `checkout_hero_img`, `checkout_trustbar_img`, `checkout_payment_img`, `checkout_side_img`, `checkout_footer_img` (vacío = imagen original de `public/checkout/`), visibilidad `checkout_show_trustbar|side|footer`, colores `checkout_bg`, `checkout_card_bg`, `checkout_text`, `checkout_summary_bg`, `checkout_summary_text`, `checkout_accent` y letra `checkout_font` (Google Fonts). Valores por defecto en `CHECKOUT_DEFAULTS` (`CheckoutPage.tsx`). La vista previa del admin muestra 2 productos de ejemplo si el carrito está vacío y bloquea el pago.
- La imagen principal del checkout va a todo lo ancho desde el borde superior y **el menú queda encima** (sin `padding-top`); si se quita la imagen se deja el espacio del menú. Los logos de pago ocupan todo el ancho del resumen.
- **Ficha de producto** (`ProductPage.tsx` + `ProductPage.css`, clases `.pdp-*`): ruta compacta; galería con miniaturas verticales, corte diagonal y zoom que sigue al cursor; precio, 3 beneficios (la descripción en formato `TÍTULO: texto` se convierte en lista), cantidad + "Agregar · $total" y "Comprar ahora" (agrega y va a `/checkout`); envío gratis desde $999, producto original, pago seguro; acordeón de detalles (descripción, modo de uso, ingredientes, preguntas) que solo muestra lo que tiene datos; 4 relacionados (misma marca, luego misma categoría); barra fija de compra en celular. Se conservan Helmet, Schema.org y canonical. **Las etiquetas internas (`bajo-pedido`, `TOP_HOME`, `BADGE:*`) ya no se muestran como texto**; `BADGE:X` se ve como insignia sobre la foto.
- **Insignias** (`BADGE:*` en tarjetas y ficha): salvia nacarada con punto que late y destello; el descuento va en verde profundo. Un descuento menor a 1 % no se muestra.
- **Carrito vacío → "Te recomendamos"** (`CartDrawer.tsx`): 3 productos al azar, en existencia y con foto (de `getProducts(60)`, se cargan una vez y se barajan cada vez que se abre). Foto cuadrada con corte diagonal (dos esquinas redondeadas y dos rectas, `--rc-cut`), tarjeta de cristal con brillo al pasar el cursor y nombre abajo; clic lleva a `/producto/:slug`. **Con productos en el carrito no se muestra.**

## 18. Pendientes conocidos

- **SMS de pedido nuevo:** no está. SMS real cuesta por mensaje (Twilio, etc.). Opciones gratis evaluadas: notificación push de Gmail con un filtro para el correo de aviso, bot de Telegram o ntfy.sh (push al celular). Hoy el aviso llega por correo.
- **Pagos con verificación del banco (3-D Secure):** decidido no implementarlo (29-oct-2026). El pago no aprobado cancela el pedido y la clienta ve "Tu compra no fue satisfactoria. Intenta con otra tarjeta."
- **Migración `20261029200000_orders_followup.sql`:** columnas del estado del correo al cliente. Se aplica sola con la Action de GitHub si tiene sus 3 secretos.
- **Cálculo de margen (Abastecimiento):** valores acordados: comisión Clip 5 % total (sin IVA extra, sin cuota fija) y colchón de envío $20 por venta (`sourcing_customer_shipping`); el envío real se cobra aparte al cliente. Se guardan en `store_config` (`sourcing_*`).
- **Coincidencia:** un anuncio que junta dos productos ("Lambdacaps + Lambdapil", "Loción + Champú"; no cuenta "SPF 50+") es **No confirmada** (combo). "Champú" = "shampoo". Se ignoran palabras de relleno de títulos de Amazon (ayuda, reducir, estimula, crecimiento, cabello, capilar…). Si el anuncio no trae la marca ni el nombre de la línea, es No confirmada.
- **Mejor costo** solo toma ofertas *exactas*, no sospechosas (< 45 % de la mediana) y de tiendas no descartadas; una *probable* se ve en la lista pero no cuenta.
- **Seguridad:** `products.cost_price` (costo de proveedor) y ahora `sourcing_note`/`search_query` se pueden leer con la llave pública. Falta ocultarlos al público (vista pública de productos o permisos por columna).
- **Migración `20261029120000_sourcing_auto.sql`:** abastecimiento automático (sección 10 bis). Antes de que se aplique, la tienda y el buscador siguen funcionando; las pantallas nuevas muestran el aviso.
- **Días de entrega por tienda:** ya no bloquean la revisión automática (29-oct-2026). Siguen usándose en Oportunidades y en "Pedidos por comprar" (Verificar proveedor), que aún usan la regla anterior.
- **Search Console:** después del deploy, enviar `https://www.divinastore.com.mx/sitemap.xml` y pedir indexación de las 4 colecciones (cambiaron de URL canónica).
- **Feed de Google Merchant Center** (productos gratis en Google Shopping): no está; el schema ya trae precio, envío y política sin devoluciones.
- **Migración `20261009120000_orders_clip.sql`:** debe correrse en Supabase para que exista la columna Pago Clip y el candado.
- **Migración `20261025120000_coupons.sql`:** crea `coupons`, `validate_coupon`, columnas `orders.coupon_code`/`discount_amount` y el primer cupón `DESCUENTO202610`. Hasta correrla, `/admin/cupones` muestra el aviso y la tienda solo acepta ese código.

**Revisión del proceso de compra (25-oct-2026)** — hallazgos, sin cambios aplicados:
- ~~Crítico — monto del cobro sin verificar~~ **Resuelto el 29-oct-2026:** `charge-clip` recalcula y cobra el total del servidor (sección 10 bis, punto 4).
- **Pedido marcado `paid` desde el navegador** (`updateOrderStatus` tras el cobro). El servidor ya lo marca; revisar en Supabase que la regla de `orders` no permita a la llave pública cambiar `status`.
- **Al aplicar un cupón en el checkout se vuelve a montar el formulario de tarjeta de Clip** (el efecto depende de `finalTotal`) y se borra lo que la clienta ya había escrito.
- **Enlaces rotos:** "Términos y Condiciones" (`/terminos`) y "Aviso de Privacidad" (`/privacidad`) no tienen ruta: dan 404.
- **"Hasta 12 MSI según tu banco"** en el resumen, pero el cobro va con `installments: 1`.
- **Teléfono, CP y colonia** no se validan antes de pagar (solo nombre, correo, calle y ciudad).
- **El carrito se reabre solo** al recargar si estaba abierto (`isOpen` se guarda en `localStorage`).
- `removeItem` quita por producto e ignora la variante.
- **Guías automáticas:** la etiqueta es imprimible pero no genera guía; integrar una paquetería o agregador requiere su cuenta y su API.

- Rotar la llave de Bright Data (se compartió por chat) y actualizarla en Vercel.
- Capturar la comisión real de Clip en Abastecimiento → Márgenes.
- Decidir si se quitan las citas de estudios del generador de blog.
- La imagen de métodos de pago del checkout muestra PayPal, Discover, Diners y SPEI, pero solo se cobra con tarjeta; los sellos prometen "30-day money back" y "24/7 support".
- El campo Referencia del checkout viene prellenado con "Casa".
- Borrar el código antiguo de Clip y los archivos sueltos de la raíz, una vez confirmado que nada los usa.
