import React, { useEffect, useState } from 'react';
import { getProducts } from '../../lib/queries';
import { supabase, getImageUrl } from '../../lib/supabase';
import { ImageUploaderModal } from '../../components/ImageUploaderModal';
import type { Product } from '../../types';

export const AdminProducts: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showOnlyPending, setShowOnlyPending] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = () => {
    getProducts(200).then(data => {
      setProducts(data);
      setLoading(false);
    });
  };

  const updateProductImages = async (id: string, urls: string[]) => {
    const mainUrl = urls[0];
    await supabase
      .from('products')
      .update({ image_url: mainUrl, images: urls, image_status: 'done' })
      .eq('id', id);
      
    // Refrescar para ver los cambios
    fetchProducts();
    setSelectedProduct(null);
  };

  const displayedProducts = showOnlyPending 
    ? products.filter(p => p.image_status === 'pending') 
    : products;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="admin-page-title">Catálogo Actual</h1>
          <p className="admin-page-subtitle">Revisa y administra todo tu catálogo en un solo lugar.</p>
        </div>
        
        <button 
          onClick={() => setShowOnlyPending(!showOnlyPending)}
          style={{ 
            background: showOnlyPending ? 'var(--c-lime)' : 'rgba(255,255,255,0.05)', 
            color: showOnlyPending ? '#000' : 'var(--c-white)', 
            border: '1px solid',
            borderColor: showOnlyPending ? 'var(--c-lime)' : 'rgba(255,255,255,0.2)',
            padding: '10px 20px', 
            borderRadius: 12, 
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {showOnlyPending ? "👀 Viendo Faltantes" : "🔍 Filtrar Faltantes de Foto"}
        </button>
      </div>

      {loading ? (
        <p>Cargando catálogo...</p>
      ) : displayedProducts.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 24 }}>
          <p>{showOnlyPending ? '¡Felicidades! Todos tus productos tienen foto.' : 'El catálogo está vacío.'}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginTop: 16 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Imagen</th>
                <th>Nombre</th>
                <th>Marca</th>
                <th>Precio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {displayedProducts.map(p => (
                <tr key={p.id}>
                  <td style={{ width: 80 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.image_url ? (
                        <img src={getImageUrl(p.image_url, { width: 96, quality: 60 })} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                      ) : (
                        <span style={{ fontSize: 20 }}>🌿</span>
                      )}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.brand}</td>
                  <td style={{ fontFamily: 'var(--f-heading)' }}>
                    ${Number(p.price || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    {p.in_stock ? (
                      <span style={{ color: 'var(--c-lime)', fontSize: 12, fontWeight: 'bold' }}>En stock</span>
                    ) : (
                      <span style={{ color: '#ff6b6b', fontSize: 12, fontWeight: 'bold' }}>Agotado</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6 }}>
                        <input 
                          type="checkbox" 
                          checked={(p.tags || []).includes('TOP_HOME')}
                          onChange={async (e) => {
                            const newTags = e.target.checked 
                              ? [...(p.tags || []), 'TOP_HOME'] 
                              : (p.tags || []).filter(t => t !== 'TOP_HOME');
                            await supabase.from('products').update({ tags: newTags }).eq('id', p.id);
                            fetchProducts();
                          }}
                        />
                        🏠 En Home
                      </label>

                      <select 
                        value={(p.tags || []).find(t => t && typeof t === 'string' && t.startsWith('BADGE:'))?.replace('BADGE:', '') || ''}
                        onChange={async (e) => {
                          const val = e.target.value;
                          const cleanTags = (p.tags || []).filter(t => t && typeof t === 'string' && !t.startsWith('BADGE:'));
                          const newTags = val ? [...cleanTags, `BADGE:${val}`] : cleanTags;
                          await supabase.from('products').update({ tags: newTags }).eq('id', p.id);
                          fetchProducts();
                        }}
                        style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', color: 'var(--c-white)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px' }}
                      >
                        <option value="">Sin Badge</option>
                        <option value="NUEVO">NUEVO</option>
                        <option value="TOP VENTAS">TOP VENTAS</option>
                        <option value="ESENCIAL">ESENCIAL</option>
                        <option value="EXCLUSIVO">EXCLUSIVO</option>
                      </select>

                      <button 
                        onClick={() => setSelectedProduct(p)}
                        style={{ color: 'var(--c-bg)', background: 'var(--c-lime)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
                        title="Ver o editar la galería de este producto"
                      >
                        📸 Fotos
                      </button>

                      {p.image_status === 'done' && (
                        <button 
                          onClick={async () => {
                            if(window.confirm('¿Seguro que quieres borrar TODAS las fotos de este producto? El producto regresará a la lista de "Pendientes".')) {
                              await supabase.from('products').update({ image_url: null, images: [], image_status: 'pending' }).eq('id', p.id);
                              fetchProducts();
                            }
                          }}
                          style={{ color: '#fff', background: 'rgba(255,165,0,0.2)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold', cursor: 'pointer', border: '1px solid orange' }}
                        >
                          🧹 Quitar Fotos
                        </button>
                      )}

                      <button 
                        onClick={async () => {
                          if(window.confirm('¿Seguro que quieres ELIMINAR por completo este producto del sistema?')) {
                            await supabase.from('products').delete().eq('id', p.id);
                            fetchProducts();
                          }
                        }}
                        style={{ color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
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
