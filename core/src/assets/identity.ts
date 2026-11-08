/**
 * Who an asset is (adr-0157, spec part 2 *Identity*): `publisher/name`, for every Library asset. Every part follows
 * the Agent Skills name rule: 1–64 lowercase letters, digits and hyphens, never starting or ending with a hyphen nor
 * holding two together. A template's role skill is named under its template, `<publisher>/<template>/<skill>`, so its
 * `name` is `<template>/<skill>`.
 *
 * The publisher is the verified signer as the organisation recorded it, never a manifest's claim; that rule is hq's
 * to enforce. Core only says which publisher names are reserved.
 */

/**
 * `task-template` holds task types with their columns and custom fields with their options (adr-0174, ./tasks). There
 * is no board kind: a board is a saved view and is not shared (adr-0176).
 */
export const ASSET_KINDS = ['skill', 'agent', 'team', 'task-template'] as const
export type AssetKind = (typeof ASSET_KINDS)[number]

export type AssetIdentity = { publisher: string; name: string }

export const ASSET_NAME_MAX_LENGTH = 64

/** An unsigned package or folder is installed under this publisher, and never matches a signed asset. */
export const UNSIGNED_PUBLISHER = 'unsigned'
/** Agenthix's own release identity: only its exact signature may publish under it. */
export const AGENTHIX_PUBLISHER = 'agenthix'
export const RESERVED_PUBLISHERS: readonly string[] = [UNSIGNED_PUBLISHER, AGENTHIX_PUBLISHER]

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isAssetKind(value: unknown): value is AssetKind {
  return typeof value === 'string' && (ASSET_KINDS as readonly string[]).includes(value)
}

/** One part of an identity: a publisher, an asset's name, or a template or skill part of a role skill's name. */
export function isAssetName(value: unknown): value is string {
  return typeof value === 'string' && value.length <= ASSET_NAME_MAX_LENGTH && NAME.test(value)
}

export function isReservedPublisher(publisher: string): boolean {
  return RESERVED_PUBLISHERS.includes(publisher)
}

/** A template's role skill's name, `<template>/<skill>`; null when either part is not a valid name. */
export function roleSkillName(template: string, skill: string): string | null {
  return isAssetName(template) && isAssetName(skill) ? `${template}/${skill}` : null
}

/** `publisher/name` or `publisher/template/skill`, from untrusted text; null when it is neither. */
export function parseAssetIdentity(text: unknown): AssetIdentity | null {
  if (typeof text !== 'string') return null
  const parts = text.split('/')
  if (parts.length < 2 || parts.length > 3 || !parts.every(isAssetName)) return null
  const [publisher, ...name] = parts
  return { publisher, name: name.join('/') }
}

export function formatAssetIdentity(identity: AssetIdentity): string {
  return `${identity.publisher}/${identity.name}`
}
