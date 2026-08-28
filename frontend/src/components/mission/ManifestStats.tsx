import { StatusCard } from '../status/StatusCard'
import type { SessionManifestCounts } from '../../api/types'

interface ManifestStatsProps {
  counts: SessionManifestCounts | null
  title?: string
}

export function ManifestStats({ counts, title = 'Manifest Statistics' }: ManifestStatsProps) {
  if (!counts) {
    return (
      <div style={{ color: 'var(--text-muted)' }}>
        No manifest data available
      </div>
    )
  }

  const stats = [
    { label: 'Items', value: counts.items },
    { label: 'Snapshots', value: counts.snapshots },
    { label: 'Samples', value: counts.samples },
    { label: 'Detections', value: counts.detections },
    { label: 'Inference Runs', value: counts.inference },
    { label: 'Paired Items', value: counts.paired_items },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
        {title}
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 'var(--space-2)',
      }}>
        {stats.map(stat => (
          <StatusCard
            key={stat.label}
            title={stat.label}
            value={stat.value}
          />
        ))}
      </div>

      {Object.keys(counts.by_feed).length > 0 && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 var(--space-2) 0' }}>
            By Feed
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 'var(--space-2)',
          }}>
            {Object.entries(counts.by_feed).map(([feed, count]) => (
              <StatusCard
                key={feed}
                title={feed}
                value={count}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
