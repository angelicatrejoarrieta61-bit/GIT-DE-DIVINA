import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface ContactMessage {
  id: string;
  created_at: string;
  first_name: string;
  email: string;
  message: string;
  source: string;
  status: string;
}

export const AdminMessages: React.FC = () => {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error && error.code !== '42P01') {
      console.error(error);
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const deleteMessage = async (id: string) => {
    if (!window.confirm('¿Eliminar este mensaje?')) return;
    await supabase.from('contact_messages').delete().eq('id', id);
    setMessages(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="admin-products">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="admin-title">Mensajes de Contacto</h1>
        <button onClick={fetchMessages} className="btn btn-outline" style={{ padding: '8px 16px' }}>Actualizar</button>
      </div>

      <div className="admin-card" style={{ marginBottom: '24px', padding: '16px', background: 'rgba(196, 252, 21, 0.05)', border: '1px solid rgba(196, 252, 21, 0.2)' }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#ccc' }}>
          <strong>Nota:</strong> Los mensajes recibidos aquí deben ser respondidos manualmente a través de <strong>admin@divinastore.com.mx</strong>. 
          Esta sección sirve como tu bandeja de entrada centralizada.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>Cargando mensajes...</div>
      ) : messages.length === 0 ? (
        <div className="admin-card" style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          No hay mensajes recibidos aún.
        </div>
      ) : (
        <div className="admin-grid" style={{ display: 'grid', gap: '16px' }}>
          {messages.map(m => (
            <div key={m.id} className="admin-card" style={{ padding: '20px', borderLeft: '4px solid var(--c-lime)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{m.first_name}</h3>
                  <a href={`mailto:${m.email}`} style={{ color: 'var(--c-lime)', fontSize: '14px', textDecoration: 'none' }}>{m.email}</a>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '12px', color: '#666' }}>{new Date(m.created_at).toLocaleString()}</span>
                  <div style={{ fontSize: '10px', color: '#444', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '4px' }}>Origen: {m.source || 'Directo'}</div>
                </div>
              </div>
              <p style={{ margin: '12px 0', fontSize: '15px', color: '#ccc', lineHeight: '1.6', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                {m.message}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <a href={`mailto:${m.email}?subject=Respuesta de Divina Store`} className="btn btn-lime" style={{ fontSize: '12px', padding: '6px 12px' }}>Responder por Email</a>
                <button onClick={() => deleteMessage(m.id)} className="btn btn-outline" style={{ fontSize: '12px', padding: '6px 12px', color: '#ff4444' }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
