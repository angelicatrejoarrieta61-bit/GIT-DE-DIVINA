import React, { useState } from 'react';
import { read, utils } from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../../lib/supabase';

export const AdminImport: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const ab = e.target?.result;
      const wb = read(ab, { type: 'array' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const json = utils.sheet_to_json(ws);
      setData(json);
      setMessage(`📄 Excel cargado: ${json.length} filas encontradas.`);
    };
    reader.readAsArrayBuffer(file);
  };

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  const handleImport = async () => {
    if (data.length === 0) return;
    setLoading(true);
    setMessage('Procesando, no cierres esta ventana...');

    try {
      for (const row of data) {
        // Normalizar headers (quitar acentos, minúsculas, espacios)
        const getVal = (possibleKeys: string[]) => {
          const key = Object.keys(row).find(k => {
            const normalizedRowKey = k.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            return possibleKeys.includes(normalizedRowKey);
          });
          return key ? row[key] : undefined;
        };

        // Generar nombre
        const rawName = getVal(['nombre', 'title', 'name', 'producto', 'product', 'titulo']);
        const name = rawName ? String(rawName).trim() : '';

        // Si no hay nombre válido, no lo subimos
        if (!name) {
          console.warn('Fila sin nombre ignorada:', row);
          continue;
        }

        const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        
        const priceStr = getVal(['precio', 'price', 'variant price', 'precio final', 'precio normal', 'precio de la variante', 'variante precio']);
        const price = parseFloat(String(priceStr).replace(/[^0-9.]/g, '')) || 0;
        
        const compareStr = getVal(['precio comparacion', 'compare at price', 'variant compare at price', 'precio oferta', 'precio original', 'precio de comparacion', 'precio de comparacion de la variante']);
        let compare = parseFloat(String(compareStr).replace(/[^0-9.]/g, '')) || 0;

        const description = getVal(['descripcion', 'body (html)', 'description', 'detalle']) || '';
        const brand = getVal(['marca', 'vendor', 'brand']) || 'DIVINA';

        const payload = {
          name,
          slug,
          description,
          price,
          compare_price: compare > price ? compare : null,
          brand,
          in_stock: true,
          image_status: 'pending' // Esto enviará el producto a la fila de subida de imágenes
        };

        await supabase.from('products').upsert(payload, { onConflict: 'slug' });
      }

      setMessage(`✅ Importación exitosa. ${data.length} productos actualizados.`);
      setData([]);
    } catch (err: any) {
      setMessage(`❌ Error al importar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="admin-page-title">Importar Excel de Productos</h1>
      <p className="admin-page-subtitle">Sube tu archivo .xlsx o .csv. Los productos se guardarán y pasarán a la sección "Imágenes de Productos".</p>

      <div style={{ marginBottom: 24 }}>
        <button 
          className="btn btn-primary"
          style={{ background: '#ff4444', color: 'white', padding: '10px 20px', fontSize: '12px' }}
          onClick={async () => {
            if (window.confirm('¿Seguro que quieres borrar TODO el catálogo actual para empezar de cero?')) {
              setMessage('Borrando catálogo antiguo...');
              await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              setMessage('✅ Catálogo borrado con éxito. Ahora puedes importar.');
            }
          }}
        >
          🗑️ Borrar todo el catálogo previo
        </button>
      </div>

      <div 
        {...getRootProps()} 
        style={{
          border: '2px dashed rgba(196,252,21,0.3)',
          borderRadius: 24,
          padding: 60,
          textAlign: 'center',
          backgroundColor: isDragActive ? 'rgba(196,252,21,0.05)' : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          marginBottom: 24,
          transition: 'all 0.2s'
        }}
      >
        <input {...getInputProps()} />
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <p style={{ fontSize: 18, color: 'var(--c-white)' }}>
          {isDragActive ? 'Suelta el archivo aquí...' : 'Arrástra tu Excel aquí, o haz clic para seleccionarlo'}
        </p>
      </div>

      {message && (
        <div style={{ padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 12, marginBottom: 24 }}>
          {message}
        </div>
      )}

      {data.length > 0 && (
        <div>
          <button 
            className="btn btn-lime" 
            onClick={handleImport} 
            disabled={loading}
            style={{ marginBottom: 24 }}
          >
            {loading ? 'Subiendo datos a Supabase...' : `Importar ${data.length} productos`}
          </button>

          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {Object.keys(data[0] || {}).slice(0, 6).map(k => <th key={k}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).slice(0, 6).map((val: any, j) => <td key={j}>{String(val)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.length > 10 && <p className="muted-text" style={{ marginTop: 12, fontSize: 13 }}>Mostrando 10 de {data.length} filas...</p>}
          </div>
        </div>
      )}
    </div>
  );
};
