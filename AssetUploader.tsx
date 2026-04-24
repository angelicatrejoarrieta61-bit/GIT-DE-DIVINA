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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  // Cada que el valor del servidor cambie (o se limpie), reseteamos el local
  useEffect(() => {
    if (!selectedFile) setPreview(null);
  }, [currentValue]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setStatus(null);
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setStatus(null);

    try {
      // Subimos con un nombre que incluya la extensión original
      const path = await uploadAsset(selectedFile, configKey);
      
      if (path) {
        // Guardamos la ruta en la base de datos (salvo que skipConfig = true)
        if (!skipConfig) await setStoreConfig(configKey, path);
        onUpdate(path);
        
        setStatus({ type: 'success', msg: '¡Guardado correctamente!' });
        setSelectedFile(null);
        setPreview(null);
      } else {
        throw new Error('No se pudo subir el archivo.');
      }
    } catch (err) {
      console.error('Error uploading asset:', err);
      setStatus({ type: 'error', msg: 'Error al guardar. Intenta de nuevo.' });
    } finally {
      setUploading(false);
    }
  };

  const currentSrc = preview || (currentValue ? getImageUrl(currentValue, { width: 200, quality: 70 }) : null);

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
            background: 'rgba(255,255,255,0.05)', 
            color: 'var(--c-white)', 
            borderRadius: 6, 
            fontSize: 11, 
            fontWeight: 'bold', 
            cursor: uploading ? 'not-allowed' : 'pointer',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          {preview ? 'Cambiar' : 'Elegir'}
        </label>

        {preview && (
          <button 
            onClick={handleSave}
            disabled={uploading}
            style={{ 
              padding: '8px 12px', 
              background: 'var(--c-lime)', 
              color: '#000', 
              borderRadius: 6, 
              fontSize: 11, 
              fontWeight: 'bold', 
              cursor: uploading ? 'not-allowed' : 'pointer',
              border: 'none'
            }}
          >
            {uploading ? '...' : '✅ Guardar'}
          </button>
        )}
      </div>
    </div>
  );
};
