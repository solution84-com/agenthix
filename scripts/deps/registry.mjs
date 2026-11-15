// Reads an image registry over its HTTP API (the OCI distribution API), anonymously: the tags of a repository and the
// digest a tag points to. Needs only Node's fetch, so it runs the same on the dev machine and in CI. A HEAD request
// for a manifest does not count against Docker Hub's pull limit.

const MANIFEST_TYPES = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ')

/** The registry host and repository path of an image reference without its tag: node, ghcr.io/sigstore/cosign/cosign. */
export function registryOf(name) {
  const first = name.split('/')[0]
  const hasHost = name.includes('/') && (first.includes('.') || first.includes(':') || first === 'localhost')
  let host = hasHost ? first : 'docker.io'
  let repo = hasHost ? name.slice(first.length + 1) : name
  if (host === 'docker.io') { host = 'registry-1.docker.io'; if (!repo.includes('/')) repo = `library/${repo}` }
  return { host, repo }
}

const tokens = new Map()

async function authorised(url, init, repo) {
  const key = `${new URL(url).host}/${repo}`
  const withToken = () => ({ ...init, headers: { ...init.headers, ...(tokens.has(key) ? { authorization: `Bearer ${tokens.get(key)}` } : {}) } })
  let res = await fetch(url, withToken())
  if (res.status !== 401) return res
  const challenge = res.headers.get('www-authenticate') ?? ''
  const params = Object.fromEntries([...challenge.matchAll(/(\w+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
  if (!/^Bearer/i.test(challenge) || !params.realm) throw new Error(`${url}: the registry asks for credentials this script does not have`)
  const tokenUrl = new URL(params.realm)
  if (params.service) tokenUrl.searchParams.set('service', params.service)
  tokenUrl.searchParams.set('scope', params.scope ?? `repository:${repo}:pull`)
  const t = await fetch(tokenUrl)
  if (!t.ok) throw new Error(`${tokenUrl.origin}: no anonymous token for ${repo} (${t.status})`)
  const body = await t.json()
  tokens.set(key, body.token ?? body.access_token)
  res = await fetch(url, withToken())
  return res
}

/** Every tag of an image repository, following the registry's pages. */
export async function listTags(name) {
  const { host, repo } = registryOf(name)
  const tags = []
  let url = `https://${host}/v2/${repo}/tags/list?n=1000`
  while (url) {
    const res = await authorised(url, { headers: {} }, repo)
    if (!res.ok) throw new Error(`${name}: the registry did not list its tags (${res.status})`)
    tags.push(...((await res.json()).tags ?? []))
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1]
    url = next ? new URL(next, `https://${host}`).toString() : null
  }
  return tags
}

/** The digest a tag points to: the multi-platform index where there is one. */
export async function tagDigest(name, tag) {
  const { host, repo } = registryOf(name)
  const res = await authorised(`https://${host}/v2/${repo}/manifests/${tag}`, { method: 'HEAD', headers: { accept: MANIFEST_TYPES } }, repo)
  const digest = res.headers.get('docker-content-digest')
  if (!res.ok || !/^sha256:[0-9a-f]{64}$/.test(digest ?? '')) throw new Error(`${name}:${tag}: the registry gave no digest (${res.status})`)
  return digest
}
