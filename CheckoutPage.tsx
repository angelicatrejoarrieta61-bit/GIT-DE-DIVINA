import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder } from '../lib/queries';
import { getImageUrl } from '../lib/supabase';
import './CheckoutPage.css';

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
  </svg>
);

const IconVisa = () => (
  <svg viewBox="0 0 48 32" width="42" height="28">
    <rect width="48" height="32" rx="4" fill="#1A1F71" />
    <text x="8" y="22" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial">VISA</text>
  </svg>
);

const IconMastercard = () => (
  <svg viewBox="0 0 48 32" width="42" height="28">
    <rect width="48" height="32" rx="4" fill="#252525" />
    <circle cx="18" cy="16" r="9" fill="#EB001B" />
    <circle cx="30" cy="16" r="9" fill="#F79E1B" />
    <path d="M24 9.5a9 9 0 0 1 0 13A9 9 0 0 1 24 9.5z" fill="#FF5F00" />
  </svg>
);

const IconAmex = () => (
  <svg viewBox="0 0 48 32" width="42" height="28">
    <rect width="48" height="32" rx="4" fill="#2E77BC" />
    <text x="5" y="22" fill="white" fontSize="11" fontWeight="bold" fontFamily="Arial">AMEX</text>
  </svg>
);

const ClipLogo = () => (
  <svg viewBox="0 0 80 28" width="56" height="20" aria-label="Clip">
    <rect width="80" height="28" rx="5" fill="#FC4C02" />
    <text x="10" y="20" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial, sans-serif" letterSpacing="1">clip</text>
  </svg>
);

interface CustomerForm {
  nombre: string;
  email: string;
  telefono: string;
  calle: string;
  colonia: string;
  ciudad: string;
  estado: string;
  cp: string;
}

const EMPTY_FORM: CustomerForm = {
  nombre: '',
  email: '',
  telefono: '',
  calle: '',
  colonia: '',
  ciudad: '',
  estado: '',
  cp: '',
};

function validateForm(f: CustomerForm): string | null {
  if (!f.nombre.trim()) return 'El nombre es requerido.';
  if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return 'Ingresa un email válido.';
  if (!f.telefono.trim() || f.telefono.replace(/\D/g, '').length < 10) return 'El teléfono debe tener 10 dígitos.';
  if (!f.calle.trim()) return 'La calle y número son requeridos.';
  if (!f.colonia.trim()) return 'La colonia es requerida.';
  if (!f.ciudad.trim()) return 'La ciudad es requerida.';
  if (!f.estado.trim()) return 'El estado es requerido.';
  if (!f.cp.trim() || f.cp.replace(/\D/g, '').length !== 5) return 'El código postal debe tener 5 dígitos.';
  return null;
}

export const CheckoutPage: React.FC = () => {
  const { items, total, clearCart } = useCartStore();
  const cartTotal = total();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [touched, setTouched] = useState<Partial<Record<keyof CustomerForm, boolean>>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    setTouched(prev => ({ ...prev, [e.target.name]: true }));
  };

  const handlePagar = async () => {
    setTouched({
      nombre: true, email: true, telefono: true,
      calle: true, colonia: true, ciudad: true, estado: true, cp: true,
    });

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    const fullAddress = `${form.calle}, Col. ${form.colonia}, ${form.ciudad}, ${form.estado}, CP ${form.cp}`;

    try {
      const order = await createOrder({
        customer_name: form.nombre.trim(),
        customer_email: form.email.trim().toLowerCase(),
        customer_phone: form.telefono.trim(),
        customer_address: fullAddress,
        items,
        total: cartTotal,
        status: 'pending',
      });

      if (!order?.id) throw new Error('No se pudo crear la orden. Intenta de nuevo.');

      const res = await fetch('/api/create-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cartTotal,
          description: `Divina Store MX — Orden ${order.id}`,
          orderId: order.id,
          customerName: form.nombre.trim(),
          customerEmail: form.email.trim().toLowerCase(),
          redirect_url: `${window.location.origin}/pago-exitoso?order=${order.id}`,
          error_url: `${window.location.origin}/pago-error?order=${order.id}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Error al crear el pago.');
      if (!data.payment_url) throw new Error('No se recibió URL de pago de Clip.');

      clearCart();
      window.location.href = data.payment_url;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="checkout-empty" style={{ paddingTop: 'calc(var(--nav-h) + 80px)' }}>
        <div className="checkout-empty__icon">🛍️</div>
        <h2>Tu carrito está vacío</h2>
        <p className="muted-text">Agrega productos antes de continuar al pago.</p>
        <button onClick={() => navigate('/catalogo')} className="btn btn-lime" style={{ marginTop: 24 }}>
          Ir al catálogo
        </button>
      </div>
    );
  }

  const formValidationError = validateForm(form);

  return (
    <div className="checkout-page" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="page-width section">

        <div className="checkout-page__header">
          <h1 className="checkout-page__title">Finalizar <span className="lime-text">Compra</span></h1>
          <div className="checkout-page__secure-badge">
            <IconLock />
            <span>Pago 100% seguro</span>
          </div>
        </div>

        <div className="checkout-page__grid">

          <div className="checkout-page__left">

            {/* FORMULARIO DE DATOS DEL CLIENTE */}
            <div className="checkout-form-section">
              <h2 className="checkout-form-section__title">Datos de contacto</h2>

              <div className="checkout-form-grid">
                <div className="checkout-form-field checkout-form-field--full">
                  <label htmlFor="nombre">Nombre completo *</label>
                  <input
                    id="nombre"
                    name="nombre"
                    type="text"
                    autoComplete="name"
                    placeholder="María García López"
                    value={form.nombre}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.nombre && !form.nombre.trim() ? 'input-error' : ''}
                  />
                </div>

                <div className="checkout-form-field">
                  <label htmlFor="email">Correo electrónico *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="maria@ejemplo.com"
                    value={form.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) ? 'input-error' : ''}
                  />
                </div>

                <div className="checkout-form-field">
                  <label htmlFor="telefono">Teléfono *</label>
                  <input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    autoComplete="tel"
                    placeholder="55 1234 5678"
                    value={form.telefono}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.telefono && form.telefono.replace(/\D/g, '').length < 10 ? 'input-error' : ''}
                  />
                </div>
              </div>
            </div>

            {/* DIRECCIÓN DE ENTREGA */}
            <div className="checkout-form-section">
              <h2 className="checkout-form-section__title">Dirección de entrega</h2>

              <div className="checkout-form-grid">
                <div className="checkout-form-field checkout-form-field--full">
                  <label htmlFor="calle">Calle y número *</label>
                  <input
                    id="calle"
                    name="calle"
                    type="text"
                    autoComplete="address-line1"
                    placeholder="Av. Insurgentes Sur 1234, Int. 5"
                    value={form.calle}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.calle && !form.calle.trim() ? 'input-error' : ''}
                  />
                </div>

                <div className="checkout-form-field">
                  <label htmlFor="colonia">Colonia *</label>
                  <input
                    id="colonia"
                    name="colonia"
                    type="text"
                    autoComplete="address-line2"
                    placeholder="Del Valle"
                    value={form.colonia}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.colonia && !form.colonia.trim() ? 'input-error' : ''}
                  />
                </div>

                <div className="checkout-form-field">
                  <label htmlFor="cp">Código postal *</label>
                  <input
                    id="cp"
                    name="cp"
                    type="text"
                    autoComplete="postal-code"
                    placeholder="03100"
                    maxLength={5}
                    value={form.cp}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.cp && form.cp.replace(/\D/g, '').length !== 5 ? 'input-error' : ''}
                  />
                </div>

                <div className="checkout-form-field">
                  <label htmlFor="ciudad">Ciudad / Alcaldía *</label>
                  <input
                    id="ciudad"
                    name="ciudad"
                    type="text"
                    autoComplete="address-level2"
                    placeholder="Ciudad de México"
                    value={form.ciudad}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.ciudad && !form.ciudad.trim() ? 'input-error' : ''}
                  />
                </div>

                <div className="checkout-form-field">
                  <label htmlFor="estado">Estado *</label>
                  <select
                    id="estado"
                    name="estado"
                    autoComplete="address-level1"
                    value={form.estado}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={touched.estado && !form.estado.trim() ? 'input-error' : ''}
                  >
                    <option value="">Selecciona un estado</option>
                    {[
                      'Aguascalientes','Baja California','Baja California Sur','Campeche',
                      'Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima',
                      'Durango','Estado de México','Guanajuato','Guerrero','Hidalgo',
                      'Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca',
                      'Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa',
                      'Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'
                    ].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* MÉTODOS DE PAGO */}
            <div className="checkout-accepted-cards">
              <span className="checkout-accepted-cards__label">Métodos de pago aceptados</span>
              <div className="checkout-accepted-cards__logos">
                <IconVisa />
                <IconMastercard />
                <IconAmex />
                <div className="checkout-accepted-cards__clip">
                  <span>Procesado por</span>
                  <ClipLogo />
                </div>
              </div>
            </div>

            <div className="checkout-clip-info">
              <div className="checkout-clip-info__item">
                <IconShield />
                <span>Serás redirigido al sitio seguro de Clip donde podrás ingresar tus datos de pago con tarjeta de crédito o débito.</span>
              </div>
              <div className="checkout-clip-info__item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Acepta Visa, Mastercard, American Express y tarjetas de débito.</span>
              </div>
              <div className="checkout-clip-info__item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
                <span>Meses sin intereses disponibles según tu banco.</span>
              </div>
            </div>

            {error && (
              <div className="checkout-page__error">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handlePagar}
              className={`checkout-submit-btn ${loading ? 'loading' : ''}`}
              disabled={loading || !!formValidationError}
            >
              {loading ? (
                <span className="checkout-submit-btn__loading">
                  <span className="checkout-spinner" />
                  Preparando pago...
                </span>
              ) : (
                <span className="checkout-submit-btn__content">
                  <IconLock />
                  Pagar con Clip
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              )}
            </button>

            <div className="checkout-trust-row">
              <div className="checkout-trust-item">
                <IconShield />
                <span>Datos cifrados SSL</span>
              </div>
              <div className="checkout-trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Pago procesado por Clip</span>
              </div>
              <div className="checkout-trust-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Compra garantizada</span>
              </div>
            </div>
          </div>

          {/* RESUMEN DE ORDEN */}
          <div className="checkout-page__summary">
            <div className="checkout-summary-card">
              <h2 className="checkout-summary-card__title">Tu pedido</h2>

              <div className="checkout-page__items">
                {items.map(item => (
                  <div key={item.product.id} className="checkout-page__item">
                    <div className="checkout-page__item-img">
                      {item.product.image_url
                        ? <img src={getImageUrl(item.product.image_url)} alt={item.product.name} loading="lazy" />
                        : <span>🌿</span>}
                      <span className="checkout-page__item-qty-badge">{item.quantity}</span>
                    </div>
                    <div className="checkout-page__item-info">
                      {item.product.brand && (
                        <p className="checkout-page__item-brand">{item.product.brand}</p>
                      )}
                      <p className="checkout-page__item-name">{item.product.name}</p>
                    </div>
                    <p className="checkout-page__item-price">
                      ${(item.product.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              <div className="checkout-summary-divider" />

              <div className="checkout-summary-lines">
                <div className="checkout-summary-line">
                  <span>Subtotal</span>
                  <span>${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                </div>
                <div className="checkout-summary-line">
                  <span>Envío</span>
                  <span className="lime-text">Gratis</span>
                </div>
              </div>

              <div className="checkout-summary-divider" />

              <div className="checkout-page__total">
                <span>Total</span>
                <span className="lime-text">
                  ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>

              <div className="checkout-summary-cards-row">
                <IconVisa />
                <IconMastercard />
                <IconAmex />
              </div>

              <div className="checkout-summary-clip-note">
                <ClipLogo />
                <span>Pagos procesados de forma segura por Clip México</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};