import { useState } from 'react'

/**
 * Dettaglio tecnico: disponibile ma chiuso di default. Il messaggio
 * principale resta operativo; qui finiscono status, endpoint ed eccezioni.
 */
export function TechnicalDetails({ detail, label = 'Technical details' }: { detail: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(detail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard non disponibile (contesto non sicuro): il testo resta
      // comunque selezionabile a mano.
    }
  }

  return (
    <details className="easy-technical">
      <summary>{label}</summary>
      <div className="easy-technicalbody">
        <pre>{detail}</pre>
        <button type="button" className="easy-btn mini" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </details>
  )
}
