<script lang="ts">
  import { ladeRuecklaeufe, neuerRuecklauf, setzeAbgegeben, setzeFeld, type Ruecklauf } from './lib/ruecklauf'
  import { seriell } from './lib/seriell'
  import { heute } from './lib/beobachtungen'
  import type { Klasse } from './config'
  import type { Sus } from './lib/sus'
  import type { Schnellbutton, Bewertung } from './lib/schnellbuttons'

  let { klasse, sus, nameVon, abwesend, buttons, erfasse }: {
    klasse: Klasse
    sus: Sus[]
    nameVon: (s: string) => string
    abwesend: Set<string>
    buttons: Schnellbutton[]
    erfasse: (b: { bez: string; kat: string; bew: Bewertung; beschr?: string }, stems: string[]) => Promise<boolean>
  } = $props()

  let liste = $state<Ruecklauf[]>([])
  let laedt = $state(false)
  let aktiv = $state<Ruecklauf | null>(null)
  let fehler = $state('')
  let zeigeAlle = $state(false)
  let neuOffen = $state(false)
  let neuTitel = $state('')
  let neuFaellig = $state('')
  let eintrag = $state<{ idx: number; bez: string } | null>(null)

  const inTagen = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return heute(d) }
  const kurz = (iso: string) => iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' : ''

  async function laden() {
    laedt = true
    fehler = ''
    try { liste = await ladeRuecklaeufe(klasse) } catch (e) { fehler = String(e) } finally { laedt = false }
  }

  $effect(() => {
    void klasse
    aktiv = null
    laden()
  })

  const sichtbar = $derived(liste.filter((r) => zeigeAlle || r.status === 'offen'))
  const offen = (r: Ruecklauf) => r.alle.filter((s) => !r.abgegeben.has(s))
  const fehlendAnwesend = $derived(aktiv ? offen(aktiv).filter((s) => !abwesend.has(s)) : [])
  const fehlendAbwesend = $derived(aktiv ? offen(aktiv).filter((s) => abwesend.has(s)) : [])

  function ersetze(r: Ruecklauf) {
    liste = liste.map((x) => (x.datei === r.datei ? r : x))
    if (aktiv?.datei === r.datei) aktiv = r
  }

  async function anlegen() {
    if (!neuTitel.trim()) return
    fehler = ''
    try {
      const r = await neuerRuecklauf(klasse, neuTitel, neuFaellig, sus.map((s) => s.stem))
      liste = [r, ...liste]
      neuOffen = false
      aktiv = r
    } catch (e) { fehler = String(e) }
  }

  function toggle(stem: string) {
    if (!aktiv) return
    const r = aktiv
    const ja = !r.abgegeben.has(stem)
    // sofort anzeigen, dann speichern
    const m = new Map(r.abgegeben)
    ja ? m.set(stem, heute()) : m.delete(stem)
    ersetze({ ...r, abgegeben: m })
    seriell(() => setzeAbgegeben(klasse, r.datei, stem, ja))
      .then((neu) => { if (aktiv?.datei === neu.datei) ersetze(neu) })
      .catch((e) => { fehler = String(e); laden() })
  }

  async function status(s: 'offen' | 'abgeschlossen') {
    if (!aktiv) return
    try { ersetze(await seriell(() => setzeFeld(klasse, aktiv!.datei, 'status', s))) } catch (e) { fehler = String(e) }
    if (s === 'abgeschlossen') aktiv = null
  }

  function eintragOeffnen() {
    const i = Math.max(0, buttons.findIndex((b) => b.bew === 'ungenügend'))
    eintrag = { idx: i, bez: buttons[i]?.bez ?? '' }
  }

  async function eintragSpeichern() {
    if (!eintrag || !aktiv || !fehlendAnwesend.length) return
    const b = buttons[eintrag.idx]
    const bez = eintrag.bez.trim() || b.bez
    const r = aktiv
    eintrag = null
    const ok = await erfasse({ bez, kat: b.kat, bew: b.bew }, fehlendAnwesend)
    if (ok) {
      try { ersetze(await seriell(() => setzeFeld(klasse, r.datei, 'beobachtung', heute()))) } catch (e) { fehler = String(e) }
    }
  }
</script>

<section class="ruecklauf">
  {#if !aktiv}
    <div class="rl-kopf">
      <button class="primary" onclick={() => { neuTitel = ''; neuFaellig = inTagen(7); neuOffen = true }}>+ Neuer Rücklauf</button>
      <label class="klein-label"><input type="checkbox" bind:checked={zeigeAlle} /> abgeschlossene zeigen</label>
    </div>
    {#if laedt}<p class="info">Lade …</p>{/if}
    {#if !laedt && !sichtbar.length}<p class="info">Keine offenen Rückläufe.</p>{/if}
    <ul class="rl-liste">
      {#each sichtbar as r (r.datei)}
        <li>
          <button class="rl-eintrag" class:erledigt={r.status === 'abgeschlossen'} onclick={() => (aktiv = r)}>
            <strong>{r.titel}</strong>
            <span>{r.faellig ? `fällig ${kurz(r.faellig)}` : ''}{r.faellig && r.faellig < heute() && r.status === 'offen' ? ' ⚠' : ''}</span>
            <span class="zahl">{offen(r).length ? `${offen(r).length} offen` : '✓ komplett'}</span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="rl-detail-kopf">
      <button class="klein" onclick={() => (aktiv = null)}>← Zurück</button>
      <div>
        <strong>{aktiv.titel}</strong><br />
        <span class="info-inline">{aktiv.abgegeben.size}/{aktiv.alle.length} abgegeben{aktiv.faellig ? ` · fällig ${kurz(aktiv.faellig)}` : ''}</span>
      </div>
    </div>
    <div class="raster">
      {#each aktiv.alle as s (s)}
        <button class="kachel" class:abgegeben={aktiv.abgegeben.has(s)} class:abwesend-leicht={abwesend.has(s)} onclick={() => toggle(s)}>
          {nameVon(s)}{aktiv.abgegeben.has(s) ? ' ✓' : ''}
        </button>
      {/each}
    </div>
    <div class="rl-aktionen">
      <button disabled={!fehlendAnwesend.length} onclick={eintragOeffnen}>Fehlende als Beobachtung erfassen ({fehlendAnwesend.length})</button>
      {#if aktiv.status === 'offen'}
        <button onclick={() => status('abgeschlossen')}>Abschliessen</button>
      {:else}
        <button onclick={() => status('offen')}>Wieder öffnen</button>
      {/if}
    </div>
    {#if aktiv.beobachtung}<p class="info">Einträge für Fehlende erstellt am {kurz(aktiv.beobachtung)}</p>{/if}
  {/if}

  {#if neuOffen}
    <div class="dialog-hg" role="presentation" onclick={(e) => e.target === e.currentTarget && (neuOffen = false)}>
      <form class="dialog" onsubmit={(e) => { e.preventDefault(); anlegen() }}>
        <h2>Neuer Rücklauf {klasse.id}</h2>
        <label>Was muss zurückkommen?
          <input bind:value={neuTitel} required placeholder="z.B. Elternbrief Skilager" />
        </label>
        <label>Fällig am
          <input type="date" bind:value={neuFaellig} />
        </label>
        <div class="dialog-knoepfe">
          <button type="button" onclick={() => (neuOffen = false)}>Abbrechen</button>
          <button type="submit" class="primary">Anlegen</button>
        </div>
      </form>
    </div>
  {/if}

  {#if eintrag && aktiv}
    <div class="dialog-hg" role="presentation" onclick={(e) => e.target === e.currentTarget && (eintrag = null)}>
      <form class="dialog" onsubmit={(e) => { e.preventDefault(); eintragSpeichern() }}>
        <h2>Beobachtung für {fehlendAnwesend.length} SuS</h2>
        <p class="info-inline">{fehlendAnwesend.map(nameVon).join(', ')}</p>
        {#if fehlendAbwesend.length}
          <p class="info-inline">Ausgenommen (abwesend): {fehlendAbwesend.map(nameVon).join(', ')}</p>
        {/if}
        <div class="chips-wrap">
          {#each buttons as b, i}
            <button type="button" class:aktiv={eintrag.idx === i} onclick={() => (eintrag = { idx: i, bez: b.bez })}>{b.label}</button>
          {/each}
        </div>
        <label>Bezeichnung (max. 50 Zeichen)
          <input bind:value={eintrag.bez} maxlength="50" />
        </label>
        <div class="dialog-knoepfe">
          <button type="button" onclick={() => (eintrag = null)}>Abbrechen</button>
          <button type="submit" class="primary">Erfassen</button>
        </div>
      </form>
    </div>
  {/if}

  {#if fehler}<pre class="fehler">{fehler}</pre>{/if}
</section>
