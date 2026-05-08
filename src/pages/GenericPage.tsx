import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './ContactPage.css';

export const GenericPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<React.ReactNode>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    
    if (slug === 'legales') {
      setTitle('Legales, Copyright y Propiedad Intelectual');
      setContent(
        <div style={{ color: '#ccc', lineHeight: 1.8 }}>
          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>1. Protección de Derechos de Autor</h3>
          <p style={{ marginBottom: 20 }}>Todo el software, código fuente (HTML, CSS, JS), diseños UX/UI, logotipos y material fotográfico presente en Divina Store® está protegido por leyes nacionales e internacionales de Propiedad Intelectual. Queda estrictamente prohibida su copia o reproducción sin autorización.</p>
          
          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>2. Aviso de Privacidad</h3>
          <p style={{ marginBottom: 20 }}>Recopilamos tus datos únicamente para fines operativos. Contamos con protocolos de cifrado de extremo a extremo para asegurar que tu información personal y de pago nunca sea comprometida.</p>

          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>3. Políticas de Devolución y Garantías</h3>
          <p style={{ marginBottom: 20 }}>Garantizamos la originalidad de todos nuestros productos. Si recibes un producto con defecto de fábrica, cuentas con 7 días para reportarlo. No se aceptan cambios en productos abiertos por razones de higiene.</p>
          
          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>4. Limitación de Responsabilidad</h3>
          <p>Divina Store no se hace responsable por el uso inadecuado de los productos adquiridos. Recomendamos siempre consultar con un dermatólogo antes de iniciar cualquier tratamiento.</p>
        </div>
      );
    } else if (slug === 'programa-de-promocion') {
      setTitle('Programa de Promoción y Embajadores');
      setContent(
        <div style={{ color: '#ccc', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}>Conviértete en embajador de Divina Store y ayuda a otros a encontrar el cuidado de piel perfecto mientras generas ingresos.</p>
          <ul style={{ listStyleType: 'disc', paddingLeft: 20, marginBottom: 20 }}>
            <li>Comisiones del 10% al 20% por venta referida.</li>
            <li>Códigos de descuento exclusivos para tu audiencia.</li>
            <li>Acceso anticipado a lanzamientos de marcas como ISDIN y La Roche-Posay.</li>
            <li>Dashboard personal para rastrear tus ganancias.</li>
          </ul>
          <p>Para aplicar, envía tus redes sociales y estadísticas a <strong>ventas@divinastore.com.mx</strong>.</p>
        </div>
      );
    } else if (slug === 'programa-testers') {
      setTitle('Programa de Testers y Creadores (UGC)');
      setContent(
        <div style={{ color: '#ccc', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}>¿Te apasiona el skincare y te gusta crear contenido? Queremos enviarte productos para que los pruebes y compartas tu opinión honesta.</p>
          <p style={{ marginBottom: 20 }}>Buscamos perfiles en TikTok e Instagram que tengan una comunidad activa interesada en belleza y salud cutánea.</p>
          <p>Envíanos un mensaje con el asunto "Programa Tester" indicando tus canales principales y por qué te gustaría colaborar con nosotros.</p>
        </div>
      );
    } else {
      setTitle('Página no encontrada');
      setContent(<p>La información que buscas no está disponible o la URL es incorrecta.</p>);
    }
  }, [slug]);

  return (
    <div className="contact-page collection-page" style={{ paddingTop: 'calc(var(--nav-h) + 60px)', minHeight: '80vh' }}>
      <div className="page-width section" style={{ maxWidth: 800 }}>
        <h1 className="contact-page__title" style={{ fontSize: '36px', fontFamily: 'var(--f-heading)', marginBottom: '32px', color: 'var(--c-white)', textAlign: 'left' }}>
          {title}
        </h1>
        <div className="contact-page__form-wrapper glass" style={{ padding: '40px', borderRadius: '16px' }}>
          {content}
        </div>
      </div>
    </div>
  );
};
