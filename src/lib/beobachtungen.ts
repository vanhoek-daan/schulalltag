import { readWithEtag, updateText } from './graph'
import type { Klasse } from '../config'
import type { Bewertung } from './schnellbuttons'

export interface Beobachtung {
  zeit: string        // HH:MM
  sus: string[]       // Dateinamen ohne .md (Wikilink-Ziele)
  kat: string         // ausgeschriebene Kategorie (Verhalten), z.B. "Beteiligt sich aktiv am Unterricht"
  bew: Bewertung
  bez: string         // Bezeichnung (max. 50 Zeichen, wie KLUS)
  beschr?: string     // detaillierte Beschreibung
  erfasser?: string   // wer erfasst hat, z.B. "D. van Hoek"
  klus: 'offen' | 'übertragen'
}

export interface GespeicherteBeobachtung extends Beobachtung {
  zeile: string       // exakte Zeile in der Datei (für Rückgängig)
}

const pad = (n: number) => String(n).padStart(2, '0')
export const heute = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const jetzt = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

const pfad = (k: Klasse, datum: string) => `02 Schule/Klassen/${k.ordner}/App/Beobachtungen/${datum}.md`

/** Freitext für Inline-Felder entschärfen: keine eckigen Klammern, keine Zeilenumbrüche */
const sauber = (s: string) => s.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim()

export function zuZeile(b: Beobachtung): string {
  const teile = [
    `[zeit:: ${b.zeit}]`,
    `[sus:: ${b.sus.map((s) => `[[${s}]]`).join(', ')}]`,
    `[kat:: ${sauber(b.kat)}]`,
    `[bew:: ${b.bew}]`,
    `[bez:: ${sauber(b.bez).slice(0, 50)}]`,
  ]
  if (b.beschr && sauber(b.beschr)) teile.push(`[beschr:: ${sauber(b.beschr)}]`)
  if (b.erfasser && sauber(b.erfasser)) teile.push(`[erfasser:: ${sauber(b.erfasser)}]`)
  teile.push(`[klus:: ${b.klus}]`)
  return `- ${teile.join(' ')}`
}

/** Zeile → Beobachtung (null, wenn die Zeile kein Eintrag ist) */
export function ausZeile(zeile: string): GespeicherteBeobachtung | null {
  if (!zeile.startsWith('- [zeit::')) return null
  const feld = (name: string) => {
    // Feldwert darf [[Wikilinks]] enthalten
    const m = zeile.match(new RegExp(`\\[${name}:: ((?:\\[\\[[^\\]]*\\]\\]|[^\\]])*)\\]`))
    return m ? m[1].trim() : ''
  }
  const sus = [...feld('sus').matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1])
  return {
    zeile,
    zeit: feld('zeit'),
    sus,
    kat: feld('kat'),
    bew: feld('bew') === 'sehr gut' ? 'sehr gut' : 'ungenügend',
    bez: feld('bez'),
    beschr: feld('beschr') || undefined,
    erfasser: feld('erfasser') || undefined,
    klus: feld('klus') === 'übertragen' ? 'übertragen' : 'offen',
  }
}

function neueDatei(k: Klasse, datum: string): string {
  return `---\ndatum: ${datum}\nklasse: ${k.id}\n---\n# Beobachtungen ${k.id} ${datum}\n\n`
}

/** Zeile an die Tagesdatei anhängen (legt sie bei Bedarf an) */
async function anhaengen(k: Klasse, datum: string, zeile: string): Promise<void> {
  await updateText(pfad(k, datum), (alt) => {
    const basis = alt ?? neueDatei(k, datum)
    return (basis.endsWith('\n') ? basis : basis + '\n') + zeile + '\n'
  })
}

/** Einträge eines Tages lesen */
export async function ladeTag(k: Klasse, datum = heute()): Promise<GespeicherteBeobachtung[]> {
  const datei = await readWithEtag(pfad(k, datum))
  if (!datei) return []
  return datei.text.split(/\r?\n/).map(ausZeile).filter((b): b is GespeicherteBeobachtung => b !== null)
}

/** Eine bestimmte Zeile wieder entfernen (Rückgängig) */
export async function entfernen(k: Klasse, datum: string, zeile: string): Promise<void> {
  await updateText(pfad(k, datum), (alt) => {
    if (alt === null) return neueDatei(k, datum)
    const zeilen = alt.split(/\r?\n/)
    const i = zeilen.indexOf(zeile)
    if (i >= 0) zeilen.splice(i, 1)
    return zeilen.join('\n')
  })
}

// --- Warteschlange für Einträge, die ohne Netz nicht gespeichert werden konnten ---

interface Wartend { klasseId: string; ordner: string; datum: string; zeile: string }
const QKEY = 'schulalltag.warteschlange'

function leseQueue(): Wartend[] {
  try { return JSON.parse(localStorage.getItem(QKEY) ?? '[]') } catch { return [] }
}
function schreibeQueue(q: Wartend[]) {
  try { localStorage.setItem(QKEY, JSON.stringify(q)) } catch { /* ignorieren */ }
}
export const anzahlWartend = () => leseQueue().length

/** Speichern; ohne Netz landet der Eintrag in der Warteschlange. Rückgabe: true = sofort gespeichert */
export async function speichern(k: Klasse, b: Beobachtung, datum = heute()): Promise<{ ok: boolean; zeile: string }> {
  const zeile = zuZeile(b)
  try {
    await anhaengen(k, datum, zeile)
    return { ok: true, zeile }
  } catch (e) {
    if (e instanceof TypeError || !navigator.onLine) {
      // Netzwerkfehler → später nachreichen
      schreibeQueue([...leseQueue(), { klasseId: k.id, ordner: k.ordner, datum, zeile }])
      return { ok: false, zeile }
    }
    throw e
  }
}

/** Wartende Einträge nachreichen; liefert Anzahl erfolgreich übertragener */
export async function warteschlangeSenden(): Promise<number> {
  const q = leseQueue()
  let ok = 0
  const rest: Wartend[] = []
  for (const w of q) {
    try {
      await anhaengen({ id: w.klasseId, ordner: w.ordner } as Klasse, w.datum, w.zeile)
      ok++
    } catch {
      rest.push(w)
    }
  }
  schreibeQueue(rest)
  return ok
}
