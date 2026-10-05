/**
 * EASY Maritime Awareness Dashboard
 * Copyright (c) 2026 Carmine Coppola and EASY contributors.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Vitest setup: jest-dom matchers and a localStorage fallback.
 */

import '@testing-library/jest-dom/vitest'

// jsdom in this environment does not expose a complete localStorage: without this
// stub any test that touches the token or the preferences fails with
// "localStorage.removeItem is not a function" instead of testing the behaviour.
if (typeof window !== 'undefined' && typeof window.localStorage?.removeItem !== 'function') {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(window, 'localStorage', { value: memoryStorage, configurable: true })
}
