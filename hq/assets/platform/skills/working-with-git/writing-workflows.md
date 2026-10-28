# Writing a workflow, and deploying

Read this when the starter workflows (`push`, `pull`, `open-pull-request`) don't do what you need.

## A workflow of your own

Put each workflow in a folder of its own in your workspace, such as `.workflows/<name>/workflow.yaml`, with any
scripts it runs beside it. Propose it with `propose_workflow`: `path` is the file's path from the workspace's root,
and `workspace` is the workspace's name, such as `demo`. A person reviews and approves every version before it can
run, and any change is a new version to approve.

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
  as `contents: read` or `pull_requests: write`. The run's token gets only those, for this workspace's repository.
  Use git with that token only in a new repository under `/tmp`, never in your workspace's, and give `gh`
  `--repo "$GITHUB_REPOSITORY"` and run it from `/tmp`.
- **A script** in the workflow's folder is run as `./script.sh`; list any other file the steps read under `files:`.
- **A field the platform doesn't know is refused**, and the answer names the fields it does: `name`, `description`,
  `steps` (each with `name`, `run`, `secrets`, `timeout`), `variables`, `parameters`, `hosts`, `github`, `timeout`
  and `files`.
- **Anything a step prints from a secret is masked** before you or a person sees it.

## Deploying, backing up, migrating

Operations run as GitHub Actions workflows in the repository, never as commands you run against production.

1. Write the files in the repository: the app (a `Dockerfile` and `compose.yml`, say) and
   `.github/workflows/<name>.yml`.
2. Refer to secrets by name, never by value: `${{ secrets.VPS_SSH_KEY }}`, in a job with `environment: production`.
3. Ask the person for the secret: say which secret the workflow needs, what it is for, and the narrowest credential
   that would do. Someone who administers the place adds it under **Secrets and variables**, ticks **Also set it on
   GitHub**, and approves the `set-github-secrets` version that follows. You never set or see the value.
4. Trigger on the protected branch, with a manual re-run:
   ```yaml
   on:
     workflow_dispatch:
     push:
       branches: [main]
   jobs:
     deploy:
       environment: production
   ```
5. Push a branch and open a pull request. A person merges, and the merge deploys.

## Don't

- Don't put secret values in files. Refer to `${{ secrets.NAME }}` and ask a person to set it.
- Don't use repository secrets for anything a pushed branch shouldn't reach; the platform sets secrets of the
  `production` environment, which only protected branches reach.

More: `platform:workflows/workflows.md` and `platform:workflows/secrets-and-variables.md`, read with `read_knowledge`.
