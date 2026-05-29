import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
}

export const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form para nuevo usuario
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'list' }
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Error al obtener usuarios');
      
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con la Edge Function. Verifica que hiciste deploy.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    
    setCreating(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'create', email: newEmail, password: newPassword }
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Error al crear usuario');
      
      setNewEmail('');
      setNewPassword('');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Error al crear usuario');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`¿Estás seguro de eliminar permanentemente al usuario ${email}?`)) return;
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke('manage-users', {
        body: { action: 'delete', userId }
      });
      if (fnError) throw new Error(fnError.message);
      if (!data?.success) throw new Error(data?.error || 'Error al eliminar usuario');
      
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Error al eliminar usuario');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Usuarios y Accesos</h1>
          <p className="admin-subtitle">Gestiona quién tiene acceso a este panel de administración</p>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 24, padding: 16, background: 'rgba(255,100,100,0.1)', color: '#ff6b6b', borderRadius: 8, border: '1px solid rgba(255,100,100,0.2)' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 32, alignItems: 'start' }}>
        
        {/* LISTA DE USUARIOS */}
        <div className="admin-card">
          <h2 style={{ fontSize: 16, fontFamily: 'var(--f-heading)', marginBottom: 20 }}>Usuarios Registrados ({users.length})</h2>
          
          {loading ? (
            <p className="muted-text">Cargando usuarios...</p>
          ) : users.length === 0 ? (
            <p className="muted-text">No hay usuarios registrados o no se pudieron cargar.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {users.map(user => (
                <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{user.email}</div>
                    <div style={{ fontSize: 12, color: 'var(--c-text-muted)' }}>
                      Creado: {new Date(user.created_at).toLocaleDateString('es-MX')}
                      {user.last_sign_in_at && ` · Último acceso: ${new Date(user.last_sign_in_at).toLocaleDateString('es-MX')}`}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteUser(user.id, user.email)}
                    style={{ background: 'rgba(255,50,50,0.1)', color: '#ff6b6b', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AGREGAR USUARIO */}
        <div className="admin-card">
          <h2 style={{ fontSize: 16, fontFamily: 'var(--f-heading)', marginBottom: 20 }}>Añadir Usuario</h2>
          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 6 }}>Email</label>
              <input 
                type="email" 
                value={newEmail} 
                onChange={e => setNewEmail(e.target.value)} 
                className="input-dark" 
                placeholder="nuevo@ejemplo.com"
                required 
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 6 }}>Contraseña</label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                className="input-dark" 
                placeholder="Mínimo 6 caracteres"
                required 
                minLength={6}
              />
            </div>
            <button type="submit" className="btn btn-lime" disabled={creating} style={{ marginTop: 8, justifyContent: 'center' }}>
              {creating ? 'Creando...' : 'Crear Usuario'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
