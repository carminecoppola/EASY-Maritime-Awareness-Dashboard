import { StatusCard } from '../status/StatusCard'
import { StatusBadge } from '../status/StatusBadge'
import type { AcquisitionStatus } from '../../api/types'

interface AcquisitionStatusSectionProps {
  acquisitionStatus: AcquisitionStatus | null
}

export function AcquisitionStatusSection({ acquisitionStatus }: AcquisitionStatusSectionProps) {
  if (!acquisitionStatus) {
    return (
      <div style={{ color: 'var(--text-muted)' }}>
        No acquisition data available
      </div>
    )
  }

  const runningTone = acquisitionStatus.running
    ? { color: 'var(--accent-ok)', dim: 'var(--accent-ok-dim)', label: 'RUNNING' }
    : { color: 'var(--text-muted)', dim: 'var(--bg-3)', label: 'STOPPED' }

  const counts = acquisitionStatus.manifest_counts
  const datasetSummary = acquisitionStatus.dataset_summary as any

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-2) 0' }}>
          Acquisition Status
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <StatusBadge tone={runningTone} text={acquisitionStatus.running ? 'RUNNING' : 'STOPPED'} />
        </div>
      </div>

      {counts && (
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 var(--space-2) 0' }}>
            Manifest Counts
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--space-2)',
          }}>
            <StatusCard title="Items" value={counts.items || 0} />
            <StatusCard title="Samples" value={counts.samples || 0} />
            <StatusCard title="Snapshots" value={counts.snapshots || 0} />
            <StatusCard title="Detections" value={counts.detections || 0} />
            <StatusCard title="Inference" value={counts.inference || 0} />
            <StatusCard title="Paired Items" value={counts.paired_items || 0} />
          </div>
        </div>
      )}

      {datasetSummary && typeof datasetSummary === 'object' && Object.keys(datasetSummary as Record<string, unknown>).length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 var(--space-2) 0' }}>
            Dataset Summary
          </h4>
          <div style={{
            padding: 'var(--space-2)',
            background: 'var(--bg-2)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--text-secondary)',
          }}>
            <pre style={{ margin: 0, overflow: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
              {JSON.stringify(datasetSummary as Record<string, unknown>, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
