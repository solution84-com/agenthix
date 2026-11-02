/**
 * What the workspace view reads and sends for code work on branches (spec parts 1–3). Shared by the client and the
 * server; no server code here. The operations are in `operations.ts`.
 */
import type { BranchFileChange, GitCommitLine, GitTreeEntry, MainVersion, MergeClash } from '@agenthix/core'

/** Whose work a branch is, as the branch select's line says it. */
export type BranchWhose =
  | { kind: 'task'; taskId: string; taskKey: string | null; title: string; personId: string | null; personName: string | null }
  | { kind: 'conversation'; conversationId: string; title: string; personId: string | null; personName: string | null }

export type BranchLineView = {
  id: string
  name: string
  whose: BranchWhose
  /** The agent the branch's work belongs to (the task's, or the conversation's), working now or not. */
  agentName: string | null
  /** The agent working on it right now, by name, or null when none is. */
  working: { agentName: string } | null
  ahead: number
  behind: number
  lastCommitAt: string | null
  /** Phase 2 fills this; null until live previews exist. */
  livePreview: null
}

export type WorkspaceBranchesView =
  | { git: false; canAct: boolean }
  | {
      git: true
      canAct: boolean
      main: { name: string; head: string; versionCount: number }
      branches: BranchLineView[]
    }

/** `ref` names `main` or one of the workspace's branches by its id. */
export type BranchRef = { kind: 'main' } | { kind: 'branch'; branchId: string }

/** `baseVersion`: the version of main the changes are compared with, by number; null when it is none of main's. */
export type BranchChangesView = { base: string; head: string; files: BranchFileChange[]; overflow: boolean; baseVersion: number | null }
export type BranchCommitsView = { commits: GitCommitLine[]; overflow: boolean }
export type MainVersionsView = { versions: MainVersion[]; hasMore: boolean }
export type GitTreeView = { exists: boolean; entries: GitTreeEntry[]; overflow: boolean }
export type GitFileView =
  | { exists: false }
  | { exists: true; binary: true; bytes: number }
  | { exists: true; binary: false; tooLarge: boolean; bytes: number; text: string | null }

/** `expectedMain`: the head of `main` the dialog showed, so a stale dialog cannot make an unexpected version. */
export type MergeBranchInput = { branchId: string; message: string; expectedMain: string }
export type MergeBranchResult =
  /** `github`: for a workspace connected to GitHub, whether `main` was pushed after; null when it is not connected. */
  | { outcome: 'merged'; versionNumber: number; branchClosed: boolean; github?: 'pushed' | 'remote_ahead' | 'not_pushed' | null }
  | { outcome: 'clash'; clashes: MergeClash[]; agentAsked: boolean }
  | { outcome: 'nothing_to_merge' }
  | { outcome: 'main_moved' }

export type RestoreVersionInput = { workspaceId: string; versionCommit: string; expectedMain: string }
export type RestoreVersionResult =
  | { outcome: 'restored'; versionNumber: number; github?: 'pushed' | 'remote_ahead' | 'not_pushed' | null }
  | { outcome: 'same_files' }
  | { outcome: 'main_moved' }

/** What removing a workspace stops and removes (live preview spec, *Defaults for review* 5). */
export type WorkspaceRemovalBranch = {
  id: string
  name: string
  whose: BranchWhose
  ahead: number
  /** The agent working on it, which stops; null when none is. */
  working: { agentName: string } | null
}
export type WorkspaceRemovalView = { git: boolean; branches: WorkspaceRemovalBranch[] }
