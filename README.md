# Divina E-Commerce Platform

Plataforma de e-commerce "headless" moderna construida con React y conectada a un backend de Supabase. Este proyecto incluye tanto el escaparate (storefront) para clientes como un panel de administración personalizado (Admin Dashboard) para gestionar el catálogo y la configuración visual.

## Tecnologías Principales (Tech Stack)

*   **Frontend Framework**: React 19 + TypeScript
*   **Build Tool**: Vite
*   **Estilos**: Tailwind CSS v4 + Vanilla CSS para estilos específicos
*   **Gestión de Estado**: Zustand
*   **Backend & Base de Datos**: Supabase (Autenticación, Database, Storage)
*   **Routing**: React Router DOM
*   **Animaciones**: Framer Motion y GSAP
*   **Manejo de Archivos**: React Dropzone y XLSX (para importación de productos)

## Estructura del Proyecto

El código fuente de la aplicación se encuentra en la carpeta `src/`. *(Nota: Hay archivos `.liquid` y copias de seguridad de componentes en la raíz que parecen provenir de un entorno anterior basado en Shopify o respaldos).*

```text
src/
├── components/     # Componentes UI reutilizables (Header, Footer, CartDrawer, etc.)
├── hooks/          # Custom React hooks
├── lib/            # Utilidades y configuración de servicios (ej. supabase.ts)
├── pages/          # Vistas principales de la aplicación
│   ├── admin/      # Vistas del Panel de Administración (Config, Import, Login, etc.)
│   └── ...         # Vistas de la tienda (HomePage, CatalogPage, ProductPage, etc.)
├── sections/       # Secciones dinámicas de las páginas (HeroSection, DynamicSections, etc.)
├── store/          # Stores de Zustand (ej. cartStore.ts)
├── styles/         # Estilos globales y tokens
├── types.ts        # Definiciones de tipos globales de TypeScript
└── main.tsx        # Punto de entrada de la aplicación
```

## Scripts Disponibles

En el directorio del proyecto, puedes ejecutar:

*   `npm run dev`: Inicia el servidor de desarrollo en modo local (puerto 3000).
*   `npm run build`: Compila la aplicación para producción.
*   `npm run preview`: Previsualiza el build de producción localmente.

## Notas de Desarrollo

1.  **Panel de Administración**: Se encuentra en las rutas bajo `/admin`. Permite importar productos vía Excel, configurar la vista del Hero, y gestionar categorías dinámicamente con previsualización en tiempo real.
2.  **Archivos en Raíz**: La raíz del proyecto contiene actualmente una gran cantidad de archivos `.liquid`, `.json`, `.css` y `.tsx` mezclados. El código base activo y en funcionamiento es el que se encuentra estrictamente dentro de la carpeta `src/`.
3.  **Animaciones**: El proyecto utiliza intensivamente efectos visuales modernos como "glassmorphism", burbujas dinámicas y transiciones suaves gestionadas por Framer Motion y GSAP.
