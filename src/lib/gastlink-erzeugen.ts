// Gastlink erzeugen (nur in der Haupt-App, mit Login)
import { kodiere, type GastDaten } from './gastlink'
import { parse } from 'yaml'
import { readText } from './graph'

export interface FormsConfig { klasse: string; formular: string; frage_sus: string; frage_bezeichnung: string }

export async function ladeFormsConfig(): Promise<FormsConfig | null> {
  try {
    const c = parse(await readText('05 Vorlagen/App/Forms.yaml')) as FormsConfig
    return c?.formular && c.frage_sus && c.frage_bezeichnung ? c : null
  } catch {
    return null
  }
}

export function erzeugeGastlink(c: FormsConfig, namen: string[], knoepfe: { label: string; bez: string }[]): string {
  const d: GastDaten = { v: 1, k: c.klasse, f: c.formular, s: c.frage_sus, b: c.frage_bezeichnung, n: namen, t: knoepfe.map((k) => [k.label, k.bez]) }
  return new URL(`${import.meta.env.BASE_URL}erfassen.html#${kodiere(d)}`, location.origin).href
}
