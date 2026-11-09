import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { MANUAL_SECTIONS } from './manualContent';

/** Manual de ayuda contextual (manual-modal.js). Corrige la fuga de listeners y el reset de overflow del body. */
const ManualContext = createContext<((id: string) => void) | null>(null);

export function ManualProvider({ children }: { children: ReactNode }) {
  const [sectionId, setSectionId] = useState<string | null>(null);
  const open = useCallback((id: string) => { if (MANUAL_SECTIONS[id]) setSectionId(id); }, []);
  const close = useCallback(() => setSectionId(null), []);
  const section = sectionId ? MANUAL_SECTIONS[sectionId] : null;

  useEffect(() => {
    if (!section) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [section, close]);

  return (
    <ManualContext.Provider value={open}>
      {children}
      <div id="manualModalOverlay" className={`manual-modal-overlay ${section ? 'active' : ''}`}
        onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} aria-hidden={!section}>
        {section && (
          <div id="manualModalContainer" className="manual-modal-container" role="dialog" aria-modal="true" aria-labelledby="manualModalTitle">
            <div className="manual-modal-header">
              <div className="manual-modal-header-content">
                <div className="manual-modal-header-icon"><i className={`fas ${section.icon}`} aria-hidden="true" /></div>
                <h3 id="manualModalTitle">{section.title}</h3>
              </div>
              <button type="button" className="manual-modal-close-btn" id="manualCloseBtn" onClick={close} aria-label="Cerrar manual">
                <i className="fas fa-times" aria-hidden="true" />
              </button>
            </div>
            <div className="manual-modal-content">
              {section.items.map((it, i) => (
                <div className="manual-section" key={it.title}>
                  <div className="manual-section-number">{i + 1}</div>
                  <div className="manual-section-content">
                    <h4 className="manual-section-title">{it.title}</h4>
                    <p className="manual-section-text">{it.text}</p>
                  </div>
                </div>
              ))}
              {section.tips.length > 0 && (
                <div className="manual-tips-box">
                  <h5 className="manual-tips-title"><i className="fas fa-lightbulb" aria-hidden="true" />{section.tipsTitle ?? 'Consejos Útiles'}</h5>
                  <ul className="manual-tips-list">
                    {section.tips.map((t) => <li className="manual-tips-item" key={t}>{t}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="manual-modal-footer">
              <button type="button" className="manual-modal-footer-btn" id="manualConfirmBtn" onClick={close} autoFocus>Entendido</button>
            </div>
          </div>
        )}
      </div>
    </ManualContext.Provider>
  );
}

export function useManual() {
  const ctx = useContext(ManualContext);
  if (!ctx) throw new Error('useManual debe usarse dentro de <ManualProvider>');
  return ctx;
}

/** Botón "?" de ayuda. variant 'form' = .manual-help-btn ; 'table' = .manual-help-btn-table (sobre cabeceras con gradiente). */
export function HelpButton({ sectionId, variant = 'form', className = '', title, style }: {
  sectionId: string; variant?: 'form' | 'table'; className?: string; title?: string; style?: React.CSSProperties;
}) {
  const open = useManual();
  const t = title ?? (variant === 'form' ? 'Ver instrucciones de esta sección' : 'Ver explicación de columnas');
  return (
    <button type="button" data-section-id={sectionId} aria-label={t} title={t} style={style}
      className={`${variant === 'form' ? 'manual-help-btn' : 'manual-help-btn-table'} ${className}`}
      onClick={(e) => { e.stopPropagation(); open(sectionId); }}>
      <i className="fas fa-question" aria-hidden="true" />
    </button>
  );
}
