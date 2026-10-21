---
name: Git Workflow
description: Work on feature branches, commit, push, and open PRs
---

# Git Workflow

Always work on a feature branch. Never commit directly to main or develop.

## Starting a task
1. Pull the latest from develop: `git checkout develop && git pull`
2. Create a feature branch: `git checkout -b feature/<task-slug>`

## During work
- Commit early and often with descriptive messages
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`

## Finishing a task
1. Run tests before pushing
2. Push your branch: `git push -u origin feature/<task-slug>`
3. Open a pull request targeting develop
4. Add the task ID in the PR description

## Rules
- Never force-push to shared branches
- Never commit directly to main or develop
