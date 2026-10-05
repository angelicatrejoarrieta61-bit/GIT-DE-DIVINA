# Divina Store MX — Arquitectura y conexiones

**Actualizado:** 4 de octubre de 2026 · **Admin:** v1.3
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
  store/cartStore.ts    carrito y cupón
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
| `sourcing.ts` | Lógica del buscador de proveedores: coincidencia exacta, margen, envío, comisión de Clip |
| `blog-queries.ts` | Lecturas y escrituras del blog |
| `promoterTracking.ts` | Guarda el código de promotora (`?ref=`) 30 días |
| `analytics.ts` | Eventos de Google Analytics |

## 6. Base de datos (Supabase)

| Tabla | Contenido |
|---|---|
| `products` | Catálogo. Columnas clave: `name, slug, brand, price, compare_price, image_url, images, collection_id, in_stock, stock, tags, ean, cost_price, fulfillment`. **No existe `sku`.** |
| `collections` | Categorías: `name, slug, image_url, description, sort_order` |
| `orders` | Pedidos. `status`: `pending`, `paid`, `shipped`, `delivered`, `cancelled` |
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

**Públicas:** `/`, `/catalogo`, `/coleccion/:slug`, `/producto/:slug`, `/blog`, `/blog/:slug`, `/quienes-somos`, `/contacto`, `/programa-promocion`, `/info/:slug` (páginas creadas desde el admin), `/checkout`, `/pago-exitoso`, `/pago-error`.

**Admin** (requiere sesión de Supabase; entrada en `/admin/login`):

| Ruta | Pantalla |
|---|---|
| `/admin` | Resumen: ventas del mes, por surtir, sin foto, mensajes |
| `/admin/reportes` | Pedidos |
| `/admin/productos` | Catálogo unificado: precio, marca, fotos, badge, Home |
| `/admin/abastecimiento` | Buscador de proveedores |
| `/admin/config?section=…` | Diseño de la tienda (General, Home, colecciones, páginas, Clip) |
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
5. Si Clip pide verificación del banco (3-D Secure), se redirige al usuario; si no, el pedido pasa a `paid` y se va a `/pago-exitoso`.

**Código antiguo que sigue en el repo y no usa el checkout actual:** `api/clip-payment.ts`, `api/clip-card-token.ts`, `api/clip-installments.ts`, `api/clip-webhook.ts`, `api/create-payment.ts`, `api/test-clip.ts` y `src/hooks/useClipPayment.ts`. Antes de borrarlos, confirmar en el panel de Clip que no haya un webhook apuntando a `clip-webhook`.

**Cupón:** hay un solo código de descuento (10 %) escrito directamente en `src/store/cartStore.ts`. No se administra desde el panel.

## 10. Buscador de proveedores (Abastecimiento)

**Objetivo:** dado un producto, encontrar en qué tiendas de México se vende, a qué precio, y cuánto margen deja. Solo busca cuando el administrador presiona Buscar.

**Recorrido de una búsqueda:**

1. `AdminSourcing.tsx` envía a `/api/sourcing-search` el texto (nombre, marca o código de barras) junto con el token de sesión del admin.
2. La función valida la sesión, aplica un límite de uso y revisa si esa búsqueda ya se hizo en las últimas **6 horas**; si es así, devuelve lo guardado sin gastar consulta.
3. Si no, llama a Bright Data, que abre Google Shopping México (`google.com/search?...&udm=28&gl=mx`) y devuelve las ofertas ya estructuradas.
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

## 11. Correo (Resend)

Todo pasa por `/api/send-email`, según el campo `type`:

| `type` | Cuándo | Requiere sesión de admin |
|---|---|---|
| `contact` | Formulario de contacto | No |
| `newsletter` | Alta al newsletter | No |
| `promoter-welcome` | Alta de promotora | No |
| `test`, `campaign` | Envíos desde el admin | Sí |

Remitente: `admin@divinastore.com.mx`. Los avisos llegan a `info@divinastore.com.mx`.

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

Consecuencia: un producto nuevo funciona de inmediato en la tienda, pero **su SEO se genera hasta el siguiente deploy**.

## 15. Variables de entorno (Vercel → Settings → Environment Variables)

Nunca se guardan en el repositorio.

| Variable | Dónde se usa | Pública |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Navegador y build | Sí |
| `VITE_CLIP_API_KEY` | Formulario de tarjeta | Sí |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics | Sí |
| `SUPABASE_URL` | Funciones `/api` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | `sourcing-search`, `admin-users`, `send-email` | **No** |
| `CLIP_API_KEY`, `CLIP_SECRET` | Cobro | **No** |
| `RESEND_API_KEY` | Correo | **No** |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE` | Buscador de proveedores | **No** |
| `SUPABASE_SERVICE_KEY`, `CLIP_API_URL`, `CLIP_API_URL_SECURE` | Solo el código antiguo de Clip | No |

## 16. Cómo se publica un cambio

1. Editar en la carpeta local del repo.
2. Si el cambio trae un `.sql` nuevo, ejecutarlo en Supabase → SQL Editor.
3. GitHub Desktop → Commit → Push a `main`.
4. Vercel publica solo en uno o dos minutos.

Para trabajar en local: `npm install`, crear un `.env` con las variables `VITE_*` y `npm run dev` (puerto 3000). Las funciones `/api` no corren con `npm run dev`; para probarlas se usa `vercel dev` o el sitio publicado.

`npm run lint` revisa tipos. Hoy marca 3 errores viejos (en `ProductPage.tsx`, `BlogPage.tsx` y `BlogPostPage.tsx`) que no impiden el build.

## 17. Reglas para no romper nada

- **Antes de usar una columna, confirmar que existe.** Ya pasó con `sku`: el catálogo dejó de cargar.
- **No escribir en `store_config` a espaldas de `AdminConfig`** (sección 8).
- **Ruta nueva con parámetro → agregarla en `vercel.json`.**
- **Los estilos del admin van con prefijo** (`.adm-`, `.src-`, `.cat-`) y los del checkout con `.cv2__`, para no chocar con la tienda.
- **Los textos de la tienda son blancos.** Un fondo claro los vuelve ilegibles; el admin avisa.
- **Probar en navegador real** a 1440, ~1180 y 390 px antes de publicar.

## 17 bis. Diseño de la tienda (octubre 2026)

- **Paleta de marca** en `src/styles/index.css`: `--b-green-*` (verde profundo), `--b-sage*` (salvia), `--b-charcoal`, `--b-graphite`, `--b-cream`.
- Toda la tienda pública va dentro de `<div class="store">` (en `App.tsx`). Ahí el acento antiguo `--c-lime` se redefine a salvia, así que cualquier estilo viejo que use `var(--c-lime)` toma el color nuevo. **El admin queda fuera** y conserva el lima.
- **Forma "hoja"** (`--b-leaf`, `--b-leaf-alt`): dos esquinas amplias y dos casi rectas, tomada del logo. La usan las tarjetas de producto, las de categoría y la tarjeta del hero.
- **Encabezado:** transparente sobre la foto; al bajar se vuelve barra sólida (`.header--scrolled`).
- **Footer en tres pisos:** newsletter, marca + enlaces, barra legal. El newsletter guarda en `subscribers` con `source: 'footer'`.
- El checkout (`.cv2`) todavía usa su propio lima; no se ha pasado a la paleta nueva.

## 18. Pendientes conocidos

- Rotar la llave de Bright Data (se compartió por chat) y actualizarla en Vercel.
- Capturar la comisión real de Clip en Abastecimiento → Márgenes.
- Decidir si se quitan las citas de estudios del generador de blog.
- La imagen de métodos de pago del checkout muestra PayPal, Discover, Diners y SPEI, pero solo se cobra con tarjeta; los sellos prometen "30-day money back" y "24/7 support".
- El campo Referencia del checkout viene prellenado con "Casa".
- Borrar el código antiguo de Clip y los archivos sueltos de la raíz, una vez confirmado que nada los usa.
- Mover el cupón a la base de datos si se quieren más códigos.
