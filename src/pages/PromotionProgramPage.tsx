import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Seo } from '../components/Seo';
import { supabase } from '../lib/supabase';
import './PromotionProgramPage.css';

type RegistrationResult = { promoter_id: string; promoter_code: string };

export const PromotionProgramPage: React.FC = () => {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', social: '', accepted: false, website: '' });
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | ''>('');

  const promoterLink = result ? `https://www.divinastore.com.mx/?ref=${encodeURIComponent(result.promoter_code)}` : '';

  const copy = async (value: string, kind: 'code' | 'link') => {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(''), 1800);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.website) return;
    setError('');
    setLoading(true);
    try {
      const { data, error: registrationError } = await supabase.rpc('register_promoter', {
        p_full_name: form.fullName,
        p_email: form.email,
        p_phone: form.phone || null,
        p_social_handle: form.social || null,
        p_terms_accepted: form.accepted,
      });
      if (registrationError) {
        const message = registrationError.message.toLowerCase();
        if (message.includes('unique') || message.includes('duplicate')) throw new Error('Este correo ya está inscrito. Escríbenos si necesitas recuperar tu código.');
        throw registrationError;
      }
      const registration = (Array.isArray(data) ? data[0] : data) as RegistrationResult | undefined;
      if (!registration?.promoter_code) throw new Error('No pudimos generar tu código. Intenta nuevamente.');
      setResult(registration);

      const emailResponse = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'promoter-welcome',
          firstName: form.fullName,
          email: form.email,
          promoterCode: registration.promoter_code,
          promoterLink: `https://www.divinastore.com.mx/?ref=${encodeURIComponent(registration.promoter_code)}`,
        }),
      });
      if (!emailResponse.ok) console.error('[Promoters] Registration completed, but welcome email failed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos completar tu registro. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="promo-page">
      <Seo
        title="Programa de promoción: gana 12% | Divina Store"
        description="Recomienda productos Divina Store con tu código o liga personal y gana 12% por cada venta válida. Regístrate gratis."
        path="/programa-promocion"
      />

      <section className="promo-hero page-width">
        <div className="promo-hero__copy">
          <span className="promo-kicker">PROGRAMA DIVINA</span>
          <h1>Comparte belleza.<br /><span>Gana 12%.</span></h1>
          <p>Recomienda cualquier producto de Divina Store con tu código o liga personal. Por cada compra pagada que llegue de ti, acumulas el 12%.</p>
          <a className="btn btn-lime" href="#registro">Quiero inscribirme</a>
        </div>
        <div className="promo-hero__rate" aria-label="Comisión de doce por ciento">
          <strong>12%</strong>
          <span>de comisión en cualquier producto</span>
        </div>
      </section>

      <section className="promo-how page-width" aria-labelledby="como-funciona">
        <div className="promo-section-heading">
          <span>FÁCIL Y TRANSPARENTE</span>
          <h2 id="como-funciona">Así funciona</h2>
        </div>
        <div className="promo-steps">
          <article><b>01</b><h3>Regístrate</h3><p>Completa tus datos y recibe al instante tu código y liga personal.</p></article>
          <article><b>02</b><h3>Comparte</h3><p>Recomienda tus productos favoritos por WhatsApp, redes sociales o en persona.</p></article>
          <article><b>03</b><h3>Gana</h3><p>Cuando la compra se paga, registramos la venta y calculamos automáticamente tu 12%.</p></article>
        </div>
      </section>

      <section className="promo-register" id="registro">
        <div className="page-width promo-register__grid">
          <div>
            <span className="promo-kicker">ÚNETE A LA COMUNIDAD</span>
            <h2>Tu recomendación tiene valor</h2>
            <p>Inscribirte es gratis. Te enviaremos por correo tu código y la liga que usarás para compartir la tienda.</p>
            <ul className="promo-benefits">
              <li>12% sobre el total pagado de productos</li>
              <li>Válido para cualquier producto del catálogo</li>
              <li>Panel interno con tus ventas y comisión pendiente</li>
              <li>Atribución durante 30 días después de abrir tu liga</li>
            </ul>
          </div>

          <div className="promo-form-card">
            {result ? (
              <div className="promo-success" aria-live="polite">
                <span className="promo-success__eyebrow">INSCRIPCIÓN COMPLETA</span>
                <h2>¡Bienvenida/o al programa!</h2>
                <p>También enviamos estos datos a <strong>{form.email}</strong>.</p>
                <label>Tu código</label>
                <div className="promo-share-value"><strong>{result.promoter_code}</strong><button type="button" onClick={() => copy(result.promoter_code, 'code')}>{copied === 'code' ? 'Copiado' : 'Copiar'}</button></div>
                <label>Tu liga personal</label>
                <div className="promo-share-value promo-share-value--link"><span>{promoterLink}</span><button type="button" onClick={() => copy(promoterLink, 'link')}>{copied === 'link' ? 'Copiada' : 'Copiar'}</button></div>
                <Link to="/catalogo" className="btn btn-lime">Ver productos para compartir</Link>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2>Regístrate</h2>
                <p>Todos los campos marcados con * son obligatorios.</p>
                <label htmlFor="promo-name">Nombre completo *</label>
                <input id="promo-name" required minLength={3} maxLength={100} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} autoComplete="name" />
                <label htmlFor="promo-email">Correo electrónico *</label>
                <input id="promo-email" type="email" required maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                <div className="promo-form-row">
                  <div><label htmlFor="promo-phone">Teléfono</label><input id="promo-phone" type="tel" maxLength={20} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></div>
                  <div><label htmlFor="promo-social">Red social</label><input id="promo-social" maxLength={100} placeholder="@tuusuario" value={form.social} onChange={e => setForm({ ...form, social: e.target.value })} /></div>
                </div>
                <input className="promo-honeypot" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} />
                <label className="promo-check"><input type="checkbox" required checked={form.accepted} onChange={e => setForm({ ...form, accepted: e.target.checked })} /><span>Acepto las reglas del programa y confirmo que mis datos son correctos. *</span></label>
                {error && <p className="promo-error" role="alert">{error}</p>}
                <button className="btn btn-lime promo-submit" disabled={loading}>{loading ? 'Creando tu código…' : 'Crear mi código'}</button>
                <small>Al registrarte recibirás un correo automático de confirmación.</small>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="promo-rules page-width" aria-labelledby="reglas-programa">
        <div className="promo-section-heading"><span>CLARO DESDE EL INICIO</span><h2 id="reglas-programa">Reglas del programa</h2></div>
        <ol>
          <li><strong>Comisión:</strong> ganas el 12% del total pagado de productos en cada venta válida atribuida a tu código o liga.</li>
          <li><strong>Productos:</strong> participan todos los productos disponibles en Divina Store.</li>
          <li><strong>Atribución:</strong> la persona debe comprar usando tu código o haber abierto tu liga en los últimos 30 días.</li>
          <li><strong>Venta válida:</strong> el pedido debe estar pagado. Pedidos cancelados, rechazados o reembolsados no generan comisión.</li>
          <li><strong>Promoción responsable:</strong> no se permite spam, información engañosa, suplantar a Divina Store ni prometer resultados médicos.</li>
          <li><strong>Pago:</strong> Divina Store revisa en su panel las ventas y confirma el pago de la comisión con cada participante.</li>
        </ol>
        <p>¿Tienes dudas? <Link to="/contacto">Contáctanos</Link> y con gusto te ayudamos.</p>
      </section>
    </div>
  );
};
