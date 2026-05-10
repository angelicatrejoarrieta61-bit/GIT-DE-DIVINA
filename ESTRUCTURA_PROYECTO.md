# Documentación Técnica - Divina Store

## Arquitectura del Sitio
El proyecto está desarrollado bajo un stack moderno de alto rendimiento:

### 1. Frontend (Interfaz de Usuario)
- **Framework**: React.js (v18+)
- **Lenguaje**: TypeScript (para robustez del código)
- **Bundler**: Vite (carga ultra-rápida)
- **Estilos**: Vanilla CSS (Diseño premium a medida)

### 2. Backend (Lógica y Datos)
- **Base de Datos**: Supabase (PostgreSQL en la nube)
- **Funciones API**: Vercel Serverless Functions (Node.js / TypeScript)
- **Emailing**: Resend API (Newsletter y Contacto)
- **Almacenamiento**: Supabase Storage (Imágenes de productos y banners)

### 3. Estructura de Carpetas
- `/src`: Contiene toda la lógica visual, componentes y páginas de la tienda.
- `/src/pages/admin`: Panel de control para gestión de inventario y newsletter.
- `/api`: Funciones de servidor que se ejecutan en Vercel (envío de mails, pagos).
- `/lib`: Configuraciones de conexión con Supabase.

### 4. Flujo del Newsletter
- **Captura**: Los correos se guardan en la tabla `subscribers` de Supabase.
- **Editor**: Construido en React, genera un HTML dinámico y compacto.
- **Envío**: Se procesa de forma secuencial desde el cliente hacia la API de Resend para evitar bloqueos de servidores SMTP tradicionales.

---
© 2026 DIVINA STORE — Documentación de Ingeniería.
