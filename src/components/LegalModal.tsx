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
    // Solo reaccionar a la animación del overlay para evitar bugs con hijos
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
          <p className="legal-modal-date"><em>Actualizado: 25 de abril de 2026</em></p>
          
          <div className="legal-modal-text-content">
            <h3>TÉRMINOS Y CONDICIONES</h3>
            <p>Bienvenido a Divina Store. Al acceder y utilizar este sitio web, aceptas cumplir con los siguientes términos y condiciones. Todo el contenido, marcas, logotipos, imágenes y diseños visuales están protegidos por derechos de autor internacionales y leyes de propiedad intelectual.</p>
            <p>Queda estrictamente prohibida la reproducción, distribución o modificación no autorizada de cualquier material presente en esta plataforma sin el consentimiento expreso y por escrito de Divina Store.</p>
            
            <h3>AVISO DE PRIVACIDAD</h3>
            <p>Tus datos personales están protegidos con los más altos estándares de seguridad (cifrado SSL). Utilizamos la información recopilada únicamente para procesar tus pedidos, mejorar tu experiencia en la plataforma y enviarte comunicaciones relevantes si así lo has autorizado.</p>
            <p>No compartimos, vendemos ni alquilamos tu información a terceros bajo ninguna circunstancia. Puedes solicitar la eliminación de tu cuenta y datos en cualquier momento a través del correo de contacto.</p>

            <h3>POLÍTICAS DE DEVOLUCIÓN</h3>
            <p>Por razones de higiene y salubridad, debido a la naturaleza de los productos cosméticos y de cuidado personal, no aceptamos devoluciones una vez que el empaque original del producto ha sido alterado o abierto.</p>
            <p>Solo se aceptarán cambios o devoluciones en caso de defectos de fábrica o si el producto recibido no corresponde al pedido original, en un plazo máximo de 7 días naturales tras la recepción.</p>
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
