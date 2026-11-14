import { parse } from 'yaml'
import { listFolder, readText, readWithEtag, updateText } from './graph'
import { ausZeile, heute, type GespeicherteBeobachtung } from './beobachtungen'
import type { Klasse } from '../config'

export interface HinweisConfig {
  semesterbeginn: string[]
  schwellen: Record<string, number[]>   // Kategorie-Buchstabe → Schwellen
}

export interface Hinweis {
  stem: string
  kat: string        // Buchstabe
  katText: string
  anzahl: number
  stufe: number      // höchste erreichte Schwelle
  stufeNr: number    // 1-basiert
  stufen: number
}

const ordner = (k: Klasse) => `02 Schule/Klassen/${k.ordner}/App/Beobachtungen`
const quittPfad = (k: Klasse) => `02 Schule/Klassen/${k.ordner}/App/Hinweise.md`

export async function ladeHinweisConfig(): Promise<HinweisConfig | null> {
  try {
    const c = parse(await readText('05 Vorlagen/App/Hinweise.yaml')) as { semesterbeginn?: unknown[]; schwellen?: Record<string, number[]> }
    const schwellen: Record<string, number[]> = {}
    for (const [k, v] of Object.entries(c?.schwellen ?? {})) {
      if (Array.isArray(v)) schwellen[k] = v.map(Number).filter((n) => n > 0).sort((a, b) => a - b)
    }
    return { semesterbeginn: (c?.semesterbeginn ?? []).map(String).sort(), schwellen }
  } catch {
    return null
  }
}

/** Beginn des aktuellen Semesters (letzter Semesterbeginn ≤ heute) */
export function semesterStart(c: HinweisConfig, datum = heute()): string {
  return [...c.semesterbeginn].reverse().find((s) => s <= datum) ?? c.semesterbeginn[0] ?? '0000-00-00'
}

/** Alle Beobachtungen seit Semesterbeginn: Datum → Einträge */
export async function ladeSemester(k: Klasse, start: string): Promise<Map<string, GespeicherteBeobachtung[]>> {
  const m = new Map<string, GespeicherteBeobachtung[]>()
  let dateien
  try { dateien = await listFolder(ordner(k)) } catch { return m }
  const tage = dateien.map((d) => d.name).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n) && n.slice(0, 10) >= start)
  let i = 0
  const worker = async () => {
    while (i < tage.length) {
      const n = tage[i++]
      const text = await readText(`${ordner(k)}/${n}`)
      m.set(n.slice(0, 10), text.split(/\r?\n/).map(ausZeile).filter((b): b is GespeicherteBeobachtung => b !== null))
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  return m
}

// Quittungen: App/Hinweise.md, eine Zeile pro Quittung
//   - [[stem]] [kat:: a] [stufe:: 6] [semester:: 2026-08-18] [quittiert:: 2026-11-20]
interface Quittung { stem: string; kat: string; stufe: number; semester: string }

function leseQuittungen(text: string | null): Quittung[] {
  const q: Quittung[] = []
  for (const z of (text ?? '').split(/\r?\n/)) {
    const m = z.match(/^- \[\[([^\]]+)\]\] \[kat:: (\w)\] \[stufe:: (\d+)\] \[semester:: ([\d-]+)\]/)
    if (m) q.push({ stem: m[1], kat: m[2], stufe: Number(m[3]), semester: m[4] })
  }
  return q
}

export async function ladeQuittungen(k: Klasse): Promise<Quittung[]> {
  return leseQuittungen((await readWithEtag(quittPfad(k)))?.text ?? null)
}

export async function quittieren(k: Klasse, h: Hinweis, semester: string): Promise<Quittung[]> {
  let ergebnis: Quittung[] = []
  await updateText(quittPfad(k), (alt) => {
    const basis = alt ?? `---\nklasse: ${k.id}\n---\n# Quittierte Hinweise ${k.id}\n\n`
    const neu = `${basis.endsWith('\n') ? basis : basis + '\n'}- [[${h.stem}]] [kat:: ${h.kat}] [stufe:: ${h.stufe}] [semester:: ${semester}] [quittiert:: ${heute()}] [anzahl:: ${h.anzahl}]\n`
    ergebnis = leseQuittungen(neu)
    return neu
  })
  return ergebnis
}

/** Offene Hinweise berechnen */
export function berechne(
  c: HinweisConfig,
  kategorien: Record<string, string>,
  eintraege: Iterable<GespeicherteBeobachtung[]>,
  quittungen: Quittung[],
  semester: string,
): Hinweis[] {
  const textZuBuchstabe = new Map(Object.entries(kategorien).map(([b, t]) => [t, b]))
  const zahl = new Map<string, number>()   // "stem|kat" → Anzahl
  for (const tag of eintraege) {
    for (const b of tag) {
      if (b.bew !== 'ungenügend') continue
      const kat = textZuBuchstabe.get(b.kat) ?? (b.kat.length === 1 ? b.kat : '')
      if (!c.schwellen[kat]?.length) continue
      for (const s of new Set(b.sus)) zahl.set(`${s}|${kat}`, (zahl.get(`${s}|${kat}`) ?? 0) + 1)
    }
  }
  const hinweise: Hinweis[] = []
  for (const [key, n] of zahl) {
    const [stem, kat] = key.split('|')
    const st = c.schwellen[kat]
    const erreicht = st.filter((t) => n >= t)
    if (!erreicht.length) continue
    const stufe = erreicht[erreicht.length - 1]
    const quittiert = Math.max(0, ...quittungen.filter((q) => q.stem === stem && q.kat === kat && q.semester === semester).map((q) => q.stufe))
    if (stufe <= quittiert) continue
    hinweise.push({ stem, kat, katText: kategorien[kat] ?? kat, anzahl: n, stufe, stufeNr: erreicht.length, stufen: st.length })
  }
  return hinweise.sort((a, b) => b.stufeNr - a.stufeNr || b.anzahl - a.anzahl)
}
