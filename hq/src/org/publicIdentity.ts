/**
 * The organisation before sign-in (getting-in spec, Signing in): HQ is the
 * organisation's own (adr-0042), so every way in shows its identity, not ours.
 * The sign-in page reads it without a session, and shows as much as an admin
 * chose: the whole cover, the name only, or nothing. Its picture and cover are
 * already served without sign-in (`identityImages.ts`).
 *
 * An invitation and a reset link show it the same way (`readPublicOrgIdentity`);
 * the setup steps read the whole identity (`readOrgCard`).
 */
import { HttpError, prisma } from 'wasp/server'
import type { PublicOrgIdentityApi } from 'wasp/server/api'
import type { SignInShows } from '@prisma/client'
import {
  CLIENT_PROTOCOL_VERSION, type HqVersions, type OrgCard, type PublicIdentityAnswer, type PublicOrgIdentity,
  type SignInShowsChoice,
} from '@agenthix/core'
import { BUILD_INFO } from '../server/buildInfo'
import { requireRole } from '../server/identity/requireRole'
import { DEFAULT_ORG_NAME } from './ensureDefaultOrg'

/** Declared in core's client protocol, since the mobile app reads them before sign-in. */
export type { OrgCard, PublicOrgIdentity, SignInShowsChoice } from '@agenthix/core'

type OrgRow = OrgCard & { signInShows: SignInShows }

const CHOICE: Record<SignInShows, SignInShowsChoice> = { COVER: 'cover', NAME: 'name', NOTHING: 'nothing' }
const STORED: Record<SignInShowsChoice, SignInShows> = { cover: 'COVER', name: 'NAME', nothing: 'NOTHING' }

export function orgCardOf(org: OrgCard | null): OrgCard {
  if (!org) return { name: DEFAULT_ORG_NAME, handle: null, vision: '', avatarUrl: null, coverUrl: null }
  return { name: org.name, handle: org.handle, vision: org.vision, avatarUrl: org.avatarUrl, coverUrl: org.coverUrl }
}

/** Pure: the sign-in page's view of the organisation, as much as its admin chose. */
export function publicOrgIdentity(org: OrgRow | null): PublicOrgIdentity {
  const shows = CHOICE[org?.signInShows ?? 'COVER']
  const card = orgCardOf(org)
  if (shows === 'nothing') return { shows, name: null, handle: null, vision: null, avatarUrl: null, coverUrl: null }
  if (shows === 'name') return { shows, name: card.name, handle: null, vision: null, avatarUrl: null, coverUrl: null }
  return { shows, ...card }
}

const ORG_FIELDS = { name: true, handle: true, vision: true, avatarUrl: true, coverUrl: true, signInShows: true } as const

export async function readOrgCard(): Promise<OrgCard> {
  return orgCardOf(await prisma.org.findFirst({ select: ORG_FIELDS }))
}

export async function readPublicOrgIdentity(): Promise<PublicOrgIdentity> {
  return publicOrgIdentity(await prisma.org.findFirst({ select: ORG_FIELDS }))
}

/** What hq states before sign-in about itself: its release, and the client protocol it speaks (core's `client`). */
export const hqVersions = (): HqVersions => ({ release: BUILD_INFO.version, clientProtocolVersion: CLIENT_PROTOCOL_VERSION })

/** GET /api/org/public-identity — no session needed. An app reads hq's versions here before anyone signs in. */
export const publicOrgIdentityHandler: PublicOrgIdentityApi = async (_req, res) => {
  res.set('Cache-Control', 'no-store')
  const answer: PublicIdentityAnswer = { ...(await readPublicOrgIdentity()), ...hqVersions() }
  return res.json(answer)
}

export function parseSignInShows(value: unknown): SignInShowsChoice {
  if (value === 'cover' || value === 'name' || value === 'nothing') return value
  throw new HttpError(400, 'The sign-in page shows the whole cover, the name only, or nothing')
}

export const setSignInShows = async (
  args: { shows: SignInShowsChoice },
  context: { user?: { id: string } | null },
): Promise<{ shows: SignInShowsChoice }> => {
  await requireRole(context, 'ADMIN', 'Choosing what the sign-in page shows')
  const shows = parseSignInShows(args?.shows)
  const { count } = await prisma.org.updateMany({ data: { signInShows: STORED[shows] } })
  if (count === 0) throw new HttpError(409, 'There is no organisation yet')
  return { shows }
}

export const signInShowsChoice = (stored: SignInShows): SignInShowsChoice => CHOICE[stored]
