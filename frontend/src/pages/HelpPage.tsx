export function HelpPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <h1 style={{ fontSize: 18 }}>Help & Documentation</h1>

      {/* Recommended Workflow */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
            First Startup
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
            Recommended Workflow
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            This dashboard monitors RGB and thermal feeds, saves useful captures and organizes data for inference and fine-tuning.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {[
              { step: '1', title: 'Live', desc: 'Check that all three previews are updating and no feed remains in an error state.' },
              { step: '2', title: 'Mission', desc: 'Start a mission before saving data so the system can create a session manifest.' },
              { step: '3', title: 'Capture', desc: 'Save sensor captures and use the Analysis page to produce samples and AI results.' },
              { step: '4', title: 'Archive', desc: 'Review saved photos and the activity log to confirm what was stored and identify any errors.' },
            ].map((item) => (
              <div key={item.step} style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <div style={{ minWidth: '100px', fontSize: 12, fontWeight: 600, color: 'var(--accent-info)' }}>
                  {item.step} · {item.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guide Cards */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
          Pages Guide
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {[
            {
              title: 'When is a feed really live?',
              kicker: 'Live Overview',
              desc: 'The Live page updates feed status and FPS automatically. An offline feed does not mean the server has stopped; it means that camera is not delivering recent frames.',
              href: '/',
            },
            {
              title: 'Why start a mission?',
              kicker: 'Mission',
              desc: 'A mission groups collected data. Captures, inference runs and detections are indexed in its manifest while the session is active, or when analysis opens one automatically.',
              href: '/mission',
            },
            {
              title: 'What should I expect from AI?',
              kicker: 'Detections',
              desc: 'Start analysis runs inference on the selected source. Results appear as current detections, events and manifest entries. If no new detections appear, check the frame source and activity log.',
              href: '/thermal-events',
            },
            {
              title: 'Where are images stored?',
              kicker: 'Photos and Activity',
              desc: 'Photos are stored locally on the Raspberry Pi and shown in the archive. The activity log helps distinguish hardware errors from normal waiting states.',
              href: '/snapshots',
            },
            {
              title: 'Demoing without hardware?',
              kicker: 'Presentation Preview',
              desc: 'A static view with recorded samples and no live polling, for demos or presentation material when the physical cameras are unavailable.',
              href: '/presentation',
            },
          ].map((card) => (
            <div key={card.kicker} style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {card.kicker}
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {card.title}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, flex: 1 }}>
                {card.desc}
              </p>
              <a href={card.href} style={{ fontSize: 12, color: 'var(--accent-interactive)', textDecoration: 'none', fontWeight: 500, marginTop: 'var(--space-2)' }}>
                View page →
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Pre-Capture Checklist */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
            Quick Checklist
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
            Before Collecting Important Data
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-4)' }}>
            These checks reduce incomplete datasets and sessions that are difficult to interpret later.
          </p>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', listStyle: 'none', padding: 0, margin: 0 }}>
            {[
              'Left and right RGB feeds have recent frames.',
              'The thermal sensor is producing real frames or is clearly marked unavailable.',
              'A mission is active before collecting captures intended for fine-tuning.',
              'The session dataset reports consistent samples and RGB/thermal pairs.',
              'The activity log does not show repeated hardware errors.',
            ].map((item, idx) => (
              <li key={idx} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--accent-ok)', fontWeight: 600, minWidth: '16px' }}>✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tips */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={{ fontSize: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
          Tips & Troubleshooting
        </h2>
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-info)', marginBottom: 'var(--space-2)' }}>
                Feed is offline?
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                Check the System Diagnostics page to verify camera connectivity. An offline feed may indicate a USB connection issue, missing libcamera tools, or a hardware malfunction. Review the error message in the camera inventory section.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-warn)', marginBottom: 'var(--space-2)' }}>
                No detections appearing?
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                Ensure a mission is running and that the selected source is producing frames. Low light conditions or unrelated objects may result in no detections. Check the Thermal Events page for detailed logs.
              </p>
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-critical)', marginBottom: 'var(--space-2)' }}>
                High CPU or memory usage?
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                The inference engine consumes significant resources. Monitor the System Diagnostics page during analysis runs. If usage exceeds safe limits, stop the current analysis and restart the service.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
        <p style={{ margin: 0 }}>
          For more information, check the System Diagnostics page or contact your system administrator.
        </p>
      </section>
    </div>
  )
}
