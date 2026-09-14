import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AnalysisPage } from './AnalysisPage'
import * as DashboardStateContext from '../hooks/DashboardStateContext'
import * as ApiClient from '../api/client'

vi.mock('../hooks/DashboardStateContext', () => ({
  useSharedDashboardState: vi.fn(),
}))

vi.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 0
    body: unknown = null
  },
  api: {
    runInferenceOnNextFrame: vi.fn(),
    selectSource: vi.fn(),
  },
  withCacheBuster: (url: string) => url,
}))

const INFERENCE = {
  ok: true,
  running: false,
  mode: 'replay',
  backend: 'onnx',
  backend_status: { loaded: true, cpu_threads: 4, execution_mode: 'sequential' },
  model_path: '/runtime/models/best.onnx',
  source_label: 'Replay Folder',
  source_status: 'STREAMING',
  last_inference_ms: 891.5,
  last_run_ts: '2026-09-10T16:06:57Z',
  fps: 1.12,
}

function renderPage(data: unknown, error: unknown = null) {
  vi.mocked(DashboardStateContext.useSharedDashboardState).mockReturnValue({
    data,
    loading: false,
    error,
  } as any)
  return render(
    <MemoryRouter>
      <AnalysisPage />
    </MemoryRouter>,
  )
}

describe('AnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the page title', () => {
    renderPage({ inference: INFERENCE })
    expect(screen.getByRole('heading', { name: 'AI Analysis' })).toBeInTheDocument()
  })

  it('shows the real model and backend instead of mockup values', () => {
    renderPage({ inference: INFERENCE })
    expect(screen.getAllByText('best.onnx').length).toBeGreaterThan(0)
    expect(screen.getAllByText('892 ms').length).toBeGreaterThan(0)
    expect(screen.getByText('LOADED')).toBeInTheDocument()
  })

  it('does not claim the model is unloaded when the status is missing', () => {
    renderPage({})
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.queryByText('NOT LOADED')).not.toBeInTheDocument()
  })

  it('reports unavailable values when the backend cannot be reached', () => {
    renderPage(null, new Error('down'))
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText(/unreachable/)).toBeInTheDocument()
  })

  it('lists the real sources using their backend name', () => {
    renderPage({
      inference: INFERENCE,
      sources: { sources: [{ id: 'rgb_left', name: 'RGB LEFT' }], selected_source_id: 'rgb_left' },
    })
    expect(screen.getByRole('radio', { name: /RGB LEFT/ })).toBeChecked()
  })

  it('refuses thermal as an AI source because the model is RGB-only', () => {
    renderPage({
      inference: INFERENCE,
      sources: { sources: [{ id: 'thermal', name: 'THERMAL' }], selected_source_id: null },
    })
    expect(screen.getByRole('radio', { name: /THERMAL/ })).toBeDisabled()
  })

  it('runs inference and reports the result', async () => {
    renderPage({ inference: INFERENCE })
    vi.mocked(ApiClient.api.runInferenceOnNextFrame).mockResolvedValue({ ok: true, count: 2 } as any)

    fireEvent.click(screen.getByRole('button', { name: 'Run analysis' }))
    await waitFor(() => expect(screen.getByText(/2 detections/)).toBeInTheDocument())
  })

  it('surfaces a failed run instead of pretending it succeeded', async () => {
    renderPage({ inference: INFERENCE })
    vi.mocked(ApiClient.api.runInferenceOnNextFrame).mockResolvedValue({ ok: false, error: 'No frame available' } as any)

    fireEvent.click(screen.getByRole('button', { name: 'Run analysis' }))
    await waitFor(() => expect(screen.getByText('No frame available')).toBeInTheDocument())
    expect(screen.getByText('Inference did not complete')).toBeInTheDocument()
  })

  it('shows an empty state when there is no detection', () => {
    renderPage({ inference: INFERENCE, detections: { detections: [] } })
    expect(screen.getByText(/No detection in the latest result/)).toBeInTheDocument()
  })
})
