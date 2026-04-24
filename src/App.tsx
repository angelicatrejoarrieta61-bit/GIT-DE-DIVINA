import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { HomePage } from './pages/HomePage';
import { CollectionPage } from './pages/CollectionPage';
import { ProductPage } from './pages/ProductPage';
import { CatalogPage } from './pages/CatalogPage';
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
import { StoreThemeProvider } from './components/StoreThemeProvider';

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreThemeProvider>
      <Header />
      <main>{children}</main>
      <Footer />
      <CartDrawer />
    </StoreThemeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin routes — no header/footer */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="productos" element={<AdminProducts />} />
          <Route path="import" element={<AdminImport />} />
          <Route path="config" element={<AdminConfig />} />
        </Route>

        {/* Public routes */}
        <Route path="/" element={<PublicLayout><HomePage /></PublicLayout>} />
        <Route path="/coleccion/:slug" element={<PublicLayout><CollectionPage /></PublicLayout>} />
        <Route path="/producto/:slug" element={<PublicLayout><ProductPage /></PublicLayout>} />
        <Route path="/catalogo" element={<PublicLayout><CatalogPage /></PublicLayout>} />
        <Route path="/quienes-somos" element={<PublicLayout><QuienesSomosPage /></PublicLayout>} />
        <Route path="/contacto" element={<PublicLayout><ContactPage /></PublicLayout>} />
        <Route path="/checkout" element={<PublicLayout><CheckoutPage /></PublicLayout>} />
        <Route path="/pago-exitoso" element={<PublicLayout><PaymentSuccessPage /></PublicLayout>} />
        <Route path="/pago-error" element={<PublicLayout><PaymentErrorPage /></PublicLayout>} />
      </Routes>
    </BrowserRouter>
  );
}
