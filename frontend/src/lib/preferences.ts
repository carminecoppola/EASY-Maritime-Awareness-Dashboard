import { useCallback, useEffect, useState } from 'react'

/**
 * Preferenze locali del browser. Solo opzioni che cambiano davvero il
 * comportamento della UI: niente interruttori decorativi.
 */
export const PREFERENCES = {
  confirmEndMission: {
    key: 'easy.confirmEndMission',
    label: 'Confirm before ending a mission',
    description: 'Ask for confirmation before stopping an active mission.',
    default: true,
  },
} as const

export type PreferenceName = keyof typeof PREFERENCES

function read(name: PreferenceName): boolean {
  const spec = PREFERENCES[name]
  try {
    const raw = localStorage.getItem(spec.key)
    return raw === null ? spec.default : raw === 'true'
  } catch {
    // Private mode o storage bloccato: si torna al default invece di rompere.
    return spec.default
  }
}

export function getPreference(name: PreferenceName): boolean {
  return read(name)
}

const EVENT = 'easy:preference-change'

export function setPreference(name: PreferenceName, value: boolean): void {
  try {
    localStorage.setItem(PREFERENCES[name].key, String(value))
  } catch {
    // Ignorato: la preferenza resta valida per la sessione corrente.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))
}

/** Tiene allineati più componenti che leggono la stessa preferenza. */
export function usePreference(name: PreferenceName): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => read(name))

  useEffect(() => {
    const sync = () => setValue(read(name))
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [name])

  const update = useCallback(
    (next: boolean) => {
      setPreference(name, next)
      setValue(next)
    },
    [name],
  )

  return [value, update]
}
