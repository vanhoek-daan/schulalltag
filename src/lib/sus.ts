import { listFolder, readText } from './graph'
import type { Klasse } from '../config'

export interface Sus {
  stem: string      // Dateiname ohne .md, z.B. "Ana_Lopes" (für [[Wikilinks]])
  vorname: string
  nachname: string
  anzeige: string   // Name auf der Kachel
}

/** Einfacher Frontmatter-Leser: nur "schluessel: wert"-Zeilen */
export function frontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const out: Record<string, string> = {}
  if (!m) return out
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w-]+):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

/** Begrenzt parallele Anfragen (schont Graph-Limits) */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  const worker = async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export async function ladeKlasse(k: Klasse): Promise<Sus[]> {
  const ordner = `02 Schule/Klassen/${k.ordner}/SuS`
  const dateien = (await listFolder(ordner)).filter(
    (d) => d.file && d.name.endsWith('.md') && !d.name.startsWith('00 '),
  )
  const liste = await mapLimit(dateien, 6, async (d) => {
    const stem = d.name.slice(0, -3)
    const fm = frontmatter(await readText(`${ordner}/${d.name}`))
    // Fallback: Dateiname Vorname_Nachname
    const [v, ...n] = stem.split('_')
    const vorname = fm.vorname || v
    const nachname = fm.nachname || n.join(' ')
    return { stem, vorname, nachname, anzeige: vorname }
  })
  // Doppelte Vornamen: Initiale des Nachnamens anhängen
  const zaehl = new Map<string, number>()
  for (const s of liste) zaehl.set(s.vorname, (zaehl.get(s.vorname) ?? 0) + 1)
  for (const s of liste) if (zaehl.get(s.vorname)! > 1) s.anzeige = `${s.vorname} ${s.nachname.charAt(0)}.`
  return liste.sort((a, b) => a.anzeige.localeCompare(b.anzeige, 'de'))
}
