// Gastlink für Kolleg:innen: alle Daten stecken im URL-Fragment (#…), das nie an einen Server geht.

export interface GastDaten {
  v: 1
  k: string                 // Klasse, z.B. "1Ab"
  f: string                 // Forms-Adresse (ResponsePage.aspx?id=…)
  s: string                 // Parameter der Frage «SuS»
  b: string                 // Parameter der Frage «Was ist passiert?»
  n: string[]               // Namen genau wie im Formular («Vorname Nachname»)
  t: [string, string][]     // Schnellbuttons: [Label, Bezeichnung wie im Formular]
}

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export const kodiere = (d: GastDaten) => b64url(JSON.stringify(d))
export const dekodiere = (s: string): GastDaten => JSON.parse(unb64url(s))

/** Vorausgefüllten Forms-Link bauen (Format von «Vorausgefüllten Link abrufen») */
export function formsLink(d: GastDaten, namen: string[], bez?: string): string {
  // encodeURIComponent statt URLSearchParams: Forms erwartet %20, nicht «+»
  let url = d.f
  const add = (k: string, v: string) => { url += `&${k}=${encodeURIComponent(v)}` }
  if (namen.length) add(d.s, JSON.stringify(JSON.stringify(namen)))
  if (bez) add(d.b, JSON.stringify(bez))
  return url
}

