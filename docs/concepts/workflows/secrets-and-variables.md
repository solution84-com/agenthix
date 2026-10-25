# Secrets and Variables

Named values a place's [workflows](workflows.md) use, as in GitHub Actions' secrets and variables. They are kept apart
because they are handled differently: a **variable** is meant to be read and checked, a **secret** is meant never to be
seen. Both belong to one place — a project, or a person's own storage — and only that place's workflows can use them.

| | Secret | Variable |
|---|---|---|
| What it is for | A value that must not be seen: a key, a password, a token | A plain setting: a host name, an environment, a region |
| Stored | In hq, encrypted; text, or a file of up to 48 KB | In hq, as it is |
| A person sees | Its name, description, kind and when it was replaced. **Never the value** | Its value, and every change, old and new |
| An agent sees | Its name and description | Its name and value |
| A step gets it | Only if that step names it, as the file `/run/secrets/NAME` | If the workflow names it, every step has it as `$NAME` |
| In a run's output | Masked | Shown |
| Who changes it | The place's administrators; for a person's own storage, that person. Typed or uploaded once, then only replaced | The same people, edited in place |

**Agents never set or change either kind.** Names are capitals, digits and `_`. A variable cannot take a name that
changes how programs run — `PATH`, `HOME`, `LD_PRELOAD`, `NODE_OPTIONS`, proxy settings, and anything starting `GIT_`,
`SSH_`, `GH_` or `GITHUB_`, among others — since the executor sets those itself. Saving a variable that looks like a
secret (a key's `BEGIN` line, a known token prefix) asks whether it belongs under Secrets.

## How a secret is kept

1. **Typed once** by an administrator into the form, which also asks what it is, what it reaches, where to get a new
   one, and an optional *rotate by* date.
2. **Stored encrypted** at once in hq, bound to its own row and its place, so a value copied anywhere else cannot be
   decrypted. It is never shown again — not in a page, a log, to an administrator or to an agent.
3. **Sent** only for a run of an approved version that names it, to the site that runs it, and written only into the
   container of the step that names it, which is removed when the step ends.
4. **Recorded:** setting, replacing, deleting, and every run that used it, with who and when; never the value.

**Rotating.** A week before its *rotate by* date the place's administrators are told; on the day it shows as overdue.
A replaced value is used from the next run. **Revoking** is one action: *Turn off what uses it* switches off every
workflow that names the secret and stops any run in progress, so it can be replaced at its issuer. A secret or variable
an approved, switched-on workflow names cannot be deleted until that workflow is off.

## Secrets from an integration

`GITHUB_TOKEN` is not typed by anyone: hq mints one for each run that needs it, for the workspace's own repository and
the permissions the workflow declares, and revokes it when the run ends. It is listed with the secrets as *From
GitHub*, and cannot be set or replaced ([git access](../git/git-access.md)).

## Secrets for GitHub workflows

Ticking *Also set it on GitHub, for GitHub workflows* when adding a secret proposes adding its name to the
`set-github-secrets` workflow, which an administrator then approves. That workflow sets **environment secrets** only, on
a GitHub environment limited to protected branches, so code an agent pushes to an ordinary branch cannot read them.
Repository secrets set on GitHub some other way are listed by name as *Outside hq*. hq has no other way to send a
secret to GitHub.

## Where it is in hq

**Secrets and variables** is a section of a project, beside Members and Settings, and of a person's own space: two
tabs with the same columns — name and description, value (for a secret, only its kind), used by, changed, and actions.

## Where in the code

| What | Where |
|---|---|
| The store, encryption, the record of use | `hq/src/secrets/store.ts`, `hq/src/server/crypto/secretCrypto.ts` |
| Variables and the names they cannot have | `hq/src/secrets/variables.ts`, `rules.ts` |
| Rotation, turning off what uses a secret | `hq/src/secrets/rotation.ts`, `turnOff.ts` |

## Decisions behind this

[ADR-0060](../../adr/adr-0060-authority-comes-from-the-boundary.md) ·
[ADR-0147](../../adr/adr-0147-a-secret-is-used-only-by-a-workflow-a-person-approved-run-by-the-platform.md)
