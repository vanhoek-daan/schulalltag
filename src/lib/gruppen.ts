import { parse } from 'yaml'
import { readWithEtag, updateText } from './graph'
import type { Klasse } from '../config'

export type Paar = [string, string]   // zwei SuS (Dateinamen), die nie zusammen sollen

const pfad = (k: Klasse) => `02 Schule/Klassen/${k.ordner}/App/Gruppen.yaml`
const KOPF = '# Schulalltag-App: SuS-Paare, die bei der Gruppenbildung nie zusammenkommen\n'

const gleich = (a: Paar, b: Paar) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0])

export async function ladeAusschluesse(k: Klasse): Promise<Paar[]> {
  const d = await readWithEtag(pfad(k))
  if (!d) return []
  const roh = parse(d.text) as { nie_zusammen?: unknown } | null
  const liste = Array.isArray(roh?.nie_zusammen) ? roh!.nie_zusammen : []
  return liste.filter((p): p is Paar => Array.isArray(p) && p.length === 2).map((p) => [String(p[0]), String(p[1])])
}

/** Ausschlüsse ändern (hinzufügen/entfernen) und speichern; liefert neue Liste */
export async function aendereAusschluesse(k: Klasse, paar: Paar, hinzufuegen: boolean): Promise<Paar[]> {
  let ergebnis: Paar[] = []
  await updateText(pfad(k), (alt) => {
    const roh = (alt ? parse(alt) : null) as { nie_zusammen?: Paar[] } | null
    let liste: Paar[] = Array.isArray(roh?.nie_zusammen) ? roh!.nie_zusammen : []
    liste = liste.filter((p) => !gleich(p, paar))
    if (hinzufuegen) liste.push(paar)
    ergebnis = liste
    const zeilen = liste.map(([a, b]) => `  - [${JSON.stringify(a)}, ${JSON.stringify(b)}]`)
    return KOPF + (zeilen.length ? `nie_zusammen:\n${zeilen.join('\n')}\n` : 'nie_zusammen: []\n')
  })
  return ergebnis
}

function mischen<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function verstoesse(gruppen: string[][], paare: Paar[]): number {
  let n = 0
  for (const g of gruppen) for (const [a, b] of paare) if (g.includes(a) && g.includes(b)) n++
  return n
}

/**
 * Zufällige Gruppen bilden.
 * anzahl = Anzahl Gruppen; Grössen unterscheiden sich höchstens um 1.
 * Liefert die beste gefundene Einteilung und die Anzahl verletzter Ausschlüsse (0 = alles erfüllt).
 */
export function bildeGruppen(sus: string[], anzahl: number, paare: Paar[]): { gruppen: string[][]; verstoesse: number } {
  const g = Math.max(1, Math.min(anzahl, sus.length))
  let best: string[][] = []
  let bestV = Infinity
  for (let versuch = 0; versuch < 3000 && bestV > 0; versuch++) {
    const m = mischen(sus)
    const gruppen: string[][] = Array.from({ length: g }, () => [])
    m.forEach((s, i) => gruppen[i % g].push(s))
    const v = verstoesse(gruppen, paare)
    if (v < bestV) { best = gruppen; bestV = v }
  }
  return { gruppen: best, verstoesse: bestV === Infinity ? 0 : bestV }
}

/** "ca. k pro Gruppe" → Anzahl Gruppen (abgerundet: keine Gruppe kleiner als k) */
export const anzahlAusGroesse = (n: number, k: number) => Math.max(1, Math.floor(n / Math.max(1, k)))

/** Zufallsauswahl; ohneWiederholung: bereits Gezogene auslassen, bis alle dran waren */
export function ziehe(anwesend: string[], gezogen: string[], ohneWiederholung: boolean): { wer: string; gezogen: string[] } | null {
  if (!anwesend.length) return null
  let pool = ohneWiederholung ? anwesend.filter((s) => !gezogen.includes(s)) : anwesend
  let basis = gezogen
  if (!pool.length) { pool = anwesend; basis = [] }   // Runde vorbei → neu beginnen
  const wer = pool[Math.floor(Math.random() * pool.length)]
  return { wer, gezogen: [...basis, wer] }
}
