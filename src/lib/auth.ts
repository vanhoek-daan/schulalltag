import {
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser'
import { CONFIG } from '../config'

// Redirect-URI = Adresse der App (lokal oder auf GitHub Pages)
const redirectUri = new URL(import.meta.env.BASE_URL, window.location.origin).href

const msal = new PublicClientApplication({
  auth: {
    clientId: CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
    redirectUri,
  },
  // localStorage: Login bleibt auf dem Handy erhalten
  cache: { cacheLocation: 'localStorage' },
})

let account: AccountInfo | null = null

/** Muss beim Start einmal aufgerufen werden. Liefert das angemeldete Konto oder null. */
export async function initAuth(): Promise<AccountInfo | null> {
  await msal.initialize()
  const result = await msal.handleRedirectPromise()
  account = result?.account ?? msal.getAllAccounts()[0] ?? null
  if (account) msal.setActiveAccount(account)
  return account
}

export function login(): Promise<void> {
  return msal.loginRedirect({ scopes: [...CONFIG.scopes], prompt: 'select_account' })
}

/** true = eigenes Konto (Vault-Besitzer), false = Gast mit Schulkonto */
export const istBesitzer = (a: AccountInfo) => a.tenantId === CONFIG.tenantId

export function logout(): Promise<void> {
  return msal.logoutRedirect({ account: account ?? undefined })
}

/** Neu anmelden: Login-Zwischenspeicher dieser App leeren, dann Microsoft-Anmeldung */
export async function neuAnmelden(): Promise<void> {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('msal.') || k.includes(CONFIG.clientId))) localStorage.removeItem(k)
    }
    sessionStorage.removeItem(REDIRECT_KEY)
  } catch { /* egal */ }
  await msal.loginRedirect({ scopes: [...CONFIG.scopes], prompt: 'select_account' })
}

const REDIRECT_KEY = 'schulalltag.tokenRedirect'

/** Access-Token für Graph holen; scheitert die stille Erneuerung (z.B. Timeout am Handy), neu anmelden. */
export async function getToken(): Promise<string> {
  if (!account) throw new Error('Nicht angemeldet')
  try {
    const r = await msal.acquireTokenSilent({ scopes: [...CONFIG.scopes], account, authority: `https://login.microsoftonline.com/${account.tenantId}` })
    try { sessionStorage.removeItem(REDIRECT_KEY) } catch { /* egal */ }
    return r.accessToken
  } catch (e) {
    // Schutz vor Endlosschleife: höchstens ein automatischer Redirect pro Minute
    let zuletzt = 0
    try { zuletzt = Number(sessionStorage.getItem(REDIRECT_KEY) ?? 0) } catch { /* egal */ }
    if (Date.now() - zuletzt > 60_000) {
      try { sessionStorage.setItem(REDIRECT_KEY, String(Date.now())) } catch { /* egal */ }
      await msal.acquireTokenRedirect({ scopes: [...CONFIG.scopes], account })
    }
    throw new Error(`Anmeldung abgelaufen – bitte «Neu anmelden» tippen (${e instanceof Error ? e.message : e})`)
  }
}
