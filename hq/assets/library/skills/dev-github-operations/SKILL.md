---
name: GitHub Operations
description: Work with GitHub from inside a run — commit locally, then push, pull and open pull requests through the place's approved workflows, and author GitHub Actions workflows whose secrets a person sets. Use whenever the task involves a connected repository.
version: 2
---

# GitHub Operations

How to do GitHub work from an agent run: commit code, share it on a branch, open a pull request for review, and
author operations (deploy, backup, migrate) as GitHub Actions workflows.

## The model — what you do, and what you can't

- **You commit locally**, with `git`, in your workspace, as always: branch, add, commit, log, diff, rebase.
- **Your container holds no GitHub token**, and there is no credential helper. A plain `git push` or `git fetch`
  against GitHub fails, with a message naming the `push` workflow. Don't look for a token, and don't try to make one
  work: there is none to find.
- **Anything that needs GitHub runs as a workflow** a person of the place approved: `push`, `pull`,
  `open-pull-request` and `set-github-secrets`. HQ proposes them when a repository is connected. Each run gets a token
  of its own, for this workspace's repository only, with only the permissions that workflow declares, and it ends
  when the run does. You see the run's result and its output, never the token.
- **A person approves what reaches production.** Push to a feature branch, open a pull request, and a person merges
  it. The workflows refuse a protected branch, such as `main`, as the branch they write to.

## When to Use

- The task involves a repository connected to your workspace (there is a `.git` there).
- You're asked to share work, open a pull request, bring in changes from GitHub, or set up a deploy.

## Find the workflows

Call `list_workflows`. It shows each workflow of the place, whether it is on, its approved version's parameters and
any version waiting for a person. If `push`, `pull` or `open-pull-request` is missing, waiting or off, say so and ask
a person who administers the place to approve or turn it on; don't work around it.

## Commit, then push

```bash
git checkout -b <descriptive-branch>
git add -A
git commit -m "<what changed and why>"
```

Then run the `push` workflow with `run_workflow`: `name: push`, `parameters: { branch: "<descriptive-branch>" }`.
It bundles the branch from your workspace and pushes the bundle from a clean repository. It never forces a push, so a
rejected push means the branch moved on GitHub: run `pull` for that branch, rebase or merge locally, and push again.

## Bring in changes from GitHub

Run `pull` with `parameters: { branch: "<branch>" }`. It fetches the branch into a clean repository and brings it into
your workspace fast-forward only. If your branch has diverged, it refuses; resolve it locally.

## Open a pull request

After `push`, run `open-pull-request` with `parameters: { branch: "<your-branch>", base: "main", title: "...",
body: "..." }`. The title and body are passed as files, so any text is safe in them. Surface the pull request's
address from the run's output so a person can review it. **Always open a pull request after pushing a feature
branch**: a branch with no pull request is in no review queue.

## Anything else on GitHub

There is no general GitHub access. For something the four workflows don't do — reading a workflow run's logs,
labelling an issue — write a workflow of your own (`workflow.yaml` and its scripts) that declares exactly the GitHub
permissions it needs under `github:`, and propose it with `propose_workflow`. A person reviews and approves it before
it can run. In it, git with `GITHUB_TOKEN` runs only in a new repository under `/tmp`, never your workspace's, and
`gh` is given `--repo "$GITHUB_REPOSITORY"` and run from `/tmp`.

## Writing a workflow

Put each workflow in a folder of its own in your workspace, such as `.workflows/<name>/workflow.yaml`, with any
scripts it runs beside it. Propose it with `propose_workflow`: `path` is the file's path from the workspace's root, and
`workspace` is the workspace's name, such as `demo`. A person reviews and approves every version before it can run.

```yaml
name: check-token
description: Prints the start of DEMO_TOKEN, then checks that GitHub answers.
hosts: [api.github.com:443]      # the only places the steps can reach; none means no network
timeout: 5m                       # the whole run: 90s, 10m, 1h30m; at most 6h
parameters:                       # values given when it is run
  - name: branch
    pattern: '^[A-Za-z0-9_][A-Za-z0-9._/-]{0,99}$'
variables: [STAGING_HOST]         # the place's variables, as environment variables in every step
steps:
  - name: Show the token's start
    secrets: [DEMO_TOKEN]         # only this step gets it
    run: head -c 3 /run/secrets/DEMO_TOKEN
  - name: Ask GitHub for a zen line
    run: curl -fsS https://api.github.com/zen
```

- **A secret is a file, never an environment variable.** A step gets only the secrets it lists under `secrets:`,
  each as `/run/secrets/<NAME>`. A step that lists none gets none.
- **A parameter's value is the file `/run/params/<name>`.** Pass it as a file argument, or as one quoted argument,
  `"$(cat /run/params/<name>)"`, never pasted into a command. A parameter is `pattern:` (the whole value must match),
  `values:` (one of a list) or `text: true` (free text, such as a commit message).
- **Hand files to the next step** by writing them under `/run/out`.
- **For GitHub**, list `GITHUB_TOKEN` under the step's `secrets:` and the permissions it needs under `github:`, such
  as `contents: read` or `pull_requests: write`; the run's token gets only those, for this workspace's repository.
- **A script** in the workflow's folder is run as `./script.sh`; list any other file the steps read under `files:`.
- **A field HQ doesn't know is refused**, and the answer names the fields it does. The other fields are `name`,
  `description`, `steps` (each with `name`, `run`, `secrets`, `timeout`), `variables`, `parameters`, `hosts`,
  `github`, `timeout` and `files`.
- **Anything a step prints from a secret is masked** before you or a person sees it.

## Author an operation (deploy / backup / migrate)

Operations run as **GitHub Actions workflows** in the repository, never as commands you run against production.

1. **Author the files** in the repository: the app (a `Dockerfile` and `compose.yml`, say) and
   `.github/workflows/<name>.yml`.
2. **Reference secrets by name, never by value:** `${{ secrets.VPS_SSH_KEY }}`, in a job with
   `environment: production`. Secrets reach GitHub only as **secrets of the `production` environment**, whose
   deployment branches are protected branches only, so they reach a job only on a branch that changes through a
   reviewed pull request, never on your feature branch or a pull request's run.
3. **Ask for the secret:** tell the person which secret the workflow needs, what it is for and the narrowest
   credential that would do. A person who administers the place adds it on *Secrets and variables* and ticks
   *Also set it on GitHub*, then approves the `set-github-secrets` version that follows. You never set or see a value.
4. **Trigger on the protected branch:** `push: branches: [main]` (deploy on merge), and `workflow_dispatch` for a
   manual re-run:
   ```yaml
   on:
     workflow_dispatch:
     push:
       branches: [main]
   jobs:
     deploy:
       environment: production
   ```
5. **Push a feature branch, open a pull request.** A person merges; the merge deploys.

## Don'ts

- **Don't `git push` or `git fetch` against GitHub** — run `push` or `pull`.
- **Don't look for a token**, a credential helper or a way around the workflows; there is none, and trying is the
  kind of thing a person reviewing your run will see.
- **Don't target a protected branch** — feature branch and pull request, always.
- **Don't put secret values in files** — reference `${{ secrets.NAME }}` and ask a person to set it.
- **Don't use repository secrets** for anything a pushed branch shouldn't reach; environment secrets on protected
  branches are what HQ sets.
