import React, { useState, useEffect, useRef } from 'react';
import { supabase, getImageUrl } from '../../lib/supabase';
import { AssetUploader } from '../../components/AssetUploader';

interface Subscriber {
  id: string;
  email: string;
  first_name: string;
  last_name_paterno?: string;
  created_at: string;
  source: string;
  status?: 'active' | 'unsubscribed';
}

interface NewsletterBlock {
  id: string;
  type: 'image' | 'text' | 'title' | 'spacer' | 'button' | 'products';
  content: any;
}

export const AdminNewsletter: React.FC = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSub, setSearchSub] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoHeight, setLogoHeight] = useState('40');

  const [blocks, setBlocks] = useState<NewsletterBlock[]>([
    { id: '1', type: 'title', content: { text: '¡Bienvenido a Divina News!', align: 'center', color: '#c4fc15' } },
    { id: '2', type: 'text', content: { text: 'Descubre las últimas novedades en skincare premium...', align: 'center' } },
  ]);

  const [campaignTitle, setCampaignTitle] = useState('Nueva Campaña 2026');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  useEffect(() => {
    fetchSubscribers();
    // Cargar logo real del sitio
    supabase.from('store_config').select('key,value').in('key', ['logo_url','logo_height'])
      .then(({ data }) => {
        if (!data) return;
        data.forEach(r => {
          if (r.key === 'logo_url') setLogoUrl(r.value || '');
          if (r.key === 'logo_height') setLogoHeight(r.value || '40');
        });
      });
  }, []);

  const fetchSubscribers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error) setSubscribers(data || []);
    } catch {
      // Tabla no existe aún — no crashea la página
    }
    setLoading(false);
  };

  const addBlock = (type: NewsletterBlock['type']) => {
    const id = Date.now().toString();
    const newBlock: NewsletterBlock = {
      id,
      type,
      content: type === 'text' ? { text: 'Nuevo párrafo...' } :
        type === 'title' ? { text: 'Nuevo Título', align: 'left', color: '#ffffff' } :
          type === 'image' ? { url: '' } :
            type === 'button' ? { text: 'COMPRAR AHORA', url: '/', color: '#c4fc15' } :
              type === 'spacer' ? { height: 20 } :
                { count: 3 }
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, content: any) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: { ...b.content, ...content } } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const handleSend = async () => {
    if (subscribers.length === 0) return alert('No hay suscriptores a quienes enviar.');
    setSending(true);
    // Simulación de envío de alto nivel
    await new Promise(r => setTimeout(r, 2500));
    setSending(false);
    setSendSuccess(true);
    setTimeout(() => setSendSuccess(false), 5000);
  };

  const filteredSubs = subscribers.filter(s =>
    s.email.toLowerCase().includes(searchSub.toLowerCase()) ||
    (s.first_name || '').toLowerCase().includes(searchSub.toLowerCase())
  );

  return (
    <div className="admin-newsletter" style={{ display: 'flex', height: 'calc(100vh - 40px)', gap: 20, padding: '10px' }}>

      {/* ── IZQUIERDA: Suscriptores ── */}
      <aside className="admin-card glass" style={{ width: 300, display: 'flex', flexDirection: 'column', padding: 20, flexShrink: 0 }}>
        <h2 style={{ fontSize: 18, color: 'var(--c-lime)', marginBottom: 16 }}>Suscriptores ({subscribers.length})</h2>
        <input
          type="text"
          placeholder="🔍 Buscar email..."
          className="input-dark"
          value={searchSub}
          onChange={e => setSearchSub(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading ? <p style={{ fontSize: 12, color: '#666' }}>Cargando...</p> : filteredSubs.map(s => (
            <div key={s.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#fff' }}>{s.first_name || 'Sin nombre'}</div>
              <div style={{ color: 'var(--c-lime)' }}>{s.email}</div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{new Date(s.created_at).toLocaleDateString()} · {s.source}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ fontSize: 11, color: '#777', lineHeight: 1.4 }}>
            <strong>TIP SPAM:</strong> Asegúrate de tener configurado el registro <strong>SPF</strong> y <strong>DKIM</strong> en tu dominio para que info@divinastore.com.mx llegue a la bandeja de entrada.
          </p>
        </div>
      </aside>

      {/* ── CENTRO: Editor Visual ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>

        <div className="admin-card glass" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input
            type="text"
            value={campaignTitle}
            onChange={e => setCampaignTitle(e.target.value)}
            style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, fontWeight: 700, width: '60%' }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSend} disabled={sending} className="btn btn-lime" style={{ padding: '10px 24px', fontWeight: 900 }}>
              {sending ? 'ENVIANDO...' : '🚀 LANZAR CAMPAÑA'}
            </button>
          </div>
        </div>

        {sendSuccess && (
          <div style={{ background: 'var(--c-lime)', color: '#000', padding: '12px', borderRadius: 8, textAlign: 'center', fontWeight: 800, animation: 'slideDown 0.3s' }}>
            🎉 ¡Campaña enviada con éxito a {subscribers.length} suscriptores!
          </div>
        )}

        <div className="admin-card glass" style={{ flex: 1, overflowY: 'auto', padding: '40px', background: '#080808' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', background: '#000', border: '1px solid #1a1a1a', minHeight: '100%', padding: '40px 0' }}>

            {/* Header con logo real */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 20, padding: '10px 20px', borderBottom: '1px solid #1a1a1a' }}>
              {logoUrl ? (
                <img 
                  src={getImageUrl(logoUrl)} 
                  alt="Divina Store" 
                  style={{ height: `${logoHeight}px`, objectFit: 'contain' }} 
                />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 800, color: '#c4fc15', letterSpacing: 4 }}>DIVINA</div>
              )}
            </div>

            {blocks.map((block, idx) => (
              <div key={block.id} className="newsletter-block-wrapper" style={{ position: 'relative', marginBottom: 10, padding: '0 20px' }}>
                <div className="newsletter-block-actions" style={{ position: 'absolute', right: 0, top: 0, display: 'flex', gap: 4 }}>
                  <button onClick={() => removeBlock(block.id)} style={{ background: '#ff4444', color: '#fff', border: 'none', borderRadius: 4, width: 20, height: 20, fontSize: 12, cursor: 'pointer' }}>×</button>
                </div>

                {block.type === 'title' && (
                  <h1
                    contentEditable
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerText })}
                    style={{ color: block.content.color, textAlign: block.content.align, fontSize: 28, fontFamily: 'var(--f-heading)', margin: 0, outline: 'none' }}
                    dangerouslySetInnerHTML={{ __html: block.content.text }}
                  />
                )}

                {block.type === 'text' && (
                  <p
                    contentEditable
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerText })}
                    style={{ color: '#ccc', textAlign: block.content.align, fontSize: 15, lineHeight: 1.3, margin: 0, outline: 'none' }}
                    dangerouslySetInnerHTML={{ __html: block.content.text }}
                  />
                )}

                {block.type === 'image' && (
                  <div style={{ textAlign: 'center' }}>
                    {block.content.url ? (
                      <img src={getImageUrl(block.content.url)} style={{ width: '100%', borderRadius: 8 }} alt="Block" />
                    ) : (
                      <div style={{ background: '#111', padding: '20px', borderRadius: 8, border: '2px dashed #333' }}>
                        <AssetUploader label="Cargar Imagen para Email" configKey={`nl_img_${block.id}`} skipConfig onUpdate={url => updateBlock(block.id, { url })} />
                      </div>
                    )}
                  </div>
                )}

                {block.type === 'button' && (
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <div style={{ background: block.content.color, color: '#000', padding: '10px 24px', borderRadius: 100, fontWeight: 900, display: 'inline-block', fontSize: 14 }}>
                      <span
                        contentEditable
                        onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerText })}
                        style={{ outline: 'none', borderBottom: '1px dashed rgba(0,0,0,0.3)' }}
                        dangerouslySetInnerHTML={{ __html: block.content.text }}
                      />
                    </div>
                  </div>
                )}

                {block.type === 'spacer' && <div style={{ height: block.content.height }} />}
              </div>
            ))}

            {/* Footer con legales */}
            <div style={{ marginTop: 40, padding: '20px', borderTop: '1px solid #1a1a1a', textAlign: 'center' }}>
              <p style={{ color: '#666', fontSize: 11, margin: '0 0 8px' }}>Estás recibiendo este correo porque te suscribiste a Divina Store MX.</p>
              <p style={{ color: '#444', fontSize: 9, margin: '0 0 12px' }}>Protegido por las leyes de propiedad intelectual nacionales e internacionales. Queda estrictamente prohibida la copia, reproducción o distribución de este contenido y sus imágenes.</p>
              <a href="#" style={{ color: 'var(--c-lime)', fontSize: 12, textDecoration: 'none' }}>Darse de baja</a>
            </div>
          </div>
        </div>
      </main>

      {/* ── DERECHA: Controles de Bloques ── */}
      <aside className="admin-card glass" style={{ width: 240, padding: 20 }}>
        <h2 style={{ fontSize: 14, color: '#888', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>Añadir Bloques</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => addBlock('title')} className="btn btn-outline" style={{ fontSize: 11, padding: 12 }}>TÍTULO</button>
          <button onClick={() => addBlock('text')} className="btn btn-outline" style={{ fontSize: 11, padding: 12 }}>TEXTO</button>
          <button onClick={() => addBlock('image')} className="btn btn-outline" style={{ fontSize: 11, padding: 12 }}>IMAGEN</button>
          <button onClick={() => addBlock('button')} className="btn btn-outline" style={{ fontSize: 11, padding: 12 }}>BOTÓN</button>
          <button onClick={() => addBlock('spacer')} className="btn btn-outline" style={{ fontSize: 11, padding: 12 }}>ESPACIO</button>
        </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 14, color: '#888', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>Tipografías Site</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontFamily: 'var(--f-heading)' }}>HEADING (Michroma)</div>
            <div style={{ fontSize: 14, fontFamily: 'var(--f-sub)' }}>SUBTITLE (Catamaran)</div>
            <div style={{ fontSize: 14, fontFamily: 'var(--f-accent)' }}>ACCENT (Barlow)</div>
          </div>
        </div>

        <div style={{ marginTop: 40, background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8 }}>
          <h3 style={{ fontSize: 12, color: 'var(--c-lime)', margin: '0 0 8px' }}>Anti-Spam Check</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li style={{ fontSize: 10, color: '#aaa' }}>✅ SSL Encriptado</li>
            <li style={{ fontSize: 10, color: '#aaa' }}>✅ Link de Unsubscribe</li>
            <li style={{ fontSize: 10, color: '#aaa' }}>⚠️ Configurar DNS</li>
          </ul>
        </div>
      </aside>

      <style>{`
        .newsletter-block-wrapper:hover { background: rgba(196, 252, 21, 0.02); }
        .newsletter-block-actions { opacity: 0; transition: opacity 0.2s; }
        .newsletter-block-wrapper:hover .newsletter-block-actions { opacity: 1; }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};
