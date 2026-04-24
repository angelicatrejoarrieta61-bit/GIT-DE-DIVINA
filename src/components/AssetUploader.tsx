import React, { useState, useEffect } from 'react';
import { uploadAsset, getImageUrl } from '../lib/supabase';
import { setStoreConfig } from '../lib/queries';

interface Props {
  label: string;
  configKey: string;
  currentValue?: string;
  onUpdate: (val: string) => void;
  skipConfig?: boolean;
}

export const AssetUploader: React.FC<Props> = ({ label, configKey, currentValue, onUpdate, skipConfig }) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  // Cada que el valor del servidor cambie, reseteamos el local si no estamos subiendo
  useEffect(() => {
    if (!uploading) setPreview(null);
  }, [currentValue, uploading]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read as Data URL to support passing it safely to iframe via postMessage
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        setPreview(dataUrl);
        setStatus(null);
        onUpdate(dataUrl);
      }
    };
    reader.readAsDataURL(file);

    // Auto-upload
    setUploading(true);
    setStatus({ type: 'success', msg: 'Subiendo...' });

    try {
      const path = await uploadAsset(file, configKey);
      
      if (path) {
        if (!skipConfig) await setStoreConfig(configKey, path);
        onUpdate(path);
        setStatus({ type: 'success', msg: '¡Guardado correctamente!' });
        
        // Remove success message after 3 seconds
        setTimeout(() => setStatus(null), 3000);
      } else {
        throw new Error('No se pudo subir el archivo.');
      }
    } catch (err) {
      console.error('Error uploading asset:', err);
      setStatus({ type: 'error', msg: 'Error al subir. Intenta de nuevo con una imagen más liviana.' });
      setPreview(null);
      if (currentValue && !currentValue.startsWith('data:') && !currentValue.startsWith('blob:')) {
         onUpdate(currentValue);
      } else {
         onUpdate(''); // or whatever fallback
      }
    } finally {
      setUploading(false);
    }
  };

  const currentSrc = preview || (currentValue && !currentValue.startsWith('data:') && !currentValue.startsWith('blob:') ? getImageUrl(currentValue, { width: 200, quality: 70 }) : (currentValue || null));

  return (
    <div style={{ 
      background: 'rgba(255,255,255,0.03)', 
      padding: '12px 16px', 
      borderRadius: 12, 
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16
    }}>
      <div style={{ 
        width: 48, height: 48, borderRadius: 8, background: '#111', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: preview ? '2px solid var(--c-lime)' : '1px solid rgba(255,255,255,0.1)'
      }}>
        {currentSrc ? (
          <img src={currentSrc} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontSize: 20 }}>🖼️</span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--c-white)' }}>{label}</label>
        {status && (
          <p style={{ fontSize: 11, color: status.type === 'success' ? 'var(--c-lime)' : '#ff6b6b', margin: 0, fontWeight: 'bold' }}>
            {status.msg}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input 
          type="file" 
          id={`file-${configKey}`}
          onChange={handleFileSelect} 
          style={{ display: 'none' }} 
          accept="image/*"
          disabled={uploading}
        />
        
        <label 
          htmlFor={`file-${configKey}`}
          style={{ 
            padding: '8px 12px', 
            background: uploading ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)', 
            color: uploading ? 'rgba(255,255,255,0.4)' : 'var(--c-white)', 
            borderRadius: 6, 
            fontSize: 11, 
            fontWeight: 'bold', 
            cursor: uploading ? 'not-allowed' : 'pointer',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          {uploading ? 'Subiendo...' : 'Cambiar'}
        </label>
      </div>
    </div>
  );
};
