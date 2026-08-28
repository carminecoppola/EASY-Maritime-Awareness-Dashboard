import { useState, useEffect, useCallback, useRef } from 'react'
import { api, ApiError } from '../api/client'

/**
 * Forma reale di una sessione dal /api/session/list endpoint.
 * Non modificare per rimanere sincronizzato con i dati reali.
 */
export interface SessionListItem {
  ok: boolean
  session_id: string
  start_time: string
  end_time: string
  duration: number
  status: 'RUNNING' | 'STOPPED'
  mode: string
  operator: string
  hostname: string
  model_name: string
  model_type: string
  project_version: string
  notes: string
  editable?: {
    campaign?: string | null
    location?: string | null
    notes?: string
    operator?: string
    weather?: string | null
  }
  manifest?: {
    counts?: {
      by_feed: Record<string, number>
      detections: number
      inference: number
      items: number
      paired_items: number
      samples: number
      snapshots: number
      synchronized_samples: number
    }
    path: string
    schema: string
  }
  metrics?: Record<string, unknown>
  paths?: Record<string, string>
  updated_at: string
}

interface UseSessionListResult {
  sessions: SessionListItem[]
  error: unknown
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * Hook per la lista sessioni — non serve polling aggressivo perché cambia raramente.
 * Fetch on-mount + refresh manuale via bottone nella UI.
 */
export function useSessionList(): UseSessionListResult {
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  // Incrementato ad ogni refresh: se due richieste sono in volo (es. click
  // rapido su "Refresh" più il refresh automatico dopo uno start/stop),
  // solo la risposta della richiesta più recente viene applicata — senza
  // questo, una risposta più vecchia arrivata più tardi poteva sovrascrivere
  // dati più freschi già mostrati.
  const requestIdRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const response = await api.getSessionList()
      if (requestId !== requestIdRef.current) return
      // Cast sicuro perché il tipo di ritorno è { sessions: unknown[] }
      const sessionsList = (response as { sessions: unknown[] }).sessions as SessionListItem[]
      setSessions(sessionsList)
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e)
      if (e instanceof ApiError) {
        console.error('Failed to load session list:', e.message, e.body)
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { sessions, error, loading, refresh }
}
