---
name: GitHub Operations
description: Work with GitHub from inside a run — branch and push, open pull requests, and author deploy workflows. Use whenever the task involves a connected repo.
---

# GitHub Operations

How to do real GitHub work from an agent run: commit and push code, open a pull request for review, and author operations (deploy/backup/migrate) as GitHub Actions workflows.

## The model — what you do vs what the platform does

- **You run `git` directly** in your workspace (the data plane). Cloning, branching, committing, pushing all work normally — the platform injects a short-lived, repo-scoped token for each git operation automatically. You never see, store, or manage that token.
- **The platform holds the GitHub credentials** (the control plane). You never handle secret *values* — when a workflow needs one, the operator sets it; you only reference it by name.
- **A human approves what reaches production.** You push to a **feature branch** and open a **PR**; a human merges it. Never push to `main` directly.

## When to Use

- The task involves a repo connected to your workspace (you can see a `.git` there).
- You're asked to commit/push work, open a PR, or set up a deploy/operation.

## Commit & push

Work on a feature branch, never `main`:

```bash
git checkout -b <descriptive-branch>
git add -A
git commit -m "<what changed and why>"
git push -u origin <descriptive-branch>
```

That's it — auth is handled for you. If a push is rejected as non-fast-forward, the branch diverged; fetch and rebase, don't force-push shared branches.

## Open a pull request

**A pull request is NOT a git feature — it's a GitHub API call.** There is no `git` command for it, and `gh` is not installed in your container. Use `curl` against the GitHub API. Your repo token (the same one git uses) can open PRs.

Fetch the token from the credential helper, then POST to the API:

```bash
OWNER=<owner>; REPO=<repo>; BRANCH=<your-branch>
TOKEN=$(printf 'host=github.com\npath=%s/%s\n' "$OWNER" "$REPO" | agenthix-git-credential get | sed -n 's/^password=//p')
curl -fsS -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls" \
  -d "$(printf '{"title":"%s","head":"%s","base":"main","body":"%s"}' "Your title" "$BRANCH" "What this changes and why")"
```

The response includes `"html_url"` — surface it so the human can review. **Always open a PR after pushing a feature branch** — a branch with no PR is invisible (no review queue, no notification).

The same token works for other GitHub API reads/writes you may need (e.g. checking a workflow run) — it carries `contents`, `actions`, `secrets`, `workflows`, and `pull_requests`.

## Author an operation (deploy / backup / migrate)

Operations run as **GitHub Actions workflows** — never as commands you run against production yourself.

1. **Author the files** in the repo: the app (e.g. a `Dockerfile` + `compose.yml`) and `.github/workflows/<name>.yml`.
2. **Reference secrets by name, never value:** `${{ secrets.VPS_SSH_KEY }}`. The operator enters the actual values in the **Operations panel** (they relay to GitHub Secrets — the platform stores none, and you never see them).
3. **Trigger:** support both `workflow_dispatch` (manual re-run/rollback) and `push: branches: [main]` (deploy-on-merge), so merging the PR deploys:
   ```yaml
   on:
     workflow_dispatch:
     push:
       branches: [main]
   ```
4. **Push on a feature branch → open a PR.** The human merges; the merge triggers the deploy. The operator can also re-run manually from the Operations panel.

This keeps production human-gated: you can author and push freely, but nothing deploys until a human merges.

## Don'ts

- **Don't use `gh`** — it isn't installed. Use `git` for git, `curl` for the GitHub API.
- **Don't print, store, or embed tokens** — fetch from the helper at point of use; never write a token to a file or echo it.
- **Don't push to `main`** — feature branch + PR, always.
- **Don't put secret values in files** — reference `${{ secrets.NAME }}`; the operator supplies values.
