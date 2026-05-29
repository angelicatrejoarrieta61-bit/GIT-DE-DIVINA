import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

export const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
        // Flujo de Iniciar Sesión
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        
        if (error) {
          setError(error.message);
        } else {
          navigate('/admin/config?section=site-general');
        }
    } catch (err: any) {
      console.error("Error crítico de red/login:", err);
      setError(err?.message || 'Error de conexión. Revisa tu internet o la configuración de Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      <form onSubmit={handleSubmit} className="glass" style={{ padding: 48, borderRadius: 24, width: 400, maxWidth: '90%' }}>
        <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 32, marginBottom: 8, textAlign: 'center' }}>
          DIVINA ADMIN
        </h1>
        <p style={{ color: 'var(--c-text-muted)', textAlign: 'center', marginBottom: 24 }}>
          Ingresa a tu panel de control
        </p>
        {error && <p style={{ color: '#ff6b6b', background: 'rgba(255,100,100,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</p>}
        {message && <p style={{ color: 'var(--c-lime)', background: 'rgba(196,252,21,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{message}</p>}
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--c-text-muted)' }}>EMAIL</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-dark" required />
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--c-text-muted)' }}>CONTRASEÑA</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input-dark" required />
        </div>

        <button type="submit" className="btn btn-lime" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} disabled={loading}>
          {loading ? 'Cargando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
};
