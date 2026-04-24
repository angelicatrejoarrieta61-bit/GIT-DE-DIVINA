import React, { useEffect, useState } from 'react';
import { getProducts } from '../../lib/queries';
import { supabase, getImageUrl } from '../../lib/supabase';
import { ImageUploaderModal } from '../../components/ImageUploaderModal';
import type { Product } from '../../types';

export const AdminNoImage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    // Traemos todos para usarlos como Gestor de Galería. Ponemos los pendientes primero.
    const data = await getProducts(300);
    const sorted = [...data].sort((a, b) => {
      if (a.image_status === 'pending' && b.image_status === 'done') return -1;
      if (a.image_status === 'done' && b.image_status === 'pending') return 1;
      return 0;
    });
    setProducts(sorted);
    setLoading(false);
  };

  const updateProductImages = async (id: string, urls: string[]) => {
    const mainUrl = urls[0];
    await supabase
      .from('products')
      .update({ image_url: mainUrl, images: urls, image_status: 'done' })
      .eq('id', id);
      
    // Actualizamos en vivo sin borrar el renglón
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, image_url: mainUrl, images: urls, image_status: 'done' } : p
    ));
    setSelectedProduct(null); // Cerrar modal si estaba abierto
  };

  return (
    <div>
      <h1 className="admin-page-title">Gestor Múltiple de Fotos</h1>
      <p className="admin-page-subtitle">
        Sube o edita las 6 fotos de cada producto. Al subirlas, verás aquí su preview en vivo.
      </p>

      {loading ? (
        <p>Cargando lista...</p>
      ) : products.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 24, border: '1px solid rgba(196,252,21,0.2)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
          <h2 style={{ color: 'var(--c-lime)' }}>No hay productos</h2>
          <p>Importa tu Excel primero.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>Galería (6 Slots)</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr 
                  key={p.id} 
                  style={{ cursor: 'pointer', transition: 'background 0.2s', opacity: p.image_status === 'pending' ? 1 : 0.8 }}
                  onClick={() => setSelectedProduct(p)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.brand}</td>
                  <td>
                    {/* Renderizamos visualmente los 6 slots */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[0, 1, 2, 3, 4, 5].map(idx => {
                        const url = p.images && p.images[idx];
                        if (url) {
                          return (
                            <div key={idx} style={{ width: 32, height: 32, borderRadius: 4, overflow: 'hidden', border: idx === 0 ? '1px solid var(--c-lime)' : '1px solid rgba(255,255,255,0.2)' }}>
                              <img src={getImageUrl(url, { width: 64, quality: 60 })} alt={`s-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                            </div>
                          );
                        } else {
                          return (
                            <div key={idx} style={{ 
                              width: 32, height: 32, borderRadius: 4, 
                              background: 'rgba(196,252,21,0.05)', 
                              border: '1px dashed rgba(196,252,21,0.2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 8, color: 'var(--c-lime)'
                            }}>
                              {idx + 1}
                            </div>
                          );
                        }
                      })}
                    </div>
                  </td>
                  <td>
                    <button className={p.image_status === 'done' ? "badge badge-dark" : "badge badge-lime"} style={{ border: 'none', cursor: 'pointer', padding: '6px 12px' }}>
                      {p.image_status === 'done' ? 'Editar Fotos' : 'Subir Imágenes'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedProduct && (
        <ImageUploaderModal 
          product={selectedProduct} 
          onClose={() => setSelectedProduct(null)}
          onSuccess={(urls) => updateProductImages(selectedProduct.id, urls)}
        />
      )}
    </div>
  );
};


