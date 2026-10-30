/**
 * MyOrderPage.tsx — /mi-pedido
 * - ?id=<id> (liga del correo o de la página de pago exitoso): abre ese pedido.
 * - Pedidos comprados en este dispositivo: se listan solos.
 * - Cualquier otro: número de pedido (8 caracteres) + correo con el que compró.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Package, Search } from 'lucide-react';
import { OrderView } from '../components/OrderView';
import {
  ORDER_STATUS, forgetOrder, lookupOrder, orderDate, orderMoney, rememberOrder, savedOrderIds, type PublicOrder,
} from '../lib/orderPublic';
import './OrderPages.css';

export const MyOrderPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const linkId = params.get('id');
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const loadSaved = useCallback(async () => {
    const ids = [...new Set([...(linkId ? [linkId] : []), ...savedOrderIds()])];
    if (!ids.length) { setLoading(false); return; }
    const found = await Promise.all(ids.map(async (id) => {
      try { return await lookupOrder({ orderId: id }); } catch { if (id !== linkId) forgetOrder(id); return null; }
    }));
    const list = found.filter((o): o is PublicOrder => Boolean(o));
    setOrders(list);
    if (linkId && list.some((o) => o.id === linkId)) { rememberOrder(linkId); setOpen(linkId); }
    else if (list.length === 1) setOpen(list[0].id);
    if (linkId && !list.some((o) => o.id === linkId)) setError('No encontramos el pedido de esa liga. Búscalo con tu número de pedido y tu correo.');
    setLoading(false);
  }, [linkId]);

  useEffect(() => { void loadSaved(); }, [loadSaved]);

  const numberClean = number.trim().replace(/^#/, '');
  const numberErr = !/^[0-9a-f]{8}$/i.test(numberClean) ? 'Son 8 letras y números (ej. 3C7F2752)' : '';
  const emailErr = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Escribe el correo con el que compraste' : '';

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    if (numberErr || emailErr) return;
    setSearching(true);
    try {
      const o = await lookupOrder({ number: numberClean, email: email.trim() });
      rememberOrder(o.id);
      setOrders((list) => [o, ...list.filter((x) => x.id !== o.id)]);
      setOpen(o.id);
      setParams({ id: o.id }, { replace: true });
      setNumber(''); setEmail(''); setTouched(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="op">
      <section className="op-band">
        <div className="op-band__in">
          <span className="op-band__icon" aria-hidden="true"><Package size={22} /></span>
          <div>
            <h1>Mi pedido</h1>
            <p>Revisa el estado de tu compra, la forma de entrega y tu número de guía.</p>
          </div>
        </div>
      </section>

      <div className="op-wrap">
        {loading ? (
          <div className="op-list" aria-busy="true"><div className="op-skel" /><div className="op-skel" /></div>
        ) : orders.length > 0 && (
          <div className="op-list">
            {orders.map((o) => {
              const isOpen = open === o.id;
              const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'info' as const };
              const units = o.items.reduce((s, i) => s + i.qty, 0);
              return (
                <React.Fragment key={o.id}>
                  <button type="button" className="op-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : o.id)}>
                    {isOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                    <span className="op-row__main">
                      <strong>#{o.number}</strong>
                      <span>{orderDate(o.created_at)} · {units} pieza{units === 1 ? '' : 's'} · {orderMoney(o.total)}</span>
                    </span>
                    <span className={`op-tag t-${st.tone}`}>{st.label}</span>
                  </button>
                  {isOpen && <OrderView order={o} />}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <form className="op-find" onSubmit={search} noValidate>
          <h2>{orders.length ? '¿Buscas otro pedido?' : 'Consulta tu pedido'}</h2>
          <div className="op-find__row">
            <label className="op-field">Número de pedido
              <input value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} placeholder="Ej. 3C7F2752" maxLength={9}
                autoComplete="off" autoCapitalize="characters" aria-invalid={touched && !!numberErr} />
            </label>
            <label className="op-field">Correo con el que compraste
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com"
                autoComplete="email" inputMode="email" aria-invalid={touched && !!emailErr} />
            </label>
            <button type="submit" className="op-btn op-btn--primary" disabled={searching}>
              <Search size={15} aria-hidden="true" /> {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {touched && (numberErr || emailErr) && <p className="op-error" role="alert">{numberErr || emailErr}</p>}
          {error && <p className="op-error" role="alert">{error}</p>}
          <p className="op-muted" style={{ margin: 0 }}>El número viene en el correo de confirmación (“Recibimos tu pedido #…”).</p>
        </form>

        {!loading && !orders.length && (
          <p className="op-empty">¿Aún no compras? <Link to="/catalogo">Ver productos</Link></p>
        )}
      </div>
    </div>
  );
};
