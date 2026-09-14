import { Link } from 'react-router-dom'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { CHECK_COLOR, CHECK_GLYPH, preflightChecks } from '../lib/preflight'

const FLOW = [
  { step: 1, title: 'Verify Live', detail: 'Confirm all required feeds are current.' },
  { step: 2, title: 'Start Mission', detail: 'Create the manifest before collection.' },
  { step: 3, title: 'Capture & Analyze', detail: 'Save synchronized sets and run RGB AI.' },
  { step: 4, title: 'Review & Export', detail: 'Validate evidence in the archive.' },
]

const GUIDES = [
  {
    to: '/',
    tag: 'Live Overview',
    question: 'When is a feed really live?',
    answer: 'Confirm timestamps and provider freshness before collecting.',
    cta: 'Open Live',
  },
  {
    to: '/mission',
    tag: 'Mission',
    question: 'Why start a mission?',
    answer: 'Captures, inference and detections are indexed in the active manifest.',
    cta: 'Open Mission',
  },
  {
    to: '/analysis',
    tag: 'AI Analysis',
    question: 'What should I expect from AI?',
    answer: 'Choose an RGB source and monitor running, waiting or completed states.',
    cta: 'Open Analysis',
  },
  {
    to: '/thermal-events',
    tag: 'Thermal & Events',
    question: 'How does the thermal sensor behave?',
    answer: 'It is captured on demand and releases the device between frames.',
    cta: 'Open Thermal',
  },
  {
    to: '/snapshots',
    tag: 'Archive',
    question: 'Where are images stored?',
    answer: 'Review synchronized capture sets and prepare validated exports.',
    cta: 'Open Archive',
  },
  {
    to: '/system-diagnostics',
    tag: 'Diagnostics',
    question: 'Something looks wrong?',
    answer: 'Inspect CPU, storage and exact hardware-provider errors.',
    cta: 'Open Diagnostics',
  },
]

const ISSUES = [
  {
    tone: '',
    title: 'Feed is offline?',
    detail: 'Open Diagnostics and check the exact provider and USB error.',
  },
  {
    tone: 'warn',
    title: 'No detections?',
    detail: 'Verify the mission and the selected RGB source, then run analysis again.',
  },
  {
    tone: 'danger',
    title: 'High resource usage?',
    detail: 'Stop analysis if CPU load or temperature stays unsafe.',
  },
]

export function HelpPage() {
  const { data } = useSharedDashboardState()
  // La checklist di preparazione riflette lo stato reale, non una lista di
  // spunte sempre verdi come nel mockup.
  const checks = preflightChecks(data ?? null)
  const missionRunning = data?.session?.running ?? false

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Operator guidance</div>
          <h1>Help &amp; Onboarding</h1>
          <p>The normal workflow, page guidance and recovery paths.</p>
        </div>
        <div className="easy-updated">
          Operator guide · <b>EASY dashboard</b>
        </div>
      </section>

      <section className="easy-surface easy-flow">
        {FLOW.map((item) => (
          <div className="easy-flowstep" key={item.step}>
            <div className="easy-num" aria-hidden>
              {item.step}
            </div>
            <b>{item.title}</b>
            <small>{item.detail}</small>
          </div>
        ))}
      </section>

      <section className="easy-helpgrid">
        <article className="easy-surface">
          <div className="easy-panelhead">
            <h2>Page guide</h2>
            <span className="easy-panelnote">One page per operator question</span>
          </div>
          <div className="easy-guide">
            {GUIDES.map((guide) => (
              <Link className="easy-guidecard" to={guide.to} key={guide.to}>
                <span className="easy-tag" style={{ color: 'var(--accent-info)' }}>
                  {guide.tag}
                </span>
                <h3>{guide.question}</h3>
                <p>{guide.answer}</p>
                <span className="easy-open">{guide.cta} →</span>
              </Link>
            ))}
          </div>
        </article>

        <aside className="easy-surface">
          <div className="easy-panelhead">
            <h2>Collection readiness</h2>
            <span className="easy-panelnote">Live checks</span>
          </div>
          <div className="easy-sidebody">
            <h3>Pre-collection checklist</h3>
            {checks.map((check) => (
              <div className="easy-checkline" key={check.id}>
                <i style={{ color: CHECK_COLOR[check.level] }} aria-hidden>
                  {CHECK_GLYPH[check.level]}
                </i>
                <span>
                  {check.label} — {check.detail}
                </span>
              </div>
            ))}
            <div className="easy-checkline">
              <i style={{ color: missionRunning ? 'var(--accent-ok)' : 'var(--text-muted)' }} aria-hidden>
                {missionRunning ? '✓' : '·'}
              </i>
              <span>
                {missionRunning
                  ? 'A mission is active — captures are being indexed.'
                  : 'No mission is active: start one before saving samples you want to keep.'}
              </span>
            </div>

            <h3 style={{ marginTop: 14 }}>Quick troubleshooting</h3>
            {ISSUES.map((issue) => (
              <div className={`easy-issue ${issue.tone}`} key={issue.title}>
                <b>{issue.title}</b>
                <p>{issue.detail}</p>
              </div>
            ))}

            <div className="easy-quick">
              <Link className="easy-btn mini" to="/system-diagnostics">
                Diagnostics
              </Link>
              <Link className="easy-btn mini primary" to="/">
                Start at Live
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </>
  )
}
