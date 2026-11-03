/**
 * A run on a code workspace (site protocol 1.12, live preview spec *Which work is code work* and *What agents are
 * told*): what hq's dispatch adds when the run's workspace is a Git repository. Its working folder is its branch's
 * copy, the workspace's own folder is bound read-only, and its prompt says where its branch stands. Absent for every
 * other run, and from an hq before 1.12.
 */
import type { BranchCopyRef, GitPerson } from './branchWork.js'

/** Another branch of the same workspace, so the agent can see what others are already changing. */
export type RunOtherBranch = {
  name: string
  /** Whose work it is, as a person reads it: *Ada · Login form*. */
  whose: string
  ahead: number
  /** The agent working on it now, by name; null when none is. */
  agentWorking: string | null
}

export type RunCodeWork = BranchCopyRef & {
  /** The name of the workspace's `main`. */
  main: string
  /** How many commits `main` has that the branch lacks. Bringing them in is the agent's call. */
  behindMain: number
  otherBranches: RunOtherBranch[]
  /**
   * Who the commit the site makes at the run's end (*Work in progress*) names: the run's agent as its author, and the
   * person the work is for in an `On-behalf-of:` line, as hq names them in `branch.commit`. Added inside 1.12.
   */
  author: GitPerson
  onBehalfOf: GitPerson | null
  /**
   * Set when the branch has a live preview on another site and the run works there, in the live preview's own copy
   * (copy kind `bundle`; `copyId` is that copy's). The site finds the copy by its live-preview record, not its branch
   * copies, and reports commits with `livePreview.branchMoved` instead of bringing them back itself. Added inside 1.12.
   */
  livePreviewId?: string
  /**
   * The branch's live preview when the run was dispatched, so its prompt says whether one is open and which apps run in
   * it: present only while one is starting, running or paused on the site the run goes to; absent otherwise. A snapshot
   * for the prompt only; the app tools find the live preview again at each call. Since 1.12.
   */
  openLivePreview?: RunOpenLivePreview
}

export type RunOpenLivePreview = {
  /** Paused by the guard or a lost line: the app tools answer only once a person resumes it. */
  paused: boolean
  /** The apps running in it, by name. */
  runningApps: string[]
}
