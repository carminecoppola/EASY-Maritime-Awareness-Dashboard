import { SnapshotGallery } from '../components/snapshots/SnapshotGallery'
import { SnapshotActions } from '../components/snapshots/SnapshotActions'
import { DatasetExport } from '../components/snapshots/DatasetExport'
import { Collapsible } from '../components/common/Collapsible'
import { useSnapshotsRecent } from '../hooks/useSnapshotsRecent'

const SECTION_TITLE_STYLE = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  margin: '0 0 var(--space-3) 0',
}

export function SnapshotsPage() {
  // La galleria si aggiorna già da sola ogni 5s: non serve forzarne il
  // remount dopo uno snapshot manuale. Prima invece SnapshotActions veniva
  // rimontato via `key` subito dopo aver chiamato la sua stessa callback di
  // successo, distruggendo il proprio messaggio di conferma a metà del
  // proprio handler — e la galleria perdeva filtro/scroll ad ogni scatto.
  const { data, loading, error } = useSnapshotsRecent(24, 5000)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* Page Header */}
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Snapshots
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 0 0' }}>
          Capture snapshots and manage dataset exports
        </p>
      </div>

      {/* PRIMARY: Manual Capture — the key action */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={SECTION_TITLE_STYLE}>
          Manual Capture
        </h2>
        <SnapshotActions />
      </div>

      {/* SECONDARY: Snapshot Gallery */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h2 style={SECTION_TITLE_STYLE}>
          Snapshot Gallery
        </h2>
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

      {/* TERTIARY: Dataset Export (collapsible) */}
      <Collapsible title="Dataset Export" defaultOpen={false}>
        <DatasetExport />
      </Collapsible>
    </div>
  )
}

