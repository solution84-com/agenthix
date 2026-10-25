/**
 * The knowledge methods' shapes (agent knowledge spec, parts 2 and 3; site protocol 1.7), split from
 * `locationFiles.ts` on the file-size rule and re-exported from it; the method names stay in
 * `LOCATION_FILE_METHODS` there. Every one is addressed by an owner, like `location.listKnowledge`, and names a page
 * by its path inside that owner's knowledge pages (`processes/release.md`), never by a level: which level an owner's
 * pages are (`website-rebuild:`, `org:`) is hq's to say, and a site knows nothing of levels.
 *
 * **One gate.** `writeKnowledge`, `editKnowledge`, `deleteKnowledge` and `restoreKnowledge` are the only ways a page
 * changes (G1–G5). Each call is one finished change. The site applies it, checks the result against T1–T4 with
 * `checkPageChange` (`core/src/knowledge/`), keeps the page it replaces as a version, and answers with a
 * `KnowledgeChangeResult`: a refusal is an answer, not a channel failure, because it carries what the caller needs
 * to try again (the problems, the current text, how many times a passage was found). A failure of containment or
 * of the call's shape is still a `LocationFileError` (`outside`, `invalid`).
 *
 * **A page's version** is the hex SHA-256 of its bytes, as `read` in `@agenthix/core/file-tools` gives it. hq
 * reads a page's bytes over the content transport and can work the version out itself; a write carries the version
 * it started from, and a page changed since is refused with its current text. An earlier version kept by the gate
 * is named by its own `id` instead, since two kept versions can hold the same text.
 *
 * **Who changed it** never crosses to the site (ADR-0042: a site holds no identity store). hq records each change in
 * its own table, with who made it (G5), and joins that record to the site's versions by page, version and id.
 *
 * Pages are at most 64 KB (T4), so a page's text crosses the control channel as JSON in a change, as a seed's
 * starter documents do; reading a page stays on the content transport (`location.readKnowledge`).
 */
import type { KnowledgePageProblem } from '../knowledge/problems.js'
import type { StorageOwnerRef } from './locationFiles.js'

export type KnowledgeChangeKind = 'created' | 'edited' | 'moved' | 'deleted' | 'restored'

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Grep's own parameters (Claude Code's Grep), over one owner's pages, under Grep's own names, so hq passes an
 * agent's call through and the site hands it to the file tools' `grep` as it is. `path` and `glob` are inside the
 * owner's pages. The guards (S1–S8) are the file tools'; the site applies them whatever arrives here.
 */
export interface KnowledgeGrepParams {
  pattern: string
  path?: string
  glob?: string
  output_mode?: 'content' | 'files_with_matches' | 'count'
  '-i'?: boolean
  '-n'?: boolean
  '-A'?: number
  '-B'?: number
  '-C'?: number
  head_limit?: number
  offset?: number
}

/**
 * One line of a search's answer from one owner's pages: in `content` mode a matching line (or, with `context`, a
 * line around one); in `files_with_matches` mode a page; in `count` mode a page and how many lines matched.
 */
export interface KnowledgeGrepHit {
  page: string
  /** 1-based, in `content` mode when line numbers were asked for. */
  line?: number
  /** The line's text, in `content` mode. */
  text?: string
  /** A line printed around a match (`-A`, `-B`, `-C`), not a match itself. */
  context?: true
  /** In `count` mode. */
  count?: number
}

/**
 * A hit as hq gives it to an agent: marked with the level it came from, so `level:page` is the page's name for
 * `read_knowledge` (D2). hq marks the site's hits; a site never sends this.
 */
export interface KnowledgeSearchHit extends KnowledgeGrepHit {
  /** `org`, `platform`, `personal`, or a project's name as its pages are named (`website-rebuild`). */
  level: string
}

export type KnowledgeGrepResult =
  | {
    outcome: 'done'
    mode: 'content' | 'files_with_matches' | 'count'
    hits: KnowledgeGrepHit[]
    /** Set when `head_limit` or the size cap cut the answer: the `offset` that continues it. */
    nextOffset?: number
  }
  /** A pattern ripgrep cannot run, a search that ran out of time, or too many searches: one of the fixed messages. */
  | { outcome: 'refused'; message: string }

// ── The itemiser ────────────────────────────────────────────────────────────

/** A folder of pages, by its path inside the owner's pages; `''` is not listed. */
export interface KnowledgeSection {
  path: string
  /** The pages directly in it. */
  pageCount: number
}

/** One page as `location.listKnowledge` lists it: its index entry from its front matter, and its problems (T1–T5). */
export interface KnowledgePageListing {
  page: string
  /** The page's title, or its file name without `.md` while it has none it can use. */
  title: string
  description: string
  tags: string[]
  /** The place's own front-matter fields, as written. */
  properties: Record<string, string | string[]>
  size: number
  /** ISO time. */
  modifiedAt: string
  version: string
  /** Empty for a page with nothing wrong. Listed under *Needs fixing* otherwise. */
  problems: KnowledgePageProblem[]
}

// ── Changes: the gate ───────────────────────────────────────────────────────

/** A whole page (G2: a write is the whole page and carries the version it started from). */
export interface LocationWriteKnowledgeParams extends StorageOwnerRef {
  page: string
  content: string
  /** The version the change started from, as a read gave it; null to make a page that is not there yet. */
  baseVersion: string | null
  /** The page this one was moved from, when this write is the first half of a move (the second deletes it). */
  movedFrom?: string
}

/** A passage replaced, under Edit's own names: found exactly once unless `replace_all`, by exact matching. */
export interface LocationEditKnowledgeParams extends StorageOwnerRef {
  page: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

/**
 * A page deleted: moved into its versions, marked deleted, and listed as recently deleted until pruned.
 * `permanently` removes at once instead, and for good: the page and all its versions, or, with `versionId`, that one
 * kept version only (a pasted password, a person's details).
 */
export interface LocationDeleteKnowledgeParams extends StorageOwnerRef {
  page: string
  /** The page it was moved to, when this delete is the second half of a move. */
  movedTo?: string
  permanently?: true
  versionId?: string
}

/** A kept version saved back as the page, through the gate, as a new version. Restores a deleted page too. */
export interface LocationRestoreKnowledgeParams extends StorageOwnerRef {
  page: string
  versionId: string
}

export type KnowledgeChangeRefusalReason =
  /** G3: the result breaks T1–T4; `problems` says how. */
  | 'problems'
  /** G2: the page changed since `baseVersion`, or a page to be made is already there; `current` is what is there. */
  | 'conflict'
  /** No such page, or no such kept version. */
  | 'not_found'
  /** G2: the passage to replace was not found exactly once; `found` says how many times it was. */
  | 'not_unique'
  /** The edit changes nothing: the passage and its replacement are the same. */
  | 'no_change'

/**
 * What a change answers. A refusal's `message` is in plain words for the person or agent, and ends saying nothing
 * was changed; a caller that meets a `reason` it does not know shows the message.
 */
export type KnowledgeChangeResult =
  | {
    outcome: 'done'
    page: string
    change: KnowledgeChangeKind
    /** The page's new version, which the next write starts from. Absent once a page is deleted. */
    version?: string
    /** The kept version holding what the page was before, for Undo and Restore. Absent when there was none. */
    previousVersionId?: string
  }
  | {
    outcome: 'refused'
    reason: KnowledgeChangeRefusalReason
    message: string
    problems?: KnowledgePageProblem[]
    current?: { content: string; version: string }
    found?: number
  }

// ── History ─────────────────────────────────────────────────────────────────

/** One page's kept versions, newest first; with no `page`, the recently deleted pages. */
export interface LocationKnowledgeVersionsParams extends StorageOwnerRef {
  page?: string
}

export interface KnowledgeVersion {
  page: string
  /** Names this kept version, for reading, restoring or deleting it. */
  id: string
  /** Its text's version, as a page's is. */
  version: string
  /** ISO time it stopped being the page. */
  savedAt: string
  size: number
  /** The change that replaced (or deleted) it. */
  change: KnowledgeChangeKind
  /** A deleted page's last version. */
  deleted: boolean
  /** ISO time pruning removes it, for a deleted page. */
  removeAfter?: string
}

export interface LocationKnowledgeVersionsResult {
  versions: KnowledgeVersion[]
  /** The listing stopped at its bound. */
  truncated: boolean
}
