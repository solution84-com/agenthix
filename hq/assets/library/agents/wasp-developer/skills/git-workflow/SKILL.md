---
name: Git Workflow
description: Work on a feature branch per task, commit, push, and open a PR through the place's approved workflows.
version: 2
---

# Git Workflow

Use this skill whenever you are working on a code task that requires pushing changes to GitHub.

## Git access

You commit locally with `git`. Your container holds no GitHub token, and a plain `git push` or `git fetch` against GitHub fails with a message naming the `push` workflow. Pushing, pulling and opening a pull request are approved workflows you run with `run_workflow`: `push` (`branch`), `pull` (`branch`) and `open-pull-request` (`branch`, `base`, `title`, `body`). `list_workflows` shows what the place has. If one is missing, waiting or off, say so and ask a person who administers the place; never push, fetch or call GitHub's API by other means, and never look for or ask for a token. Do not create SSH keys or `~/.ssh/config`.

## The repository

A workspace connected to GitHub is the repository itself, already checked out; there is nothing to clone. Work at the workspace's root. Set the git identity if it is not set:

```bash
git config user.name "{your-agent-name}"
git config user.email "{your-handle}@agenthix.local"
```

## Before each task

```bash
git checkout develop
```

Then run the `pull` workflow with `parameters: { branch: "develop" }` to bring in what is new on GitHub.

## Branch naming

```
agent/{handle}/{task-id}-{short-slug}
```

Examples:
- `agent/remy/task-42-add-ssh-key-model`
- `agent/nova/task-17-fix-socket-timeout`

Create the branch:
```bash
git checkout -b agent/{handle}/{task-id}-{short-slug}
```

## Commit messages

Reference the task ID. Use conventional commits:
```
feat: add AgentSshKey Prisma model (#42)
fix: resolve socket timeout on reconnect (#17)
```

Commit frequently — after each logical unit of work, not just at the end.

## When work is complete

1. Push the branch by running the `push` workflow: `name: push`, `parameters: { branch: "agent/{handle}/{task-id}-{short-slug}" }`.

2. Open a PR targeting `develop` by running `open-pull-request`: `parameters: { branch: "agent/{handle}/{task-id}-{short-slug}", base: "develop", title: "feat: {short description} (#task-id)", body: "## Summary\n\n{what was changed and why}\n\n## Task\nCloses #{task-id}" }`.

3. Copy the PR URL from the run's output.

4. Report back using the `add_comment` MCP tool:
   ```
   PR opened: {PR URL}
   ```

## If you get stuck

- Cannot push: `push` is probably missing, waiting or off, or the repository is not connected to the workspace you are working in. Say so in a comment on the task and ask a person who administers the place; do not work around it.
- Tests failing: fix before pushing. Never push a broken branch.
- Merge conflict: rebase on develop (`git rebase develop`), resolve conflicts, then run `push` again.
- Unsure about scope: add a comment on the task asking for clarification before proceeding.
