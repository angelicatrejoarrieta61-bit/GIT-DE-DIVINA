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
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });

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
    const totalRecipients = subscribers.length;
    if (totalRecipients === 0 && !manualEmails.trim()) {
      return alert('No hay suscriptores a quienes enviar.');
    }
    if (!window.confirm(`¿Seguro que deseas lanzar esta campaña a los ${totalRecipients} suscriptores de la base de datos ahora?`)) return;
    
    setSending(true);
    setSendProgress({ current: 0, total: totalRecipients });

    // Generar HTML a partir de los bloques
    let htmlBody = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#000;color:#fff;padding:40px 20px;">`;
    if (logoUrl) htmlBody += `<div style="text-align:center;margin-bottom:30px;"><img src="${getImageUrl(logoUrl)}" style="height:${logoHeight}px;"/></div>`;
    
    blocks.forEach(b => {
      if (b.type === 'title') htmlBody += `<h1 style="color:${b.content.color || '#fff'};text-align:center;margin:10px 0;">${b.content.text}</h1>`;
      if (b.type === 'text') htmlBody += `<p style="color:#ccc;text-align:center;line-height:1.5;">${b.content.text}</p>`;
      if (b.type === 'spacer') htmlBody += `<div style="height:${b.content.height || 20}px;"></div>`;
      if (b.type === 'image' && b.content.url) htmlBody += `<div style="text-align:center;"><img src="${getImageUrl(b.content.url)}" style="max-width:100%;border-radius:8px;"/></div>`;
      if (b.type === 'button') htmlBody += `<div style="text-align:center;margin:20px 0;"><a href="${b.content.url}" style="display:inline-block;background:${b.content.color || '#c4fc15'};color:#000;padding:12px 24px;border-radius:30px;text-decoration:none;font-weight:bold;">${b.content.text}</a></div>`;
      if (b.type === 'products') {
         const pIds = b.content.productIds || [];
         if (pIds.length > 0) {
           htmlBody += `<div style="text-align:center;margin:20px 0;">`;
           pIds.forEach((pid: string) => {
             const p = dbProducts.find(x => x.id === pid);
             if (p) {
               htmlBody += `
                 <div style="background:#111;padding:15px;border-radius:8px;margin-bottom:10px;text-align:center;">
                   ${p.image_url ? `<img src="${getImageUrl(p.image_url)}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;margin-bottom:10px;"/>` : ''}
                   <div style="font-weight:bold;color:#fff;margin-bottom:5px;">${p.name}</div>
                   <div style="color:#c4fc15;">$${p.price.toFixed(2)}</div>
                 </div>
               `;
             }
           });
           htmlBody += `</div>`;
         }
      }
    });
    htmlBody += `
      <hr style="border:none;border-top:1px solid #333;margin:40px 0;"/>
      <div style="text-align:center;color:#666;font-size:11px;">
        <p>Has recibido este correo porque te suscribiste a Divina Store MX.</p>
        <p>No respondas a este correo generado automáticamente.</p>
      </div>
    </div>`;

    // ENVÍO SECUENCIAL DESDE EL CLIENTE (Evita Timeouts de Vercel)
    let errors = 0;
    for (let i = 0; i < subscribers.length; i++) {
      const s = subscribers[i];
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'campaign',
            subject: 'Novedades exclusivas de Divina Store ✨',
            to: s.email,
            htmlBody: htmlBody
          })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Error en servidor');
        }

        setSendProgress(prev => ({ ...prev, current: i + 1 }));
        // Pequeña pausa para no saturar al servidor
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        console.error(`Error enviando a ${s.email}:`, err);
        errors++;
      }
    }

    setSending(false);
    if (errors === 0) {
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 5000);
    } else {
      alert(`Campaña finalizada con ${errors} errores. Revisa la consola para más detalles.`);
    }
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
      const { error } = await supabase.from('subscribers').upsert(inserts, { onConflict: 'email' });
      if (error) throw error;
      
      alert(`¡${emails.length} suscriptores añadidos/actualizados correctamente!`);
      setManualEmails('');
      
      // Update local state immediately so they appear in the list
      const newSubs = inserts.map(i => ({ ...i, id: Date.now().toString() + Math.random(), created_at: new Date().toISOString() })) as Subscriber[];
      setSubscribers(prev => {
        const combined = [...newSubs, ...prev];
        // remove duplicates
        return combined.filter((v, i, a) => a.findIndex(t => t.email === v.email) === i);
      });
      
    } catch (err) {
      console.error(err);
      alert('Hubo un error al agregar los correos. Verifica los permisos de la base de datos.');
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
          placeholder="🔍 Buscar..."
          className="input-dark"
          value={searchSub}
          onChange={e => setSearchSub(e.target.value)}
          style={{ marginBottom: 10, fontSize: 11, padding: '6px 10px', height: 'auto' }}
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
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleSaveDraft} className="btn btn-outline" style={{ padding: '10px 24px', fontWeight: 900 }}>
              💾 GUARDAR BORRADOR
            </button>
            <button 
              onClick={async () => {
                try {
                  const res = await fetch('/api/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'test' })
                  });
                  const data = await res.json();
                  if (data.ok) alert(`✅ SUCCESS: ${data.message}`);
                  else alert(`❌ ERROR: ${data.error}\nConfig Detectada: ${JSON.stringify(data.config, null, 2)}`);
                } catch (e) {
                  alert('Fallo total de conexión con la API.');
                }
              }} 
              className="btn btn-outline" 
              style={{ padding: '10px 24px', fontWeight: 900, borderColor: '#444' }}
            >
              🔍 PROBAR CONEXIÓN SMTP
            </button>
          </div>
          <button onClick={handleSend} disabled={sending} className="btn btn-lime" style={{ padding: '10px 24px', fontWeight: 900 }}>
            {sending ? 'ENVIANDO...' : '🚀 LANZAR CAMPAÑA'}
          </button>
        </div>

        {sending && (
          <div style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '12px', borderRadius: 8, textAlign: 'center', fontWeight: 600 }}>
            🚀 Enviando: {sendProgress.current} de {sendProgress.total} suscriptores...
            <div style={{ width: '100%', height: 4, background: '#222', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%`, height: '100%', background: 'var(--c-lime)', transition: 'width 0.3s' }} />
            </div>
          </div>
        )}

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
                    style={{ color: block.content.color, textAlign: 'center', fontSize: 28, fontFamily: 'var(--f-heading)', margin: 0, outline: 'none' }}
                    dangerouslySetInnerHTML={{ __html: block.content.text }}
                  />
                )}

                {block.type === 'text' && (
                  <p
                    contentEditable
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerHTML })}
                    style={{ color: '#ccc', textAlign: 'center', fontSize: 14, fontFamily: 'var(--f-sub)', lineHeight: 1.4, margin: 0, outline: 'none' }}
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
        <h2 style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Añadir Bloques</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {['title', 'image', 'spacer', 'text', 'button', 'products'].map(type => (
            <button 
              key={type}
              onClick={() => addBlock(type as any)} 
              style={{ 
                display: 'flex', justifyContent: 'center', alignItems: 'center', 
                fontSize: 9, padding: '6px 0', letterSpacing: 1, color: '#fff', 
                background: 'linear-gradient(145deg, #555, #222)', 
                boxShadow: '0 4px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                border: '1px solid #111', borderRadius: 4, cursor: 'pointer',
                textTransform: 'uppercase', fontWeight: 'bold'
              }}
            >
              {type === 'products' ? 'PRODUCTO' : type === 'spacer' ? 'ESPACIO' : type === 'image' ? 'IMAGEN' : type === 'button' ? 'BOTÓN' : type === 'title' ? 'TÍTULO' : 'TEXTO'}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 8, background: '#000', padding: 12, borderRadius: 8, border: '1px solid #1a1a1a' }}>
          <h3 style={{ fontSize: 12, color: 'var(--c-lime)', margin: '0 0 12px' }}>Añadir Producto al Bloque</h3>
          <select 
            className="input-dark" 
            style={{ width: '100%', fontSize: 11, marginBottom: 10, backgroundColor: '#000', color: '#fff', border: '1px solid #333' }}
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
            style={{ 
              width: '100%', fontSize: 9, padding: '8px 0', letterSpacing: 1, color: '#fff', 
              background: 'linear-gradient(145deg, #555, #222)', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
              border: '1px solid #111', borderRadius: 4, cursor: 'pointer',
              textTransform: 'uppercase', fontWeight: 'bold'
            }}
          >
            LIMPIAR BLOQUE
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
