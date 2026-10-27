# Part 4 · Git in plain view

The agent does git; the person watches. Every read is of a workspace's own repository on its site, with or without a
remote: git is not GitHub. Boards: *6 · Git in plain view*, *G1*, *G2*.

## What the site reads

| Read | Returns | Crosses as | Phase |
|---|---|---|---|
| **Status** | Branch (or detached at a commit), clean or the count of changed files, the last commit (short id, first line, author, when), and whether a merge or rebase is in progress | A typed request on the control channel, read when a workspace or the Files tool opens and again on focus (R6) | MVP |
| **Changed files** | Each changed path with its mark: `M`, `A`, `D`, `R`, `??`, capped at 1,000 | The same request, asked with `files: true` | Stretch |
| **Diff** | One file's change against the last commit, or between two commits | Bytes through the relay, on a ticket naming the file and two versions; the `diff` renderer; 1 MB | Stretch |
| **Log and branches** | The last 50 commits, paged; local branches; ahead and behind the remote branch as last fetched | Typed request | Stretch |

- **Read only, always.** Nothing checks out, commits, fetches or pushes. Any git that needs a credential goes through a
  workflow; reading local state needs none.
- **No fetch for ahead and behind**: it compares with the remote branch as last fetched, and says when.
- **How:** `git` with fixed arguments and a time limit, never a shell, as `site/src/storage/repoOps.ts` already runs it;
  `GIT_OPTIONAL_LOCKS=0` so a read never blocks an agent's write; hooks, `fsmonitor` and external diff tools switched
  off for these reads, so a repository's own config runs nothing.
- **Where:** a workspace is one repository; the Files tool reads `files/` as one if it is one.

## Status at a glance (G1, MVP)

One line above a workspace's files, and in the Files tool when `files/` is a repository, beside the GitHub backup line
(`BackupLine.tsx`), which keeps its job, the remote.

| State | The line |
|---|---|
| Clean | ⎇ main · ✓ No changes · Last commit `a41f2c9` "Add Q3 chart page" by Kernel, 12 min ago |
| Changed | ⎇ main · ● 3 changed · Last commit … |
| No commits yet | ⎇ main · ● 12 new files · No commits yet |
| Mid-merge or rebase | ⎇ main · ⚠ Merge in progress · … |
| Not a repository | No git line |
| Site not answering | The folder's own message; the git line hides |

## Changed files, diffs and the log (G2, stretch)

In this order, each droppable: markers and a **Changed** tab (G1's count opens it); a changed file opens on
**Changes**, the diff against the last commit, with **File** for the whole file; then the log — the last 50 commits,
**More**, a commit opening its changed files, a branch menu to *look at* a branch's log, never to check out.
