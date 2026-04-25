import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './ContactPage.css'; // Podemos reusar los estilos de ContactPage para el wrapper

export const GenericPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<React.ReactNode>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    
    // Aquí podríamos jalar la información de Supabase (una tabla de 'pages')
    // Por ahora, pondremos información estática basada en el slug para cumplir con las páginas faltantes.
    
    if (slug === 'legales') {
      setTitle('Legales y Copyright');
      setContent(
        <div style={{ color: '#ccc', lineHeight: 1.8 }}>
          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>Términos y Condiciones</h3>
          <p style={{ marginBottom: 20 }}>Bienvenido a Divina Store. Al acceder y utilizar este sitio web, aceptas cumplir con los siguientes términos y condiciones. Todo el contenido, marcas y diseños están protegidos por derechos de autor.</p>
          
          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>Aviso de Privacidad</h3>
          <p style={{ marginBottom: 20 }}>Tus datos personales están protegidos. Utilizamos la información recopilada únicamente para procesar tus pedidos, mejorar tu experiencia y enviarte comunicaciones relevantes si así lo has autorizado.</p>

          <h3 style={{ color: 'var(--c-lime)', marginBottom: 12 }}>Políticas de Devolución</h3>
          <p>Debido a la naturaleza de los productos cosméticos, no aceptamos devoluciones una vez que el producto ha sido abierto, a menos que presente un defecto de fábrica.</p>
        </div>
      );
    } else if (slug === 'programa-de-promocion') {
      setTitle('Programa de Promoción');
      setContent(
        <div style={{ color: '#ccc', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}>Únete a nuestro programa de embajadores y recibe comisiones por cada venta generada a través de tus enlaces referidos.</p>
          <ul style={{ listStyleType: 'disc', paddingLeft: 20, marginBottom: 20 }}>
            <li>Comisiones atractivas</li>
            <li>Acceso a productos exclusivos</li>
            <li>Soporte y material publicitario</li>
          </ul>
          <p>Para más información, envíanos un mensaje a través de nuestra página de contacto.</p>
        </div>
      );
    } else if (slug === 'programa-testers') {
      setTitle('Programa Testers (Youtubers)');
      setContent(
        <div style={{ color: '#ccc', lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}>¿Eres creador de contenido? Nos encantaría colaborar contigo. Si tienes un canal de YouTube, TikTok o Instagram dedicado al cuidado personal, puedes aplicar para recibir nuestros productos de prueba.</p>
          <p>Por favor, envíanos tus estadísticas y enlaces a tus canales a través de nuestra página de contacto o correo electrónico directo.</p>
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
