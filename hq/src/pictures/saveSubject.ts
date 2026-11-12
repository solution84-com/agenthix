/**
 * Whose pictures a save changes, and whether the caller may: the same rules as each subject's own upload had. An
 * agent's, a team's and the organisation's pictures are changed by organisation admins; a person's by themselves or an
 * organisation admin, never once they are erased.
 */
import { HttpError, prisma } from 'wasp/server'
import path from 'node:path'
import type { PictureSubjectRef } from '@agenthix/core'
import { requireRole } from '../server/identity/requireRole'
import { requireMayEditProfile } from '../settings/personProfileActions'
import { getAgentImagesDir, getHqStorageRoot, getPersonImagesDir } from '../server/hqStoragePaths'
import type { PictureOwner } from './service'

type Ctx = { user?: { id: string } | null }

const KINDS = ['agent', 'person', 'team', 'org'] as const

/** The subject as the arguments name it, checked for shape only; refused with a 400 otherwise. */
export function readSubject(raw: unknown): PictureSubjectRef {
  const s = raw as { kind?: unknown; id?: unknown } | null
  if (typeof s !== 'object' || s === null || !(KINDS as readonly unknown[]).includes(s.kind)) {
    throw new HttpError(400, 'Name whose pictures to change')
  }
  if (s.kind === 'org') return { kind: 'org' }
  if (typeof s.id !== 'string' || s.id === '') throw new HttpError(400, 'Name whose pictures to change')
  return { kind: s.kind as 'agent' | 'person' | 'team', id: s.id }
}

/** Checks the caller may change this subject's pictures, and that it exists; its owner for the picture service. */
export async function authorisedOwner(subject: PictureSubjectRef, context: Ctx): Promise<PictureOwner> {
  switch (subject.kind) {
    case 'agent': {
      await requireRole(context, 'ADMIN', "Changing an agent's image")
      const agent = await prisma.agent.findUnique({ where: { id: subject.id }, select: { id: true } })
      if (!agent) throw new HttpError(404, 'Agent not found')
      return { kind: 'agent', id: agent.id }
    }
    case 'person':
      await requireMayEditProfile(context, subject.id)
      return { kind: 'person', id: subject.id }
    case 'team': {
      await requireRole(context, 'ADMIN', "Changing a team's picture or cover")
      const team = await prisma.team.findUnique({ where: { id: subject.id }, select: { id: true } })
      if (!team) throw new HttpError(404, 'Team not found')
      return { kind: 'team', id: team.id }
    }
    case 'org': {
      await requireRole(context, 'ADMIN', "Changing the organisation's picture or cover")
      const org = await prisma.org.findFirst({ select: { id: true } })
      if (!org) throw new HttpError(409, 'There is no organisation yet')
      return { kind: 'org', id: org.id }
    }
  }
}

/** Where an owner's pictures are written, and the url a row records for one of them (as the service does). */
export function imagesOf(owner: PictureOwner): { dir: string; url: (fileName: string) => string } {
  switch (owner.kind) {
    case 'agent':
      return { dir: getAgentImagesDir(owner.id), url: f => `/agents/${owner.id}/images/${f}` }
    case 'person':
      return { dir: getPersonImagesDir(owner.id), url: f => `/people/${owner.id}/images/${f}` }
    case 'team':
      return { dir: path.join(getHqStorageRoot(), 'teams', owner.id, 'images'), url: f => `/teams/${owner.id}/images/${f}` }
    case 'org':
      return { dir: path.join(getHqStorageRoot(), 'org', 'images'), url: f => `/org/images/${f}` }
  }
}
