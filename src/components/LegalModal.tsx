import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './LegalModal.css';

interface LegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ isOpen, onClose }) => {
  const [render, setRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setRender(true);
    }
  }, [isOpen]);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === e.currentTarget && !isOpen) {
      setRender(false);
    }
  };

  if (!render) return null;

  const modalContent = (
    <div 
      className={`legal-modal-overlay ${isOpen ? 'open' : 'closed'}`} 
      onClick={onClose}
      onAnimationEnd={handleAnimationEnd}
    >
      <div 
        className={`legal-modal-container ${isOpen ? 'open' : 'closed'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="legal-modal-main">
          <h2 className="legal-modal-title">LEGALES Y COPYRIGHT</h2>
          <p className="legal-modal-date"><em>Actualizado: {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</em></p>
          
          <div className="legal-modal-text-content">
            <h3 style={{ color: 'var(--c-lime)', marginTop: 24, marginBottom: 12 }}>1. PROPIEDAD INTELECTUAL Y COPYRIGHT</h3>
            <p>Todo el contenido presente en este sitio web, incluyendo pero no limitado a: código fuente, arquitectura de software, diseños gráficos, logotipos, imágenes de productos, textos, y combinaciones de colores, es propiedad exclusiva de <strong>Divina Store®</strong> o de sus respectivos licenciantes.</p>
            <p>Queda estrictamente prohibida la extracción automática de datos (web scraping), la copia total o parcial del código fuente, el uso de nuestras imágenes para fines comerciales externos, o cualquier otra forma de robo de propiedad intelectual. Divina Store® se reserva el derecho de emprender acciones legales civiles y penales contra cualquier individuo o entidad que infrinja estos derechos.</p>
            
            <h3 style={{ color: 'var(--c-lime)', marginTop: 24, marginBottom: 12 }}>2. TÉRMINOS Y CONDICIONES DE USO</h3>
            <p>Al navegar y comprar en Divina Store, el usuario acepta que es mayor de edad y que la información proporcionada para transacciones es verídica. Nos reservamos el derecho de cancelar pedidos sospechosos de fraude o que infrinjan nuestras políticas de seguridad.</p>
            <p>Los precios mostrados están en Pesos Mexicanos (MXN) e incluyen IVA, a menos que se indique lo contrario. Las promociones tienen vigencia limitada y no son acumulables a menos que se especifique.</p>
            
            <h3 style={{ color: 'var(--c-lime)', marginTop: 24, marginBottom: 12 }}>3. AVISO DE PRIVACIDAD INTEGRAL</h3>
            <p>Divina Store® cumple con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares. Tus datos (nombre, correo, dirección, teléfono) son utilizados exclusivamente para:</p>
            <ul style={{ listStyleType: 'disc', paddingLeft: 20, marginBottom: 12 }}>
              <li>Procesar y enviar tus pedidos.</li>
              <li>Brindar soporte técnico y atención al cliente.</li>
              <li>Enviar boletines informativos (solo si te has suscrito).</li>
              <li>Prevenir actividades fraudulentas.</li>
            </ul>
            <p>No almacenamos datos sensibles de tarjetas bancarias; todos los pagos son procesados a través de pasarelas seguras y certificadas (como Clip®).</p>

            <h3 style={{ color: 'var(--c-lime)', marginTop: 24, marginBottom: 12 }}>4. POLÍTICAS DE ENVÍO Y DEVOLUCIÓN</h3>
            <p><strong>Envíos:</strong> Procesamos pedidos en 24-48 horas hábiles. El tiempo de entrega varía según la zona geográfica (generalmente de 3 a 5 días hábiles).</p>
            <p><strong>Devoluciones:</strong> Por razones de higiene y salubridad, no se aceptan devoluciones de productos cosméticos o de cuidado personal una vez que el sello de seguridad ha sido roto o el empaque abierto.</p>
            <p>En caso de recibir un producto dañado o incorrecto, el cliente tiene <strong>7 días naturales</strong> para reportarlo a hola@divinastore.com.mx adjuntando fotografías del estado del paquete.</p>
          </div>
        </div>
        
        <div className="legal-modal-arrow">
          <svg preserveAspectRatio="none" viewBox="0 0 100 100">
            <polygon points="0,0 95,50 0,100" fill="#f4f9fa" />
            <polyline points="0,0 95,50 0,100" fill="none" stroke="var(--c-lime)" strokeWidth="12" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" strokeLinecap="square"/>
          </svg>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
