/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Collapsible technical detail with a copy button.
 */

import { useState } from 'react'

/**
 * Technical detail: available but closed by default. The main message stays
 * operational; status codes, endpoints and exceptions go here.
 */
export function TechnicalDetails({ detail, label = 'Technical details' }: { detail: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(detail)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard unavailable (insecure context): the text can still be selected by hand.
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
