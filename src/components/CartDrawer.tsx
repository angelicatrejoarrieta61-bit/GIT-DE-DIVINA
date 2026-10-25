import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useCartStore } from '../store/cartStore';
import { Link, useNavigate } from 'react-router-dom';
import { getImageUrl } from '../lib/supabase';
import { getProducts } from '../lib/queries';
import { shippingFor, orderTotal, missingForFreeShipping, FREE_SHIPPING_FROM } from '../lib/shipping';
import type { Product } from '../types';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import './CartDrawer.css';
import { analyticsItems, trackEvent } from '../lib/analytics';
import { couponLabel } from '../lib/coupons';

type CheckoutState = 'idle' | 'loading' | 'error';

const RECO_COUNT = 3;
/** 3 productos al azar (con foto y en existencia) para el carrito vacío. */
function pickRandom(list: Product[], n: number): Product[] {
  const pool = list.filter((p) => p.image_url && p.slug);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export const CartDrawer: React.FC = () => {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    updateQty,
    total,
    couponCode,
    couponType,
    couponValue,
    couponMin,
    applyCoupon,
    revalidateCoupon,
    removeCoupon,
    couponBelowMin,
    discountAmount,
    totalAfterDiscount
  } = useCartStore();
  const navigate = useNavigate();

  const [checkoutState] = useState<CheckoutState>('idle');
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [reco, setReco] = useState<Product[] | null>(null); // null = cargando
  const catalogRef = useRef<Product[] | null>(null);

  // "Te recomendamos": solo con el carrito vacío; 3 productos distintos cada vez que se abre
  const isEmpty = items.length === 0;
  useEffect(() => {
    if (!isOpen || !isEmpty) return;
    let alive = true;
    const run = async () => {
      if (!catalogRef.current) {
        setReco(null);
        catalogRef.current = await getProducts(60);
      }
      if (alive) setReco(pickRandom(catalogRef.current, RECO_COUNT));
    };
    void run();
    return () => { alive = false; };
  }, [isOpen, isEmpty]);

  // Al abrir el carrito se confirma que el cupón guardado siga vigente (pudo pausarse en el admin)
  useEffect(() => {
    if (!isOpen || !couponCode) return;
    let alive = true;
    revalidateCoupon().then((msg) => { if (alive && msg) setCouponError(msg); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim() || couponBusy) return;
    setCouponBusy(true);
    const err = await applyCoupon(couponInput);
    setCouponBusy(false);
    if (err) setCouponError(err);
    else setCouponInput('');
  };
  const couponText = couponLabel(couponType, couponValue);
  const belowMin = couponBelowMin();

  const cartTotal = total();
  const productsTotal = couponCode ? totalAfterDiscount() : cartTotal;
  const shipping = shippingFor(productsTotal);
  const grandTotal = orderTotal(productsTotal);
  const missingFree = missingForFreeShipping(productsTotal);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleCheckout = useCallback(() => {
    if (!items.length) return;
    trackEvent('begin_checkout', { currency: 'MXN', value: grandTotal, coupon: couponCode || undefined, items: analyticsItems(items) });
    closeCart();
    navigate('/checkout');
  }, [items, closeCart, navigate, grandTotal, couponCode]);

  return (
    <>
      {/* 👇 Overlay */}
      {isOpen && <div className="cart-overlay" onClick={closeCart} />}

      {/* 👇 Drawer */}
      <aside
        className={`cart-drawer ${isOpen ? 'cart-drawer--open' : ''}`}
        aria-label="Carrito de compras"
      >
        {/* Header */}
        <div className="cart-drawer__header">
          <h2 className="cart-drawer__title">
            Tu carrito
            <span className="cart-drawer__count" aria-label={`${items.length} producto${items.length !== 1 ? 's' : ''}`}>
              <strong>{items.length}</strong> producto{items.length !== 1 ? 's' : ''}
            </span>
          </h2>

          <button
            type="button"
            className="cart-drawer__close"
            onClick={closeCart}
            aria-label="Cerrar carrito"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Items */}
        <div className="cart-drawer__items">
          {items.length === 0 ? (
            <>
              <div className="cart-drawer__empty">
                <ShoppingBag size={36} aria-hidden="true" />
                <p>Tu carrito está vacío</p>
                <Link to="/catalogo" onClick={closeCart} className="cart-drawer__empty-btn">
                  Ver productos
                </Link>
              </div>

              {(reco === null || reco.length > 0) && (
                <section className="cart-reco" aria-labelledby="cart-reco-title" aria-busy={reco === null}>
                  <h3 id="cart-reco-title" className="cart-reco__title"><span>Te recomendamos</span></h3>
                  <ul className="cart-reco__grid">
                    {reco === null
                      ? Array.from({ length: RECO_COUNT }, (_, i) => (
                          <li key={i} className="cart-reco__item is-loading" aria-hidden="true">
                            <span className="cart-reco__media" />
                            <span className="cart-reco__line" />
                            <span className="cart-reco__line cart-reco__line--short" />
                          </li>
                        ))
                      : reco.map((p, i) => (
                          <li key={p.id} className="cart-reco__item" style={{ '--i': i } as React.CSSProperties}>
                            <Link to={`/producto/${p.slug}`} onClick={closeCart} className="cart-reco__card">
                              <span className="cart-reco__media">
                                <img src={getImageUrl(p.image_url || '', { width: 240, quality: 75 })} alt="" loading="lazy" />
                              </span>
                              <span className="cart-reco__name">{p.name}</span>
                            </Link>
                          </li>
                        ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            items.map((item, i) => (
              <div
                key={`${item.product.id}-${item.variant}`}
                className="cart-item"
                style={{ '--i': Math.min(i, 8) } as React.CSSProperties}
              >
                <div className="cart-item__img">
                  {item.product.image_url ? (
                    <img src={getImageUrl(item.product.image_url)} alt={item.product.name} loading="lazy" />
                  ) : (
                    <div className="cart-item__placeholder"><ShoppingBag size={18} aria-hidden="true" /></div>
                  )}
                </div>

                <div className="cart-item__info">
                  <span className="cart-item__brand">{item.product.brand || 'DIVINA'}</span>
                  <h3 className="cart-item__name" title={item.product.name}>{item.product.name}</h3>
                </div>

                <p className="cart-item__price">{formatCurrency(item.product.price * item.quantity)}</p>

                <div className="cart-item__controls">
                  <div className="cart-item__qty-box">
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, Math.max(1, item.quantity - 1))}
                      disabled={item.quantity <= 1}
                      aria-label={`Quitar una unidad de ${item.product.name}`}
                    >
                      <Minus size={12} aria-hidden="true" />
                    </button>
                    <span className="cart-item__qty-num" aria-live="polite">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQty(item.product.id, item.quantity + 1)}
                      aria-label={`Agregar una unidad de ${item.product.name}`}
                    >
                      <Plus size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cart-item__delete"
                    onClick={() => removeItem(item.product.id)}
                    aria-label={`Eliminar ${item.product.name}`}
                    title="Eliminar"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer__footer">
            {/* Sección de Cupón */}
            <div className="cart-drawer__coupon-container">
              {couponCode ? (
                <div className="cart-drawer__coupon-applied">
                  <span className="coupon-tag">🏷️ {couponCode} (-{couponText})</span>
                  <button type="button" onClick={removeCoupon} className="coupon-remove-btn" aria-label="Eliminar cupón" title="Eliminar cupón"><X size={11} aria-hidden="true" /></button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="cart-drawer__coupon-form">
                  <input
                    type="text"
                    placeholder="Código de descuento"
                    value={couponInput}
                    onChange={e => { setCouponInput(e.target.value); setCouponError(''); }}
                    className="cart-drawer__coupon-input"
                    aria-label="Código de descuento"
                    aria-invalid={!!couponError}
                    autoCapitalize="characters"
                    disabled={couponBusy}
                  />
                  <button type="submit" className="cart-drawer__coupon-btn" disabled={couponBusy || !couponInput.trim()} aria-busy={couponBusy}>
                    {couponBusy ? '…' : 'Aplicar'}
                  </button>
                </form>
              )}
              {couponError && <p className="cart-drawer__coupon-error" role="alert">{couponError}</p>}
              {belowMin && (
                <p className="cart-drawer__coupon-error" role="status">
                  {couponCode} aplica en compras desde {formatCurrency(couponMin)}
                </p>
              )}
            </div>

            <div className="cart-drawer__row-item">
              <span>Subtotal:</span>
              <span>{formatCurrency(cartTotal)}</span>
            </div>
            {couponCode && !belowMin && (
              <div className="cart-drawer__row-item discount">
                <span>Descuento ({couponText}):</span>
                <span>-{formatCurrency(discountAmount())}</span>
              </div>
            )}
            <div className={`cart-drawer__row-item ${shipping === 0 ? 'discount' : ''}`}>
              <span>Envío:</span>
              <span>{shipping === 0 ? 'Gratis' : formatCurrency(shipping)}</span>
            </div>
            {missingFree > 0 && (
              <p className="cart-drawer__ship-hint">
                Te faltan <strong>{formatCurrency(missingFree)}</strong> para envío gratis
                <span className="cart-drawer__ship-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (productsTotal / FREE_SHIPPING_FROM) * 100)}%` }} /></span>
              </p>
            )}
            <div className="cart-drawer__total-row cart-drawer__total-row--split">
              <span>Total:</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutState === 'loading'} 
              className="btn-checkout-main"
            >
              {checkoutState === 'loading' ? 'PROCESANDO...' : 'FINALIZAR COMPRA'}
            </button>
            
            <button type="button" onClick={closeCart} className="btn-continue-shopping">
              Seguir comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
