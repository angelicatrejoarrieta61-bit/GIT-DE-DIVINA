import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadProductImage, getImageUrl } from '../lib/supabase';
import type { Product } from '../types';

interface Props {
  product: Product;
  onClose: () => void;
  onSuccess: (urls: string[]) => void;
}

type MixedImage = { type: 'url'; url: string } | { type: 'file'; file: File };

export const ImageUploaderModal: React.FC<Props> = ({ product, onClose, onSuccess }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  
  // Inicializamos con las imágenes que YA existan en el producto
  const [items, setItems] = useState<MixedImage[]>(() => 
    (product.images || []).map(url => ({ type: 'url', url }))
  );

  const onDrop = (acceptedFiles: File[]) => {
    setItems(prev => {
      const newItems: MixedImage[] = acceptedFiles.map(file => ({ type: 'file', file }));
      return [...prev, ...newItems].slice(0, 6);
    });
  };

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] }
  });

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setUploading(true);
    setError('');

    try {
      const finalUrls: string[] = [];
      const timestamp = Date.now(); // Para romper el caché si sobrescriben

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === 'url') {
          // Ya estaba en la nube, la conservamos
          finalUrls.push(item.url);
        } else {
          // Es un archivo nuevo, lo subimos
          const suffix = i === 0 ? `-${timestamp}` : `-${i}-${timestamp}`;
          const path = await uploadProductImage(item.file, `${product.slug}${suffix}`);
          if (path) finalUrls.push(path);
        }
      }

      onSuccess(finalUrls);
    } catch (err) {
      setError('Error al subir las imágenes. Revisa tu conexión.');
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{
        background: 'var(--c-surface)', border: '1px solid var(--c-border)', 
        borderRadius: 24, padding: 32, width: '90%', maxWidth: 600,
        boxShadow: '0 30px 60px rgba(0,0,0,0.5)', position: 'relative',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        {!uploading && (
          <button 
            onClick={onClose}
            style={{ position: 'absolute', top: 24, right: 24, fontSize: 24, color: 'var(--c-text-muted)', cursor: 'pointer', zIndex: 10, background: 'none', border: 'none' }}
          >
            ×
          </button>
        )}

        <h2 style={{ fontFamily: 'var(--f-heading)', marginBottom: 8, paddingRight: 32 }}>{product.name}</h2>
        <p style={{ color: 'var(--c-lime)', fontSize: 12, marginBottom: 24, letterSpacing: '0.1em', fontFamily: 'var(--f-accent)' }}>
          {product.brand}
        </p>

        <div 
          {...getRootProps()} 
          style={{
            border: '2px dashed',
            borderColor: isDragActive ? 'var(--c-lime)' : 'rgba(255,255,255,0.2)',
            borderRadius: 16,
            minHeight: items.length > 0 ? 120 : 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: uploading ? 'not-allowed' : 'pointer',
            background: isDragActive ? 'rgba(196,252,21,0.05)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
            pointerEvents: uploading ? 'none' : 'auto'
          }}
        >
          <input {...getInputProps()} />
          <div style={{ textAlign: 'center' }}>
             <p style={{ fontSize: 18, color: 'var(--c-white)', marginBottom: 8, marginTop: 0 }}>
                {isDragActive ? 'Suelta tus imágenes acá...' : '👉 Clickea para elegir fotos o arrástralas aquí'}
             </p>
             <p style={{ fontSize: 12, color: 'var(--c-text-muted)', margin: 0 }}>(Máximo 6 imágenes, tú llevas {items.length}/6)</p>
          </div>
        </div>

        {items.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 14, color: 'var(--c-text-muted)', marginBottom: 12 }}>Galería del producto:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {items.map((item, idx) => {
                const src = item.type === 'url' ? getImageUrl(item.url, { width: 200, quality: 70 }) : URL.createObjectURL(item.file);
                return (
                  <div key={idx} style={{ position: 'relative', background: '#111', borderRadius: 8, overflow: 'hidden', height: 80, border: idx === 0 ? '2px solid var(--c-lime)' : '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={src} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: uploading ? 0.5 : 1 }} />
                    {idx === 0 && <span style={{ position: 'absolute', bottom: 4, left: 4, background: 'var(--c-lime)', color: '#000', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 'bold' }}>PRINCIPAL</span>}
                    
                    {!uploading && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                        style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <p style={{ color: '#ff6b6b', fontSize: 14, marginTop: 16, textAlign: 'center' }}>{error}</p>}

        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end' }}>
           <button 
             className="btn btn-lime"
             style={{ width: '100%', justifyContent: 'center', height: 50, border: 'none', cursor: uploading ? 'not-allowed' : 'pointer' }}
             onClick={handleSave}
             disabled={uploading}
           >
             {uploading ? '💾 Guardando en nube...' : `💾 Guardar Galería (${items.length} imágenes)`}
           </button>
        </div>

      </div>
    </div>
  );
};
