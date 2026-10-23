/**
 * GitHub App Manifest flow endpoints. An admin starts a registration inside hq
 * (startGithubAppRegistration), which returns the address of the first route with a
 * one-time state; GitHub passes the state back to the second.
 *  - GET /api/v1/github/app-manifest-new?state=  → a one-click form POST to GitHub with the manifest
 *  - GET /api/v1/github/app-manifest-callback?code=&state= → converts + stores, redirects to the install page
 * Both are browser navigations, so neither carries a session; the state is the credential.
 */
import type { Response } from 'express'
import type { GithubAppManifestNewApi, GithubAppManifestCallbackApi } from 'wasp/server/api'
import { masterKeyProblem } from '../server/crypto/secretCrypto'
import { buildManifest, convertManifestCode, getApp, storeAppFromConversion, refreshInstallations } from './githubApp'
import { consumeManifestState, isManifestStateOpen } from './manifestState'
import { BRANDING } from '@agenthix/core'

/** Escape a string for safe inclusion in a single-quoted HTML attribute. */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function plain(res: Response, status: number, message: string): void {
  res.status(status).type('text/plain').send(message)
}

const START_AGAIN = 'Start again from Manage organisation › Infrastructure › GitHub App in hq.'
const ALREADY_CONNECTED = 'A GitHub App is already connected. Disconnect it under Manage organisation › Infrastructure › GitHub App, then connect again.'

export const appManifestNewHandler: GithubAppManifestNewApi = async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  if (!state) { plain(res, 400, `This link is missing its state. ${START_AGAIN}`); return }
  if (!isManifestStateOpen(state)) { plain(res, 403, `This link is invalid or has expired. ${START_AGAIN}`); return }
  const org = typeof req.query.org === 'string' ? req.query.org.trim() : ''
  const manifest = JSON.stringify(buildManifest(state))
  // Org-owned App: POST to the org's apps/new. Personal account: the bare apps/new.
  const base = org
    ? `https://github.com/organizations/${encodeURIComponent(org)}/settings/apps/new`
    : 'https://github.com/settings/apps/new'
  const action = `${base}?state=${encodeURIComponent(state)}`
  // No inline JS (the site CSP blocks inline event handlers). The operator clicks the
  // button, which POSTs the manifest to GitHub; GitHub then redirects to redirect_url with ?code=.
  // Override helmet's default CSP for this standalone bootstrap page: helmet's
  // `form-action 'self'` would otherwise block the POST to github.com.
  res.set('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action https://github.com")
  res.set('Content-Type', 'text/html')
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Connect GitHub</title></head>
<body style="font-family:system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
  <h2>Connect GitHub</h2>
  <p>This creates the ${BRANDING.displayName} GitHub App in your account or organisation. GitHub will ask you to confirm, then send you back here to finish.</p>
  <form action="${action}" method="post">
    <input type="hidden" name="manifest" value='${escapeAttr(manifest)}'>
    <button type="submit" style="padding:.6rem 1.1rem;font-size:1rem;border:0;border-radius:6px;background:#1f6feb;color:#fff;cursor:pointer">Create GitHub App on GitHub →</button>
  </form>
</body></html>`)
}

export const appManifestCallbackHandler: GithubAppManifestCallbackApi = async (req, res) => {
  // Used up before anything else, so a state can start at most one conversion.
  if (!consumeManifestState(req.query.state)) {
    plain(res, 400, `This GitHub connection link is invalid, already used, or has expired. ${START_AGAIN}`)
    return
  }
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  if (!code) { plain(res, 400, 'Missing code'); return }
  try {
    if (await getApp()) { plain(res, 409, ALREADY_CONNECTED); return }
    const keyProblem = masterKeyProblem()
    if (keyProblem) { plain(res, 503, `hq cannot store the App's private key. ${keyProblem}`); return }
    const conversion = await convertManifestCode(code)
    await storeAppFromConversion(conversion)
    await refreshInstallations().catch(() => {}) // best-effort; operator may install next
    // Redirect to the install page so the operator installs the App on their repos.
    res.redirect(`https://github.com/apps/${encodeURIComponent(conversion.slug)}/installations/new`)
  } catch (e) {
    plain(res, 500, `GitHub App registration failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}
