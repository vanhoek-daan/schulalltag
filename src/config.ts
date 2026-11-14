// Zentrale Konfiguration. Diese Werte sind NICHT geheim (öffentliche SPA-Client-ID).
export const CONFIG = {
  clientId: '5f941989-de96-49e6-bf84-979d6a961a55',
  tenantId: '7d1ced09-9c2f-4de6-8956-fc3e99913b14',
  scopes: ['Files.ReadWrite'],
  // Pfad des Obsidian-Vaults im OneDrive (relativ zur OneDrive-Wurzel)
  vaultRoot: 'Obsidian_Vault/Campus_Helper',
  klassen: [
    { id: '1Ab', ordner: 'vanHoek' },
    { id: '1Aa', ordner: 'Wimmer' },
  ],
} as const

export type Klasse = (typeof CONFIG.klassen)[number]
