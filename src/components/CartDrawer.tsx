import React from 'react';
import { useCartStore } from '../store/cartStore';
import { Link } from 'react-router-dom';
import { getImageUrl } from '../lib/supabase';
import './CartDrawer.css';

export const CartDrawer: React.FC = () => {
  const { items, isOpen, closeCart, removeItem, updateQty, total } = useCartStore();
  const cartTotal = total();

  return (
    <>
      {isOpen && <div className="cart-overlay" onClick={closeCart} />}

      <aside className={`cart-drawer ${isOpen ? 'cart-drawer--open' : ''}`} aria-label="Carrito de compras">
        {/* Header */}
        <div className="cart-drawer__header">
          <div>
            <h2 className="cart-drawer__title">Tu Carrito</h2>
            <p className="cart-drawer__subtitle">{items.length} producto{items.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="cart-drawer__close" onClick={closeCart} aria-label="Cerrar carrito">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Items */}
        <div className="cart-drawer__items">
          {items.length === 0 ? (
            <div className="cart-drawer__empty">
              <div className="cart-drawer__empty-icon">🛍️</div>
              <p>Tu carrito está vacío</p>
              <Link to="/catalogo" onClick={closeCart} className="btn btn-lime" style={{ marginTop: 16 }}>
                Ver Productos
              </Link>
            </div>
          ) : (
            items.map(item => (
              <div key={`${item.product.id}-${item.variant}`} className="cart-item">
                {/* Image */}
                <div className="cart-item__img">
                  {item.product.image_url ? (
                    <img src={getImageUrl(item.product.image_url, { width: 160, quality: 75 })} alt={item.product.name} loading="lazy" />
                  ) : (
                    <div className="cart-item__placeholder">🌿</div>
                  )}
                </div>

                {/* Info */}
                <div className="cart-item__info">
                  <p className="cart-item__brand">{item.product.brand}</p>
                  <p className="cart-item__name">{item.product.name}</p>
                  {item.variant && <p className="cart-item__variant">{item.variant}</p>}
                  <p className="cart-item__price">
                    ${(item.product.price * item.quantity).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                  </p>
                </div>

                {/* Quantity */}
                <div className="cart-item__actions">
                  <div className="cart-item__qty">
                    <button onClick={() => updateQty(item.product.id, item.quantity - 1)}>−</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => updateQty(item.product.id, item.quantity + 1)}>+</button>
                  </div>
                  <button className="cart-item__remove" onClick={() => removeItem(item.product.id)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                      <path d="M10 11v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__total">
              <span>Total</span>
              <span className="cart-drawer__total-amount">
                ${cartTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
              </span>
            </div>
            <p className="cart-drawer__note">Envío calculado al finalizar</p>
            <Link to="/checkout" onClick={closeCart} className="btn btn-lime cart-drawer__checkout-btn">
              Proceder al Pago con Clip →
            </Link>
            <button onClick={closeCart} className="btn btn-outline cart-drawer__continue-btn">
              Seguir comprando
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
