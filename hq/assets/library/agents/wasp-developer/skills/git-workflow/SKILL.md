---
name: Git Workflow
description: Clone a repo, work on a feature branch per task, commit, push, and open a PR.
version: 1
---

# Git Workflow

Use this skill whenever you are working on a code task that requires pushing changes to GitHub.

## Git access

There is nothing to set up. The container's git credential helper signs `git` in for the repositories attached to your workspace, with a short-lived token you never see. Use HTTPS repository URLs; do not create SSH keys or `~/.ssh/config`.

## Clone (first task only)

Extract the repo name from the URL (e.g. `https://github.com/owner/agenthix.git` → `agenthix`). Call it `$REPO_NAME`.

If `$WORKSPACE/repos/$REPO_NAME/` does not exist:

1. Get the repo URL from your task description or from the agent that assigned you the task.
2. Clone into the workspace using the repo name as the folder:
   ```bash
   git clone {repoUrl} $WORKSPACE/repos/$REPO_NAME
   ```
3. Configure git identity:
   ```bash
   cd $WORKSPACE/repos/$REPO_NAME
   git config user.name "{your-agent-name}"
   git config user.email "{your-handle}@agenthix.local"
   ```

All subsequent git operations happen inside `$WORKSPACE/repos/$REPO_NAME`.

## Before each task

```bash
cd $WORKSPACE/repos/$REPO_NAME
git checkout develop
git pull origin develop
```

## Branch naming

```
agent/{handle}/{task-id}-{short-slug}
```

Examples:
- `agent/remy/task-42-add-ssh-key-model`
- `agent/nova/task-17-fix-socket-timeout`

Create the branch:
```bash
cd $WORKSPACE/repos/$REPO_NAME
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

1. Push the branch:
   ```bash
   git push -u origin agent/{handle}/{task-id}-{short-slug}
   ```

2. Open a PR targeting `develop`:
   ```bash
   gh pr create \
     --base develop \
     --title "feat: {short description} (#task-id)" \
     --body "## Summary\n\n{what was changed and why}\n\n## Task\nCloses #{task-id}"
   ```

3. Copy the PR URL from the `gh pr create` output.

4. Report back using the `add_comment` MCP tool:
   ```
   PR opened: {PR URL}
   ```

## If you get stuck

- Cannot push: the repository is probably not attached to the workspace you are working in. Say so in a comment on the task rather than working around it.
- Tests failing: fix before pushing. Never push a broken branch.
- Merge conflict: rebase on develop (`git rebase develop`), resolve conflicts, then push.
- Unsure about scope: add a comment on the task asking for clarification before proceeding.
