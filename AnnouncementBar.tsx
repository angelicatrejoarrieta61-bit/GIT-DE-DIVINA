import React, { useState, useEffect } from 'react';

const MESSAGES = [
  "ENVÍO ESTÁNDAR GRATIS EN COMPRAS A PARTIR DE $2000 MXN",
  "PAGA A MESES SIN INTERESES CON TARJETAS PARTICIPANTES",
  "DESCUBRE LA NUEVA COLECCIÓN 2026",
  "SUSCRÍBETE Y RECIBE OFERTAS EXCLUSIVAS"
];

export const AnnouncementBar: React.FC = () => {
  const [visible, setVisible] = useState(true);

  // Ocultar automáticamente después de 1 minuto
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 60000); // 60 segundos
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0,
      zIndex: 101,
      background: '#000000',
      color: '#ffffff',
      height: '28px', // Más delgada
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
    }}>
      <div className="announcement-marquee">
        {/* Repetimos la lista un par de veces para crear el efecto de loop infinito continuo */}
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '32px', whiteSpace: 'nowrap', paddingRight: '32px' }}>
            {MESSAGES.map((msg, index) => (
              <span key={`${i}-${index}`} style={{
                fontSize: '11px',
                fontFamily: 'var(--f-sub)',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                fontWeight: 700,
              }}>
                {msg}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
