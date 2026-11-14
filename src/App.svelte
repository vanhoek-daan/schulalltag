<script lang="ts">
  import { onMount } from 'svelte'
  import type { AccountInfo } from '@azure/msal-browser'
  import { initAuth, login, logout } from './lib/auth'
  import { ladeKlasse, type Sus } from './lib/sus'
  import { ladeButtons, type ButtonConfig, type Bewertung, type Schnellbutton } from './lib/schnellbuttons'
  import {
    speichern, entfernen, ladeTag, heute, jetzt, warteschlangeSenden, anzahlWartend,
    type GespeicherteBeobachtung,
  } from './lib/beobachtungen'
  import { CONFIG, type Klasse } from './config'

  let konto = $state<AccountInfo | null>(null)
  let bereit = $state(false)
  let fehler = $state('')
  let warnung = $state('')
  let klasse = $state<Klasse>(CONFIG.klassen[0])
  let sus = $state<Sus[]>([])
  let laedt = $state(false)
  let auswahl = $state(new Set<string>())
  let config = $state<ButtonConfig | null>(null)
  let tagesListe = $state<GespeicherteBeobachtung[]>([])
  let speichert = $state(false)
  let wartend = $state(0)

  // Meldung unten mit optionalem "Rückgängig"
  let toast = $state<{ text: string; rueckgaengig?: () => void } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // Freie Eingabe
  let freiOffen = $state(false)
  let frei = $state({ bez: '', kat: 'a', bew: 'ungenügend' as Bewertung, beschr: '' })

  // Löschen in der Tagesliste (zweistufig)
  let loeschKandidat = $state<string | null>(null)

  const cache = new Map<string, Sus[]>()
  const nameVon = (stem: string) => sus.find((s) => s.stem === stem)?.anzeige ?? stem.replace(/_/g, ' ')

  function zeigeToast(text: string, rueckgaengig?: () => void) {
    clearTimeout(toastTimer)
    toast = { text, rueckgaengig }
    toastTimer = setTimeout(() => (toast = null), 6000)
  }

  async function ladeHeute() {
    try {
      tagesListe = (await ladeTag(klasse)).reverse()
    } catch (e) {
      fehler = String(e)
    }
  }

  async function zeigeKlasse(k: Klasse) {
    klasse = k
    auswahl = new Set()
    fehler = ''
    tagesListe = []
    if (cache.has(k.id)) {
      sus = cache.get(k.id)!
    } else {
      laedt = true
      sus = []
      try {
        const liste = await ladeKlasse(k)
        cache.set(k.id, liste)
        if (klasse.id === k.id) sus = liste
      } catch (e) {
        fehler = String(e)
      } finally {
        laedt = false
      }
    }
    await ladeHeute()
  }

  function toggle(stem: string) {
    const s = new Set(auswahl)
    s.has(stem) ? s.delete(stem) : s.add(stem)
    auswahl = s
  }

  async function erfassen(b: { bez: string; kat: string; bew: Bewertung; beschr?: string }) {
    if (!auswahl.size || speichert) return
    speichert = true
    const k = klasse
    const datum = heute()
    const stems = [...auswahl].sort()
    try {
      const r = await speichern(k, { zeit: jetzt(), sus: stems, kat: b.kat, bew: b.bew, bez: b.bez, beschr: b.beschr, klus: 'offen' }, datum)
      auswahl = new Set()
      const wer = stems.length === 1 ? nameVon(stems[0]) : `${stems.length} SuS`
      if (r.ok) {
        zeigeToast(`✓ ${b.bez} – ${wer}`, async () => {
          toast = null
          try { await entfernen(k, datum, r.zeile); await ladeHeute() } catch (e) { fehler = String(e) }
        })
        await ladeHeute()
      } else {
        wartend = anzahlWartend()
        zeigeToast(`Kein Netz – ${b.bez} (${wer}) wird später gespeichert`)
      }
    } catch (e) {
      fehler = String(e)
    } finally {
      speichert = false
    }
  }

  function schnell(btn: Schnellbutton) {
    erfassen({ bez: btn.bez, kat: btn.kat, bew: btn.bew })
  }

  function freiOeffnen() {
    frei = { bez: '', kat: 'a', bew: 'ungenügend', beschr: '' }
    freiOffen = true
  }

  async function freiSpeichern() {
    if (!frei.bez.trim()) return
    freiOffen = false
    await erfassen({ bez: frei.bez.trim(), kat: frei.kat, bew: frei.bew, beschr: frei.beschr })
  }

  async function loeschen(b: GespeicherteBeobachtung) {
    loeschKandidat = null
    try { await entfernen(klasse, heute(), b.zeile); await ladeHeute() } catch (e) { fehler = String(e) }
  }

  async function nachreichen() {
    if (!anzahlWartend()) return
    const n = await warteschlangeSenden()
    wartend = anzahlWartend()
    if (n) { zeigeToast(`${n} wartende Einträge gespeichert`); await ladeHeute() }
  }

  onMount(async () => {
    try {
      konto = await initAuth()
      if (konto) {
        const [b] = await Promise.all([ladeButtons(), zeigeKlasse(klasse)])
        config = b.config
        if (b.warnung) warnung = b.warnung
        wartend = anzahlWartend()
        await nachreichen()
      }
    } catch (e) {
      fehler = String(e)
    } finally {
      bereit = true
    }
    window.addEventListener('online', nachreichen)
  })
</script>

<main class:mit-leiste={auswahl.size > 0}>
  {#if !bereit}
    <p class="info">Lade …</p>
  {:else if !konto}
    <div class="login">
      <h1>Schulalltag</h1>
      <button class="primary" onclick={login}>Mit Microsoft anmelden</button>
    </div>
  {:else}
    <header>
      <nav>
        {#each CONFIG.klassen as k}
          <button class:aktiv={k.id === klasse.id} onclick={() => zeigeKlasse(k)}>{k.id}</button>
        {/each}
      </nav>
      <button class="klein" onclick={logout} title={konto.username}>Abmelden</button>
    </header>

    {#if wartend > 0}
      <button class="hinweis" onclick={nachreichen}>{wartend} Eintrag/Einträge warten auf Netz – jetzt senden</button>
    {/if}
    {#if warnung}<p class="warnung">{warnung}</p>{/if}
    {#if laedt}<p class="info">Lade Klasse {klasse.id} …</p>{/if}

    <div class="raster">
      {#each sus as s (s.stem)}
        <button class="kachel" class:gewaehlt={auswahl.has(s.stem)} onclick={() => toggle(s.stem)}>
          {s.anzeige}
        </button>
      {/each}
    </div>

    {#if tagesListe.length}
      <section class="heute">
        <h2>Heute erfasst ({tagesListe.length})</h2>
        <ul>
          {#each tagesListe as b (b.zeile)}
            <li class:positiv={b.bew === 'sehr gut'}>
              <span class="zeit">{b.zeit}</span>
              <span class="text"><strong>{b.bez}</strong> <span class="kat">{b.kat}</span><br />
                <span class="namen">{b.sus.map(nameVon).join(', ')}</span>
                {#if b.beschr}<br /><em>{b.beschr}</em>{/if}
              </span>
              {#if loeschKandidat === b.zeile}
                <button class="weg bestaetigen" onclick={() => loeschen(b)}>Löschen?</button>
              {:else}
                <button class="weg" onclick={() => (loeschKandidat = b.zeile)} aria-label="Löschen">×</button>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if auswahl.size > 0 && config}
      <div class="leiste">
        <div class="leiste-kopf">
          <span>{auswahl.size === 1 ? nameVon([...auswahl][0]) : `${auswahl.size} SuS`}</span>
          <button class="klein" onclick={() => (auswahl = new Set())}>Abbrechen</button>
        </div>
        <div class="schnell">
          {#each config.buttons as btn}
            <button class:positiv={btn.bew === 'sehr gut'} disabled={speichert} onclick={() => schnell(btn)}>{btn.label}</button>
          {/each}
          <button class="frei" disabled={speichert} onclick={freiOeffnen}>Frei …</button>
        </div>
      </div>
    {/if}

    {#if freiOffen && config}
      <div class="dialog-hg" role="presentation" onclick={(e) => e.target === e.currentTarget && (freiOffen = false)}>
        <form class="dialog" onsubmit={(e) => { e.preventDefault(); freiSpeichern() }}>
          <h2>Beobachtung – {auswahl.size === 1 ? nameVon([...auswahl][0]) : `${auswahl.size} SuS`}</h2>
          <label>Bezeichnung (max. 50 Zeichen)
            <input bind:value={frei.bez} maxlength="50" required list="bez-vorschlaege" />
            <datalist id="bez-vorschlaege">
              {#each config.buttons as btn}<option value={btn.bez}></option>{/each}
            </datalist>
          </label>
          <label>Verhalten
            <select bind:value={frei.kat}>
              {#each Object.entries(config.kategorien) as [k, t]}<option value={k}>{k} – {t}</option>{/each}
            </select>
          </label>
          <div class="bew">
            <button type="button" class:aktiv={frei.bew === 'ungenügend'} onclick={() => (frei.bew = 'ungenügend')}>ungenügend</button>
            <button type="button" class:aktiv={frei.bew === 'sehr gut'} onclick={() => (frei.bew = 'sehr gut')}>sehr gut</button>
          </div>
          <label>Beschreibung (optional)
            <textarea bind:value={frei.beschr} rows="3"></textarea>
          </label>
          <div class="dialog-knoepfe">
            <button type="button" onclick={() => (freiOffen = false)}>Abbrechen</button>
            <button type="submit" class="primary">Speichern</button>
          </div>
        </form>
      </div>
    {/if}

    {#if toast}
      <div class="toast">
        <span>{toast.text}</span>
        {#if toast.rueckgaengig}<button onclick={toast.rueckgaengig}>Rückgängig</button>{/if}
      </div>
    {/if}
  {/if}

  {#if fehler}
    <pre class="fehler">{fehler}</pre>
  {/if}
</main>
