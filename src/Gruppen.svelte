<script lang="ts">
  import { bildeGruppen, anzahlAusGroesse, ladeAusschluesse, aendereAusschluesse, type Paar } from './lib/gruppen'
  import type { Klasse } from './config'
  import type { Sus } from './lib/sus'

  let { klasse, anwesend, alle, nameVon }: {
    klasse: Klasse; anwesend: string[]; alle: Sus[]; nameVon: (s: string) => string
  } = $props()

  let modus = $state<'anzahl' | 'groesse'>('groesse')
  let wert = $state(4)
  let gruppen = $state<string[][]>([])
  let verstoesse = $state(0)
  let paare = $state<Paar[]>([])
  let ausschlussOffen = $state(false)
  let neuA = $state('')
  let neuB = $state('')
  let fehler = $state('')

  $effect(() => {
    const k = klasse
    gruppen = []
    ladeAusschluesse(k).then((p) => (paare = p)).catch((e) => (fehler = String(e)))
  })

  const anzahl = $derived(modus === 'anzahl' ? wert : anzahlAusGroesse(anwesend.length, wert))

  function mischen() {
    const r = bildeGruppen(anwesend, anzahl, paare)
    gruppen = r.gruppen
    verstoesse = r.verstoesse
  }

  async function paarAendern(p: Paar, dazu: boolean) {
    fehler = ''
    try { paare = await aendereAusschluesse(klasse, p, dazu) } catch (e) { fehler = String(e) }
    neuA = ''; neuB = ''
  }
</script>

<section class="gruppen">
  <div class="steuerung">
    <div class="umschalter">
      <button class:aktiv={modus === 'groesse'} onclick={() => (modus = 'groesse')}>ca. pro Gruppe</button>
      <button class:aktiv={modus === 'anzahl'} onclick={() => (modus = 'anzahl')}>Anzahl Gruppen</button>
    </div>
    <div class="stepper">
      <button onclick={() => (wert = Math.max(1, wert - 1))}>−</button>
      <span>{wert}</span>
      <button onclick={() => (wert = Math.min(anwesend.length || 1, wert + 1))}>+</button>
    </div>
    <button class="primary" onclick={mischen} disabled={!anwesend.length}>Mischen</button>
  </div>
  <p class="info">{anwesend.length} anwesend → {anzahl} Gruppen</p>

  {#if verstoesse > 0}
    <p class="warnung">Gruppen konnten nicht optimal verteilt werden – bitte nochmals mischen.</p>
  {/if}

  {#if gruppen.length}
    <div class="ergebnis">
      {#each gruppen as g, i}
        <div class="gruppe">
          <h3>Gruppe {i + 1}</h3>
          {#each g as s}<div>{nameVon(s)}</div>{/each}
        </div>
      {/each}
    </div>
  {/if}

  <details bind:open={ausschlussOffen} class="ausschluss">
    <summary>Einstellungen</summary>
    <p class="info">Nie zusammen</p>
    <ul>
      {#each paare as p}
        <li>{nameVon(p[0])} + {nameVon(p[1])}
          <button class="klein" onclick={() => paarAendern(p, false)} aria-label="Entfernen">×</button></li>
      {/each}
    </ul>
    <div class="neu">
      <select bind:value={neuA}><option value="">–</option>{#each alle as s}<option value={s.stem}>{s.anzeige}</option>{/each}</select>
      <select bind:value={neuB}><option value="">–</option>{#each alle as s}<option value={s.stem}>{s.anzeige}</option>{/each}</select>
      <button disabled={!neuA || !neuB || neuA === neuB} onclick={() => paarAendern([neuA, neuB], true)}>Hinzufügen</button>
    </div>
  </details>
  {#if fehler}<pre class="fehler">{fehler}</pre>{/if}
</section>
