/**
 * A certificate Agenthix Cloud gives the front door (pre-release spec B3): `frontDoor.set` with `certificate` and
 * `privateKey`, again at each renewal. The machine's firewall admits only Cloud's edge, so a certificate authority
 * could never reach it; the front door serves what it is given and never tries one. The private key is written at
 * 0600 in the host service's state folder, mounted read-only into the front door's container, and is never logged or
 * echoed in an answer.
 */
import { X509Certificate, createPrivateKey } from 'node:crypto'
import fs from 'node:fs'
import { filesOfAddress, type FilesSettings } from '../install/address'
import type { StateFolder } from '../state/folder'
import { GIVEN_FILES, type FrontDoorSettings } from './config'

export type GivenCertificate = { certificate: string; privateKey: string }

/** Why this certificate and key cannot serve `hosts` now, in words that quote none of it; null when they can. */
export function givenCertificateProblem(given: GivenCertificate, hosts: string[], now: Date): string | null {
  let certificate: X509Certificate
  try {
    certificate = new X509Certificate(given.certificate)
  } catch {
    return 'The certificate is not one the front door can read.'
  }
  let matches: boolean
  try {
    matches = certificate.checkPrivateKey(createPrivateKey(given.privateKey))
  } catch {
    return 'The private key is not one the front door can read.'
  }
  if (!matches) return 'The private key does not belong to the certificate.'
  if (now.getTime() < Date.parse(certificate.validFrom)) return 'The certificate is not valid yet.'
  if (now.getTime() >= Date.parse(certificate.validTo)) return 'The certificate has expired.'
  const wrong = hosts.find(h => !certificate.checkHost(h))
  return wrong ? `The certificate does not cover ${wrong}.` : null
}

export function writeGiven(state: StateFolder, given: GivenCertificate): void {
  state.writePrivate([...GIVEN_FILES.certificate], given.certificate)
  state.writePrivate([...GIVEN_FILES.privateKey], given.privateKey)
}

/** The certificate the front door was given and serves, which its check matches; null when it was given none. */
export function readGivenCertificate(state: StateFolder): string | null {
  if (!(state.readJson('front-door', 'settings.json') as FrontDoorSettings | null)?.given) return null
  try {
    return fs.readFileSync(state.path(...GIVEN_FILES.certificate), 'utf8')
  } catch {
    return null
  }
}

/**
 * Where files are served from at `address`: the files host Cloud gave, or none (downloads only) when it gave
 * none, kept through a new address and an install, never reset to `files.<HQ's host>` (ADR-0114); otherwise the host a
 * person chose, which `before` recorded, or the default (`filesOfAddress`).
 */
export function filesKept(state: StateFolder, address: string, before?: FilesSettings): FilesSettings {
  const given = (state.readJson('front-door', 'settings.json') as FrontDoorSettings | null)?.given
  return given ? { filesOrigin: given.filesOrigin, filesChosen: undefined } : filesOfAddress(address, before)
}
