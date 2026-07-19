import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminLogin } from './pages/admin/AdminLogin';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminImport } from './pages/admin/AdminImport';
import { AdminConfig } from './pages/admin/AdminConfig';
import { AdminOrderReports } from './pages/admin/AdminOrderReports';
import { AdminMessages } from './pages/admin/AdminMessages';
import { AdminNewsletter } from './pages/admin/AdminNewsletter';
import { AdminBlog } from './pages/admin/AdminBlog';
import { AdminUsers } from './pages/admin/AdminUsers';
import { StoreThemeProvider } from './components/StoreThemeProvider';
import { SiteGeneral } from './pages/admin/SiteGeneral';
import { FloatingContactBubble } from './components/FloatingContactBubble';
import { CatalogPage } from './pages/CatalogPage';
import { NotFoundPage } from './pages/NotFoundPage';

// ── Blog ──────────────────────────────────────────────────────
import { BlogPage }     from './pages/blog/BlogPage';
import { BlogPostPage } from './pages/blog/BlogPostPage';

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
      <Header />
      <main>{children}</main>
      <Footer />
      <CartDrawer />
      <FloatingContactBubble />
    </StoreThemeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <RouteRedirector />
      <Routes>
        {/* Admin routes — no header/footer */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/config?section=site-general" replace />} />
          <Route path="productos"  element={<AdminProducts />} />
          <Route path="import"     element={<AdminImport />} />
          <Route path="config"     element={<AdminConfig />} />
          <Route path="reportes"   element={<AdminOrderReports />} />
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
        <Route path="/catalogo"          element={<PublicLayout><CatalogPage /></PublicLayout>} />
        <Route path="/contacto"          element={<PublicLayout><ContactPage /></PublicLayout>} />
        <Route path="/checkout"          element={<PublicLayout><CheckoutPage /></PublicLayout>} />
        <Route path="/pago-exitoso"      element={<PublicLayout><PaymentSuccessPage /></PublicLayout>} />
        <Route path="/pago-error"        element={<PublicLayout><PaymentErrorPage /></PublicLayout>} />

        {/* ── Blog ── */}
        <Route path="/blog"       element={<PublicLayout><BlogPage /></PublicLayout>} />
        <Route path="/blog/:slug" element={<PublicLayout><BlogPostPage /></PublicLayout>} />
        <Route path="*" element={<PublicLayout><NotFoundPage /></PublicLayout>} />
      </Routes>
    </BrowserRouter>
  );
}
