import { SnapshotGallery } from '../components/snapshots/SnapshotGallery'
import { SnapshotActions } from '../components/snapshots/SnapshotActions'
import { DatasetExport } from '../components/snapshots/DatasetExport'
import { useSnapshotsRecent } from '../hooks/useSnapshotsRecent'

export function SnapshotsPage() {
  // La galleria si aggiorna già da sola ogni 5s: non serve forzarne il
  // remount dopo uno snapshot manuale. Prima invece SnapshotActions veniva
  // rimontato via `key` subito dopo aver chiamato la sua stessa callback di
  // successo, distruggendo il proprio messaggio di conferma a metà del
  // proprio handler — e la galleria perdeva filtro/scroll ad ogni scatto.
  const { data, loading, error } = useSnapshotsRecent(24, 5000)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Snapshots
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0 0' }}>
          Captured snapshot gallery and dataset export management
        </p>
      </div>

      {/* Sezione Azioni Snapshot Manuale */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Manual Capture
        </div>
        <SnapshotActions />
      </div>

      {/* Sezione Galleria */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Snapshot Gallery
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
            Failed to load snapshots: {error instanceof Error ? error.message : String(error as unknown)}
          </div>
        ) : null}
        {data && (
          <SnapshotGallery items={data.items} feeds={data.feeds} loading={loading} />
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

