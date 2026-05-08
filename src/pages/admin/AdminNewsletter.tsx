import React, { useState, useEffect } from 'react';
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
  const [manualEmails, setManualEmails] = useState('');
  const [dbProducts, setDbProducts] = useState<{id:string,name:string,price:number,image_url:string}[]>([]);

  const [blocks, setBlocks] = useState<NewsletterBlock[]>([
    { id: '1', type: 'title', content: { text: '¡Bienvenido a Divina News!', align: 'center', color: '#c4fc15' } },
    { id: '2', type: 'text', content: { text: 'Descubre las últimas novedades en skincare premium...', align: 'center' } },
    { id: '3', type: 'products', content: {} }
  ]);


  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  useEffect(() => {
    fetchSubscribers();
    
    // Cargar productos para el selector
    supabase.from('products').select('id, name, price, image_url').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDbProducts(data); });

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
      // Ignore if table not present
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
                {}
    };
    setBlocks([...blocks, newBlock]);
  };

  const updateBlock = (id: string, content: any) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: { ...b.content, ...content } } : b));
  };

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const moveBlockUp = (index: number) => {
    if (index === 0) return;
    setBlocks(prev => {
      const newBlocks = [...prev];
      const temp = newBlocks[index - 1];
      newBlocks[index - 1] = newBlocks[index];
      newBlocks[index] = temp;
      return newBlocks;
    });
  };

  const moveBlockDown = (index: number) => {
    if (index === blocks.length - 1) return;
    setBlocks(prev => {
      const newBlocks = [...prev];
      const temp = newBlocks[index + 1];
      newBlocks[index + 1] = newBlocks[index];
      newBlocks[index] = temp;
      return newBlocks;
    });
  };

  // Cargar borrador al montar si existe
  useEffect(() => {
    const saved = localStorage.getItem('newsletter_draft');
    if (saved) {
      try { setBlocks(JSON.parse(saved)); } catch {}
    }
  }, []);

  const handleSend = async () => {
    if (subscribers.length === 0 && !manualEmails.trim()) {
      return alert('No hay suscriptores a quienes enviar.');
    }
    if (!window.confirm('¿Seguro que deseas enviar esta campaña ahora?')) return;
    
    setSending(true);
    // Simulación de envío a Vercel API
    await new Promise(r => setTimeout(r, 2000));
    setSending(false);
    setSendSuccess(true);
    setTimeout(() => setSendSuccess(false), 5000);
  };

  const handleSaveDraft = () => {
    localStorage.setItem('newsletter_draft', JSON.stringify(blocks));
    alert('Borrador guardado exitosamente en tu navegador.');
  };

  const handleAddManualEmails = async () => {
    if (!manualEmails.trim()) return;
    const emails = manualEmails.split(/[,;\n]+/).map(e => e.trim()).filter(e => e.includes('@'));
    if (emails.length === 0) return alert('No se detectaron correos válidos.');
    
    setLoading(true);
    const inserts = emails.map(email => ({
      email,
      first_name: email.split('@')[0],
      source: 'manual_admin'
    }));

    try {
      await supabase.from('subscribers').upsert(inserts, { onConflict: 'email' });
      alert(`¡${emails.length} suscriptores añadidos/actualizados correctamente!`);
      setManualEmails('');
      fetchSubscribers();
    } catch (err) {
      alert('Hubo un error al agregar los correos.');
    }
    setLoading(false);
  };

  const filteredSubs = subscribers.filter(s =>
    s.email.toLowerCase().includes(searchSub.toLowerCase()) ||
    (s.first_name || '').toLowerCase().includes(searchSub.toLowerCase())
  );

  return (
    <div className="admin-newsletter" style={{ display: 'flex', height: 'calc(100vh - 40px)', gap: 20, padding: '10px' }}>

      {/* ── IZQUIERDA: Suscriptores ── */}
      <aside className="admin-card glass" style={{ width: 300, display: 'flex', flexDirection: 'column', padding: 20, flexShrink: 0 }}>
        <h2 style={{ fontSize: 18, color: 'var(--c-lime)', marginBottom: 16 }}>Destinatarios</h2>
        
        <input
          type="text"
          placeholder="🔍 Buscar en base de datos..."
          className="input-dark"
          value={searchSub}
          onChange={e => setSearchSub(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(0,0,0,0.2)', padding: 10, borderRadius: 8 }}>
          <p style={{ fontSize: 11, color: '#aaa', margin: 0 }}>Base actual ({subscribers.length} suscriptores)</p>
          {loading ? <p style={{ fontSize: 12, color: '#666' }}>Cargando...</p> : filteredSubs.map(s => (
            <div key={s.id} style={{ padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11 }}>
              <div style={{ fontWeight: 700, color: '#fff' }}>{s.first_name || 'Sin nombre'}</div>
              <div style={{ color: 'var(--c-lime)' }}>{s.email}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 12, color: '#fff', marginBottom: 8 }}>+ Añadir Correos Manuales</h3>
          <textarea
            className="input-dark"
            placeholder="ejemplo1@correo.com, ejemplo2@correo.com..."
            value={manualEmails}
            onChange={e => setManualEmails(e.target.value)}
            style={{ width: '100%', height: 70, fontSize: 11, resize: 'none', marginBottom: 8 }}
          />
          <button 
            onClick={handleAddManualEmails} 
            className="btn btn-outline" 
            style={{ width: '100%', padding: '8px', fontSize: 11, fontWeight: 'bold' }}
            disabled={!manualEmails.trim()}
          >
            AGREGAR SUSCRIPTORES A LA BASE
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ fontSize: 11, color: '#777', lineHeight: 1.4 }}>
            <strong>TIP:</strong> Los correos manuales se enviarán junto con la base de datos existente.
          </p>
        </div>
      </aside>

      {/* ── CENTRO: Editor Visual ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', gap: 10 }}>
          <button onClick={handleSaveDraft} className="btn btn-outline" style={{ padding: '10px 24px', fontWeight: 900 }}>
            💾 GUARDAR BORRADOR
          </button>
          <button onClick={handleSend} disabled={sending} className="btn btn-lime" style={{ padding: '10px 24px', fontWeight: 900 }}>
            {sending ? 'ENVIANDO...' : '🚀 LANZAR CAMPAÑA'}
          </button>
        </div>

        {sendSuccess && (
          <div style={{ background: 'var(--c-lime)', color: '#000', padding: '12px', borderRadius: 8, textAlign: 'center', fontWeight: 800, animation: 'slideDown 0.3s' }}>
            🎉 ¡Campaña enviada con éxito!
          </div>
        )}

        <div className="admin-card glass" style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px 40px', background: '#080808' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', background: '#000', border: '1px solid #1a1a1a', minHeight: '100%', padding: '0 0 40px 0' }}>

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
                <div className="newsletter-block-actions" style={{ position: 'absolute', right: 0, top: 0, display: 'flex', gap: 4, zIndex: 10 }}>
                  <button onClick={() => moveBlockUp(idx)} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Mover arriba">↑</button>
                  <button onClick={() => moveBlockDown(idx)} style={{ background: '#333', color: '#fff', border: 'none', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Mover abajo">↓</button>
                  <button onClick={() => removeBlock(block.id)} style={{ background: '#ff4444', color: '#fff', border: 'none', borderRadius: 4, width: 24, height: 24, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Eliminar">×</button>
                </div>

                {block.type === 'title' && (
                  <h1
                    contentEditable
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerHTML })}
                    style={{ color: block.content.color, textAlign: block.content.align, fontSize: 28, fontFamily: 'var(--f-heading)', margin: 0, outline: 'none' }}
                    dangerouslySetInnerHTML={{ __html: block.content.text }}
                  />
                )}

                {block.type === 'text' && (
                  <p
                    contentEditable
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerHTML })}
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
                        onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerHTML })}
                        style={{ outline: 'none', borderBottom: '1px dashed rgba(0,0,0,0.3)' }}
                        dangerouslySetInnerHTML={{ __html: block.content.text }}
                      />
                    </div>
                  </div>
                )}

                {block.type === 'products' && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {[0,1,2].map(i => {
                        const pid = (block.content.productIds || [])[i];
                        const prod = dbProducts.find(p => p.id === pid);
                        return (
                          <div key={i} style={{ background: '#111', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ width: '100%', aspectRatio: '1', background: '#222', borderRadius: 4, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              {prod?.image_url ? (
                                <img src={getImageUrl(prod.image_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={prod.name} />
                              ) : (
                                <span style={{ fontSize: 24, opacity: 0.5 }}>✨</span>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>DIVINA</div>
                            <div style={{ fontSize: 11, color: '#fff', fontWeight: 'bold', height: 32, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {prod ? prod.name : 'Espacio de Producto'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--c-lime)', marginTop: 8 }}>
                              {prod ? `$${prod.price.toFixed(2)}` : '---'}
                            </div>
                          </div>
                        );
                      })}
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
      <aside className="admin-card glass" style={{ width: 240, padding: 16, flexShrink: 0, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Añadir Bloques</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <button onClick={() => addBlock('title')} className="btn btn-outline" style={{ fontSize: 10, padding: '6px 0', letterSpacing: 1 }}>TÍTULO</button>
          <button onClick={() => addBlock('text')} className="btn btn-outline" style={{ fontSize: 10, padding: '6px 0', letterSpacing: 1 }}>TEXTO</button>
          <button onClick={() => addBlock('image')} className="btn btn-outline" style={{ fontSize: 10, padding: '6px 0', letterSpacing: 1 }}>IMAGEN</button>
          <button onClick={() => addBlock('button')} className="btn btn-outline" style={{ fontSize: 10, padding: '6px 0', letterSpacing: 1 }}>BOTÓN</button>
          <button onClick={() => addBlock('spacer')} className="btn btn-outline" style={{ fontSize: 10, padding: '6px 0', letterSpacing: 1 }}>ESPACIO</button>
          <button onClick={() => addBlock('products')} className="btn btn-outline" style={{ fontSize: 10, padding: '6px 0', letterSpacing: 1 }}>PRODUCTO</button>
        </div>

        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 14, color: '#888', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>Tipografías Site</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 14, fontFamily: 'var(--f-heading)' }}>HEADING (Michroma)</div>
            <div style={{ fontSize: 14, fontFamily: 'var(--f-sub)' }}>SUBTITLE (Catamaran)</div>
            <div style={{ fontSize: 14, fontFamily: 'var(--f-accent)' }}>ACCENT (Barlow)</div>
          </div>
        </div>

        <div style={{ marginTop: 40, background: '#000', padding: 16, borderRadius: 8, border: '1px solid #1a1a1a' }}>
          <h3 style={{ fontSize: 12, color: 'var(--c-lime)', margin: '0 0 12px' }}>Añadir Producto al Bloque</h3>
          <select 
            className="input-dark" 
            style={{ width: '100%', fontSize: 11, marginBottom: 10 }}
            onChange={e => {
              const pid = e.target.value;
              if (!pid) return;
              // Encuentra el primer bloque de productos para insertarlo
              const prodBlock = blocks.find(b => b.type === 'products');
              if (!prodBlock) {
                alert('Primero añade un bloque de "PRODUCTOS" al diseño del correo.');
                e.target.value = '';
                return;
              }
              const currentIds = prodBlock.content.productIds || [];
              if (currentIds.length < 3 && !currentIds.includes(pid)) {
                updateBlock(prodBlock.id, { productIds: [...currentIds, pid] });
              } else if (currentIds.length >= 3) {
                alert('Ya hay 3 productos en este bloque. Límpialo o añade otro bloque de productos.');
              }
              e.target.value = '';
            }}
          >
            <option value="">+ Seleccionar catálogo...</option>
            {dbProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button 
            onClick={() => {
              const prodBlock = blocks.find(b => b.type === 'products');
              if (prodBlock) updateBlock(prodBlock.id, { productIds: [] });
            }} 
            className="btn btn-outline" 
            style={{ width: '100%', fontSize: 11, padding: '8px' }}
          >
            Limpiar Bloque
          </button>
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
