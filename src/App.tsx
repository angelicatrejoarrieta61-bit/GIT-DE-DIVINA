import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';
import { ProductPage } from './pages/ProductPage';
import { QuienesSomosPage } from './pages/QuienesSomosPage';
import { ContactPage } from './pages/ContactPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentSuccessPage } from './pages/PaymentSuccessPage';
import { PaymentErrorPage } from './pages/PaymentErrorPage';
import { StoreThemeProvider } from './components/StoreThemeProvider';
import { FloatingContactBubble } from './components/FloatingContactBubble';
import { CatalogPage } from './pages/CatalogPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { trackPageView } from './lib/analytics';
import { capturePromoterReferral } from './lib/promoterTracking';
import { PromotionProgramPage } from './pages/PromotionProgramPage';
import { InfoPage } from './pages/InfoPage';
import { BlogPage }     from './pages/blog/BlogPage';
import { BlogPostPage } from './pages/blog/BlogPostPage';

// ── Admin: se descarga sólo al entrar a /admin (no pesa en la tienda pública) ──
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin').then((m) => ({ default: m.AdminLogin })));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts').then((m) => ({ default: m.AdminProducts })));
const AdminImport = lazy(() => import('./pages/admin/AdminImport').then((m) => ({ default: m.AdminImport })));
const AdminConfig = lazy(() => import('./pages/admin/AdminConfig').then((m) => ({ default: m.AdminConfig })));
const AdminOrderReports = lazy(() => import('./pages/admin/AdminOrderReports').then((m) => ({ default: m.AdminOrderReports })));
const AdminMessages = lazy(() => import('./pages/admin/AdminMessages').then((m) => ({ default: m.AdminMessages })));
const AdminNewsletter = lazy(() => import('./pages/admin/AdminNewsletter').then((m) => ({ default: m.AdminNewsletter })));
const AdminBlog = lazy(() => import('./pages/admin/AdminBlog').then((m) => ({ default: m.AdminBlog })));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminPromoters = lazy(() => import('./pages/admin/AdminPromoters').then((m) => ({ default: m.AdminPromoters })));
const AdminSourcing = lazy(() => import('./pages/admin/AdminSourcing').then((m) => ({ default: m.AdminSourcing })));
const AdminHome = lazy(() => import('./pages/admin/AdminHome').then((m) => ({ default: m.AdminHome })));


function RouteRedirector() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetPath = params.get('admin_path');
    if (targetPath && location.pathname !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [navigate, location]);
  return null;
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreThemeProvider>
      <div className="store">
        <Header />
        <main>{children}</main>
        <Footer />
        <CartDrawer />
        <FloatingContactBubble />
      </div>
    </StoreThemeProvider>
  );
}

function AnalyticsRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    capturePromoterReferral(location.search);
    const timer = window.setTimeout(() => trackPageView(`${location.pathname}${location.search}`), 0);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);
  return null;
}

function NoIndex({ children }: { children: React.ReactNode }) {
  return <><Helmet><meta name="robots" content="noindex, nofollow" /></Helmet>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteRedirector />
      <AnalyticsRouteTracker />
      <Suspense fallback={<div className="admin-lazy-fallback" role="status" aria-label="Cargando" style={{ minHeight: '100vh' }} />}>
      <Routes>
        {/* Admin routes — no header/footer */}
        <Route path="/admin/login" element={<NoIndex><AdminLogin /></NoIndex>} />
        <Route path="/admin" element={<NoIndex><AdminLayout /></NoIndex>}>
          <Route index element={<AdminHome />} />
          <Route path="productos"  element={<AdminProducts />} />
          <Route path="abastecimiento" element={<AdminSourcing />} />
          <Route path="import"     element={<AdminImport />} />
          <Route path="config"     element={<AdminConfig />} />
          <Route path="reportes"   element={<AdminOrderReports />} />
          <Route path="promotores" element={<AdminPromoters />} />
          <Route path="mensajes"   element={<AdminMessages />} />
          <Route path="newsletter" element={<AdminNewsletter />} />
          <Route path="blog"       element={<AdminBlog />} />
          <Route path="usuarios"   element={<AdminUsers />} />
        </Route>

        {/* Public routes */}
        <Route path="/"                  element={<PublicLayout><HomePage /></PublicLayout>} />
        <Route path="/coleccion/:slug"   element={<PublicLayout><CollectionPage /></PublicLayout>} />
        <Route path="/producto/:slug"    element={<PublicLayout><ProductPage /></PublicLayout>} />
        <Route path="/quienes-somos"     element={<PublicLayout><QuienesSomosPage /></PublicLayout>} />
        <Route path="/programa-promocion" element={<PublicLayout><PromotionProgramPage /></PublicLayout>} />
        <Route path="/catalogo"          element={<PublicLayout><CatalogPage /></PublicLayout>} />
        <Route path="/contacto"          element={<PublicLayout><ContactPage /></PublicLayout>} />
        <Route path="/info/:slug"        element={<PublicLayout><InfoPage /></PublicLayout>} />
        <Route path="/checkout"          element={<NoIndex><PublicLayout><CheckoutPage /></PublicLayout></NoIndex>} />
        <Route path="/pago-exitoso"      element={<NoIndex><PublicLayout><PaymentSuccessPage /></PublicLayout></NoIndex>} />
        <Route path="/pago-error"        element={<NoIndex><PublicLayout><PaymentErrorPage /></PublicLayout></NoIndex>} />

        {/* ── Blog ── */}
        <Route path="/blog"       element={<PublicLayout><BlogPage /></PublicLayout>} />
        <Route path="/blog/:slug" element={<PublicLayout><BlogPostPage /></PublicLayout>} />
        <Route path="*" element={<PublicLayout><NotFoundPage /></PublicLayout>} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
