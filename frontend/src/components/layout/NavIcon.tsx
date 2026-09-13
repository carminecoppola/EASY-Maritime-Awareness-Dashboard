/**
 * Set di icone SVG minimali dedicato alla sidebar — sostituisce i glifi
 * Unicode (◎▤△▦⚙?⚿) che rendevano ogni voce di navigazione un carattere
 * di tastiera invece che un segno disegnato per il prodotto.
 */
type NavIconName = 'live' | 'mission' | 'thermal' | 'snapshots' | 'diagnostics' | 'help' | 'settings'

const PATHS: Record<NavIconName, string> = {
  // mirino di rilevamento — coerente col dominio (detection)
  live: 'M9 2v3M9 13v3M2 9h3M13 9h3M9 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  // rotta / waypoint di missione
  mission: 'M3 15 7 4l3 7 2-4 4 8H3Z',
  // onda termica
  thermal: 'M3 6c1.2-1.3 2.4-1.3 3.6 0s2.4 1.3 3.6 0 2.4-1.3 3.6 0M3 12c1.2-1.3 2.4-1.3 3.6 0s2.4 1.3 3.6 0 2.4-1.3 3.6 0',
  // pila di frame catturati
  snapshots: 'M4 6h10v8H4zM6 4h10v8',
  // ingranaggio
  diagnostics: 'M9 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm0-4v1.4M9 14.6V16M14.6 9H16M2 9h1.4M13.5 4.5l-1 1M5.5 12.5l-1 1M13.5 13.5l-1-1M5.5 5.5l-1-1',
  help: 'M9 16a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm0-4.2v-.3c0-.7.4-1.1 1-1.5.7-.5 1.1-.9 1.1-1.7 0-1-.9-1.6-2-1.6s-2 .6-2.1 1.7M9 12.9h.01',
  settings: 'M9 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.2-3a5.9 5.9 0 0 1-.1 1.1l1.4 1.1-1.3 2.3-1.7-.5a6 6 0 0 1-1.9 1.1l-.3 1.8H8.2l-.3-1.8a6 6 0 0 1-1.9-1.1l-1.7.5-1.3-2.3 1.4-1.1a5.9 5.9 0 0 1 0-2.2L2.9 6.5l1.3-2.3 1.7.5A6 6 0 0 1 7.8 3.6L8.1 1.8h1.8l.3 1.8a6 6 0 0 1 1.9 1.1l1.7-.5 1.3 2.3-1.4 1.1c.1.36.15.73.15 1.1Z',
}

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path d={PATHS[name]} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export type { NavIconName }
