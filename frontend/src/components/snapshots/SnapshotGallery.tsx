import { useState } from 'react'
import type { Snapshot, SnapshotFeedInfo } from '../../api/types'
import { formatRelativeTime } from '../../utils/formatTime'
import { SnapshotLightbox } from './SnapshotLightbox'

interface SnapshotGalleryProps {
  items: Snapshot[]
  feeds: Record<string, SnapshotFeedInfo>
  loading: boolean
}

type FeedFilter = 'all' | string

export function SnapshotGallery({ items, feeds, loading }: SnapshotGalleryProps) {
  const [selectedFilter, setSelectedFilter] = useState<FeedFilter>('all')
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null)

  const filteredItems = selectedFilter === 'all' ? items : items.filter((s) => s.feed === selectedFilter)

  const feedKeys = Object.keys(feeds)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Filtri per feed */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedFilter('all')}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: selectedFilter === 'all' ? '1px solid var(--accent-interactive)' : '1px solid var(--border-subtle)',
            background: selectedFilter === 'all' ? 'var(--accent-interactive)' : 'transparent',
            color: selectedFilter === 'all' ? 'var(--bg-0)' : 'var(--text-primary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 150ms ease-out',
          }}
          onMouseEnter={(e) => {
            if (selectedFilter !== 'all') {
              e.currentTarget.style.borderColor = 'var(--accent-interactive)'
              e.currentTarget.style.color = 'var(--accent-interactive)'
            }
          }}
          onMouseLeave={(e) => {
            if (selectedFilter !== 'all') {
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }
          }}
        >
          All ({items.length})
        </button>
        {feedKeys.map((feedKey) => (
          <button
            key={feedKey}
            onClick={() => setSelectedFilter(feedKey)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: selectedFilter === feedKey ? '1px solid var(--accent-interactive)' : '1px solid var(--border-subtle)',
              background: selectedFilter === feedKey ? 'var(--accent-interactive)' : 'transparent',
              color: selectedFilter === feedKey ? 'var(--bg-0)' : 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms ease-out',
            }}
            onMouseEnter={(e) => {
              if (selectedFilter !== feedKey) {
                e.currentTarget.style.borderColor = 'var(--accent-interactive)'
                e.currentTarget.style.color = 'var(--accent-interactive)'
              }
            }}
            onMouseLeave={(e) => {
              if (selectedFilter !== feedKey) {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }
            }}
          >
            {feeds[feedKey].label} ({items.filter((s) => s.feed === feedKey).length})
          </button>
        ))}
      </div>

      {/* Griglia snapshot */}
      {loading && filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
          Loading snapshots...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-5)', color: 'var(--text-muted)' }}>
          No snapshots available
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {filteredItems.map((snapshot) => (
            <div
              key={`${snapshot.feed}-${snapshot.created_ts}`}
              onClick={() => setSelectedSnapshot(snapshot)}
              style={{
                cursor: 'pointer',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: 'var(--bg-2)',
                border: '1px solid var(--border-subtle)',
                transition: 'all 150ms ease-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-interactive)'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ aspectRatio: '1', overflow: 'hidden', background: 'var(--bg-3)' }}>
                <img
                  src={snapshot.url}
                  alt={snapshot.filename}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
              <div style={{ padding: 'var(--space-2)', fontSize: 11 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{snapshot.feed_label || snapshot.feed}</div>
                <div style={{ color: 'var(--text-muted)', marginTop: 2, fontSize: 10 }}>
                  {snapshot.created || snapshot.created_ts ? formatRelativeTime(snapshot.created || snapshot.created_ts || '') : '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedSnapshot && <SnapshotLightbox snapshot={selectedSnapshot} onClose={() => setSelectedSnapshot(null)} />}
    </div>
  )
}
