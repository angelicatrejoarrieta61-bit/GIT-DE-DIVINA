/**
 * BarcodeScanner — Escanea EAN/UPC con la cámara (celular o laptop).
 * Usa ZXing (funciona en iPhone y Android). Se carga solo al abrirlo.
 * Requiere HTTPS (Vercel) o localhost.
 */
import React, { useEffect, useRef, useState } from 'react';

type ScanState = 'starting' | 'scanning' | 'denied' | 'no-camera' | 'unsupported' | 'error';

interface Props {
  onDetected: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const doneRef = useRef(false);
  const [state, setState] = useState<ScanState>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        return;
      }
      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled || !videoRef.current) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });

        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!result || doneRef.current) return;
            const code = result.getText().replace(/\D/g, '');
            if (code.length < 8) return;
            doneRef.current = true;
            try { navigator.vibrate?.(60); } catch { /* sin vibración */ }
            controls.stop();
            onDetected(code);
          },
        );
        stopRef.current = () => controls.stop();
        if (cancelled) controls.stop();
        else setState('scanning');
      } catch (e) {
        if (cancelled) return;
        const name = (e as Error)?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') setState('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setState('no-camera');
        else { setState('error'); setErrorMsg((e as Error)?.message || 'No se pudo abrir la cámara.'); }
      }
    };

    void start();
    return () => {
      cancelled = true;
      stopRef.current?.();
    };
  }, [onDetected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.replace(/\D/g, '');
    if (code.length >= 8) onDetected(code);
  };

  const message: Record<ScanState, string> = {
    starting: 'Abriendo cámara…',
    scanning: 'Apunta al código de barras del empaque',
    denied: 'Permiso de cámara negado. Actívalo en el candado de la barra de direcciones.',
    'no-camera': 'No se encontró cámara en este dispositivo.',
    unsupported: 'La cámara solo funciona en el sitio publicado (https). Escribe el código abajo.',
    error: errorMsg,
  };

  return (
    <div className="src-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title" onClick={onClose}>
      <div className="src-modal__panel src-scan" onClick={(e) => e.stopPropagation()}>
        <header className="src-modal__head">
          <h2 id="scan-title">Escanear código</h2>
          <button type="button" className="src-icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <div className={`src-scan__view ${state === 'scanning' ? 'is-live' : ''}`}>
          <video ref={videoRef} muted playsInline autoPlay />
          {state === 'scanning' && <span className="src-scan__line" aria-hidden="true" />}
          {state !== 'scanning' && <div className="src-scan__overlay">{state === 'starting' ? <span className="src-spinner" /> : '📷'}</div>}
        </div>

        <p className={`src-scan__msg ${['denied', 'no-camera', 'error', 'unsupported'].includes(state) ? 'is-error' : ''}`} role="status">
          {message[state]}
        </p>

        <form className="src-scan__manual" onSubmit={submitManual}>
          <input
            className="src-input"
            inputMode="numeric"
            placeholder="O escribe el código (EAN/UPC)"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label="Código de barras manual"
          />
          <button type="submit" className="src-btn src-btn--lime" disabled={manual.replace(/\D/g, '').length < 8}>
            Usar
          </button>
        </form>
      </div>
    </div>
  );
}
