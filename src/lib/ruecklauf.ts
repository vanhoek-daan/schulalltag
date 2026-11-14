import { listFolder, readText, updateText } from './graph'
import { frontmatter } from './sus'
import { heute } from './beobachtungen'
import type { Klasse } from '../config'

export interface Ruecklauf {
  datei: string                 // Dateiname im Ordner Ruecklauf/
  titel: string
  erstellt: string
  faellig: string
  status: 'offen' | 'abgeschlossen'
  beobachtung: string           // Datum, an dem Einträge für Fehlende erstellt wurden
  abgegeben: Map<string, string> // stem → Datum
  alle: string[]                // alle SuS in der Liste
}

const ordner = (k: Klasse) => `02 Schule/Klassen/${k.ordner}/App/Ruecklauf`
const ZEILE = /^- \[( |x)\] \[\[([^\]]+)\]\](?: \((\d{4}-\d{2}-\d{2})\))?/

function parse(datei: string, text: string): Ruecklauf {
  const fm = frontmatter(text)
  const abgegeben = new Map<string, string>()
  const alle: string[] = []
  for (const z of text.split(/\r?\n/)) {
    const m = z.match(ZEILE)
    if (!m) continue
    alle.push(m[2])
    if (m[1] === 'x') abgegeben.set(m[2], m[3] ?? '')
  }
  return {
    datei,
    titel: fm.titel || datei.replace(/\.md$/, ''),
    erstellt: fm.erstellt || '',
    faellig: fm.faellig || '',
    status: fm.status === 'abgeschlossen' ? 'abgeschlossen' : 'offen',
    beobachtung: fm.beobachtung || '',
    abgegeben,
    alle,
  }
}

/** Feld im Frontmatter setzen oder ergänzen */
function setzeFm(text: string, key: string, wert: string): string {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return text
  const zeilen = m[1].split(/\r?\n/)
  const i = zeilen.findIndex((z) => z.startsWith(`${key}:`))
  if (i >= 0) zeilen[i] = `${key}: ${wert}`
  else zeilen.push(`${key}: ${wert}`)
  return text.replace(m[0], `---\n${zeilen.join('\n')}\n---`)
}

export async function ladeRuecklaeufe(k: Klasse): Promise<Ruecklauf[]> {
  let dateien
  try {
    dateien = (await listFolder(ordner(k))).filter((d) => d.file && d.name.endsWith('.md') && !d.name.startsWith('00 '))
  } catch {
    return []   // Ordner existiert noch nicht
  }
  const liste = await Promise.all(dateien.map(async (d) => parse(d.name, await readText(`${ordner(k)}/${d.name}`))))
  return liste.sort((a, b) => b.erstellt.localeCompare(a.erstellt) || a.titel.localeCompare(b.titel))
}

const sicher = (t: string) => t.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim()

export async function neuerRuecklauf(k: Klasse, titel: string, faellig: string, stems: string[]): Promise<Ruecklauf> {
  const t = sicher(titel) || 'Rücklauf'
  const datum = heute()
  const datei = `${datum} ${t}.md`
  let text = ''
  await updateText(`${ordner(k)}/${datei}`, (alt) => {
    if (alt !== null) throw new Error(`Einen Rücklauf «${t}» von heute gibt es schon`)
    text = [
      '---', `titel: ${t}`, `klasse: ${k.id}`, `erstellt: ${datum}`, `faellig: ${faellig}`, 'status: offen', '---',
      `# Rücklauf: ${t}`, '', ...[...stems].sort().map((s) => `- [ ] [[${s}]]`), '',
    ].join('\n')
    return text
  })
  return parse(datei, text)
}

async function aendere(k: Klasse, datei: string, fn: (text: string) => string): Promise<Ruecklauf> {
  const neu = await updateText(`${ordner(k)}/${datei}`, (alt) => {
    if (alt === null) throw new Error('Rücklauf-Datei nicht gefunden')
    return fn(alt)
  })
  return parse(datei, neu)
}

export function setzeAbgegeben(k: Klasse, datei: string, stem: string, ja: boolean): Promise<Ruecklauf> {
  return aendere(k, datei, (text) =>
    text.split('\n').map((z) => {
      const m = z.replace(/\r$/, '').match(ZEILE)
      if (!m || m[2] !== stem) return z
      return ja ? `- [x] [[${stem}]] (${heute()})` : `- [ ] [[${stem}]]`
    }).join('\n'))
}

export function setzeFeld(k: Klasse, datei: string, key: 'status' | 'beobachtung', wert: string): Promise<Ruecklauf> {
  return aendere(k, datei, (text) => setzeFm(text, key, wert))
}
