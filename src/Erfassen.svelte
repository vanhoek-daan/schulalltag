<script lang="ts">
  import { onMount } from 'svelte'
  import { dekodiere, formsLink, type GastDaten } from './lib/gastlink'

  const KEY = 'schulalltag.gast'
  let daten = $state<GastDaten | null>(null)
  let fehler = $state('')
  let auswahl = $state(new Set<string>())

  // Anzeige: Vorname, bei Doppelten mit Initiale des Nachnamens
  const anzeige = $derived.by(() => {
    const m = new Map<string, string>()
    if (!daten) return m
    const vn = (n: string) => n.split(' ')[0]
    const zahl = new Map<string, number>()
    for (const n of daten.n) zahl.set(vn(n), (zahl.get(vn(n)) ?? 0) + 1)
    for (const n of daten.n) {
      const [v, ...rest] = n.split(' ')
      m.set(n, zahl.get(v)! > 1 ? `${v} ${rest.join(' ').charAt(0)}.` : v)
    }
    return m
  })
  const sortiert = $derived(daten ? [...daten.n].sort((a, b) => anzeige.get(a)!.localeCompare(anzeige.get(b)!, 'de')) : [])

  onMount(() => {
    try {
      const h = location.hash.slice(1)
      if (h) {
        daten = dekodiere(h)
        // Fragment bewusst in der Adresse lassen: «Zum Home-Bildschirm» (iOS) speichert die aktuelle Adresse,
        // und Home-Bildschirm-Apps haben unter iOS einen eigenen, leeren Speicher.
        try { localStorage.setItem(KEY, h) } catch { /* egal */ }
      } else {
        const s = localStorage.getItem(KEY)
        if (s) daten = dekodiere(s)
      }
      if (!daten) fehler = 'Bitte den Link verwenden, den du von D. van Hoek erhalten hast.'
    } catch (e) {
      fehler = `Link ungültig: ${e}`
    }
    // nach dem Zurückkommen aus Forms Auswahl leeren
    window.addEventListener('pageshow', () => (auswahl = new Set()))
  })

  function toggle(n: string) {
    const s = new Set(auswahl)
    s.has(n) ? s.delete(n) : s.add(n)
    auswahl = s
  }

  function oeffnen(bez?: string) {
    if (!daten || !auswahl.size) return
    // Reihenfolge wie im Formular
    const namen = daten.n.filter((n) => auswahl.has(n))
    location.href = formsLink(daten, namen, bez)
  }
</script>

<main class:mit-leiste={auswahl.size > 0}>
  {#if fehler}
    <p class="fehler">{fehler}</p>
  {:else if daten}
    <header><h1 class="gast-titel">Beobachtung {daten.k}</h1></header>
    <p class="info">SuS antippen, dann unten auswählen. Das Formular öffnet sich ausgefüllt – nur noch «Senden».</p>
    <div class="raster">
      {#each sortiert as n (n)}
        <button class="kachel" class:gewaehlt={auswahl.has(n)} onclick={() => toggle(n)}>{anzeige.get(n)}</button>
      {/each}
    </div>
    {#if auswahl.size > 0}
      <div class="leiste">
        <div class="leiste-kopf">
          <span>{auswahl.size === 1 ? anzeige.get([...auswahl][0]) : `${auswahl.size} SuS`}</span>
          <button class="klein" onclick={() => (auswahl = new Set())}>Abbrechen</button>
        </div>
        <div class="schnell">
          {#each daten.t as [label, bez]}
            <button onclick={() => oeffnen(bez)}>{label}</button>
          {/each}
          <button class="frei" onclick={() => oeffnen()}>Andere …</button>
        </div>
      </div>
    {/if}
  {/if}
</main>
