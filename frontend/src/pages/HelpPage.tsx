import { Link } from 'react-router-dom'
import { Collapsible } from '../components/common/Collapsible'

const STEPS = [
  { step: '1', title: 'Live', desc: 'Check all three feeds are updating.' },
  { step: '2', title: 'Mission', desc: 'Start a mission before saving data.' },
  { step: '3', title: 'Capture', desc: 'Save captures, run analysis for AI results.' },
  { step: '4', title: 'Archive', desc: 'Review saved photos and the activity log.' },
]

const PAGE_GUIDE = [
  {
    kicker: 'Live Overview',
    title: 'When is a feed really live?',
    desc: 'An offline feed doesn’t mean the server stopped — that camera just isn’t delivering recent frames.',
    href: '/',
  },
  {
    kicker: 'Mission',
    title: 'Why start a mission?',
    desc: 'Captures, inference runs, and detections are indexed in the mission manifest while a session is active.',
    href: '/mission',
  },
  {
    kicker: 'Detections',
    title: 'What should I expect from AI?',
    desc: 'No new detections? Check the frame source and activity log — analysis needs a live or selected source.',
    href: '/thermal-events',
  },
  {
    kicker: 'Photos and Activity',
    title: 'Where are images stored?',
    desc: 'Locally on the Raspberry Pi, shown in the archive. The activity log tells hardware errors from normal waits.',
    href: '/snapshots',
  },
  {
    kicker: 'Presentation Preview',
    title: 'Demoing without hardware?',
    desc: 'A static view with recorded samples, no live polling — for demos when the physical cameras aren’t available.',
    href: '/presentation',
  },
]

const CHECKLIST = [
  'Left and right RGB feeds have recent frames.',
  'The thermal sensor is producing real frames or is clearly marked unavailable.',
  'A mission is active before collecting captures intended for fine-tuning.',
  'The session dataset reports consistent samples and RGB/thermal pairs.',
  'The activity log does not show repeated hardware errors.',
]

const TROUBLESHOOTING = [
  {
    tone: 'var(--accent-info)',
    title: 'Feed is offline?',
    body: 'Check System Diagnostics to verify camera connectivity — could be a USB issue, missing libcamera tools, or a hardware fault. The camera inventory shows the exact error.',
  },
  {
    tone: 'var(--accent-warn)',
    title: 'No detections appearing?',
    body: 'Make sure a mission is running and the selected source is producing frames. Low light or unrelated objects can also mean genuinely nothing to detect.',
  },
  {
    tone: 'var(--accent-critical)',
    title: 'High CPU or memory usage?',
    body: 'Inference is resource-heavy — watch System Diagnostics during analysis runs. If usage stays unsafe, stop the analysis and restart the service.',
  },
]

export function HelpPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h1 style={{ fontSize: 18 }}>Help</h1>
        <p style={{ margin: '4px 0 0 0', color: 'var(--text-muted)', fontSize: 13 }}>
          The typical flow, one page per question, and what to do when something looks wrong.
        </p>
      </div>

      {/* PRIMARY: a visual stepper instead of a paragraph + text rows —
          the whole workflow readable in one scan, not a read. */}
      <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          {STEPS.map((item, idx) => (
            <div key={item.step} style={{ display: 'flex', alignItems: 'flex-start', flex: idx < STEPS.length - 1 ? 1 : undefined }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 96 }}>
                <div
                  className="mono"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--accent-info-dim)',
                    color: 'var(--accent-info)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {item.step}
                </div>
                <div style={{ marginTop: 'var(--space-2)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
                  {item.title}
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
                  {item.desc}
                </div>
              </div>
              {idx < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)', marginTop: 16, minWidth: 24 }} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SECONDARY: page guide — same info as before, trimmed to one line
          per card and using client-side <Link> instead of plain <a> (the
          old cards did a full page reload on every click). */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Page Guide
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
          {PAGE_GUIDE.map((card) => (
            <Link
              key={card.kicker}
              to={card.href}
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                textDecoration: 'none',
                transition: 'border-color 150ms ease-out',
              }}
            >
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.kicker}
              </div>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{card.title}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '2px 0 0 0' }}>{card.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* SECONDARY (collapsed by default): reference material looked up
          only when something's actually wrong — the checklist and the
          troubleshooting list used to always be on screen as three more
          full-text sections below an already text-heavy page. */}
      <Collapsible title="Checklist & Troubleshooting" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-3) 0' }}>
              Before collecting important data
            </h3>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', listStyle: 'none', padding: 0, margin: 0 }}>
              {CHECKLIST.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--accent-ok)', fontWeight: 600, minWidth: 16 }}>✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {TROUBLESHOOTING.map((item, idx) => (
              <div key={item.title} style={{ borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none', paddingTop: idx > 0 ? 'var(--space-3)' : 0 }}>
                <h4 style={{ fontSize: 12, fontWeight: 600, color: item.tone, margin: '0 0 4px 0' }}>{item.title}</h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Collapsible>
    </div>
  )
}
