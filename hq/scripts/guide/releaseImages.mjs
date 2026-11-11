// Reads a released screenshot from the GitHub Release that holds it: through GitHub's API with a token (GH_TOKEN or
// GITHUB_TOKEN), as the repository needs while it is private, and from the picture's own address without one.

import { REPOSITORY, screenshotUrl } from './screenshotLinks.mjs'

export function githubToken(env) {
  return env.GH_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || ''
}

/**
 * `(tag, name) => picture | null`: a screenshot as the release `tag` holds it, or null when that release, or the
 * picture in it, does not exist. With a token each release is looked up once.
 */
export function releaseImages({ token, fetchFn = fetch }) {
  const failed = (tag, name, response) => new Error(`fetching the released screenshot "${name}" in ${tag} failed: HTTP ${response.status}`)
  if (!token) {
    return async (tag, name) => {
      const response = await fetchFn(screenshotUrl(tag, name))
      if (response.status === 404) return null
      if (!response.ok) throw failed(tag, name, response)
      return Buffer.from(await response.arrayBuffer())
    }
  }
  const auth = { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
  const releases = new Map()
  const release = (tag, name) => {
    if (!releases.has(tag)) {
      releases.set(tag, (async () => {
        const address = `https://api.github.com/repos/${REPOSITORY}/releases/tags/${encodeURIComponent(tag)}`
        const response = await fetchFn(address, { headers: { ...auth, Accept: 'application/vnd.github+json' } })
        if (response.status === 404) return null
        if (!response.ok) throw failed(tag, name, response)
        return response.json()
      })())
    }
    return releases.get(tag)
  }
  return async (tag, name) => {
    const asset = (await release(tag, name))?.assets?.find((a) => a.name === `${name}.png`)
    if (!asset) return null
    // GitHub answers with a redirect to the file's storage; fetch drops the token when it follows it to another origin.
    const response = await fetchFn(asset.url, { headers: { ...auth, Accept: 'application/octet-stream' } })
    if (!response.ok) throw failed(tag, name, response)
    return Buffer.from(await response.arrayBuffer())
  }
}
