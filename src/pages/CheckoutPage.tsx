import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/cartStore';
import { createOrder, getStoreConfig } from '../lib/queries';
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

declare global {
  interface Window {
    ClipSDK: any;
  }
}

export const CheckoutPage: React.FC = () => {
  const { items, total, clearCart } = useCartStore();
  const cartTotal = total();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  
  // Form state
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    reference: 'Casa'
  });

  // Clip SDK States
  const [clipLoaded, setClipLoaded] = useState(false);
  const [clipInstance, setClipInstance] = useState<any>(null);
  const [cardElement, setCardElement] = useState<any>(null);

  React.useEffect(() => {
    getStoreConfig().then(setConfig);
  }, []);

  React.useEffect(() => {
    const initClip = () => {
      if (window.ClipSDK && !clipInstance) {
        const clip = new window.ClipSDK('3f2d18b8-2ff4-453e-a243-b078daa507e2');
        setClipInstance(clip);
        setClipLoaded(true);
      }
    };

    const timer = setInterval(() => {
      if (window.ClipSDK) {
        initClip();
        clearInterval(timer);
      }
    }, 500);
    
    return () => clearInterval(timer);
  }, [clipInstance]);

  React.useEffect(() => {
    if (clipLoaded && clipInstance && !cardElement) {
      const card = clipInstance.element.create('Card', {
        theme: 'light',
        style: {
          base: {
            color: '#111111',
            fontFamily: 'Catamaran, sans-serif',
            fontSize: '16px',
            '::placeholder': { color: '#999999' },
          },
        },
      });
      card.mount('clip-card-container');
      setCardElement(card);
    }
  }, [clipLoaded, clipInstance, cardElement]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePagar = async () => {
    if (!form.name || !form.email || !form.address || !form.city) {
      setError('Por favor completa los campos de envío antes de pagar.');
      return;
    }

    if (!clipInstance || !cardElement) {
      setError('El sistema de pagos no ha terminado de cargar. Por favor espera un momento.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await cardElement.cardToken();
      
      if (result.error) {
        throw new Error(result.error.message || 'Error al procesar la tarjeta');
      }

      const chargeRes = await fetch('/api/charge-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: result.token,
          amount: cartTotal,
          description: `Divina Store — Compra de ${form.name}`,
          customer: {
            name: form.name,
            email: form.email,
            phone: form.phone
          }
        }),
      });

      const chargeData = await chargeRes.json();
      
      if (!chargeRes.ok) {
        throw new Error(chargeData.error || 'El pago fue rechazado por el banco.');
      }

      const order = await createOrder({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        customer_address: form.address,
        customer_city: form.city,
        customer_state: form.state,
        customer_zip: form.zip,
        customer_reference: form.reference,
        items,
        total: cartTotal,
        status: 'paid',
        payment_info: chargeData
      });

      clearCart();
      navigate(`/pago-exitoso?order=${order?.id || 'new'}`);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar el pago';
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

  return (
    <div className="checkout-page" style={{ paddingTop: 'var(--nav-h)' }}>
      <div className="page-width section">

        {/* Header */}
        <div className="checkout-page__header">
          <h1 className="checkout-page__title">Finalizar <span className="lime-text">Compra</span></h1>
          <div className="checkout-page__secure-badge-top">
            <IconLock />
            <span>PAGO 100% SEGURO</span>
          </div>
        </div>

        <div className="checkout-page__grid">

          {/* IZQUIERDA — Datos y Pago */}
          <div className="checkout-page__left">

            {/* 01 DATOS DE ENVÍO */}
            <div className="checkout-card glass">
              <h2 className="checkout-card__title">
                <span className="lime-text">01</span> DATOS DE ENVÍO
              </h2>
              
              <div className="checkout-compact-grid">
                <div className="checkout-field">
                  <label>NOMBRE COMPLETO</label>
                  <input type="text" name="name" value={form.name} onChange={handleInputChange} className="input-glass" placeholder="Tu nombre" required />
                </div>
                <div className="checkout-field">
                  <label>E-MAIL O CORREO ELECTRÓNICO</label>
                  <input type="email" name="email" value={form.email} onChange={handleInputChange} className="input-glass" placeholder="correo@ejemplo.com" required />
                </div>
                <div className="checkout-field full">
                  <label>NÚMERO DONDE TE LOCALIZAMOS (CELULAR)</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleInputChange} className="input-glass" placeholder="55 1234 5678" required />
                </div>

                <div className="checkout-section-divider">DIRECCIÓN</div>

                <div className="checkout-field full">
                  <label>CALLE Y NÚMERO</label>
                  <input type="text" name="address" value={form.address} onChange={handleInputChange} className="input-glass" placeholder="Av. Siempre Viva 123" required />
                </div>
                <div className="checkout-field">
                  <label>CIUDAD</label>
                  <input type="text" name="city" value={form.city} onChange={handleInputChange} className="input-glass" placeholder="Ciudad" required />
                </div>
                <div className="checkout-field">
                  <label>ESTADO</label>
                  <input type="text" name="state" value={form.state} onChange={handleInputChange} className="input-glass" placeholder="Estado" />
                </div>
                <div className="checkout-field">
                  <label>CÓDIGO POSTAL</label>
                  <input type="text" name="zip" value={form.zip} onChange={handleInputChange} className="input-glass" placeholder="00000" />
                </div>
                <div className="checkout-field">
                  <label>REFERENCIA (TIPO LUGAR)</label>
                  <select name="reference" value={form.reference} onChange={handleInputChange} className="input-glass">
                    <option value="Casa">Casa</option>
                    <option value="Oficina">Oficina</option>
                    <option value="Local Comercial">Local Comercial</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="checkout-notice">
              <IconShield />
              <span>Tus datos están protegidos por el cifrado de seguridad de <strong>Clip México</strong>.</span>
            </div>

            {/* 02 INFORMACIÓN DE PAGO */}
            <div className="checkout-card glass payment-card">
              <div id="clip-card-container" className="checkout-clip-mount">
                {!clipLoaded && <div className="clip-skeleton">Cargando pasarela...</div>}
              </div>
            </div>

            {error && (
              <div className="checkout-page__error">
                <span>⚠</span>
                <span>{error}</span>
              </div>
            )}

            <div className="checkout-actions">
              <button
                onClick={handlePagar}
                className={`checkout-pagar-btn ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? (
                  <div className="btn-loading-state">
                    <span className="checkout-spinner" />
                    Procesando...
                  </div>
                ) : (
                  <>
                    Pagar con 
                    <img src="https://clip.mx/static/images/logos/logo-clip.svg" alt="Clip" height="24" style={{ filter: 'brightness(0) invert(1)' }} />
                  </>
                )}
              </button>
              <div className="checkout-mini-cards">
                <img src="https://clip.mx/static/images/metodos-pago/visa.svg" alt="Visa" height="14" />
                <img src="https://clip.mx/static/images/metodos-pago/mastercard.svg" alt="Mastercard" height="14" />
                <img src="https://clip.mx/static/images/metodos-pago/amex.svg" alt="Amex" height="14" />
                <img src="https://clip.mx/static/images/metodos-pago/carnet.svg" alt="Carnet" height="14" />
              </div>
            </div>

            <div className="checkout-footer-badges">
              <div className="checkout-trust-badge">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a1d600" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <div className="trust-text">
                  <strong>PAGO 100% SEGURO</strong>
                  <span>Encriptación SSL de 256 bits</span>
                </div>
              </div>
              <div className="trust-divider" />
              <div className="checkout-trust-badge partner-badge">
                <img src="https://clip.mx/static/images/logos/logo-clip.svg" alt="Clip" />
                <div className="trust-text">
                  <strong>PARTNER OFICIAL</strong>
                  <span>Tecnología Clip México</span>
                </div>
              </div>
            </div>
          </div>

          {/* DERECHA — Resumen */}
          <div className="checkout-page__summary">
            <div className="checkout-summary-card glass">
              <h2 className="checkout-summary-card__title">RESUMEN DE COMPRA</h2>

              <div className="checkout-summary-items">
                {items.map(item => (
                  <div key={item.product.id} className="checkout-summary-item">
                    <div className="item-img-wrapper">
                      <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                      <span className="qty-badge">{item.quantity}</span>
                    </div>
                    <div className="item-info">
                      <p className="item-name">{item.product.name}</p>
                    </div>
                    <p className="item-price">
                      ${(item.product.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>

              <div className="summary-total-row">
                <span>TOTAL A PAGAR</span>
                <span className="total-amount">
                  ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} <small>MXN</small>
                </span>
              </div>

              <div className="summary-cards-small">
                <span>Visa</span> <span>Mastercard</span> <span>Amex</span> <span>Carnet</span>
              </div>

              <div className="summary-clip-secure">
                <img src="https://clip.mx/favicon.ico" alt="Clip" height="14" />
                <span>Checkout seguro impulsado por Clip México</span>
              </div>
            </div>

            {/* White logos box at the bottom right of summary */}
            <div className="checkout-payment-logos-box">
              <p>ACEPTAMOS TODOS LOS SIGUIENTES METODOS DE PAGO:</p>
              {config.checkout_payment_logos ? (
                <img src={getImageUrl(config.checkout_payment_logos)} alt="Pasarelas de pago" />
              ) : (
                <div className="logos-placeholder">
                  <img src="https://clip.mx/static/images/metodos-pago/visa.svg" height="24" alt="Visa" />
                  <img src="https://clip.mx/static/images/metodos-pago/mastercard.svg" height="24" alt="Mastercard" />
                  <img src="https://clip.mx/static/images/metodos-pago/amex.svg" height="24" alt="Amex" />
                  <img src="https://clip.mx/static/images/metodos-pago/carnet.svg" height="24" alt="Carnet" />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
