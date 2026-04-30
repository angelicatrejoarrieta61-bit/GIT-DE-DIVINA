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

// No global window.ClipSDK anymore

/* ── Security Badges ── */
const PCIBadge = () => (
  <svg viewBox="0 0 64 32" width="64" height="32" aria-label="PCI DSS Compliant">
    <rect width="64" height="32" rx="4" fill="#003087" />
    <text x="4" y="13" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial">PCI DSS</text>
    <text x="4" y="24" fill="#FFD700" fontSize="7" fontFamily="Arial">COMPLIANT</text>
    <path d="M52 8l4 4-7 7-4-4z" fill="none" stroke="#FFD700" strokeWidth="1.5" />
    <path d="M49 14l-2 8 8-8z" fill="#FFD700" />
  </svg>
);

const SSLBadge = () => (
  <svg viewBox="0 0 64 32" width="64" height="32" aria-label="SSL Secure">
    <rect width="64" height="32" rx="4" fill="#1a7c1a" />
    <text x="4" y="14" fill="white" fontSize="9" fontWeight="bold" fontFamily="Arial">🔒 SSL</text>
    <text x="4" y="25" fill="#90EE90" fontSize="7" fontFamily="Arial">256-BIT</text>
  </svg>
);

const IconShieldGreen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
  </svg>
);

const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const MEXICAN_STATES = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 
  'CDMX', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 
  'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 
  'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 
  'Veracruz', 'Yucatán', 'Zacatecas'
];

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
    neighborhood: '',
    city: '',
    state: 'CDMX',
    zip: '',
    reference: 'Casa',
    accepts_marketing: true,   // opt-in newsletter por defecto
  });

  const [colonias, setColonias] = useState<string[]>([]);
  const [isFetchingZip, setIsFetchingZip] = useState(false);

  React.useEffect(() => {
    getStoreConfig().then(setConfig);
  }, []);

  // Fetch ZIP info (Mexico)
  React.useEffect(() => {
    if (form.zip.length === 5) {
      setIsFetchingZip(true);
      fetch(`https://api.zippopotam.us/mx/${form.zip}`)
        .then(res => res.json())
        .then(data => {
          if (data.places && data.places.length > 0) {
            const place = data.places[0];
            const uniqueColonias = Array.from(new Set(data.places.map((p: any) => p['place name']))) as string[];
            setColonias(uniqueColonias);
            setForm(prev => ({
              ...prev,
              city: place['place name'],
              state: place['state'],
              neighborhood: uniqueColonias[0] || ''
            }));
          }
        })
        .catch(err => console.error('Error fetching zip:', err))
        .finally(() => setIsFetchingZip(false));
    } else {
      setColonias([]);
    }
  }, [form.zip]);

  // Fetch ZIP info (Mexico)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePagar = async () => {
    if (!form.name || !form.email || !form.address || !form.city) {
      setError('Por favor completa todos los campos de envío obligatorios.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // PASO 1: Crear la orden
      const order = await createOrder({
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        customer_address: `${form.address}, ${form.neighborhood}`,
        customer_neighborhood: form.neighborhood,
        customer_city: form.city,
        customer_state: form.state,
        customer_zip: form.zip,
        customer_reference: form.reference,
        items,
        total: cartTotal,
        status: 'pending',
        accepts_marketing: form.accepts_marketing,
      });

      if (!order) throw new Error('No se pudo registrar la orden. Intenta de nuevo.');

      // PASO 2: Generar link de pago en Clip
      const chargeRes = await fetch('/api/charge-clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cartTotal,
          orderId: order.id,
          description: `Divina Store — ${form.name} — Orden ${order.id}`,
        }),
      });

      const chargeData = await chargeRes.json();

      if (!chargeRes.ok) {
        throw new Error(chargeData.error || 'Error al generar el pago. Intenta de nuevo.');
      }

      // Limpiar carrito
      clearCart();
      
      // Redirigir a Clip para pagar de forma segura
      window.location.href = chargeData.payment_url;

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al procesar el pago.';
      console.error('[Checkout] Error en pago:', msg);
      setError(msg);
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="checkout-empty" style={{ paddingTop: 'calc(var(--nav-h) + 80px)' }}>
        <h2>Tu carrito está vacío</h2>
        <button onClick={() => navigate('/catalogo')} className="btn btn-lime">Ir al catálogo</button>
      </div>
    );
  }

  return (
    <div className="checkout-page" style={{ paddingTop: 'var(--nav-h)' }}>
      {/* ── HERO BANNER HEADER ── */}
      <div className="checkout-hero-header" style={{ 
        backgroundImage: config.cart_footer_img ? `url(${getImageUrl(config.cart_footer_img)})` : 'none',
      }}>
        <div className="checkout-hero-header__overlay" />
        <div className="page-width checkout-hero-header__content">
          <div className="checkout-hero-header__left">
            <h1 className="checkout-page__title">Finalizar <span className="lime-text">Compra</span></h1>
            <div className="checkout-page__secure-badge-top"><IconLock /> <span>PAGO SEGURO</span></div>
          </div>
          <div className="checkout-hero-header__right">
             <div className="checkout-notice"><IconShield /> <span>Pago procesado por <strong>Clip México</strong>.</span></div>
          </div>
        </div>
      </div>

      <div className="page-width section" style={{ marginTop: 16 }}>
        <div className="checkout-page__grid">
          <div className="checkout-page__left">

            {/* PCI/SSL trust bar */}
            <div className="checkout-pci-bar">
              <div className="checkout-pci-bar__badges">
                <PCIBadge />
                <SSLBadge />
              </div>
              <div className="checkout-pci-bar__text">
                <IconShieldGreen />
                Datos protegidos con cifrado de 256-bit · Pago seguro por Clip México
              </div>
            </div>

            {/* MSI Banner */}
            <div className="checkout-msi-banner">
              <div className="checkout-msi-banner__icon">💳</div>
              <div className="checkout-msi-banner__text">
                <strong>¿Meses sin intereses disponibles?</strong>
                <p>Hasta 12 MSI según tu banco. Visa, Mastercard y Amex participantes. Consúltalo con tu banco emisor al momento del pago.</p>
              </div>
            </div>

            <div className="checkout-card glass compact">
              <h2 className="checkout-card__title"><span className="lime-text">01</span> DATOS DE ENVÍO</h2>
              <div className="checkout-compact-grid">
                <div className="checkout-field"><label>NOMBRE</label><input type="text" name="name" value={form.name} onChange={handleInputChange} className="input-glass" required /></div>
                <div className="checkout-field"><label>E-MAIL</label><input type="email" name="email" value={form.email} onChange={handleInputChange} className="input-glass" required /></div>
                <div className="checkout-field full"><label>CELULAR</label><input type="tel" name="phone" value={form.phone} onChange={handleInputChange} className="input-glass" required /></div>
                
                <div className="checkout-section-divider">DOMICILIO (MÉXICO)</div>
                
                <div className="checkout-field">
                  <label>CÓDIGO POSTAL {isFetchingZip && '...'}</label>
                  <input type="text" name="zip" value={form.zip} onChange={handleInputChange} className="input-glass" placeholder="00000" maxLength={5} />
                </div>
                <div className="checkout-field">
                  <label>ESTADO</label>
                  <select name="state" value={form.state} onChange={handleInputChange} className="input-glass">
                    <option value="">Selecciona...</option>
                    {MEXICAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="checkout-field">
                  <label>CIUDAD / MUNICIPIO</label>
                  <input type="text" name="city" value={form.city} onChange={handleInputChange} className="input-glass" required />
                </div>
                <div className="checkout-field">
                  <label>COLONIA</label>
                  {colonias.length > 0 ? (
                    <select name="neighborhood" value={form.neighborhood} onChange={handleInputChange} className="input-glass">
                      {colonias.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <input type="text" name="neighborhood" value={form.neighborhood} onChange={handleInputChange} className="input-glass" placeholder="Ingresa colonia" required />
                  )}
                </div>

                <div className="checkout-field full"><label>CALLE Y NÚMERO</label><input type="text" name="address" value={form.address} onChange={handleInputChange} className="input-glass" required /></div>
                
                <div className="checkout-field full">
                  <label>REFERENCIA</label>
                  <select name="reference" value={form.reference} onChange={handleInputChange} className="input-glass">
                    <option value="Casa">Casa</option><option value="Oficina">Oficina</option><option value="Local">Local</option><option value="Otro">Otro</option>
                  </select>
                </div>

                {/* Newsletter opt-in */}
                <div className="checkout-field full" style={{ marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', textTransform: 'none', fontSize: 12, color: '#aaa', fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      name="accepts_marketing"
                      checked={form.accepts_marketing}
                      onChange={e => setForm(prev => ({ ...prev, accepts_marketing: e.target.checked }))}
                      style={{ width: 15, height: 15, accentColor: 'var(--c-lime)', marginTop: 2, flexShrink: 0 }}
                    />
                    <span>Quiero recibir ofertas exclusivas, descuentos y novedades de Divina Store MX por correo electrónico. Puedo darme de baja en cualquier momento.</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="checkout-card glass payment-card">
              <div className="checkout-clip-mount" style={{ textAlign: 'center', padding: '30px 10px' }}>
                <p style={{ color: '#aaa', fontSize: 13, marginBottom: 15 }}>Serás redirigido a la plataforma oficial de Clip para completar tu pago de forma 100% segura.</p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <svg viewBox="0 0 64 24" width="80" height="30">
                    <rect width="64" height="24" rx="4" fill="#FC4C02" />
                    <text x="12" y="17" fill="white" fontSize="14" fontWeight="bold" fontFamily="Arial">clip</text>
                  </svg>
                </div>
              </div>
            </div>

            {error && <div className="checkout-page__error"><span>⚠</span><span>{error}</span></div>}

            <div className="checkout-actions">
              <button
                onClick={handlePagar}
                className={`checkout-pagar-btn-official ${loading ? 'loading' : ''}`}
                disabled={loading}
                id="checkout-pay-btn"
              >
                {loading ? (
                  <div className="btn-loading-state">
                    <span className="checkout-spinner" />
                    Procesando pago...
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 24px', background: 'var(--c-lime)', borderRadius: 12, fontFamily: 'var(--f-sub)', fontSize: 15, fontWeight: 800, color: '#000', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Pagar ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </div>
                )}
              </button>
            </div>

            <div className="checkout-footer-badges">
              <div className="checkout-trust-badge"><IconShield /> <div className="trust-text"><strong>PAGO SEGURO</strong><span>Encriptación SSL 256 bits</span></div></div>
              <div className="trust-divider" />
              <div className="checkout-trust-badge">
                <svg viewBox="0 0 48 20" width="48" height="20">
                  <rect width="48" height="20" rx="4" fill="#FC4C02" />
                  <text x="6" y="14" fill="white" fontSize="10" fontWeight="bold" fontFamily="Arial">clip</text>
                </svg>
                <div className="trust-text"><strong>PARTNER OFICIAL</strong><span>Clip México</span></div>
              </div>
            </div>
          </div>

          <div className="checkout-page__summary">
            <div className="checkout-summary-card glass">
              <h2 className="checkout-summary-card__title">RESUMEN</h2>
              <div className="checkout-summary-items">
                {items.map(item => (
                  <div key={item.product.id} className="checkout-summary-item">
                    <div className="item-img-wrapper"><img src={getImageUrl(item.product.image_url)} alt={item.product.name} /><span className="qty-badge">{item.quantity}</span></div>
                    <div className="item-info"><p className="item-name">{item.product.name}</p></div>
                    <p className="item-price">${(item.product.price * item.quantity).toLocaleString('es-MX')}</p>
                  </div>
                ))}
              </div>
              <div className="summary-total-row"><span>TOTAL</span><span className="total-amount">${cartTotal.toLocaleString('es-MX')} <small>MXN</small></span></div>
              <div className="checkout-msi-mini">💳 Hasta 12 MSI según tu banco</div>
              <div className="summary-clip-secure">
                <svg viewBox="0 0 32 14" width="32" height="14">
                  <rect width="32" height="14" rx="3" fill="#FC4C02" />
                  <text x="4" y="10" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial">clip</text>
                </svg>
                <span>Checkout impulsado por Clip</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <PCIBadge />
                <SSLBadge />
              </div>
            </div>

            <div className="checkout-payment-logos-box">
              <p>MÉTODOS DE PAGO ACEPTADOS:</p>
              {config.checkout_payment_logos && <img src={getImageUrl(config.checkout_payment_logos)} alt="Pasarelas" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
