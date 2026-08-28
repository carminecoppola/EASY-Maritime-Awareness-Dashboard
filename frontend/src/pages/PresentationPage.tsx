// Vista statica "Presentation Preview": nessuna chiamata API, nessun
// polling, pensata per demo/paper quando l'hardware non è disponibile.
// Equivalente SPA del vecchio /paper-preview Jinja (rimosso in Fase 5).
// A differenza della pagina Live reale, qui i contenuti sono fissi e
// dichiaratamente non rappresentano un'acquisizione live simultanea.
import type { ReactNode } from 'react'

export function PresentationPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 18 }}>Presentation Preview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          A static illustrative view — does not represent simultaneous hardware acquisition. Intended for demos and
          presentation material when the physical cameras are unavailable.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        <PresentationPanel title="RGB LEFT" badge="Recorded sample">
          <img
            src="/paper-assets/rgb-left"
            alt="Campione RGB registrato (dataset SeaShips)"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </PresentationPanel>

        <PresentationPanel title="RGB RIGHT" badge="Recorded sample">
          <img
            src="/paper-assets/rgb-right"
            alt="Campione RGB registrato (dataset SeaShips)"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </PresentationPanel>

        <PresentationPanel title="THERMAL" badge="Illustrative">
          <img
            src="/presentation-thermal.svg"
            alt="Riferimento termico illustrativo (non una misura FLIR live)"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </PresentationPanel>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        RGB samples from the SeaShips dataset (Shao et al., 2018). The thermal reference is illustrative, not a live
        FLIR measurement.
      </p>
    </div>
  )
}

function PresentationPanel({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-2) var(--space-3)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--bg-3)',
            color: 'var(--text-muted)',
          }}
        >
          {badge}
        </span>
      </div>
      <div style={{ aspectRatio: '4 / 3', background: 'var(--bg-0)' }}>{children}</div>
    </div>
  )
}
