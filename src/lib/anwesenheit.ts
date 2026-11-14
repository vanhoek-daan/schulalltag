import { readWithEtag, updateText } from './graph'
import { heute } from './beobachtungen'
import type { Klasse } from '../config'

// Abwesende pro Klasse und Tag im Vault: App/Anwesenheit/JJJJ-MM-TT.md
const pfad = (k: Klasse, datum: string) => `02 Schule/Klassen/${k.ordner}/App/Anwesenheit/${datum}.md`

function lese(text: string | null): Set<string> {
  const s = new Set<string>()
  if (!text) return s
  for (const z of text.split(/\r?\n/)) {
    const m = z.match(/^- \[\[([^\]]+)\]\]/)
    if (m) s.add(m[1])
  }
  return s
}

export async function ladeAbwesende(k: Klasse, datum = heute()): Promise<Set<string>> {
  return lese((await readWithEtag(pfad(k, datum)))?.text ?? null)
}

export async function setzeAbwesend(k: Klasse, stem: string, abwesend: boolean, datum = heute()): Promise<Set<string>> {
  let ergebnis = new Set<string>()
  await updateText(pfad(k, datum), (alt) => {
    const s = lese(alt)
    abwesend ? s.add(stem) : s.delete(stem)
    ergebnis = s
    const zeilen = [...s].sort().map((x) => `- [[${x}]]`)
    return `---\ndatum: ${datum}\nklasse: ${k.id}\n---\n# Abwesend ${k.id} ${datum}\n\n${zeilen.join('\n')}\n`
  })
  return ergebnis
}
