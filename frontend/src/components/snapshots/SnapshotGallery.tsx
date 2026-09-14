import { useMemo, useState } from 'react'
import type { Snapshot, SnapshotFeedInfo } from '../../api/types'
import { toDate } from '../../utils/formatTime'
import { SnapshotLightbox } from './SnapshotLightbox'
import { TabFilter } from '../common/TabFilter'

interface SnapshotGalleryProps {
  items: Snapshot[]
  feeds: Record<string, SnapshotFeedInfo>
  loading: boolean
  error?: unknown
}

type Filter = 'all' | 'rgb' | 'thermal'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All media' },
  { id: 'rgb', label: 'RGB' },
  { id: 'thermal', label: 'Thermal' },
]

function matches(snapshot: Snapshot, filter: Filter): boolean {
  if (filter === 'all') return true
  const feed = String(snapshot.feed ?? '').toLowerCase()
  return filter === 'thermal' ? feed.includes('thermal') : feed.includes('rgb')
}

function captureSetOf(snapshot: Snapshot): string | null {
  const meta = snapshot.meta as Record<string, unknown> | undefined
  const id = meta?.capture_set_id
  return typeof id === 'string' && id ? id : null
}

export function SnapshotGallery({ items, feeds, loading, error }: SnapshotGalleryProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Snapshot | null>(null)

  const visible = useMemo(() => items.filter((item) => matches(item, filter)), [items, filter])

  return (
    <article className="easy-surface">
      <div className="easy-filters">
        <TabFilter options={FILTERS} value={filter} onChange={setFilter} label="Media type filter" panelId="snapshot-gallery-panel" />
        <span className="easy-filtercount">
          {visible.length} of {items.length} shown
        </span>
      </div>

      <div id="snapshot-gallery-panel" role="tabpanel" aria-label="Snapshot gallery">
      {error ? (
        <p className="easy-error" style={{ margin: 13 }}>
          Failed to load snapshots: {error instanceof Error ? error.message : String(error)}
        </p>
      ) : loading && items.length === 0 ? (
        <p className="easy-empty" style={{ margin: 13 }}>
          Loading saved snapshots…
        </p>
      ) : visible.length === 0 ? (
        <p className="easy-empty" style={{ margin: 13 }}>
          {items.length === 0 ? 'No snapshot saved yet.' : 'No snapshot matches this filter.'}
        </p>
      ) : (
        <div className="easy-photos">
          {visible.map((snapshot) => {
            const captured = toDate(snapshot.created ?? snapshot.created_ts)
            const setId = captureSetOf(snapshot)
            const label = String(snapshot.feed_label ?? feeds[String(snapshot.feed)]?.label ?? snapshot.feed ?? 'Snapshot')
            return (
              <button
                type="button"
                className="easy-photo"
                key={snapshot.filename || `${snapshot.feed}-${snapshot.created_ts}`}
                onClick={() => setSelected(snapshot)}
              >
                <img src={snapshot.url} alt="" loading="lazy" />
                <span className="easy-photo-scrim" aria-hidden />
                <span className="easy-photometa">
                  <b>
                    {label.toUpperCase()}
                    {captured ? ` · ${captured.toLocaleTimeString(undefined, { hour12: false })}` : ''}
                  </b>
                  <small>
                    {captured ? captured.toLocaleDateString() : 'date unknown'}
                    {setId ? ` · capture set ${setId}` : ''}
                  </small>
                </span>
              </button>
            )
          })}
        </div>
      )}

      </div>
      {selected && <SnapshotLightbox snapshot={selected} onClose={() => setSelected(null)} />}
    </article>
  )
}
