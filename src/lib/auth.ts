import {
  PublicClientApplication,
  InteractionRequiredAuthError,
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

/** Access-Token für Graph holen; bei Bedarf neu anmelden. */
export async function getToken(): Promise<string> {
  if (!account) throw new Error('Nicht angemeldet')
  try {
    const r = await msal.acquireTokenSilent({ scopes: [...CONFIG.scopes], account, authority: `https://login.microsoftonline.com/${account.tenantId}` })
    return r.accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      await msal.acquireTokenRedirect({ scopes: [...CONFIG.scopes], account })
    }
    throw e
  }
}
