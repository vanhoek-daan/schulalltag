import { getToken } from './auth'
import { CONFIG } from '../config'

const GRAPH = 'https://graph.microsoft.com/v1.0'

/** Pfad im Vault → Graph-Adresse (jedes Segment URL-kodiert) */
function itemUrl(vaultPath: string): string {
  const full = `${CONFIG.vaultRoot}/${vaultPath}`
  const enc = full.split('/').map(encodeURIComponent).join('/')
  return `${GRAPH}/me/drive/root:/${enc}`
}

async function graphFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken()
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Graph ${res.status}: ${await res.text()}`)
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
