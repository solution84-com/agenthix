/**
 * Allow and ban lists (part 4): which models may run. The organisation, each agent, each project and each person may
 * hold one, and every list that applies narrows the set: a ban beats an allow, and no list widens it. A list is in one
 * of two modes:
 * - `every`: every model may run except its `never` entries;
 * - `only_these`: only its `allow` entries may run, and its `never` entries still carve exceptions out of them.
 *
 * An entry is a model (`anthropic/claude-sonnet-5`) or a pattern with `*` for a maker (`deepseek/*`) or a family
 * (`*-pro`, `anthropic/claude-*`). Patterns match a model's maker and name, never its provider, so a list keeps up with
 * new models without naming who serves them. A personal project has no list of its own: its person's applies.
 *
 * The values are spelled as hq stores them (its `ModelList` tables' enums).
 */

export const MODEL_LIST_OWNERS = ['organisation', 'agent', 'project', 'person'] as const
export type ModelListOwner = (typeof MODEL_LIST_OWNERS)[number]

export const MODEL_LIST_MODES = ['every', 'only_these'] as const
export type ModelListMode = (typeof MODEL_LIST_MODES)[number]

export const MODEL_LIST_EFFECTS = ['allow', 'never'] as const
export type ModelListEffect = (typeof MODEL_LIST_EFFECTS)[number]

export const MODEL_LIST_PATTERN_MAX = 200

export type ModelListEntry = { effect: ModelListEffect; pattern: string }

export type ModelListView = { owner: ModelListOwner; ownerId: string; mode: ModelListMode; entries: ModelListEntry[] }
