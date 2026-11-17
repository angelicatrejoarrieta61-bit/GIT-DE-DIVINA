import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/**
 * Acceso al admin.
 *  1) Correo + contraseña.
 *  2) Verificación en 2 pasos (código de 6 dígitos de una app como Google Authenticator).
 *     - Primera vez: se muestra un QR para vincular la app y se confirma con un código.
 *     - Siguientes veces: solo se pide el código.
 *  Bloqueo por intentos fallidos: 5 errores seguidos pausan el acceso (5 min, y se duplica si se repite, máx. 60).
 *  (Supabase además limita los intentos desde su servidor.)
 */

const LOCK_KEY = 'divina_admin_lock';
const MAX_FAILS = 5;
type LockState = { fails: number; strikes: number; until: number };
const readLock = (): LockState => {
  try { return { fails: 0, strikes: 0, until: 0, ...JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') }; } catch { return { fails: 0, strikes: 0, until: 0 }; }
};
const writeLock = (l: LockState) => { try { localStorage.setItem(LOCK_KEY, JSON.stringify(l)); } catch { /* sin almacenamiento */ } };

type Step = 'password' | 'verify' | 'enroll';

export const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>('password');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [enrollFailed, setEnrollFailed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const navigate = useNavigate();

  const lock = readLock();
  const lockedLeft = Math.max(0, Math.ceil((lock.until - now) / 1000));

  useEffect(() => {
    if (!lock.until || lock.until <= Date.now()) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [lock.until]);

  const fail = (msg: string) => {
    const l = readLock();
    const fails = l.fails + 1;
    if (fails >= MAX_FAILS) {
      const strikes = l.strikes + 1;
      const minutes = Math.min(60, 5 * 2 ** (strikes - 1));
      writeLock({ fails: 0, strikes, until: Date.now() + minutes * 60_000 });
      setNow(Date.now());
      setError(`Demasiados intentos. Acceso pausado ${minutes} minutos.`);
    } else {
      writeLock({ ...l, fails });
      setError(`${msg} (${MAX_FAILS - fails} intento${MAX_FAILS - fails === 1 ? '' : 's'} restante${MAX_FAILS - fails === 1 ? '' : 's'})`);
    }
  };
  const ok = () => writeLock({ fails: 0, strikes: 0, until: 0 });
  const enter = () => navigate('/admin/config?section=site-general');

  /** Después de la contraseña: ¿falta el código?, ¿hay que vincular la app? */
  const afterPassword = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel === 'aal2') { enter(); return; }
    if (aal?.nextLevel === 'aal2') {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const totp = f?.totp?.[0];
      if (totp) { setFactorId(totp.id); setStep('verify'); return; }
    }
    // Primera vez: vincular app. Se limpian intentos abandonados.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const x of (all?.all ?? []).filter((y: any) => y.status === 'unverified')) await supabase.auth.mfa.unenroll({ factorId: x.id });
    const { data, error: eErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Divina ${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`,
    });
    if (eErr || !data) {
      setEnrollFailed(true);
      setError('No se pudo activar la verificación en 2 pasos: ' + (eErr?.message || 'error desconocido') + '. Revisa que MFA esté habilitado en Supabase (Authentication → Sign In / Providers → Multi-Factor).');
      return;
    }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setStep('enroll');
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedLeft > 0) return;
    setLoading(true); setError('');
    try {
      const { error: sErr } = await supabase.auth.signInWithPassword({ email, password });
      if (sErr) { fail(sErr.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : sErr.message); return; }
      await afterPassword();
    } catch (err: any) {
      console.error('Error crítico de red/login:', err);
      setError(err?.message || 'Error de conexión. Revisa tu internet o la configuración de Supabase.');
    } finally { setLoading(false); }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockedLeft > 0) return;
    const clean = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) { setError('El código tiene 6 dígitos.'); return; }
    setLoading(true); setError('');
    try {
      const { data: ch, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
      if (cErr || !ch) { setError(cErr?.message || 'No se pudo validar el código.'); return; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: clean });
      if (vErr) { setCode(''); fail('Código incorrecto'); return; }
      ok();
      enter();
    } catch (err: any) {
      setError(err?.message || 'Error de conexión.');
    } finally { setLoading(false); }
  };

  const cancel = async () => {
    await supabase.auth.signOut();
    setStep('password'); setCode(''); setPassword(''); setError(''); setEnrollFailed(false);
  };

  const box: React.CSSProperties = { padding: 48, borderRadius: 24, width: 400, maxWidth: '90%' };
  const errBox = error ? (
    <p role="alert" style={{ color: '#ff6b6b', background: 'rgba(255,100,100,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{error}</p>
  ) : null;
  const lockBox = lockedLeft > 0 ? (
    <p role="alert" style={{ color: '#ffb86b', background: 'rgba(255,184,107,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
      Acceso pausado por seguridad. Intenta de nuevo en {Math.floor(lockedLeft / 60)}:{String(lockedLeft % 60).padStart(2, '0')}.
    </p>
  ) : null;
  const label: React.CSSProperties = { display: 'block', marginBottom: 8, fontSize: 12, color: 'var(--c-text-muted)' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
      {step === 'password' ? (
        <form onSubmit={submitPassword} className="glass" style={box}>
          <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 32, marginBottom: 8, textAlign: 'center' }}>DIVINA ADMIN</h1>
          <p style={{ color: 'var(--c-text-muted)', textAlign: 'center', marginBottom: 24 }}>Ingresa a tu panel de control</p>
          {lockBox}{errBox}
          {enrollFailed && (
            <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} onClick={() => void cancel()}>Volver</button>
          )}
          <div style={{ marginBottom: 16 }}>
            <label style={label}>EMAIL</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark" autoComplete="username" required />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={label}>CONTRASEÑA</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark" autoComplete="current-password" required />
          </div>
          <button type="submit" className="btn btn-lime" style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} disabled={loading || lockedLeft > 0}>
            {loading ? 'Cargando...' : 'Ingresar'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="glass" style={box}>
          <h1 style={{ fontFamily: 'var(--f-heading)', fontSize: 26, marginBottom: 8, textAlign: 'center' }}>
            {step === 'enroll' ? 'Activa la verificación' : 'Verificación en 2 pasos'}
          </h1>
          {step === 'enroll' ? (
            <>
              <p style={{ color: 'var(--c-text-muted)', textAlign: 'center', marginBottom: 16, fontSize: 13 }}>
                1) Abre Google Authenticator (o Authy) y escanea el QR.<br />2) Escribe el código de 6 dígitos que muestra la app.
              </p>
              {qr && <img src={qr} alt="Código QR para la app de verificación" width={180} height={180} style={{ display: 'block', margin: '0 auto 12px', background: '#fff', padding: 8, borderRadius: 12 }} />}
              {secret && <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 16, wordBreak: 'break-all' }}>¿No puedes escanear? Clave manual: <strong>{secret}</strong></p>}
            </>
          ) : (
            <p style={{ color: 'var(--c-text-muted)', textAlign: 'center', marginBottom: 24, fontSize: 13 }}>Escribe el código de 6 dígitos de tu app de verificación.</p>
          )}
          {lockBox}{errBox}
          <div style={{ marginBottom: 24 }}>
            <label style={label}>CÓDIGO</label>
            <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))} className="input-dark" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus required />
          </div>
          <button type="submit" className="btn btn-lime" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }} disabled={loading || lockedLeft > 0}>
            {loading ? 'Verificando...' : step === 'enroll' ? 'Activar y entrar' : 'Entrar'}
          </button>
          <button type="button" className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void cancel()}>Cancelar</button>
        </form>
      )}
    </div>
  );
};
