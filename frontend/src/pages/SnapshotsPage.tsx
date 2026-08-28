import { useCallback, useState } from 'react'
import { SnapshotGallery } from '../components/snapshots/SnapshotGallery'
import { SnapshotActions } from '../components/snapshots/SnapshotActions'
import { DatasetExport } from '../components/snapshots/DatasetExport'
import { useSnapshotsRecent } from '../hooks/useSnapshotsRecent'

export function SnapshotsPage() {
  const { data, loading, error } = useSnapshotsRecent(24, 5000)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleSnapshotTaken = useCallback(() => {
    // Trigger refresh della galleria
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Snapshots
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0 0' }}>
          Galleria snapshot acquisiti e gestione dataset di esportazione
        </p>
      </div>

      {/* Sezione Azioni Snapshot Manuale */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Acquisizione Manuale
        </div>
        <SnapshotActions onSnapshotTaken={handleSnapshotTaken} key={refreshKey} />
      </div>

      {/* Sezione Galleria */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Galleria Snapshot
        </div>
        {error ? (
          <div
            style={{
              padding: 'var(--space-3)',
              background: 'var(--accent-critical-dim)',
              border: '1px solid var(--accent-critical)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              color: 'var(--accent-critical)',
            }}
          >
            Errore caricamento snapshot: {error instanceof Error ? error.message : String(error as unknown)}
          </div>
        ) : null}
        {data && (
          <SnapshotGallery
            items={data.items}
            feeds={data.feeds}
            loading={loading}
            key={refreshKey}
          />
        )}
      </div>

      {/* Sezione Dataset Export */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dataset Export
        </div>
        <DatasetExport />
      </div>
    </div>
  )
}

