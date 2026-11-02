/**
 * The front door's question before it asks a certificate authority for a live app's name (on-demand TLS, live
 * preview spec section 5): `GET /preview-certificate-ask?domain=<name>`, from the host service's front door through
 * hq-web. hq answers 200 only for a name under its preview pattern that names an app it has recorded, or the check
 * name the relay answers itself; anything else 404, so nobody can make the front door ask for certificates for names
 * they made up. The answer says only yes or no: an app's id is 130 random bits, and its address gives nothing without
 * a ticket.
 */
import type { Application, Request, Response } from 'express'
import { PREVIEW_CERTIFICATE_ASK_PATH, PREVIEW_CHECK_ID, appIdFromHost, isAppId, parsePreviewPattern } from '@agenthix/core'

export type CertificateAskDeps = {
  /** Live apps' address pattern, or null when they are off. */
  pattern: () => string | null
  /** Whether hq has recorded an app with this id. */
  appExists: (appId: string) => Promise<boolean>
}

/** The pattern hq builds live apps' addresses by (`PREVIEW_PATTERN`, set by the host service); null when unset or not one. */
export function previewPatternFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const pattern = env.PREVIEW_PATTERN?.trim()
  return pattern && parsePreviewPattern(pattern) ? pattern : null
}

/** Whether the front door may ask for a certificate for `domain`. */
export async function certificateAllowed(domain: unknown, deps: CertificateAskDeps): Promise<boolean> {
  const pattern = deps.pattern()
  if (!pattern || typeof domain !== 'string' || domain.length > 253) return false
  const parsed = parsePreviewPattern(pattern)
  // A certificate is only ever asked for over https; a name with a port is not one the front door serves.
  if (!parsed || parsed.scheme !== 'https' || domain.includes(':')) return false
  const id = appIdFromHost(pattern, domain)
  if (id === PREVIEW_CHECK_ID) return true
  return id !== null && isAppId(id) && deps.appExists(id).catch(() => false)
}

export function certificateAskHandler(deps: CertificateAskDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const allowed = await certificateAllowed(req.query.domain, deps)
    res.setHeader('Cache-Control', 'no-store')
    res.status(allowed ? 200 : 404).type('text/plain').send(allowed ? 'yes' : 'no')
  }
}

export function registerCertificateAskRoute(app: Pick<Application, 'get'>, deps: CertificateAskDeps): void {
  app.get(PREVIEW_CERTIFICATE_ASK_PATH, certificateAskHandler(deps))
}
