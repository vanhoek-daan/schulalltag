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
  import Zufall from './Zufall.svelte'
  import Gruppen from './Gruppen.svelte'
  import Ruecklauf from './Ruecklauf.svelte'
  import { ladeAbwesende, setzeAbwesend } from './lib/anwesenheit'
  import { seriell } from './lib/seriell'

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
  let modus = $state<'beobachten' | 'ruecklauf' | 'zufall' | 'gruppen' | 'anwesenheit'>('beobachten')

  // Abwesende des Tages: im Vault gespeichert (App/Anwesenheit/), gilt für alle Modi und Geräte
  let abwesend = $state(new Set<string>())
  async function ladeAbwesend() {
    const k = klasse
    try {
      const a = await ladeAbwesende(k)
      if (klasse.id === k.id) abwesend = a
    } catch (e) { fehler = String(e) }
  }
  function toggleAbwesend(stem: string) {
    const k = klasse
    const ab = !abwesend.has(stem)
    const a = new Set(abwesend)
    ab ? a.add(stem) : a.delete(stem)
    abwesend = a   // sofort anzeigen
    seriell(() => setzeAbwesend(k, stem, ab))
      .then((neu) => { if (klasse.id === k.id) abwesend = neu })
      .catch((e) => { fehler = String(e); ladeAbwesend() })
  }
  const anwesend = $derived(sus.map((s) => s.stem).filter((s) => !abwesend.has(s)))

  // Meldung unten mit optionalem "Rückgängig"
  let toast = $state<{ text: string; rueckgaengig?: () => void } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  // Freie Eingabe
  let freiOffen = $state(false)
  let frei = $state({ bez: '', kat: 'a', bew: 'ungenügend' as Bewertung, beschr: '' })

  // Nachfrage bei Buttons mit "eingabe" (Minuten bei Verspätung, Text bei Vorfällen)
  let nachfrage = $state<{ btn: Schnellbutton; minuten: string; text: string } | null>(null)

  // Löschen in der Tagesliste (zweistufig)
  let loeschKandidat = $state<string | null>(null)

  const cache = new Map<string, Sus[]>()
  /** Erfasser: aus Schnellbuttons.yaml, sonst aus dem Microsoft-Konto («Daan van Hoek» → «D. van Hoek») */
  function erfasserName(): string {
    if (config?.erfasser) return config.erfasser
    const teile = (konto?.name ?? '').trim().split(/\s+/).filter(Boolean)
    return teile.length > 1 ? `${teile[0].charAt(0)}. ${teile.slice(1).join(' ')}` : (teile[0] ?? '')
  }

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
    abwesend = new Set()
    ladeAbwesend()
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

  /** Beobachtung speichern; stems = explizite SuS (sonst aktuelle Auswahl). Rückgabe: true bei Erfolg */
  async function erfassen(b: { bez: string; kat: string; bew: Bewertung; beschr?: string }, explizit?: string[]): Promise<boolean> {
    const stems = [...(explizit ?? auswahl)].sort()
    if (!stems.length || speichert) return false
    speichert = true
    const k = klasse
    const datum = heute()
    // Kategorie ausgeschrieben speichern (Buchstabe → Text gemäss Schnellbuttons.yaml)
    const katText = config?.kategorien[b.kat] ?? b.kat
    try {
      const r = await speichern(k, { zeit: jetzt(), sus: stems, kat: katText, bew: b.bew, bez: b.bez, beschr: b.beschr, erfasser: erfasserName(), klus: 'offen' }, datum)
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
      return true
    } catch (e) {
      fehler = String(e)
      return false
    } finally {
      speichert = false
    }
  }

  function schnell(btn: Schnellbutton) {
    if (btn.eingabe) { nachfrage = { btn, minuten: '', text: '' }; return }
    erfassen({ bez: btn.bez, kat: btn.kat, bew: btn.bew })
  }

  async function nachfrageSpeichern(minuten?: number) {
    if (!nachfrage) return
    const { btn, text } = nachfrage
    const m = minuten ?? (nachfrage.minuten ? Number(nachfrage.minuten) : 0)
    nachfrage = null
    const bez = btn.eingabe === 'minuten' && m > 0 ? `${btn.bez} (${m} Min.)` : btn.bez
    await erfassen({ bez, kat: btn.kat, bew: btn.bew, beschr: btn.eingabe === 'text' ? text : undefined })
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
      <div class="kopf-rechts">
        <button class="klein" class:aktiv-chip={modus === 'anwesenheit'} onclick={() => { modus = 'anwesenheit'; auswahl = new Set() }}>
          Anwesenheit{abwesend.size ? ` (${abwesend.size} fehlen)` : ''}
        </button>
        <button class="klein" onclick={logout} title={konto.username}>Abmelden</button>
      </div>
    </header>

    <div class="modi">
      <button class:aktiv={modus === 'beobachten'} onclick={() => (modus = 'beobachten')}>Beobachten</button>
      <button class:aktiv={modus === 'ruecklauf'} onclick={() => { modus = 'ruecklauf'; auswahl = new Set() }}>Rücklauf</button>
      <button class:aktiv={modus === 'zufall'} onclick={() => { modus = 'zufall'; auswahl = new Set() }}>Zufall</button>
      <button class:aktiv={modus === 'gruppen'} onclick={() => { modus = 'gruppen'; auswahl = new Set() }}>Gruppen</button>
    </div>

    {#if modus === 'anwesenheit'}
      <p class="info"><strong>Wer fehlt heute?</strong> Antippen – gilt für Zufall, Gruppen und Rücklauf.</p>
    {:else if modus === 'ruecklauf' && config}
      <Ruecklauf {klasse} {sus} {nameVon} {abwesend} buttons={config.buttons} erfasse={erfassen} />
    {:else if modus === 'zufall'}
      <Zufall klasseId={klasse.id} {anwesend} {nameVon} />
    {:else if modus === 'gruppen'}
      <Gruppen {klasse} {anwesend} alle={sus} {nameVon} />
    {/if}
    {#if (modus === 'zufall' || modus === 'gruppen') && sus.length}
      <p class="info">Anwesenheit: antippen, wer fehlt ({abwesend.size} abwesend)</p>
    {/if}

    {#if wartend > 0}
      <button class="hinweis" onclick={nachreichen}>{wartend} Eintrag/Einträge warten auf Netz – jetzt senden</button>
    {/if}
    {#if warnung}<p class="warnung">{warnung}</p>{/if}
    {#if laedt}<p class="info">Lade Klasse {klasse.id} …</p>{/if}

    {#if modus !== 'ruecklauf'}
    <div class="raster">
      {#each sus as s (s.stem)}
        <button class="kachel" class:gewaehlt={modus === 'beobachten' && auswahl.has(s.stem)}
          class:abwesend={modus !== 'beobachten' && abwesend.has(s.stem)}
          class:abwesend-leicht={modus === 'beobachten' && abwesend.has(s.stem)}
          onclick={() => (modus === 'beobachten' ? toggle(s.stem) : toggleAbwesend(s.stem))}>
          {s.anzeige}
        </button>
      {/each}
    </div>
    {/if}

    {#if modus === 'beobachten' && tagesListe.length}
      <section class="heute">
        <h2>Heute erfasst ({tagesListe.length})</h2>
        <ul>
          {#each tagesListe as b (b.zeile)}
            <li class:positiv={b.bew === 'sehr gut'}>
              <span class="zeit">{b.zeit}</span>
              <span class="text"><strong>{b.bez}</strong><br />
                <span class="kat">{b.kat}</span><br />
                <span class="namen">{b.sus.map(nameVon).join(', ')}</span>
                {#if b.beschr}<br /><em>{b.beschr}</em>{/if}
                {#if b.erfasser}<br /><span class="kat">erfasst von {b.erfasser}</span>{/if}
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

    {#if modus === 'beobachten' && auswahl.size > 0 && config}
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
              {#each Object.entries(config.kategorien) as [k, t]}<option value={k}>{t}</option>{/each}
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

    {#if nachfrage}
      <div class="dialog-hg" role="presentation" onclick={(e) => e.target === e.currentTarget && (nachfrage = null)}>
        <form class="dialog" onsubmit={(e) => { e.preventDefault(); nachfrageSpeichern() }}>
          <h2>{nachfrage.btn.bez} – {auswahl.size === 1 ? nameVon([...auswahl][0]) : `${auswahl.size} SuS`}</h2>
          {#if nachfrage.btn.eingabe === 'minuten'}
            <div class="chips">
              <button type="button" onclick={() => nachfrageSpeichern(0)}>ohne</button>
              {#each [5, 10, 15, 20, 30] as m}
                <button type="button" onclick={() => nachfrageSpeichern(m)}>{m} Min.</button>
              {/each}
            </div>
            <label>Andere Anzahl Minuten
              <input type="number" inputmode="numeric" min="1" max="300" bind:value={nachfrage.minuten} />
            </label>
          {:else}
            <label>Was ist vorgefallen? (optional)
              <!-- svelte-ignore a11y_autofocus -->
              <textarea bind:value={nachfrage.text} rows="4" autofocus></textarea>
            </label>
          {/if}
          <div class="dialog-knoepfe">
            <button type="button" onclick={() => (nachfrage = null)}>Abbrechen</button>
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
