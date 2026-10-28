---
name: working-with-git
description: How to work in a git repository here — branch, commit, and share your work through the place's approved push, pull and open-pull-request workflows, never a plain git push. Use whenever you change files in a workspace that is a git repository, or are asked to push, pull, open a pull request, or set up a deploy.
---

# Working with git

You are working in a git repository. Follow these steps for every change you make in it.

## What you can and can't do

- **You use `git` locally, as always:** status, branch, add, commit, log, diff, merge, rebase.
- **You hold no GitHub token.** A plain `git push`, `git fetch` or `git pull` against GitHub fails, with a message
  naming the `push` workflow. Don't look for a token or a way around this. There is none, and a person reviewing
  your run will see the attempt.
- **Anything that reaches GitHub is a workflow** a person of this place approved: `push`, `pull` and
  `open-pull-request`. You run them with `run_workflow`. Each run gets its own short-lived token. You see the result,
  never the token.
- **A person merges.** You push a branch of your own and open a pull request. The workflows refuse to push to a
  protected branch, such as `main`.

## 1. Before you change anything

1. Run `git status`. If there are changes you did not make, ask before touching them.
2. Find the **base branch**: the branch the task or the person names. If none is named, use the repository's default
   branch: `git symbolic-ref --short refs/remotes/origin/HEAD` prints it as `origin/<name>`. If that prints nothing,
   run `git branch -a` and ask which branch to start from.
3. If `git config user.name` prints nothing, set an identity for this repository:
   `git config user.name "<your name>"` and `git config user.email "<your handle>@agents.invalid"`.
4. Call `list_workflows`. Check that `push`, `pull` and `open-pull-request` are there, approved and on. If one is
   missing, waiting or off, tell the person which one, and ask someone who administers this place to approve it or
   switch it on. Then do the local work only.
5. Bring the base branch up to date: run `run_workflow` with `name: pull` and `parameters: { branch: "<base>" }`.

## 2. Make a branch

```bash
git checkout <base>
git checkout -b <branch>
```

Name the branch after the work, short and lowercase: `fix-login-timeout`, or `task-42-fix-login-timeout` when you
work on a task. A branch name uses only letters, digits, `.`, `_`, `/` and `-`, does not start with `-`, and is at
most 100 characters. Never work directly on the base branch.

## 3. Commit as you go

- Commit after each piece of work that stands on its own, not only at the end.
- Write messages that say what changed and why. Run `git log --oneline -10` first and follow the style you see there
  (for example `fix: retry the socket on reconnect`).
- Never commit secrets, tokens or passwords. Put them in the place's secrets and refer to them by name.

## 4. Share your work

1. Run the project's tests. Don't share a branch whose tests fail.
2. Push: `run_workflow` with `name: push` and `parameters: { branch: "<branch>" }`.
3. Open a pull request: `run_workflow` with `name: open-pull-request` and
   `parameters: { branch: "<branch>", base: "<base>", title: "<one line>", body: "<what changed and why>" }`.
   Any text is safe in the title and body.
4. Copy the pull request's address from the run's output and give it to the person, or in a comment on the task.
   Always open a pull request after pushing: a branch with no pull request is in no one's review queue.

## When something goes wrong

- **The push is rejected:** the branch moved on GitHub. Run `pull` for your branch, merge locally, test, and push
  again. `push` never forces.
- **The base branch moved on:** run `pull` for the base branch, then `git merge <base>` on your branch, resolve any
  conflicts, test, and push. Once a branch is pushed, merge rather than rebase it, because a rebased branch can't be
  pushed without forcing.
- **A workflow run fails:** read the failed step's output in the answer. If it names something only a person can
  fix, such as a workflow that is off or a protected branch, tell the person what it says.
- **The repository is not connected to GitHub** (`list_workflows` shows none of the three): commit locally and tell
  the person that the workspace needs connecting before the work can be shared.

## Anything else on GitHub, and deploys

There is no other GitHub access. To do something these three workflows don't, such as deploying or reading a GitHub
Actions run, write a workflow of your own and propose it with `propose_workflow`; a person approves it before it
can run. Read `writing-workflows.md` in this skill's folder first: it gives the format and the deploy steps.

## Where to read more

For what these things are, search the guide with `search_knowledge` (scope `platform`) and read pages with
`read_knowledge`:

- `platform:workflows/workflows.md`: what a workflow is, and how a person approves one.
- `platform:workflows/connect-github.md`: connecting a workspace, the starter workflows, protected branches.
- `platform:workflows/secrets-and-variables.md`: secrets, and setting one on GitHub.
