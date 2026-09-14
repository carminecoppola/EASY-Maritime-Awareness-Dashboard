import { useCallback, useState } from 'react'
import { api } from '../api/client'
import { normalizeApiError } from '../lib/errors'
import { SnapshotGallery } from '../components/snapshots/SnapshotGallery'
import { DatasetExport } from '../components/snapshots/DatasetExport'
import { Collapsible } from '../components/common/Collapsible'
import { useSnapshotsRecent } from '../hooks/useSnapshotsRecent'
import { useSharedDashboardState } from '../hooks/DashboardStateContext'
import { toDate } from '../utils/formatTime'
import { mostRecentFirst } from '../utils/sorting'
import type { RawLogEvent, SessionManifestCounts, Snapshot } from '../api/types'

function countByKind(items: Snapshot[]): { rgb: number; thermal: number; left: number; right: number } {
  let rgb = 0
  let thermal = 0
  let left = 0
  let right = 0
  for (const item of items) {
    const feed = String(item.feed ?? '').toLowerCase()
    if (feed.includes('thermal')) thermal += 1
    else if (feed.includes('rgb')) {
      rgb += 1
      if (feed.includes('left')) left += 1
      if (feed.includes('right')) right += 1
    }
  }
  return { rgb, thermal, left, right }
}

export function SnapshotsPage() {
  // La galleria si aggiorna da sola ogni 5s: non serve rimontarla dopo una
  // cattura manuale.
  const { data, loading, error } = useSnapshotsRecent(24, 5000)
  const dashboard = useSharedDashboardState()

  const [capturing, setCapturing] = useState<'rgb' | 'set' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)

  const items = data?.items ?? []
  const kinds = countByKind(items)
  // manifest_counts resta popolato dalla sessione PRECEDENTE quando nessuna
  // missione è attiva: mostrarlo come "della missione" sarebbe falso.
  const rawCounts = dashboard.data?.acquisition?.manifest_counts as SessionManifestCounts | undefined
  const missionRunning = dashboard.data?.session?.running ?? false
  const counts = missionRunning ? rawCounts : undefined

  const activity = mostRecentFirst((dashboard.data?.events?.events ?? []) as RawLogEvent[]).slice(0, 4)

  const handleCaptureRgb = useCallback(async () => {
    if (capturing) return
    setCapturing('rgb')
    setMessage(null)
    setCaptureError(null)
    try {
      // Due scatti separati: senza missione attiva il backend non assegna un
      // capture-set, quindi non vanno presentati come un insieme sincronizzato.
      const results = await Promise.allSettled([api.takeSnapshot('rgb_left'), api.takeSnapshot('rgb_right')])
      const ok = results.filter((r) => r.status === 'fulfilled').length
      if (ok === 0) {
        setCaptureError('RGB capture failed on both cameras')
      } else {
        setMessage(ok === 2 ? 'Both RGB cameras captured' : 'Only one RGB camera captured')
      }
    } finally {
      setCapturing(null)
    }
  }, [capturing])

  const handleCaptureSet = useCallback(async () => {
    if (capturing) return
    setCapturing('set')
    setMessage(null)
    setCaptureError(null)
    try {
      const result = await api.captureAcquisitionSet()
      setMessage(
        result.complete
          ? `Synchronized set ${result.capture_set_id} saved`
          : `Partial set: ${result.successful_feeds}/${result.total_feeds} feeds saved`,
      )
    } catch (e) {
      setCaptureError(normalizeApiError(e, 'capture-set').message)
    } finally {
      setCapturing(null)
    }
  }, [capturing])

  return (
    <>
      <section className="easy-headline">
        <div>
          <div className="easy-eyebrow">Mission evidence</div>
          <h1>Archive &amp; Snapshots</h1>
          <p>Capture, review and prepare synchronized maritime datasets.</p>
        </div>
        <div className="easy-updated">
          Auto refresh <b>5s</b>
        </div>
      </section>

      <section className="easy-readiness" aria-label="Archive summary">
        <div className="easy-readycell">
          <div className="easy-kicker">Recent captures</div>
          <div className="easy-value mono">{items.length}</div>
          <div className="easy-sub">
            {typeof counts?.synchronized_samples === 'number'
              ? `${counts.synchronized_samples} synchronized sets in mission`
              : 'No active mission'}
          </div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">RGB images</div>
          <div className="easy-value mono" style={{ color: 'var(--accent-info)' }}>
            {kinds.rgb}
          </div>
          <div className="easy-sub">
            Left {kinds.left} · Right {kinds.right}
          </div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Thermal frames</div>
          <div className="easy-value mono" style={{ color: 'var(--accent-warn)' }}>
            {kinds.thermal}
          </div>
          <div className="easy-sub">Captured on demand</div>
        </div>
        <div className="easy-readycell">
          <div className="easy-kicker">Mission samples</div>
          <div className="easy-value mono">{typeof counts?.samples === 'number' ? counts.samples : '—'}</div>
          <div className="easy-sub">
            {typeof counts?.paired_items === 'number' ? `${counts.paired_items} paired items` : 'No active mission'}
          </div>
        </div>
      </section>

      <section className="easy-surface easy-capturepanel">
        <div className="easy-captureicon" aria-hidden>
          +
        </div>
        <div>
          <h3>Capture synchronized sample</h3>
          <p>
            {captureError ??
              message ??
              'Saves RGB left, RGB right and thermal under one capture-set identifier.'}
          </p>
        </div>
        <div className="easy-actions">
          <button type="button" className="easy-btn" onClick={handleCaptureRgb} disabled={capturing !== null}>
            {capturing === 'rgb' ? 'Capturing…' : 'Capture RGB only'}
          </button>
          <button
            type="button"
            className="easy-btn primary"
            onClick={handleCaptureSet}
            disabled={capturing !== null || !missionRunning}
            title={missionRunning ? undefined : 'Start a mission before capturing a synchronized sensor set'}
          >
            {capturing === 'set' ? 'Capturing…' : 'Capture synchronized set'}
          </button>
        </div>
      </section>

      <section className="easy-archivegrid">
        <SnapshotGallery items={items} feeds={data?.feeds ?? {}} loading={loading} error={error} />

        <aside className="easy-surface">
          <div className="easy-panelhead">
            <h2>Activity &amp; dataset</h2>
            <span className="easy-panelnote">Current mission</span>
          </div>
          <div className="easy-sidebody">
            <h3>Recent activity</h3>
            {activity.length === 0 ? (
              <p className="easy-empty" style={{ marginTop: 0 }}>
                No activity recorded yet.
              </p>
            ) : (
              activity.map((event) => {
                const date = toDate(event.timestamp)
                const isThermal = `${event.source} ${event.description}`.toLowerCase().includes('thermal')
                return (
                  <div className="easy-activity" key={event.id} style={{ color: isThermal ? 'var(--accent-warn)' : 'var(--accent-info)' }}>
                    <i aria-hidden />
                    <div>
                      <b>{event.description}</b>
                      <small>
                        {event.source}
                        {date ? ` · ${date.toLocaleString()}` : ''}
                      </small>
                    </div>
                  </div>
                )
              })
            )}

            <div className="easy-exportbox">
              <b>Dataset export</b>
              <p>
                Validate the mission manifest, then build a deterministic train/validation split with its validation
                report.
              </p>
              <Collapsible title="Open export tools" defaultOpen={false}>
                <DatasetExport />
              </Collapsible>
            </div>
          </div>
        </aside>
      </section>
    </>
  )
}
