/**
 * InfoPage.tsx — Página de información creada desde el admin (/info/:slug).
 * El contenido vive en store_config: page_<slug>_title y page_<slug>_body.
 * Formato del cuerpo: párrafos separados por línea en blanco, "## Título",
 * "- elemento" para listas y **negritas**.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getStoreConfig } from '../lib/queries';
import { Seo } from '../components/Seo';
import { NotFoundPage } from './NotFoundPage';
import './ContactPage.css';

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'p'; text: string };

/** Convierte el texto del admin en bloques. No interpreta HTML: todo se muestra como texto. */
export function parseInfoBody(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let list: string[] = [];
    let para: string[] = [];
    const flush = () => {
      if (list.length) { blocks.push({ kind: 'ul', items: list }); list = []; }
      if (para.length) { blocks.push({ kind: 'p', text: para.join(' ') }); para = []; }
    };
    for (const line of lines) {
      if (/^#{1,3}\s+/.test(line)) { flush(); blocks.push({ kind: 'h2', text: line.replace(/^#{1,3}\s+/, '') }); }
      else if (/^[-•*]\s+/.test(line)) { if (para.length) flush(); list.push(line.replace(/^[-•*]\s+/, '')); }
      else { if (list.length) flush(); para.push(line); }
    }
    flush();
  }
  return blocks;
}

/** **negritas** → <strong>, sin HTML arbitrario. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
}

export const InfoPage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const [stored, setStored] = useState<Record<string, string> | null>(null);
  // Lo que el admin está escribiendo (vista previa) siempre gana sobre lo guardado.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const config = useMemo(() => (stored ? { ...stored, ...draft } : null), [stored, draft]);

  useEffect(() => {
    window.scrollTo(0, 0);
    let alive = true;
    getStoreConfig().then((c) => { if (alive) setStored(c); });

    // Vista previa en vivo desde el admin
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'ADMIN_PREVIEW_UPDATE' && event.data.payload) {
        setDraft((prev) => ({ ...prev, ...event.data.payload }));
      }
    };
    window.addEventListener('message', onMessage);
    return () => { alive = false; window.removeEventListener('message', onMessage); };
  }, [slug]);

  const exists = useMemo(() => {
    if (!config) return false;
    try {
      const list = JSON.parse(config.admin_custom_sections || '[]');
      return Array.isArray(list) && list.some((s) => s?.key === slug && s?.type === 'page');
    } catch { return false; }
  }, [config, slug]);

  if (!config) return <div style={{ minHeight: '70vh' }} aria-busy="true" />;
  if (!exists) return <NotFoundPage />;

  const title = (config[`page_${slug}_title`] || '').trim() || slug.replace(/-/g, ' ');
  const body = config[`page_${slug}_body`] || '';
  const blocks = parseInfoBody(body);
  const plain = blocks.map((b) => (b.kind === 'ul' ? b.items.join('. ') : b.text)).join(' ').replace(/\*\*/g, '');
  const description = (plain || `${title} — Divina Store MX`).slice(0, 155);

  return (
    <div className="contact-page collection-page" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', minHeight: '80vh' }}>
      <Seo title={`${title} | Divina Store MX`} description={description} path={`/info/${slug}`} />
      <div className="page-width section" style={{ maxWidth: 800 }}>
        <h1 className="contact-page__title" style={{ fontSize: 36, fontFamily: 'var(--f-heading)', marginBottom: 32, color: 'var(--c-white)', textAlign: 'left' }}>
          {title}
        </h1>
        <div className="contact-page__form-wrapper glass" style={{ padding: 'clamp(20px, 5vw, 40px)', borderRadius: 16, color: '#ccc', lineHeight: 1.8 }}>
          {blocks.length === 0 && <p style={{ color: 'var(--c-text-muted)', margin: 0 }}>Esta página aún no tiene contenido.</p>}
          {blocks.map((b, i) => {
            if (b.kind === 'h2') return <h2 key={i} style={{ color: 'var(--c-lime)', fontSize: 20, margin: i === 0 ? '0 0 12px' : '28px 0 12px' }}><Inline text={b.text} /></h2>;
            if (b.kind === 'ul') return <ul key={i} style={{ listStyle: 'disc', paddingLeft: 22, margin: '0 0 18px' }}>{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>;
            return <p key={i} style={{ margin: '0 0 18px' }}><Inline text={b.text} /></p>;
          })}
        </div>
      </div>
    </div>
  );
};
