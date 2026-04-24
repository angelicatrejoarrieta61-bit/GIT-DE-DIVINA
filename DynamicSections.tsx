import React from 'react';
import { getImageUrl } from '../lib/supabase';
import { Link } from 'react-router-dom';
import './DynamicSections.css';

export interface SectionBlock {
  id: string;
  type: 'image_text' | 'text_center';
  title?: string;
  content?: string;
  imageUrl?: string;
  imagePosition?: 'left' | 'right';
  buttonText?: string;
  buttonLink?: string;
  showButton?: boolean;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  paddingY?: number;
}

interface Props {
  blocksData?: string;
}

export const DynamicSections: React.FC<Props> = ({ blocksData }) => {
  if (!blocksData) return null;

  let blocks: SectionBlock[] = [];
  try {
    const parsed = JSON.parse(blocksData);
    if (Array.isArray(parsed)) {
      blocks = parsed;
    }
  } catch (e) {
    return null;
  }

  return (
    <div className="dynamic-sections">
      {blocks.map(block => (
        <section
          key={block.id}
          className="dynamic-section page-width section"
          style={{
            background: block.backgroundColor || 'transparent',
            borderRadius: block.borderRadius ? `${block.borderRadius}px` : undefined,
            color: block.textColor || undefined,
            paddingTop: `${block.paddingY ?? 40}px`,
            paddingBottom: `${block.paddingY ?? 40}px`,
          }}
        >
          
          {block.type === 'text_center' && (
            <div className="dynamic-section__center">
              {block.title && <h2 className="dynamic-section__title" dangerouslySetInnerHTML={{ __html: String(block.title) }} />}
              {block.content && <p className="dynamic-section__text muted-text" dangerouslySetInnerHTML={{ __html: String(block.content) }} />}
              {block.showButton !== false && block.buttonText && block.buttonLink && (
                <Link to={String(block.buttonLink)} className="btn btn-lime" style={{ marginTop: 24 }}>
                  {String(block.buttonText)}
                </Link>
              )}
            </div>
          )}

          {block.type === 'image_text' && (
            <div className={`dynamic-section__split ${block.imagePosition === 'right' ? 'reverse' : ''}`}>
              <div className="dynamic-section__media">
                {block.imageUrl ? (
                  <img src={getImageUrl(block.imageUrl, { width: 800, quality: 80 })} alt={block.title || 'Sección'} loading="lazy" />
                ) : (
                  <div className="dynamic-section__placeholder">🖼️</div>
                )}
              </div>
              <div className="dynamic-section__info">
                {block.title && <h2 className="dynamic-section__title" dangerouslySetInnerHTML={{ __html: String(block.title) }} />}
                {block.content && <p className="dynamic-section__text muted-text" dangerouslySetInnerHTML={{ __html: String(block.content) }} />}
                {block.showButton !== false && block.buttonText && block.buttonLink && (
                  <Link to={String(block.buttonLink)} className="btn btn-outline" style={{ marginTop: 24 }}>
                    {String(block.buttonText)}
                  </Link>
                )}
              </div>
            </div>
          )}

        </section>
      ))}
    </div>
  );
};
