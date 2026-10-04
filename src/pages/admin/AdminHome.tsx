/**
 * AdminHome.tsx — Resumen del negocio (portada del admin).
 * Solo lee datos; cada tarjeta lleva a la pantalla donde se atiende.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Package, Mail, Megaphone, PenLine, Search, ArrowRight, type LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './AdminHome.css';

interface OrderRow { id: string; total: number | null; status: string | null; created_at: string; customer_name: string | null }
interface Stats {
  monthSales: number; monthOrders: number; toShip: number; pendingPay: number;
  products: number; noPhoto: number; hidden: number; noCost: number;
  subscribers: number | null; posts: number | null; messages: number | null;
  recent: OrderRow[];
}

const PAID = ['paid', 'shipped', 'delivered'];
const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente de pago', paid: 'Pagado', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' };
const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

async function countOf(table: string, filter?: (q: any) => any): Promise<number | null> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count, error } = await q;
  return error ? null : count ?? 0;
}

function Card({ to, icon: Icon, label, value, note, tone }: { to: string; icon: LucideIcon; label: string; value: string; note: string; tone?: 'warn' | 'ok' }) {
  return (
    <Link to={to} className={`home-card ${tone ? `home-card--${tone}` : ''}`}>
      <span className="home-card__k"><Icon size={14} aria-hidden="true" /> {label}</span>
      <span className="home-card__v">{value}</span>
      <span className="home-card__n">{note} <ArrowRight size={12} aria-hidden="true" /></span>
    </Link>
  );
}

export const AdminHome: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const [orders, products, subscribers, posts, messages] = await Promise.all([
        supabase.from('orders').select('id,total,status,created_at,customer_name').order('created_at', { ascending: false }).limit(500),
        supabase.from('products').select('id,image_url,in_stock,cost_price,fulfillment').limit(2000),
        countOf('subscribers'),
        countOf('blog_posts', (q) => q.eq('published', true)),
        countOf('contact_messages', (q) => q.eq('status', 'pending')),
      ]);
      if (orders.error && products.error) { setError(orders.error.message); return; }
      const o = (orders.data ?? []) as OrderRow[];
      const p = (products.data ?? []) as Array<{ image_url: string | null; in_stock: boolean; cost_price: number | null; fulfillment: string | null }>;
      const month = o.filter((x) => x.created_at >= monthStart && PAID.includes(x.status ?? ''));
      setStats({
        monthSales: month.reduce((s, x) => s + Number(x.total ?? 0), 0),
        monthOrders: month.length,
        toShip: o.filter((x) => x.status === 'paid').length,
        pendingPay: o.filter((x) => x.status === 'pending').length,
        products: p.length,
        noPhoto: p.filter((x) => !x.image_url).length,
        hidden: p.filter((x) => !x.in_stock).length,
        noCost: p.filter((x) => x.fulfillment === 'bajo_pedido' && x.cost_price == null).length,
        subscribers, posts, messages,
        recent: o.slice(0, 5),
      });
    })();
  }, []);

  const monthName = new Date().toLocaleDateString('es-MX', { month: 'long' });

  return (
    <div className="home">
      <header className="home__head">
        <h1 className="admin-page-title">Resumen</h1>
        <p className="home__sub">Lo que necesita tu atención hoy en Divina.</p>
      </header>

      {error && <div className="adm-error" role="alert">No pude leer los datos: {error}</div>}

      {!stats && !error && (
        <div className="home-grid" aria-busy="true">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="home-card home-card--skel" />)}</div>
      )}

      {stats && (
        <>
          <div className="home-grid">
            <Card to="/admin/reportes" icon={ClipboardList} label={`Ventas de ${monthName}`} value={money(stats.monthSales)} note={`${stats.monthOrders} pedido${stats.monthOrders === 1 ? '' : 's'} pagado${stats.monthOrders === 1 ? '' : 's'}`} />
            <Card to="/admin/reportes" icon={ClipboardList} label="Por surtir y enviar" value={String(stats.toShip)} note={stats.toShip ? 'Pedidos pagados sin enviar' : 'Nada pendiente de envío'} tone={stats.toShip ? 'warn' : 'ok'} />
            <Card to="/admin/reportes" icon={ClipboardList} label="Pendientes de pago" value={String(stats.pendingPay)} note="Pedidos iniciados sin pagar" />
            <Card to="/admin/productos" icon={Package} label="Productos" value={String(stats.products)} note={`${stats.hidden} oculto${stats.hidden === 1 ? '' : 's'} de la tienda`} />
            <Card to="/admin/productos" icon={Package} label="Sin foto" value={String(stats.noPhoto)} note={stats.noPhoto ? 'Súbeles foto para venderlos' : 'Todos tienen foto'} tone={stats.noPhoto ? 'warn' : 'ok'} />
            <Card to="/admin/mensajes" icon={Mail} label="Mensajes por atender" value={stats.messages === null ? '—' : String(stats.messages)} note={stats.messages === null ? 'Falta activar la tabla de mensajes' : 'Del formulario de contacto'} tone={stats.messages ? 'warn' : undefined} />
            <Card to="/admin/newsletter" icon={Megaphone} label="Suscriptores" value={stats.subscribers === null ? '—' : String(stats.subscribers)} note="En tu lista de correo" />
            <Card to="/admin/blog" icon={PenLine} label="Artículos publicados" value={stats.posts === null ? '—' : String(stats.posts)} note="En el blog" />
          </div>

          <div className="home-cols">
            <section className="home-panel">
              <h2>Últimos pedidos</h2>
              {stats.recent.length === 0 ? (
                <p className="home-empty">Aún no hay pedidos.</p>
              ) : (
                <ul className="home-list">
                  {stats.recent.map((o) => (
                    <li key={o.id}>
                      <div>
                        <strong>{o.customer_name || 'Cliente'}</strong>
                        <span>{new Date(o.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} · {STATUS_LABEL[o.status ?? ''] ?? o.status ?? '—'}</span>
                      </div>
                      <b>{money(Number(o.total ?? 0))}</b>
                    </li>
                  ))}
                </ul>
              )}
              <Link to="/admin/reportes" className="home-more">Ver todos los pedidos <ArrowRight size={13} aria-hidden="true" /></Link>
            </section>

            <section className="home-panel">
              <h2>Accesos rápidos</h2>
              <div className="home-quick">
                <Link to="/admin/abastecimiento"><Search size={15} aria-hidden="true" /> Buscar dónde comprar un producto</Link>
                <Link to="/admin/productos"><Package size={15} aria-hidden="true" /> Editar precios y fotos</Link>
                <Link to="/admin/blog"><PenLine size={15} aria-hidden="true" /> Escribir un artículo</Link>
                <Link to="/admin/config?section=home&part=home-order"><ArrowRight size={15} aria-hidden="true" /> Cambiar el Home de la tienda</Link>
              </div>
              {stats.noCost > 0 && <p className="home-tip">{stats.noCost} producto{stats.noCost === 1 ? '' : 's'} bajo pedido sin costo registrado: búscale proveedor en Abastecimiento para conocer tu margen.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
};
