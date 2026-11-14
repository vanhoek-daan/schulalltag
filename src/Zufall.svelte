<script lang="ts">
  import { ziehe } from './lib/gruppen'

  let { klasseId, anwesend, nameVon }: { klasseId: string; anwesend: string[]; nameVon: (s: string) => string } = $props()

  const key = $derived(`schulalltag.gezogen.${klasseId}`)
  let ohneWdh = $state(true)
  let wer = $state<string | null>(null)
  let gezogen = $state<string[]>([])
  let animiert = $state(false)

  $effect(() => {
    try { gezogen = JSON.parse(localStorage.getItem(key) ?? '[]') } catch { gezogen = [] }
    wer = null
  })

  const offen = $derived(anwesend.filter((s) => !gezogen.includes(s)).length)

  function los() {
    const r = ziehe(anwesend, gezogen, ohneWdh)
    if (!r) return
    // kurze "Roulette"-Animation
    animiert = true
    let n = 0
    const t = setInterval(() => {
      wer = anwesend[Math.floor(Math.random() * anwesend.length)]
      if (++n >= 8) {
        clearInterval(t)
        wer = r.wer
        animiert = false
        if (ohneWdh) {
          gezogen = r.gezogen
          try { localStorage.setItem(key, JSON.stringify(gezogen)) } catch { /* egal */ }
        }
      }
    }, 70)
  }

  function zuruecksetzen() {
    gezogen = []
    wer = null
    try { localStorage.removeItem(key) } catch { /* egal */ }
  }
</script>

<section class="zufall">
  <div class="gross" class:animiert>{wer ? nameVon(wer) : '?'}</div>
  <button class="primary los" onclick={los} disabled={!anwesend.length || animiert}>Ziehen</button>
  <div class="optionen">
    <label><input type="checkbox" bind:checked={ohneWdh} /> ohne Wiederholung</label>
    {#if ohneWdh}
      <span>{offen} von {anwesend.length} noch nicht dran</span>
      <button class="klein" onclick={zuruecksetzen}>Neue Runde</button>
    {/if}
  </div>
</section>
