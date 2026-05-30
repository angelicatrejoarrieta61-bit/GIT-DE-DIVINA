/**
 * AdminUsers.tsx — Gestión de Usuarios del Panel de Administración
 * Conecta a /api/admin-users (Vercel serverless) que usa SUPABASE_SERVICE_ROLE_KEY
 * para listar, crear y eliminar usuarios de Supabase Auth de forma segura.
 */

import React, { useEffect, useState, useCallback } from 'react';

interface AdminUser {
  id:              string;
  email:           string;
  created_at:      string;
  last_sign_in_at: string | null;
  confirmed:       boolean;
}

// Detectar si estamos en desarrollo local o en producción
const API_BASE = typeof window !== 'undefined' && window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';

async function apiRequest(action: string, body?: object) {
  const isGet = action === 'list';
  const res = await fetch(`${API_BASE}/api/admin-users`, {
    method: isGet ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    isGet ? undefined : JSON.stringify({ action, ...body }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error desconocido');
  return json;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export const AdminUsers: React.FC = () => {
  const [users,    setUsers]    = useState<AdminUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  // Form
  const [newEmail,    setNewEmail]    = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { users: data } = await apiRequest('list');
      setUsers(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 5000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword) return;
    setCreating(true);
    setError('');
    try {
      await apiRequest('create', { email: newEmail, password: newPassword });
      showSuccess(`✅ Usuario "${newEmail}" creado correctamente.`);
      setNewEmail('');
      setNewPassword('');
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    if (!confirm(`¿Eliminar permanentemente al usuario ${user.email}? Esta acción no se puede deshacer.`)) return;
    setDeletingId(user.id);
    setError('');
    try {
      await apiRequest('delete', { userId: user.id });
      showSuccess(`✅ Usuario "${user.email}" eliminado.`);
      await loadUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 26, margin: 0, marginBottom: 6 }}>
          Usuarios y Accesos
        </h1>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 13, margin: 0 }}>
          Gestiona quién tiene acceso al panel de administración de Divina Store
        </p>
      </div>

      {/* Alertas globales */}
      {error && (
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
          borderRadius: 10, fontSize: 13, color: '#ff9090',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ff9090', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}
      {success && (
        <div style={{
          marginBottom: 20, padding: '12px 16px',
          background: 'rgba(196,252,21,0.08)', border: '1px solid rgba(196,252,21,0.25)',
          borderRadius: 10, fontSize: 13, color: 'var(--c-lime)',
        }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* ── LISTA DE USUARIOS ──────────────────────────────── */}
        <div style={{
          background: 'var(--c-surface, rgba(255,255,255,0.03))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: 16, margin: 0 }}>
              Usuarios Registrados
              <span style={{
                marginLeft: 10, fontSize: 11, fontWeight: 700,
                background: 'rgba(196,252,21,0.12)', color: 'var(--c-lime)',
                padding: '2px 10px', borderRadius: 100,
              }}>
                {users.length}
              </span>
            </h2>
            <button
              onClick={loadUsers}
              disabled={loading}
              style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--c-text-muted)', borderRadius: 8, padding: '6px 14px',
                fontSize: 12, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--f-sub)', fontWeight: 600,
              }}
            >
              {loading ? '⏳ Cargando...' : '↺ Actualizar'}
            </button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3].map(i => (
                <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />
              ))}
            </div>
          ) : users.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--c-text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>👤</div>
              <p style={{ fontSize: 14 }}>No hay usuarios registrados aún.</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>Crea el primero con el formulario de la derecha.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map(user => (
                <div key={user.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 12,
                  transition: 'border-color 0.2s',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(196,252,21,0.2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: 'var(--c-lime)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: '#000', fontWeight: 800, fontSize: 14,
                      fontFamily: 'var(--f-sub)', flexShrink: 0,
                    }}>
                      {user.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c-white)', marginBottom: 3 }}>
                        {user.email}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', display: 'flex', gap: 10 }}>
                        <span>📅 Creado: {formatDate(user.created_at)}</span>
                        {user.last_sign_in_at && (
                          <span>🔑 Último acceso: {formatDate(user.last_sign_in_at)}</span>
                        )}
                        <span style={{
                          color: user.confirmed ? 'var(--c-lime)' : '#ffcc44',
                          fontWeight: 700,
                        }}>
                          {user.confirmed ? '✓ Verificado' : '⚠ Sin verificar'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(user)}
                    disabled={deletingId === user.id}
                    style={{
                      background: 'rgba(255,50,50,0.08)',
                      color: '#ff8080',
                      border: '1px solid rgba(255,50,50,0.18)',
                      borderRadius: 8, padding: '7px 14px',
                      fontSize: 12, cursor: deletingId === user.id ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--f-sub)', fontWeight: 600,
                      opacity: deletingId === user.id ? 0.6 : 1,
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                      if (deletingId !== user.id) {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,50,50,0.18)';
                      }
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,50,50,0.08)';
                    }}
                  >
                    {deletingId === user.id ? '⏳ Eliminando...' : '🗑 Eliminar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── CREAR USUARIO ──────────────────────────────────── */}
        <div style={{
          background: 'var(--c-surface, rgba(255,255,255,0.03))',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: 24,
          position: 'sticky', top: 80,
        }}>
          <h2 style={{ fontFamily: 'var(--f-heading)', fontSize: 16, margin: '0 0 6px' }}>
            Añadir Usuario
          </h2>
          <p style={{ color: 'var(--c-text-muted)', fontSize: 12, margin: '0 0 20px' }}>
            Se crea directamente en Supabase Auth con email verificado.
          </p>

          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Email */}
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--c-text-muted)', marginBottom: 7,
                fontFamily: 'var(--f-sub)',
              }}>
                Email
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="nuevo@ejemplo.com"
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10, color: 'var(--c-white)',
                  fontSize: 13, outline: 'none',
                  fontFamily: 'var(--f-body)',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--c-lime)'}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.12)'}
              />
            </div>

            {/* Contraseña */}
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--c-text-muted)', marginBottom: 7,
                fontFamily: 'var(--f-sub)',
              }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '10px 40px 10px 14px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 10, color: 'var(--c-white)',
                    fontSize: 13, outline: 'none',
                    fontFamily: 'var(--f-body)',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--c-lime)'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(255,255,255,0.12)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--c-text-muted)', fontSize: 16, lineHeight: 1,
                  }}
                  title={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
              {/* Indicador de fortaleza */}
              {newPassword && (
                <div style={{ marginTop: 6, display: 'flex', gap: 4 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: newPassword.length >= i * 3
                        ? i <= 1 ? '#ff6060' : i <= 2 ? '#ffcc44' : i <= 3 ? '#90d0ff' : 'var(--c-lime)'
                        : 'rgba(255,255,255,0.1)',
                      transition: 'background 0.2s',
                    }} />
                  ))}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={creating || !newEmail || !newPassword}
              style={{
                marginTop: 4,
                padding: '12px',
                background: creating || !newEmail || !newPassword
                  ? 'rgba(196,252,21,0.15)' : 'var(--c-lime)',
                color: creating || !newEmail || !newPassword ? 'var(--c-lime)' : '#000',
                border: creating || !newEmail || !newPassword
                  ? '1px solid rgba(196,252,21,0.3)' : 'none',
                borderRadius: 10, fontSize: 13, fontWeight: 700,
                fontFamily: 'var(--f-sub)', letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: creating || !newEmail || !newPassword ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s',
              }}
            >
              {creating ? (
                <>
                  <span style={{
                    width: 14, height: 14, border: '2px solid currentColor',
                    borderTopColor: 'transparent', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite', display: 'inline-block',
                  }} />
                  Creando usuario...
                </>
              ) : '+ Crear Usuario'}
            </button>
          </form>

          {/* Nota informativa */}
          <div style={{
            marginTop: 16, padding: '10px 14px',
            background: 'rgba(196,252,21,0.04)',
            border: '1px solid rgba(196,252,21,0.1)',
            borderRadius: 8, fontSize: 11, color: 'var(--c-text-muted)',
            lineHeight: 1.6,
          }}>
            💡 El usuario se crea con email ya verificado. Podrá iniciar sesión en el panel de administración de inmediato.
          </div>
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
