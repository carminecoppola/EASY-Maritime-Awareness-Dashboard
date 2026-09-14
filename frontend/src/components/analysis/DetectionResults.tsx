import { toDate } from '../../utils/formatTime'
import type { Detection } from '../../api/types'

interface DetectionResultsProps {
  detections: Detection[]
  meta: string
  loading: boolean
  error: string | null
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'var(--accent-ok)'
  if (confidence >= 0.4) return 'var(--accent-warn)'
  return 'var(--text-muted)'
}

export function DetectionResults({ detections, meta, loading, error }: DetectionResultsProps) {
  return (
    <article className="easy-surface">
      <div className="easy-panelhead">
        <h2>Latest detections</h2>
        <span className="easy-panelnote" style={{ marginLeft: 'auto' }}>
          {meta}
        </span>
      </div>

      {error ? (
        <p className="easy-error" style={{ margin: 14 }}>
          {error}
        </p>
      ) : loading && detections.length === 0 ? (
        <p className="easy-empty" style={{ margin: 14 }}>
          Loading detections…
        </p>
      ) : detections.length === 0 ? (
        <p className="easy-empty" style={{ margin: 14 }}>
          No detection in the latest result. Run analysis to inspect a new frame.
        </p>
      ) : (
        <div className="easy-tablewrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="easy-table">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Confidence</th>
                <th scope="col">Source</th>
                <th scope="col">Timestamp</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {detections.map((detection) => {
                const date = toDate(detection.timestamp)
                return (
                  <tr key={detection.id}>
                    <td className="easy-cell-strong">{detection.class_name}</td>
                    <td className="mono" style={{ color: confidenceColor(detection.confidence) }}>
                      {(detection.confidence * 100).toFixed(0)}%
                    </td>
                    <td>{detection.source_label || detection.source || '—'}</td>
                    <td className="mono" title={date?.toLocaleString()}>
                      {date ? date.toLocaleTimeString(undefined, { hour12: false }) : '—'}
                    </td>
                    <td>{detection.status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}
