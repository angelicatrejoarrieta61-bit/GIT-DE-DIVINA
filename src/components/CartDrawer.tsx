import React, { useState, useCallback, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { Link, useNavigate } from 'react-router-dom';
import { getImageUrl, supabase } from '../lib/supabase';
import { getStoreConfig } from '../lib/queries';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import './CartDrawer.css';
import { analyticsItems, trackEvent } from '../lib/analytics';

type CheckoutState = 'idle' | 'loading' | 'error';

export const CartDrawer: React.FC = () => {
  const {
    items,
    isOpen,
    closeCart,
    removeItem,
    updateQty,
    total,
    couponCode,
    discountPercentage,
    applyCoupon,
    removeCoupon,
    discountAmount,
    totalAfterDiscount
  } = useCartStore();
  const navigate = useNavigate();

  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [footerImg, setFooterImg] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState('');

  useEffect(() => {
    const fetchConfig = async () => {
      const config = await getStoreConfig();
      if (config?.cart_footer_img) {
        setFooterImg(config.cart_footer_img);
      }
    };
    fetchConfig();
  }, []);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError('');
    if (!couponInput.trim()) return;
    const success = applyCoupon(couponInput);
    if (success) {
      setCouponInput('');
    } else {
      setCouponError('Código no válido');
    }
  };

  const cartTotal = total();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleCheckout = useCallback(() => {
    if (!items.length) return;
    trackEvent('begin_checkout', { currency: 'MXN', value: totalAfterDiscount(), coupon: couponCode || undefined, items: analyticsItems(items) });
    closeCart();
    navigate('/checkout');
  }, [items, closeCart, navigate, totalAfterDiscount, couponCode]);

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
            <div className="cart-drawer__empty">
              <ShoppingBag size={36} aria-hidden="true" />
              <p>Tu carrito está vacío</p>
              <Link to="/catalogo" onClick={closeCart} className="cart-drawer__empty-btn">
                Ver productos
              </Link>
            </div>
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
                  <span className="coupon-tag">🏷️ {couponCode} (-{discountPercentage}%)</span>
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
                  />
                  <button type="submit" className="cart-drawer__coupon-btn">Aplicar</button>
                </form>
              )}
              {couponError && <p className="cart-drawer__coupon-error">{couponError}</p>}
            </div>

            {couponCode ? (
              <>
                <div className="cart-drawer__row-item">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
                <div className="cart-drawer__row-item discount">
                  <span>Descuento ({discountPercentage}%):</span>
                  <span>-{formatCurrency(discountAmount())}</span>
                </div>
                <div className="cart-drawer__total-row cart-drawer__total-row--split">
                  <span>Total:</span>
                  <span>{formatCurrency(totalAfterDiscount())}</span>
                </div>
              </>
            ) : (
              <div className="cart-drawer__total-row">
                <span>Total:</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
            )}
            
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
