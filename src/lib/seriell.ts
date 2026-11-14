// Schreibvorgänge nacheinander ausführen (verhindert Wettläufe bei schnellem Antippen)
let kette: Promise<unknown> = Promise.resolve()

export function seriell<T>(fn: () => Promise<T>): Promise<T> {
  const p = kette.then(fn, fn)
  kette = p.catch(() => undefined)
  return p
}
