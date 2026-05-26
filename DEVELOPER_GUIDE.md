# Guía de Desarrollo y Arquitectura Técnica — Divina Store MX
**Fecha de actualización:** 26 de Mayo, 2026

Esta guía documenta la arquitectura técnica, flujos clave de datos, configuraciones de base de datos e integraciones de terceros del proyecto. Está diseñada para que cualquier desarrollador pueda comprender e iterar sobre el sistema de manera rápida y segura.

---

## 1. Conexión y Base de Datos (Supabase)

La plataforma utiliza **Supabase** como backend serverless para la base de datos (PostgreSQL), autenticación y almacenamiento de archivos.

### Archivos de Configuración
*   **Cliente Supabase:** [src/lib/supabase.ts](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/lib/supabase.ts) inicializa la conexión con `createClient` utilizando las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
*   **Funciones de Consulta (Queries Master):** [src/lib/queries.ts](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/lib/queries.ts) contiene todas las llamadas a tablas (lectura, inserción, actualización, eliminación).

### Tablas Principales en Supabase
1.  **`products`**: Almacena el catálogo de productos (SKU, título, marca, precio, stock, descripción, tags e imágenes).
2.  **`collections`**: Almacena los datos de colecciones/categorías de la tienda.
3.  **`orders`**: Registra los pedidos con información del cliente, dirección, lista de productos y estado de pago (`pending`, `paid`, `shipped`, `delivered`, `cancelled`).
4.  **`store_config`**: Tabla llave-valor (`key`, `value`) donde se guardan configuraciones dinámicas del sitio (textos del hero, imágenes de banners, coordenadas de tarjetas, números de contacto, etc.).
5.  **`subscribers`**: Lista de correos suscritos al newsletter de promociones.
6.  **`contact_messages`**: Mensajes enviados a través de formularios de contacto (página de contacto y modales flotantes).

---

## 2. Panel de Administración y Configuración Dinámica

El Dashboard de Administración reside en las rutas `/admin/*` y gestiona las siguientes secciones principales:

*   **Configuración Visual (`/admin/config`):** Controlada por [AdminConfig.tsx](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/pages/admin/AdminConfig.tsx).
*   **Reportes e Historial (`/admin/reportes`):** Controlada por [AdminOrderReports.tsx](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/pages/admin/AdminOrderReports.tsx).
*   **Importador Masivo (`/admin/import`):** Permite subir archivos de Excel para actualizar el inventario masivamente.

### Funcionamiento de la Vista Previa en Tiempo Real
El panel de administración incluye un **Live Preview (Iframe)** a la derecha de los controles. 
1. Cuando el administrador realiza cambios en la configuración (ej. arrastrar controles deslizantes de posición o editar textos), estos se actualizan en el estado local de `AdminConfig.tsx`.
2. A través de un `useEffect` y una referencia al Iframe (`iframeRef.current`), el componente emite un evento `postMessage` con tipo `'ADMIN_PREVIEW_UPDATE'` y un payload que contiene las configuraciones modificadas.
3. La página receptora de la previsualización escucha este evento mediante `window.addEventListener('message', ...)` y actualiza su estado local inmediatamente, permitiendo ver los cambios en tiempo real antes de guardarlos.
4. Al hacer clic en "Guardar", se realiza un `upsert` masivo de la configuración en la tabla `store_config` de Supabase.

---

## 3. Flujo de Carrito, Cupones y Checkout

### Gestión de Estado de Carrito
El carrito de compras está implementado en Zustand bajo [src/store/cartStore.ts](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/store/cartStore.ts) utilizando el middleware `persist` para guardar su estado automáticamente en `localStorage` bajo el nombre `'divina-cart'`.

### Lógica de Cupones
El sistema de cupones se integra directamente en Zustand e incluye soporte para el cupón de descuento **`DESCUENTO202610`** (10% de descuento):
*   `applyCoupon(code)`: Valida el código (case-insensitive) y establece el porcentaje de descuento.
*   `discountAmount()`: Calcula el descuento sobre el subtotal (`total() * 0.10`).
*   `totalAfterDiscount()`: Devuelve el total final restando el descuento.
*   Al concretarse o vaciarse la compra (`clearCart`), el cupón se reinicia.

El formulario de cupones está disponible en dos puntos críticos:
1.  **`CartDrawer.tsx` (Carrito lateral):** Permite aplicar el descuento en tiempo real antes de ir al checkout.
2.  **`CheckoutPage.tsx` (Página de pago):** Muestra el desglose completo de Subtotal, Descuento y Total en el resumen de compra y permite ingresar o eliminar el cupón.

### Flujo de Pago Integrado con Clip SDK
El cobro se procesa mediante tarjetas de crédito/débito utilizando el SDK web de **Clip México**:
1.  El SDK oficial de Clip se inicializa en [CheckoutPage.tsx](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/pages/CheckoutPage.tsx) montándose en `#clip-card-container`. El SDK se re-inicializa automáticamente si cambia el monto total a pagar (por ejemplo, si se aplica o elimina el cupón de descuento).
2.  Al pulsar "Pagar", el SDK genera un token seguro de tarjeta en el cliente (`cardToken()`).
3.  Se crea primero un pedido en la tabla `orders` de Supabase con estado `pending`.
4.  Se envía el token seguro, el ID del pedido y el total final (con descuento aplicado si corresponde) al endpoint de la API `/api/charge-clip`.
5.  Si el banco emisor requiere autenticación adicional (3DS), Clip redirige al usuario a la URL bancaria.
6.  Al confirmarse el cobro, la orden se actualiza a estado `paid` en Supabase y el carrito es vaciado.

---

## 4. Cambios Realizados y Correcciones Clave (26 de Mayo, 2026)

### Casilla de Registro (Checkbox) Personalizada
*   **Problema:** Los resets de estilos por defecto de Tailwind CSS v4 aplican `appearance: none` a los inputs nativos, haciendo que los checkboxes fueran invisibles en los formularios de contacto.
*   **Solución:** Se implementó una regla en `index.css` para forzar la apariencia nativa y, además, se reemplazaron los inputs nativos por **casillas interactivas personalizadas (Custom Checkbox)** en `ContactPage.tsx`, `ContactModal.tsx`, y `FloatingContactBubble.tsx`. Estas casillas se controlan mediante estado de React y renderizan físicamente el caracter `✓` sobre un recuadro lime con transiciones de color, eliminando fallos en navegadores móviles.

### Burbuja de Contacto Flotante
*   Se creó e integró el componente [FloatingContactBubble.tsx](file:///C:/Users/user/Downloads/repofinalGIT/GITDIVINA%20FINAL/GIT%20DE%20DIVINA/src/components/FloatingContactBubble.tsx) en el layout público global.
*   Permite a los usuarios iniciar chats de WhatsApp o enviar mensajes de contacto directos desde cualquier sección pública.
*   Su modal de contacto y el modal global de políticas (`LegalModal.tsx`) se rediseñaron con un estilo **glassmorphic translúcido** premium utilizando `background: rgba(244, 249, 250, 0.85)` y `backdrop-filter: blur(10px)` para difuminar el fondo del sitio.

### Número de WhatsApp de Contacto
*   Se actualizó el número predeterminado/fallback de WhatsApp en toda la plataforma (página de contacto, modales de contacto, burbuja flotante y campos por defecto de la administración) al nuevo número **`525513848670`** (sin el prefijo `1` intermedio de móviles antiguos).

### Corrección en Borrado de Pedidos en Administración
*   **Problema:** Al pulsar "Empezar de cero", la base de datos arrojaba el error `22P02: invalid input syntax for type uuid: "0"` debido a que la consulta realizaba un filtro `.neq('id', '0')` sobre una columna de tipo UUID.
*   **Solución:** Se modificó la consulta maestra de eliminación en `queries.ts` para usar el filtro **`.not('id', 'is', null)`**. Esto no causa ningún conflicto de tipos con columnas UUID y selecciona correctamente todas las filas existentes en la base de datos (ya que la clave primaria nunca es nula).
*   **Lógica de "Empezar de Cero":** Se conectó este botón para llamar a `deleteUnpaidOrders()`, lo que elimina permanentemente los pedidos de prueba no pagados y preserva de manera segura los registros de ventas reales (`paid`, `shipped`, `delivered`), refrescando el panel en tiempo real de forma dinámica.
