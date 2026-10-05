/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Browser-local preferences (stored in `localStorage`).
 */

import { useCallback, useEffect, useState } from 'react'

/**
 * Local browser preferences. Only options that really change the behaviour of
 * the UI: no decorative switches.
 */
export const PREFERENCES = {
  confirmEndMission: {
    key: 'easy.confirmEndMission',
    label: 'Confirm before ending a mission',
    description: 'Ask for confirmation before stopping an active mission.',
    default: true,
  },
} as const

/** Name of a defined preference. */
export type PreferenceName = keyof typeof PREFERENCES

function read(name: PreferenceName): boolean {
  const spec = PREFERENCES[name]
  try {
    const raw = localStorage.getItem(spec.key)
    return raw === null ? spec.default : raw === 'true'
  } catch {
    // Private mode or blocked storage: fall back to the default instead of failing.
    return spec.default
  }
}

/** Current value of a preference (its default when unset or storage is unavailable). */
export function getPreference(name: PreferenceName): boolean {
  return read(name)
}

const EVENT = 'easy:preference-change'

/** Store a preference and notify every component that reads it. */
export function setPreference(name: PreferenceName, value: boolean): void {
  try {
    localStorage.setItem(PREFERENCES[name].key, String(value))
  } catch {
    // Ignored: the preference stays valid for the current session.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))
}

/** Keeps several components that read the same preference in sync. */
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
