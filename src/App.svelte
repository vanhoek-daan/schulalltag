<script lang="ts">
  import { onMount } from 'svelte'
  import type { AccountInfo } from '@azure/msal-browser'
  import { initAuth, login, logout } from './lib/auth'
  import { ladeKlasse, type Sus } from './lib/sus'
  import { CONFIG, type Klasse } from './config'

  let konto = $state<AccountInfo | null>(null)
  let bereit = $state(false)
  let fehler = $state('')
  let klasse = $state<Klasse>(CONFIG.klassen[0])
  let sus = $state<Sus[]>([])
  let laedt = $state(false)
  let auswahl = $state(new Set<string>())

  const cache = new Map<string, Sus[]>()

  async function zeigeKlasse(k: Klasse) {
    klasse = k
    auswahl = new Set()
    fehler = ''
    if (cache.has(k.id)) { sus = cache.get(k.id)!; return }
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

  function toggle(stem: string) {
    const s = new Set(auswahl)
    s.has(stem) ? s.delete(stem) : s.add(stem)
    auswahl = s
  }

  onMount(async () => {
    try {
      konto = await initAuth()
      if (konto) await zeigeKlasse(klasse)
    } catch (e) {
      fehler = String(e)
    } finally {
      bereit = true
    }
  })
</script>

<main>
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

    {#if laedt}
      <p class="info">Lade Klasse {klasse.id} …</p>
    {/if}

    <div class="raster">
      {#each sus as s (s.stem)}
        <button class="kachel" class:gewaehlt={auswahl.has(s.stem)} onclick={() => toggle(s.stem)}>
          {s.anzeige}
        </button>
      {/each}
    </div>

    {#if auswahl.size > 0}
      <p class="info">{auswahl.size} ausgewählt</p>
    {/if}
  {/if}

  {#if fehler}
    <pre class="fehler">{fehler}</pre>
  {/if}
</main>
