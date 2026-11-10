/**
 * "About this file" (site protocol 1.8), on the control channel: what hq asks a site before it opens a file, so it can
 * choose the kind (`chooseFileKind`) and sign a ticket at the file's version. No content crosses hq: only the facts,
 * and whether the first bytes (up to `TEXT_SNIFF_BYTES`, judged by `looksLikeText`) look like text.
 *
 * The params name a file in one of the three spaces a site serves (`SiteFileRef`). The site confines it to its
 * owner's storage as every read is, symbolic links resolved, and answers a path that leads out of it as `not-found`,
 * without saying which. A file with more than one hard link is refused as `linked` (site protocol 1.17; an older hq
 * reads any refusal as not found). Since 1.18, a place's file may name a `commit` of a workspace with Git: the site reads
 * that commit's file from the workspace's own repository, and its `version` is the file's blob id. A link, a
 * submodule or a folder in the tree is `not-found`. A refusal is an answer, not a channel failure; params of the wrong shape are a
 * `LocationFileError` (`invalid`).
 */
import type { SiteFileRef } from '../files/refs.js'

export const FILE_ABOUT_METHOD = 'file.about'

export type FileAboutParams = SiteFileRef

export const FILE_ABOUT_REFUSALS = ['not-found', 'not-a-file', 'linked'] as const
export type FileAboutRefusal = (typeof FILE_ABOUT_REFUSALS)[number]

export type FileAboutResult =
  | {
    ok: true
    /** The file's own name, as a person sees it. */
    name: string
    size: number
    /** ISO, as on a stat. */
    modifiedAt: string
    /** `fileVersion(size, modifiedAt)`: what a ticket carries, and what the site checks when it serves one. */
    version: string
    /** `contentTypeForName`'s guess from the name. */
    contentType: string
    looksLikeText: boolean
  }
  | { ok: false; refusal: FileAboutRefusal }
