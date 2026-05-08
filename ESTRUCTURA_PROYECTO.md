# 📁 Estructura del Proyecto — Divina Store MX

## ⚠️ REGLA MÁS IMPORTANTE

> **TODO el código fuente real está en la carpeta `/src/`**
> Los archivos `.tsx` que están en la RAÍZ del proyecto (AdminLayout.tsx, App.tsx, etc.)
> son copias de referencia antiguas. **NO SE USAN en el build.**
> **NUNCA edites los archivos de la raíz.**

---

## 📂 Estructura correcta

```
GIT DE DIVINA/
├── src/                          ← AQUÍ está todo el código real
│   ├── main.tsx                  ← Entry point (lo carga index.html)
│   ├── App.tsx                   ← Rutas principales ✅
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── AdminLayout.tsx   ← Sidebar del admin ✅
│   │   │   ├── AdminConfig.tsx   ← Editor de secciones ✅
│   │   │   ├── AdminMessages.tsx ← ✉️ Mensajes de clientes ✅ NUEVO
│   │   │   ├── AdminNewsletter.tsx ← 📢 Campañas de email ✅ NUEVO
│   │   │   ├── AdminOrderReports.tsx ← 📊 Reportes de ventas ✅
│   │   │   ├── AdminLogin.tsx
│   │   │   ├── AdminImport.tsx
│   │   │   └── AdminProducts.tsx
│   │   ├── HomePage.tsx
│   │   ├── CollectionPage.tsx
│   │   ├── ContactPage.tsx
│   │   └── ...
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx            ← Newsletter suscripción → info@
│   │   ├── ContactModal.tsx      ← Mensajes → admin@
│   │   └── ...
│   └── lib/
│       ├── supabase.ts           ← Conexión a base de datos
│       └── queries.ts            ← Consultas a Supabase
├── index.html                    ← Carga src/main.tsx
├── vite.config.ts                ← Configuración del build
├── vercel.json                   ← Config de deploy (SPA rewrites)
└── package.json
```

---

## 🚀 Rutas del Admin

| URL | Componente | Función |
|-----|-----------|---------|
| `/admin/config?section=site-general` | AdminConfig | Configuración general |
| `/admin/config?section=products-config` | AdminConfig | Tabla maestra de productos |
| `/admin/config?section=grooming` | AdminConfig | Hero y productos de Grooming |
| `/admin/reportes` | AdminOrderReports | Ventas y pedidos |
| `/admin/mensajes` | AdminMessages | ✉️ Mensajes de contacto |
| `/admin/newsletter` | AdminNewsletter | 📢 Campañas de email |

---

## 📧 Canales de Comunicación

| Email | Propósito |
|-------|-----------|
| `admin@divinastore.com.mx` | Soporte técnico, comentarios de clientes, gestión de pedidos |
| `info@divinastore.com.mx` | Marketing, registros de newsletter, suscripciones |

---

## 🔄 Cómo subir cambios a GitHub (siempre desde esta carpeta)

```bash
# Desde la carpeta: GIT DE DIVINA
git add .
git commit -m "descripción del cambio"
git push
```

> Vercel detecta el push automáticamente y hace el rebuild en ~2 minutos.
> Si no ves cambios, verifica en vercel.com → proyecto `git-de-divina` → Deployments.

---

## 🗑️ Archivos en la raíz que NO SE USAN en el build

Los siguientes archivos en la raíz son copias antiguas y **no afectan al sitio en vivo**:
- `AdminLayout.tsx` (raíz)
- `AdminConfig.tsx` (raíz)
- `App.tsx` (raíz)
- `App-1.tsx`, `App-2.tsx` (raíz)
- Todos los archivos `.liquid` (son de Shopify, no de este proyecto)

*Última actualización: Mayo 2026*
