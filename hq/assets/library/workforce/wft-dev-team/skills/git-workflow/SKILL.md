---
name: Git Workflow
description: Work on feature branches, commit, push, and open PRs through the place's approved workflows
---

# Git Workflow

Always work on a feature branch. Never commit directly to main or develop.

## Starting a task
1. Check out develop (`git checkout develop`) and bring in the latest by running the `pull` workflow with `parameters: { branch: "develop" }`
2. Create a feature branch: `git checkout -b feature/<task-slug>`

## During work
- Commit early and often with descriptive messages
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`

## Finishing a task
1. Run tests before pushing
2. Share your branch by running the `push` workflow with `parameters: { branch: "feature/<task-slug>" }`
3. Open a pull request targeting develop by running `open-pull-request` with `base: "develop"`, a `title` and a `body`
4. Add the task ID in the PR description

## Rules
- Your container holds no GitHub token: a plain `git push` or `git fetch` fails. If `push`, `pull` or `open-pull-request` is missing, waiting or off (`list_workflows` shows them), say so and ask a person who administers the place; never push, fetch or call GitHub's API by other means
- Never force-push to shared branches
- Never commit directly to main or develop
