import { getToken } from './auth'
import { CONFIG } from '../config'

const GRAPH = 'https://graph.microsoft.com/v1.0'

/** Pfad im Vault → Graph-Adresse (jedes Segment URL-kodiert) */
function itemUrl(vaultPath: string): string {
  const full = `${CONFIG.vaultRoot}/${vaultPath}`
  const enc = full.split('/').map(encodeURIComponent).join('/')
  return `${GRAPH}/me/drive/root:/${enc}`
}

export class GraphError extends Error {
  constructor(public status: number, text: string) {
    super(`Graph ${status}: ${text}`)
  }
}

async function graphFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new GraphError(res.status, await res.text())
  return res
}

export interface DriveItem {
  name: string
  file?: object
  folder?: object
}

/** Dateien und Ordner eines Vault-Ordners auflisten */
export async function listFolder(vaultPath: string): Promise<DriveItem[]> {
  const items: DriveItem[] = []
  let url: string | undefined = `${itemUrl(vaultPath)}:/children?$select=name,file,folder&$top=200`
  while (url) {
    const data: { value: DriveItem[]; '@odata.nextLink'?: string } = await (await graphFetch(url)).json()
    items.push(...data.value)
    url = data['@odata.nextLink']
  }
  return items
}

/** Textdatei aus dem Vault lesen */
export async function readText(vaultPath: string): Promise<string> {
  return (await graphFetch(`${itemUrl(vaultPath)}:/content`)).text()
}

/** Textdatei samt ETag lesen; null, wenn sie nicht existiert */
export async function readWithEtag(vaultPath: string): Promise<{ text: string; etag: string } | null> {
  try {
    // zuerst ETag, dann Inhalt: ändert sich die Datei dazwischen, scheitert das spätere Schreiben (412) → neuer Versuch
    const meta: { eTag: string } = await (await graphFetch(`${itemUrl(vaultPath)}?$select=eTag`)).json()
    const text = await readText(vaultPath)
    return { text, etag: meta.eTag }
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return null
    throw e
  }
}

/**
 * Textdatei schreiben.
 * etag gesetzt → nur überschreiben, wenn unverändert (sonst 412).
 * etag null    → nur neu anlegen, wenn sie nicht existiert (sonst 409).
 */
export async function writeText(vaultPath: string, text: string, etag: string | null): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'text/markdown; charset=utf-8' }
  let url = `${itemUrl(vaultPath)}:/content`
  if (etag) headers['If-Match'] = etag
  else url += '?@microsoft.graph.conflictBehavior=fail'
  await graphFetch(url, { method: 'PUT', headers, body: text })
}

/** Lesen → ändern → schreiben, bei gleichzeitiger Änderung bis zu 4 Versuche */
export async function updateText(
  vaultPath: string,
  aendern: (alt: string | null) => string,
): Promise<string> {
  for (let versuch = 0; versuch < 4; versuch++) {
    const alt = await readWithEtag(vaultPath)
    const neu = aendern(alt?.text ?? null)
    try {
      await writeText(vaultPath, neu, alt?.etag ?? null)
      return neu
    } catch (e) {
      if (e instanceof GraphError && (e.status === 412 || e.status === 409)) continue
      throw e
    }
  }
  throw new Error('Datei wurde mehrfach gleichzeitig geändert – bitte nochmals versuchen')
}
