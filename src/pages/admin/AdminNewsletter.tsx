import React, { useState, useEffect, useCallback } from 'react';
import { supabase, getImageUrl } from '../../lib/supabase';
import { AssetUploader } from '../../components/AssetUploader';
import * as XLSX from 'xlsx';

interface Subscriber {
  id: string;
  email: string;
  first_name: string;
  last_name_paterno?: string;
  last_name_materno?: string;
  birth_date?: string;
  created_at: string;
  source: string;
  status?: 'active' | 'unsubscribed';
}

interface NewsletterBlock {
  id: string;
  type: 'image' | 'text' | 'title' | 'spacer' | 'button' | 'products' | 'greeting';
  content: any;
}

const DEFAULT_BLOCKS: NewsletterBlock[] = [
  { id: '1', type: 'title', content: { text: '¡Bienvenido a Divina News!', align: 'center', color: '#c4fc15' } },
  { id: '2', type: 'text', content: { text: 'Descubre las últimas novedades en skincare premium...', align: 'center' } },
  { id: '3', type: 'products', content: { productIds: [] } },
];

export const AdminNewsletter: React.FC = () => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchSub, setSearchSub] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoHeight, setLogoHeight] = useState('40');
  const [bgColor, setBgColor] = useState('#000000');
  const [bgImage, setBgImage] = useState('');
  const [manualEmails, setManualEmails] = useState('');
  const [dbProducts, setDbProducts] = useState<{ id: string; name: string; price: number; image_url: string }[]>([]);
  const [blocks, setBlocks] = useState<NewsletterBlock[]>(DEFAULT_BLOCKS);

  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [showBgConfig, setShowBgConfig] = useState(false);

  // Gestión de suscriptores
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ── Filtrado de la base de datos ──
  const filteredSubs = subscribers.filter(s =>
    s.email.toLowerCase().includes(searchSub.toLowerCase()) ||
    (s.first_name || '').toLowerCase().includes(searchSub.toLowerCase())
  );

  // ── FIX 1: Un único useEffect de inicialización — orden garantizado ──
  useEffect(() => {
    // Cargar borrador primero (sincrónico)
    const saved = localStorage.getItem('newsletter_draft');
    if (saved) {
      try { setBlocks(JSON.parse(saved)); } catch { /* borrador corrupto — ignorar */ }
    }

    // Luego fetch asíncrono en paralelo
    fetchSubscribers();

    supabase
      .from('products')
      .select('id, name, price, image_url')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDbProducts(data); });

    supabase
      .from('store_config')
      .select('key,value')
      .in('key', ['logo_url', 'logo_height'])
      .then(({ data }) => {
        if (!data) return;
        data.forEach(r => {
          if (r.key === 'logo_url') setLogoUrl(r.value || '');
          if (r.key === 'logo_height') setLogoHeight(r.value || '40');
        });
      });
  }, []);

  const fetchSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setSubscribers(data);
    } catch { /* tabla no existe aún */ }
    setLoading(false);
  }, []);

  // ── Bloques ──
  const addBlock = (type: NewsletterBlock['type']) => {
    const id = Date.now().toString();
    const defaults: Record<NewsletterBlock['type'], any> = {
      title: { text: 'Nuevo Título', align: 'center', color: '#ffffff' },
      text: { text: 'Nuevo párrafo...' },
      image: { url: '' },
      button: { text: 'COMPRAR AHORA', url: '/', color: '#c4fc15' },
      spacer: { height: 20 },
      products: { productIds: [] },
      greeting: { prefix: '¡Hola, ', suffix: '!', color: '#c4fc15' },
    };
    setBlocks(prev => [...prev, { id, type, content: defaults[type] }]);
  };

  const updateBlock = (id: string, content: any) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: { ...b.content, ...content } } : b));

  const removeBlock = (id: string) =>
    setBlocks(prev => prev.filter(b => b.id !== id));

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    setBlocks(prev => {
      const arr = [...prev];
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
  };

  // ── FIX 2: addProductToBlock recibe blockId explícito ──
  const addProductToBlock = (blockId: string, pid: string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const currentIds: string[] = block.content.productIds || [];
    if (currentIds.length >= 3) {
      alert('Máximo 3 productos por bloque. Limpia el bloque o añade otro bloque de PRODUCTOS.');
      return;
    }
    if (currentIds.includes(pid)) return;
    updateBlock(blockId, { productIds: [...currentIds, pid] });
  };

  // ── FIX 3: handleAddManualEmails usa fetchSubscribers real ──
  const handleAddManualEmails = async () => {
    if (!manualEmails.trim()) return;
    const emails = manualEmails
      .split(/[,;\n]+/)
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    if (emails.length === 0) { alert('No se detectaron correos válidos.'); return; }

    setLoading(true);
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

    const inserts = emails.map(email => {
      const name = email.split('@')[0];
      return {
        email,
        first_name: capitalize(name),
        source: 'manual_admin',
      };
    });

    try {
      const { error } = await supabase
        .from('subscribers')
        .upsert(inserts, { onConflict: 'email' });
      if (error) throw error;

      alert(`${emails.length} suscriptores añadidos/actualizados.`);
      setManualEmails('');

      // ── Re-fetch real para que el estado refleje IDs reales de Supabase ──
      await fetchSubscribers();
    } catch (err) {
      console.error(err);
      alert('Error al agregar correos. Verifica los permisos RLS de la tabla subscribers.');
    }
    setLoading(false);
  };

  const handleDeleteSubscriber = async (id: string) => {
    if (!window.confirm('¿Eliminar suscriptor permanentemente?')) return;
    try {
      const { error } = await supabase.from('subscribers').delete().eq('id', id);
      if (error) throw error;
      setSubscribers(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert('Error al eliminar.');
    }
  };

  const handleUpdateSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub) return;
    setLoading(true);
    const capitalize = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
    
    try {
      const updateData: any = {
        first_name: capitalize(editingSub.first_name || ''),
        last_name_paterno: capitalize(editingSub.last_name_paterno || ''),
        last_name_materno: capitalize(editingSub.last_name_materno || ''),
        birth_date: editingSub.birth_date || null,
      };

      const { error } = await supabase
        .from('subscribers')
        .update(updateData)
        .eq('id', editingSub.id);
      
      if (error) {
        console.error('Supabase Error:', error);
        throw new Error(error.message);
      }

      setSubscribers(prev => prev.map(s => s.id === editingSub.id ? editingSub : s));
      setIsModalOpen(false);
      setEditingSub(null);
      alert('¡Suscriptor actualizado con éxito!');
    } catch (err: any) {
      alert(`Error al actualizar: ${err.message || 'Verifica que las columnas existan en Supabase'}`);
    }
    setLoading(false);
  };

  const handleSaveDraft = () => {
    localStorage.setItem('newsletter_draft', JSON.stringify(blocks));
    alert('Borrador guardado en navegador.');
  };

  // ── Construir HTML del email ──
  const buildHtml = (): string => {
    const bgStyle = bgImage 
      ? `background-image:url(${getImageUrl(bgImage)});background-size:cover;background-position:center;`
      : `background-color:${bgColor};`;

    let html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#fff;padding:20px 10px;${bgStyle}">`;

    if (logoUrl) {
      html += `<div style="text-align:center;margin-bottom:15px;">
        <img src="${getImageUrl(logoUrl)}" style="height:${logoHeight}px;"/>
      </div>`;
    }

    blocks.forEach(b => {
      if (b.type === 'greeting') {
        html += `<h2 style="color:${b.content.color || '#c4fc15'};text-align:center;margin:10px 0;font-size:22px;">
          ${b.content.prefix || '¡Hola, '}{{nombre}}${b.content.suffix || '!'}
        </h2>`;
      }
      if (b.type === 'title') {
        html += `<h1 style="color:${b.content.color || '#fff'};text-align:center;margin:5px 0;font-size:24px;">${b.content.text}</h1>`;
      }
      if (b.type === 'text') {
        html += `<p style="color:#ccc;text-align:center;line-height:1.4;margin:5px 0;font-size:14px;">${b.content.text}</p>`;
      }
      if (b.type === 'spacer') {
        html += `<div style="height:${b.content.height || 10}px;"></div>`;
      }
      if (b.type === 'image' && b.content.url) {
        html += `<div style="text-align:center;margin:10px 0;">
          <img src="${getImageUrl(b.content.url)}" style="max-width:100%;border-radius:4px;"/>
        </div>`;
      }
      if (b.type === 'button') {
        html += `<div style="text-align:center;margin:15px 0;">
          <a href="${b.content.url}" style="display:inline-block;background:${b.content.color || '#c4fc15'};color:#000;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:bold;font-size:13px;">
            ${b.content.text}
          </a>
        </div>`;
      }
      if (b.type === 'products') {
        const pIds: string[] = b.content.productIds || [];
        if (pIds.length > 0) {
          html += `<div style="display:flex;gap:8px;justify-content:center;margin:15px 0;">`;
          pIds.forEach(pid => {
            const p = dbProducts.find(x => x.id === pid);
            if (!p) return;
            html += `
              <div style="background:#111;padding:10px;border-radius:4px;text-align:center;flex:1;">
                ${p.image_url ? `<img src="${getImageUrl(p.image_url)}" style="width:100px;height:100px;object-fit:cover;border-radius:4px;margin-bottom:8px;"/>` : ''}
                <div style="font-weight:bold;color:#fff;margin-bottom:4px;font-size:11px;">${p.name}</div>
                <div style="color:#c4fc15;font-size:12px;">$${p.price.toFixed(2)}</div>
              </div>`;
          });
          html += `</div>`;
        }
      }
    });

    html += `
      <div style="text-align:center;color:#444;font-size:9px;margin-top:20px;border-top:1px solid #111;padding-top:10px;line-height:1.1;font-family:sans-serif;">
        <p style="margin:0;">&copy; ${new Date().getFullYear()} DIVINASTORE.COM.MX — Todos los derechos reservados.</p>
        <p style="margin:4px 0 0;">Estás recibiendo este mensaje porque te registraste voluntariamente en nuestra tienda o suscribiste a nuestro newsletter. Si ya no deseas recibirlo, puedes en cualquier momento enviando un correo a info@divinastore.com.mx</p>
        <p style="margin:2px 0 0;">Consulta nuestra Politica de privacidad en nuestro sitio www.divinastore.com.mx para conocer cómo tratamos tus datos. (Cumbres de maltrata 202 col. narvarte cp 03020). Informacion: info@divinastore.com.mx</p>
      </div>
    </div>`;

    return html;
  };

  // ── FIX 4: total se fija DESPUÉS de conocer la lista real ──
  const handleSend = async () => {
    const list = subscribers.filter(s => selectedIds.has(s.id));

    if (list.length === 0) {
      alert('Selecciona al menos un destinatario en la lista de la izquierda.');
      return;
    }
    if (!window.confirm(`¿Lanzar esta campaña a los ${list.length} suscriptores seleccionados?`)) return;

    setSending(true);
    setSendProgress({ current: 0, total: list.length });

    const baseHtml = buildHtml();
    let errors = 0;

    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      
      // Personalización dinámica del saludo
      const personalizedHtml = baseHtml.replace(/{{nombre}}/g, s.first_name || 'amiga');

      let sent = false;
      let attempts = 0;

      while (attempts < 3 && !sent) {
        attempts++;
        try {
          const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'campaign',
              subject: 'Novedades exclusivas de Divina Store',
              to: s.email,
              htmlBody: personalizedHtml,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            // Error 451 temporal — esperar y reintentar
            if (String(data.error).includes('451')) {
              await new Promise(r => setTimeout(r, 2500));
              continue;
            }
            throw new Error(data.error || 'Error en servidor');
          }

          sent = true;
          setSendProgress(prev => ({ ...prev, current: i + 1 }));
          // Pausa entre correos para no saturar el SMTP de HostGator
          await new Promise(r => setTimeout(r, 1200));
        } catch (err) {
          if (attempts >= 3) {
            console.error(`Error definitivo → ${s.email}:`, err);
            errors++;
          }
        }
      }
    }

    setSending(false);

    if (errors === 0) {
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 5000);
    } else {
      alert(`Campaña finalizada con ${errors} errores. Revisa la consola para detalles.`);
    }
  };

  const handleTestConnection = async () => {
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' }),
      });
      const data = await res.json();
      if (data.ok) alert(`EXITO: ${data.message}`);
      else alert(`ERROR: ${data.error}\n\nConfig: ${JSON.stringify(data.config, null, 2)}`);
    } catch {
      alert('Fallo total de conexión con la API /send-email.');
    }
  };

  const handleImportXLS = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const formatted = data.map(row => {
          // Normalizar nombres de columnas (quitar espacios y minúsculas)
          const findVal = (keys: string[]) => {
            const key = Object.keys(row).find(k => keys.includes(k.toLowerCase().trim()));
            return key ? row[key] : null;
          };

          return {
            email: findVal(['email', 'correo', 'mail']),
            first_name: findVal(['nombre', 'nombres', 'first name']),
            last_name_paterno: findVal(['apellido paterno', 'apellido_paterno', 'paterno']),
            last_name_materno: findVal(['apellido materno', 'apellido_materno', 'materno']),
            birth_date: findVal(['fecha de nacimiento', 'fecha_nacimiento', 'birth date', 'nacimiento'])
          };
        }).filter(item => item.email); // Solo los que tengan email

        if (formatted.length === 0) {
          alert('No se encontraron correos válidos en el archivo.');
          return;
        }

        setLoading(true);
        const { error } = await supabase.from('subscribers').upsert(formatted, { onConflict: 'email' });
        
        if (error) throw error;
        
        alert(`¡Éxito! Se importaron ${formatted.length} suscriptores.`);
        fetchSubscribers();
      } catch (err) {
        console.error('Error importando:', err);
        alert('Error al leer el archivo. Asegúrate que sea un Excel o CSV válido.');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSubs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSubs.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const loadDiscountTemplate = () => {
    if (blocks.length > 0 && !window.confirm('¿Reemplazar el diseño actual con la plantilla de Código de Descuento?')) {
      return;
    }
    const productIds = dbProducts.slice(0, 3).map(p => p.id);
    const template: NewsletterBlock[] = [
      { id: Date.now().toString() + '-1', type: 'greeting', content: { prefix: '¡Hola, ', suffix: '!', color: '#c4fc15' } },
      { id: Date.now().toString() + '-2', type: 'title', content: { text: '¡Tu Descuento Especial en Divina Store!', align: 'center', color: '#ffffff' } },
      { id: Date.now().toString() + '-3', type: 'text', content: { text: 'Queremos consentirte con una selección exclusiva de nuestros mejores productos de skincare. Usa el código de descuento <strong>DESCUENTO202610</strong> al finalizar tu compra para obtener un 10% de descuento en toda la tienda.', align: 'center' } },
      { id: Date.now().toString() + '-4', type: 'products', content: { productIds } },
      { id: Date.now().toString() + '-5', type: 'button', content: { text: 'APLICAR DESCUENTO', url: 'https://divinastore.com.mx/catalog', color: '#c4fc15' } }
    ];
    setBlocks(template);
  };

  const loadBirthdayTemplate = () => {
    if (blocks.length > 0 && !window.confirm('¿Reemplazar el diseño actual con la plantilla de Cumpleaños?')) {
      return;
    }
    const productIds = dbProducts.slice(0, 3).map(p => p.id);
    const template: NewsletterBlock[] = [
      { id: Date.now().toString() + '-1', type: 'greeting', content: { prefix: '¡Feliz Cumpleaños, ', suffix: '! 🎂✨', color: '#c4fc15' } },
      { id: Date.now().toString() + '-2', type: 'title', content: { text: '¡Queremos celebrar tu día especial!', align: 'center', color: '#ffffff' } },
      { id: Date.now().toString() + '-3', type: 'text', content: { text: '¡Te deseamos lo mejor en tu cumpleaños! Para celebrarlo contigo, te regalamos envío gratis y un regalo sorpresa en tu próximo pedido usando el código <strong>CUMPLEDIVINA</strong>. Disfruta de la mejor rutina de skincare.', align: 'center' } },
      { id: Date.now().toString() + '-4', type: 'products', content: { productIds } },
      { id: Date.now().toString() + '-5', type: 'button', content: { text: 'RECLAMAR MI REGALO', url: 'https://divinastore.com.mx/catalog', color: '#c4fc15' } }
    ];
    setBlocks(template);
  };

  // Bloques de tipo products para el selector del panel derecho
  const productBlocks = blocks.filter(b => b.type === 'products');

  return (
    <div className="admin-newsletter" style={{ display: 'flex', height: 'calc(100vh - 40px)', gap: 20, padding: '10px' }}>

      {/* ── IZQUIERDA: Controles de Bloques ── */}
      <aside className="admin-card glass" style={{ width: 240, padding: 16, flexShrink: 0, overflowY: 'auto' }}>
        <h2 style={{ fontSize: 12, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
          Añadir Bloques
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {(['title', 'image', 'spacer', 'text', 'button', 'products', 'greeting'] as const).map(type => (
            <button
              key={type}
              onClick={() => addBlock(type)}
              style={blockBtn}
            >
              {{ title: 'TITULO', image: 'IMAGEN', spacer: 'ESPACIO', text: 'TEXTO', button: 'BOTON', products: 'PRODUCTO', greeting: 'SALUDO' }[type]}
            </button>
          ))}
          <button onClick={() => setShowBgConfig(!showBgConfig)} style={{ ...blockBtn, background: showBgConfig ? 'var(--c-lime)' : 'linear-gradient(145deg, #555, #222)', color: showBgConfig ? '#000' : '#fff' }}>
            FONDO
          </button>
        </div>

        {/* ── Plantillas de Campaña ── */}
        <div style={{ marginTop: 14 }}>
          <h2 style={{ fontSize: 10, color: '#888', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
            Plantillas rápidas
          </h2>
          <button
            onClick={loadDiscountTemplate}
            style={{
              ...blockBtn,
              width: '100%',
              marginBottom: 6,
              padding: '9px 4px',
              background: 'linear-gradient(135deg, #1a3300, #2a5500)',
              border: '1px solid #c4fc15',
              color: '#c4fc15',
              fontSize: 9,
              gap: 4,
              flexDirection: 'column',
              lineHeight: 1.3,
            }}
          >
            <span style={{ fontSize: 16 }}>🏷️</span>
            <span>CÓDIGO DESCUENTO</span>
            <span style={{ color: '#888', textTransform: 'none', fontWeight: 400 }}>con 3 productos + cupón</span>
          </button>
          <button
            onClick={loadBirthdayTemplate}
            style={{
              ...blockBtn,
              width: '100%',
              padding: '9px 4px',
              background: 'linear-gradient(135deg, #1a0033, #33004d)',
              border: '1px solid #c47afc',
              color: '#c47afc',
              fontSize: 9,
              gap: 4,
              flexDirection: 'column',
              lineHeight: 1.3,
            }}
          >
            <span style={{ fontSize: 16 }}>🎂</span>
            <span>CUMPLEAÑOS</span>
            <span style={{ color: '#888', textTransform: 'none', fontWeight: 400 }}>saludo especial + regalo</span>
          </button>
        </div>

        {/* ── Selector por bloque ── */}
        {productBlocks.length > 0 && productBlocks.map(pb => (
          <div key={pb.id} style={{ marginTop: 12, background: '#000', padding: 12, borderRadius: 8, border: '1px solid #1a1a1a' }}>
            <h3 style={{ fontSize: 11, color: 'var(--c-lime)', margin: '0 0 8px' }}>
              Bloque ···{pb.id.slice(-4)}
            </h3>
            <select
              className="input-dark"
              style={{ width: '100%', fontSize: 11, marginBottom: 8, backgroundColor: '#000', color: '#fff', border: '1px solid #333' }}
              value=""
              onChange={e => {
                if (!e.target.value) return;
                addProductToBlock(pb.id, e.target.value);
                e.target.value = '';
              }}
            >
              <option value="">+ Seleccionar...</option>
              {dbProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={() => updateBlock(pb.id, { productIds: [] })}
              style={{ ...blockBtn, width: '100%', padding: '6px 0' }}
            >
              LIMPIAR
            </button>
          </div>
        ))}

        {/* ── SECCION FONDO (Solo visible si se activa el botón FONDO) ── */}
        {showBgConfig && (
          <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.02)', padding: 10, borderRadius: 8, border: '1px solid var(--c-lime)', boxShadow: '0 0 15px rgba(196, 252, 21, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 10, color: '#c4fc15', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Fondo del Newsletter</h3>
              <button onClick={() => setShowBgConfig(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
            
            <div style={{ display: 'flex', gap: 4, marginBottom: 10, justifyContent: 'center' }}>
              {['#000000', '#1a1a1a', '#ffffff', '#c4fc15'].map(c => (
                <div 
                  key={c}
                  onClick={() => setBgColor(c)}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: '1px solid #444', cursor: 'pointer', boxShadow: bgColor === c ? '0 0 5px #c4fc15' : 'none' }}
                />
              ))}
              <input 
                type="color" 
                value={bgColor} 
                onChange={e => setBgColor(e.target.value)} 
                style={{ width: 20, height: 20, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
              />
            </div>

            <AssetUploader 
              label="Subir Imagen de Fondo" 
              configKey="newsletter_bg_new" 
              skipConfig 
              onUpdate={url => setBgImage(url)} 
            />
            
            {bgImage && (
              <button 
                onClick={() => setBgImage('')}
                style={{ ...blockBtn, width: '100%', background: '#441111', fontSize: 9, marginTop: 6 }}
              >
                QUITAR IMAGEN
              </button>
            )}
          </div>
        )}
      </aside>

      {/* ── CENTRO: Editor Visual ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 12px', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleSaveDraft} className="btn btn-outline" style={{ padding: '5px 12px', fontWeight: 700, fontSize: 10, letterSpacing: 0.5 }}>
              💾 BORRADOR
            </button>
            <button onClick={handleTestConnection} className="btn btn-outline" style={{ padding: '5px 12px', fontWeight: 700, fontSize: 10, letterSpacing: 0.5, borderColor: '#444' }}>
              🔌 PROBAR SMTP
            </button>
          </div>
          <button onClick={handleSend} disabled={sending} className="btn btn-lime" style={{ padding: '5px 14px', fontWeight: 800, fontSize: 10, letterSpacing: 0.5 }}>
            {sending ? '⏳ ENVIANDO...' : `🚀 LANZAR A ${selectedIds.size} SELECCIONADOS`}
          </button>
        </div>

        {sending && (
          <div style={{ background: 'rgba(255,255,255,0.05)', color: '#fff', padding: '12px', borderRadius: 8, textAlign: 'center', fontWeight: 600 }}>
            Enviando: {sendProgress.current} de {sendProgress.total} suscriptores...
            <div style={{ width: '100%', height: 4, background: '#222', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
              <div style={{
                width: `${sendProgress.total > 0 ? (sendProgress.current / sendProgress.total) * 100 : 0}%`,
                height: '100%',
                background: 'var(--c-lime)',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        )}

        {sendSuccess && (
          <div style={{ background: 'var(--c-lime)', color: '#000', padding: '12px', borderRadius: 8, textAlign: 'center', fontWeight: 800, animation: 'slideDown 0.3s' }}>
            Campana enviada con exito
          </div>
        )}

        <div className="admin-card glass" style={{ flex: 1, overflowY: 'auto', padding: '0 40px 40px 40px', background: '#080808' }}>
          <div style={{ 
            maxWidth: 600, 
            margin: '0 auto', 
            border: '1px solid #1a1a1a', 
            minHeight: '100%', 
            padding: '0 0 40px 0',
            backgroundColor: bgColor,
            backgroundImage: bgImage ? `url(${getImageUrl(bgImage)})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}>

            {/* Header logo */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 20, padding: '10px 20px', borderBottom: '1px solid #1a1a1a' }}>
              {logoUrl
                ? <img src={getImageUrl(logoUrl)} alt="Divina Store" style={{ height: `${logoHeight}px`, objectFit: 'contain' }} />
                : <div style={{ fontSize: 24, fontWeight: 800, color: '#c4fc15', letterSpacing: 4 }}>DIVINA</div>
              }
            </div>

            {blocks.map((block, idx) => (
              <div key={block.id} className="newsletter-block-wrapper" style={{ position: 'relative', marginBottom: 10, padding: '0 20px' }}>

                <div className="newsletter-block-actions" style={{ position: 'absolute', right: 0, top: 0, display: 'flex', gap: 4, zIndex: 10 }}>
                  <button onClick={() => moveBlock(idx, -1)} style={actionBtn} title="Mover arriba">↑</button>
                  <button onClick={() => moveBlock(idx, 1)} style={actionBtn} title="Mover abajo">↓</button>
                  <button onClick={() => removeBlock(block.id)} style={{ ...actionBtn, background: '#ff4444' }} title="Eliminar">×</button>
                </div>

                {block.type === 'greeting' && (() => {
                  const firstSelectedId = Array.from(selectedIds)[0];
                  const firstSub = subscribers.find(s => s.id === firstSelectedId);
                  const previewName = firstSub ? firstSub.first_name : 'Nombre Cliente';
                  return (
                    <h2
                      style={{ color: block.content.color || '#c4fc15', textAlign: 'center', fontSize: 24, fontFamily: 'var(--f-heading)', margin: 0, outline: 'none' }}
                    >
                      {block.content.prefix} <span style={{ background: 'rgba(196, 252, 21, 0.2)', padding: '0 4px', borderRadius: 4 }}>{previewName}</span> {block.content.suffix}
                    </h2>
                  );
                })()}

                {block.type === 'title' && (
                  <h1
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerHTML })}
                    style={{ color: block.content.color, textAlign: 'center', fontSize: 28, fontFamily: 'var(--f-heading)', margin: 0, outline: 'none' }}
                    dangerouslySetInnerHTML={{ __html: block.content.text }}
                  />
                )}

                {block.type === 'text' && (
                  <p
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => updateBlock(block.id, { text: e.currentTarget.innerHTML })}
                    style={{ color: '#ccc', textAlign: 'center', fontSize: 14, fontFamily: 'var(--f-sub)', lineHeight: 1.4, margin: 0, outline: 'none' }}
                    dangerouslySetInnerHTML={{ __html: block.content.text }}
                  />
                )}

                {block.type === 'image' && (
                  <div style={{ textAlign: 'center' }}>
                    {block.content.url
                      ? <img src={getImageUrl(block.content.url)} style={{ width: '100%', borderRadius: 8 }} alt="Block" />
                      : (
                        <div style={{ background: '#111', padding: '20px', borderRadius: 8, border: '2px dashed #333' }}>
                          <AssetUploader label="Cargar Imagen" configKey={`nl_img_${block.id}`} skipConfig onUpdate={url => updateBlock(block.id, { url })} />
                        </div>
                      )
                    }
                  </div>
                )}

                {block.type === 'button' && (
                  <div style={{ textAlign: 'center', marginTop: 10 }}>
                    <div style={{ background: block.content.color, color: '#000', padding: '10px 24px', borderRadius: 100, fontWeight: 900, display: 'inline-block', fontSize: 14 }}>
                      <span
                        contentEditable
                        suppressContentEditableWarning
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
                      {[0, 1, 2].map(i => {
                        const pid = (block.content.productIds || [])[i];
                        const prod = dbProducts.find(p => p.id === pid);
                        return (
                          <div key={i} style={{ background: '#111', padding: 10, borderRadius: 8, textAlign: 'center' }}>
                            <div style={{ width: '100%', aspectRatio: '1', background: '#222', borderRadius: 4, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                              {prod?.image_url
                                ? <img src={getImageUrl(prod.image_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={prod.name} />
                                : <span style={{ fontSize: 24, opacity: 0.5 }}>✨</span>
                              }
                            </div>
                            <div style={{ fontSize: 10, color: '#aaa', marginBottom: 4 }}>DIVINA</div>
                            <div style={{ fontSize: 11, color: '#fff', fontWeight: 'bold', height: 32, overflow: 'hidden' }}>
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

            {/* Footer legal */}
            <div style={{ marginTop: 30, padding: '15px 20px', borderTop: '1px solid #1a1a1a', textAlign: 'center', fontSize: 9, color: '#444', lineHeight: 1.1 }}>
              <p style={{ margin: '0 0 4px' }}>&copy; {new Date().getFullYear()} DIVINASTORE.COM.MX — Todos los derechos reservados.</p>
              <p style={{ margin: '0 0 2px' }}>
                Estás recibiendo este mensaje porque te registraste voluntariamente en nuestra tienda o suscribiste a nuestro newsletter. 
                Si ya no deseas recibirlo, puedes en cualquier momento enviando un correo a info@divinastore.com.mx
              </p>
              <p style={{ margin: 0 }}>
                Consulta nuestra Politica de privacidad en nuestro sitio www.divinastore.com.mx para conocer cómo tratamos tus datos. 
                (Cumbres de maltrata 202 col. narvarte cp 03020). Informacion: info@divinastore.com.mx
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ── DERECHA: Base de Datos ── */}
      <aside className="admin-card glass" style={{ width: 340, display: 'flex', flexDirection: 'column', padding: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 14, color: 'var(--c-lime)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Base de Datos</h2>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#888', fontSize: 14 }} title="Importar Excel (XLS/CSV)">
              📥
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleImportXLS} style={{ display: 'none' }} />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: '#888' }}>Todos</span>
            <input 
              type="checkbox" 
              checked={selectedIds.size > 0 && selectedIds.size === filteredSubs.length}
              onChange={toggleSelectAll}
              style={{ cursor: 'pointer', accentColor: 'var(--c-lime)', width: 16, height: 16 }}
            />
          </div>
        </div>

        <input
          type="text"
          placeholder="Buscar..."
          className="input-dark"
          value={searchSub}
          onChange={e => setSearchSub(e.target.value)}
          style={{ marginBottom: 8, fontSize: 10, padding: '4px 8px', height: 'auto', borderRadius: 4 }}
        />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, background: 'rgba(0,0,0,0.3)', padding: '2px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
          {loading
            ? <p style={{ fontSize: 9, color: '#666', textAlign: 'center', padding: 4 }}>Cargando...</p>
            : filteredSubs.length === 0 
              ? <p style={{ fontSize: 9, color: '#444', textAlign: 'center', padding: 4 }}>Sin resultados</p>
              : filteredSubs.map(s => (
              <div key={s.id} className="sub-row" style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '2px 4px', background: selectedIds.has(s.id) ? 'rgba(196, 252, 21, 0.05)' : 'transparent', 
                fontSize: 9, borderBottom: '1px solid rgba(255,255,255,0.03)',
                lineHeight: 1
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
                  {/* Checkbox Personalizado que "prende" */}
                  <div 
                    onClick={() => toggleSelect(s.id)}
                    style={{ 
                      width: 14, height: 14, borderRadius: 2, 
                      border: '1px solid var(--c-lime)', 
                      background: selectedIds.has(s.id) ? 'var(--c-lime)' : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: selectedIds.has(s.id) ? '0 0 8px var(--c-lime)' : 'none',
                      transition: 'all 0.2s'
                    }}
                  >
                    {selectedIds.has(s.id) && <span style={{ color: '#000', fontSize: 10, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div 
                    onClick={() => { setEditingSub(s); setIsModalOpen(true); }}
                    style={{ cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selectedIds.has(s.id) ? '#fff' : '#ccc' }}
                  >
                    <strong style={{ color: 'var(--c-lime)' }}>{s.first_name || '...'}</strong>: {s.email}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
                  <button 
                    onClick={() => { setEditingSub(s); setIsModalOpen(true); }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: 0, fontSize: 10 }}
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDeleteSubscriber(s.id)}
                    style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: 0, fontSize: 10, opacity: 0.4 }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          }
        </div>

        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
          <textarea
            className="input-dark"
            placeholder="Añadir correos (separados por coma)..."
            value={manualEmails}
            onChange={e => setManualEmails(e.target.value)}
            style={{ width: '100%', height: 32, fontSize: 9, resize: 'none', marginBottom: 4, padding: '2px 6px', borderRadius: 2 }}
          />
          <button
            onClick={handleAddManualEmails}
            style={{ ...blockBtn, width: '100%', padding: '4px 0', fontSize: 9 }}
            disabled={!manualEmails.trim() || loading}
          >
            AGREGAR
          </button>
        </div>
      </aside>

      {/* ── MODAL DE DETALLES/EDICIÓN ── */}
      {isModalOpen && editingSub && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="admin-card glass" style={{ width: 400, padding: 24, position: 'relative', border: '1px solid var(--c-lime)' }}>
            <button 
              onClick={() => setIsModalOpen(false)}
              style={{ position: 'absolute', right: 16, top: 16, background: 'none', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}
            >
              ×
            </button>
            <h2 style={{ color: 'var(--c-lime)', fontSize: 20, marginBottom: 4 }}>Detalles del Suscriptor</h2>
            <p style={{ fontSize: 10, color: '#666', marginBottom: 20 }}>Solo el email es obligatorio. Los nombres son opcionales.</p>
            
            <form onSubmit={handleUpdateSubscriber} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Email (No editable)</label>
                <input type="text" className="input-dark" value={editingSub.email} disabled style={{ opacity: 0.5 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Nombres</label>
                  <input 
                    type="text" className="input-dark" 
                    value={editingSub.first_name || ''} 
                    onChange={e => setEditingSub({...editingSub, first_name: e.target.value})} 
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Apellido Paterno</label>
                    <input 
                      type="text" className="input-dark" 
                      value={editingSub.last_name_paterno || ''} 
                      onChange={e => setEditingSub({...editingSub, last_name_paterno: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Apellido Materno</label>
                    <input 
                      type="text" className="input-dark" 
                      value={editingSub.last_name_materno || ''} 
                      onChange={e => setEditingSub({...editingSub, last_name_materno: e.target.value})} 
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#888', textTransform: 'uppercase' }}>Fecha de Nacimiento</label>
                  <input 
                    type="date" className="input-dark" 
                    value={editingSub.birth_date || ''} 
                    onChange={e => setEditingSub({...editingSub, birth_date: e.target.value})} 
                  />
                </div>
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-lime" style={{ flex: 1, padding: '12px' }}>
                  GUARDAR CAMBIOS
                </button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline" style={{ flex: 1, padding: '12px' }}>
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .newsletter-block-wrapper:hover { background: rgba(196, 252, 21, 0.02); }
        .newsletter-block-actions { opacity: 0; transition: opacity 0.2s; }
        .newsletter-block-wrapper:hover .newsletter-block-actions { opacity: 1; }
        .sub-row:hover { background: rgba(255,255,255,0.05) !important; }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

// ── Estilos inline reutilizables ──
const actionBtn: React.CSSProperties = {
  background: '#333', color: '#fff', border: 'none', borderRadius: 4,
  width: 24, height: 24, fontSize: 14, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const blockBtn: React.CSSProperties = {
  display: 'flex', justifyContent: 'center', alignItems: 'center',
  fontSize: 9, padding: '6px 0', letterSpacing: 1, color: '#fff',
  background: 'linear-gradient(145deg, #555, #222)',
  boxShadow: '0 4px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
  border: '1px solid #111', borderRadius: 4, cursor: 'pointer',
  textTransform: 'uppercase', fontWeight: 'bold',
};