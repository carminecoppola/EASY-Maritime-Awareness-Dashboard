import '@testing-library/jest-dom/vitest'

// jsdom in questo ambiente non espone un localStorage completo: senza questo
// stub qualunque test che tocchi token o preferenze fallisce con
// "localStorage.removeItem is not a function" invece di provare il comportamento.
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
