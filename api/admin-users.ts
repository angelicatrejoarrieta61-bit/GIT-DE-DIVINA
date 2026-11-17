import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// La SERVICE_ROLE_KEY solo existe en el servidor (nunca en el browser)
function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // Normaliza la URL por si tiene el sufijo /rest/v1/
  const cleanUrl = url.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

  if (!cleanUrl || !key) {
    throw new Error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar configuradas en Vercel.');
  }

  return createClient(cleanUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS para peticiones del admin panel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabaseAdmin = getAdminClient();

    // Solo una sesión iniciada en el admin puede usar esta ruta (antes estaba abierta a cualquiera)
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'Inicia sesión en el admin para continuar.' });
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) return res.status(401).json({ ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });

    const { action, email, password, userId } = (req.body || {}) as Record<string, string>;
    const method = req.method?.toUpperCase();

    // ── GET: listar usuarios ──────────────────────────────────────────
    if (method === 'GET' || action === 'list') {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;

      const users = data.users.map(u => ({
        id:              u.id,
        email:           u.email ?? '',
        created_at:      u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        confirmed:       !!u.email_confirmed_at,
      }));

      return res.status(200).json({ ok: true, users });
    }

    // ── POST action=create: crear usuario ─────────────────────────────
    if (method === 'POST' && action === 'create') {
      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'Email y contraseña son requeridos.' });
      }
      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' });
      }

      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        // Fix: Supabase requiere que provider_id esté explícito en la tabla identities.
        // Sin esto lanza: "null value in column provider_id violates not-null constraint"
        app_metadata: {
          provider:  'email',
          providers: ['email'],
        },
        user_metadata: {
          email,
        },
      });
      if (error) throw error;

      return res.status(201).json({ ok: true, user: data.user });
    }

    // ── POST action=delete: eliminar usuario ──────────────────────────
    if (method === 'POST' && action === 'delete') {
      if (!userId) {
        return res.status(400).json({ ok: false, error: 'userId es requerido.' });
      }

      if (userId === caller.user.id) {
        return res.status(400).json({ ok: false, error: 'No puedes eliminar tu propio usuario.' });
      }

      // Borrado definitivo; si la base lo impide (el usuario tiene datos ligados), se desactiva y se libera el correo
      const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (error) {
        console.error('[admin-users] borrado definitivo falló, se intenta desactivar:', error.message);
        const { error: softErr } = await supabaseAdmin.auth.admin.deleteUser(userId, true);
        if (softErr) throw softErr;
        return res.status(200).json({ ok: true, soft: true });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: `Acción no reconocida: ${action} / método: ${method}` });

  } catch (err: any) {
    console.error('[admin-users] Error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Error interno del servidor.' });
  }
}
