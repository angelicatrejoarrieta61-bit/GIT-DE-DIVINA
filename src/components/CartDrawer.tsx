import React, { useState, useCallback, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { Link, useNavigate } from 'react-router-dom';
import { getImageUrl, supabase } from '../lib/supabase';
import { getStoreConfig } from '../lib/queries';
import './CartDrawer.css';

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
    closeCart();
    navigate('/checkout');
  }, [items, closeCart, navigate]);

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
          <div>
            <h2 className="cart-drawer__title">Tu Carrito</h2>
            <p className="cart-drawer__subtitle">
              {items.length} producto{items.length !== 1 ? 's' : ''}
            </p>
          </div>

          <button
            className="cart-drawer__close"
            onClick={closeCart}
            aria-label="Cerrar carrito"
          >
            ✕
          </button>
        </div>

        {/* Items */}
        <div className="cart-drawer__items">
          {items.length === 0 ? (
            <div className="cart-drawer__empty">
              <span style={{ fontSize: 48 }}>🛍️</span>
              <p style={{ fontWeight: 600, color: '#000' }}>Tu carrito está vacío</p>
              <Link to="/catalogo" onClick={closeCart} className="btn btn-lime" style={{ background: '#000', color: '#fff' }}>
                Ver Productos
              </Link>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.product.id}-${item.variant}`} className="cart-item">
                <div className="cart-item__img">
                  {item.product.image_url ? (
                    <img src={getImageUrl(item.product.image_url)} alt={item.product.name} />
                  ) : (
                    <div className="cart-item__placeholder">📦</div>
                  )}
                </div>

                <div className="cart-item__info">
                  <span className="cart-item__brand">{item.product.brand || 'DIVINA'}</span>
                  <h3 className="cart-item__name">{item.product.name}</h3>
                  <p className="cart-item__price">{formatCurrency(item.product.price * item.quantity)}</p>
                </div>

                <div className="cart-item__controls">
                  <div className="cart-item__qty-box">
                    <button onClick={() => updateQty(item.product.id, Math.max(1, item.quantity - 1))}>−</button>
                    <span className="cart-item__qty-num">{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, item.quantity + 1)}>+</button>
                  </div>
                  <button className="cart-item__delete" onClick={() => removeItem(item.product.id)} title="Eliminar">
                    🗑️
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
                  <button onClick={removeCoupon} className="coupon-remove-btn" title="Eliminar cupón">✕</button>
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
                  <span>Descuento (10%):</span>
                  <span>-{formatCurrency(discountAmount())}</span>
                </div>
                <div className="cart-drawer__total-row" style={{ marginTop: 4, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
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
              onClick={handleCheckout} 
              disabled={checkoutState === 'loading'} 
              className="btn-checkout-main"
            >
              {checkoutState === 'loading' ? 'PROCESANDO...' : 'FINALIZAR COMPRA'}
            </button>
            
            <button onClick={closeCart} className="btn-continue-shopping">
              Seguir comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
