import '@testing-library/jest-dom/vitest'

/**
 * Node 22 exposes its own `localStorage` global, which throws unless the process was started with
 * `--localstorage-file`. It shadows jsdom's implementation, so the two persisted stores (auth and
 * outbox) cannot hydrate under test. Install a plain in-memory Storage instead.
 */
class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length(): number {
    return this.data.size
  }
  clear(): void {
    this.data.clear()
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true })
}
