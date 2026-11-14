import { parse } from 'yaml'
import { readText } from './graph'

export type Bewertung = 'ungenügend' | 'sehr gut'

export interface Schnellbutton {
  label: string
  bez: string
  kat: string
  bew: Bewertung
  eingabe?: 'minuten' | 'text'   // Nachfrage vor dem Speichern
}

export interface ButtonConfig {
  kategorien: Record<string, string>
  buttons: Schnellbutton[]
}

const PFAD = '05 Vorlagen/App/Schnellbuttons.yaml'

// Fallback, falls die Datei im Vault fehlt oder fehlerhaft ist
const STANDARD: ButtonConfig = {
  kategorien: {
    a: 'Erscheint pünktlich und ordnungsgemäss zum Unterricht',
    b: 'Beteiligt sich aktiv am Unterricht',
    c: 'Arbeitet konzentriert und ausdauernd',
    d: 'Gestaltet Arbeiten sorgfältig und zuverlässig',
    e: 'Kann mit anderen zusammenarbeiten',
    f: 'Schätzt die eigene Leistungsfähigkeit realistisch ein',
    g: 'Akzeptiert die Regeln des schulischen Zusammenlebens',
    h: 'Begegnet den Lehrpersonen und den Mitschülern respektvoll',
  },
  buttons: [
    { label: 'Zu spät', bez: 'Zu spät im Unterricht', kat: 'a', bew: 'ungenügend', eingabe: 'minuten' },
    { label: 'Material', bez: 'Material nicht dabei', kat: 'a', bew: 'ungenügend' },
    { label: 'Mitarbeit', bez: 'Gute Mitarbeit', kat: 'b', bew: 'sehr gut' },
  ],
}

export async function ladeButtons(): Promise<{ config: ButtonConfig; warnung?: string }> {
  try {
    const roh = parse(await readText(PFAD)) as Partial<ButtonConfig>
    const kategorien = roh.kategorien && Object.keys(roh.kategorien).length ? roh.kategorien : STANDARD.kategorien
    const buttons = (roh.buttons ?? [])
      .filter((b) => b && b.label && b.bez && b.kat)
      .map((b) => ({ ...b, kat: String(b.kat), bew: (b.bew === 'sehr gut' ? 'sehr gut' : 'ungenügend') as Bewertung,
        eingabe: b.eingabe === 'minuten' || b.eingabe === 'text' ? b.eingabe : undefined }))
    if (!buttons.length) throw new Error('keine Buttons definiert')
    return { config: { kategorien, buttons } }
  } catch (e) {
    return { config: STANDARD, warnung: `Schnellbuttons.yaml nicht lesbar (${e}) – Standardwerte aktiv` }
  }
}
