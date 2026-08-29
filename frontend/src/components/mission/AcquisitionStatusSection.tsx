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

  const datasetSummary = acquisitionStatus.dataset_summary as Record<string, unknown> | undefined

  // Readable labels for the dataset_summary fields, instead of dumping the
  // raw JSON.stringify() output in a <pre> block — literal developer debug
  // output shown directly to the operator.
  const DATASET_SUMMARY_LABELS: Record<string, string> = {
    paired_items: 'RGB/thermal pairs',
    samples: 'Samples',
    synchronized_samples: 'Synchronized samples',
    pair_window_seconds: 'Pairing window',
  }

  const summaryEntries = datasetSummary
    ? Object.entries(datasetSummary).filter(([key, value]) => key in DATASET_SUMMARY_LABELS && typeof value !== 'object')
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-2) 0' }}>
          Acquisition Status
        </h3>
        <p style={{ margin: '0 0 var(--space-2) 0', fontSize: 11, color: 'var(--text-muted)' }}>
          Whether the background process that saves and organizes captures is currently running
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <StatusBadge tone={runningTone} text={acquisitionStatus.running ? 'RUNNING' : 'STOPPED'} />
        </div>
      </div>

      {/* Manifest Counts removed here — it duplicated the "Current Session
          Manifest" counters already shown above on the Mission page (same
          numbers, two different-looking grids back to back). */}

      {summaryEntries.length > 0 && (
        <div>
          <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 var(--space-2) 0' }}>
            Pairing (RGB + thermal)
          </h4>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--space-2)',
          }}>
            {summaryEntries.map(([key, value]) => (
              <StatusCard
                key={key}
                title={DATASET_SUMMARY_LABELS[key]}
                value={key === 'pair_window_seconds' ? `${value}s` : String(value)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
