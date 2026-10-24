# Part 3 · Secrets and variables

Named values a place's workflows use, as in GitHub's Actions secrets and variables, kept apart because they are
handled differently: a variable is meant to be read and checked, a secret is meant never to be seen. Boards:
*4 · Secret management*, *U6 · Secrets and variables*.

## The principles

The same principles the maintainers follow for their own secrets, built into the product.

| | Principle | In the product |
|---|---|---|
| S1 | **One keeper** | Every secret lives in hq's secret store, encrypted at rest with AES-256-GCM under `SECRETS_MASTER_KEY`, held in hq's environment, not its database (`secretCrypto.ts`). Each value is encrypted with its own secret's id and its place as associated data, so a value copied into another row or place fails to decrypt instead of being used. Decrypted only in memory, only for a run |
| S2 | **Never show a value** | Typed or uploaded once, never shown again — not in a page, a log, to an administrator or to an agent. It can only be replaced |
| S3 | **Every secret says what it is** | What it is, who issues it, what it reaches, where to get a new one. Its name says what it's for: `STAGING_DEPLOY_KEY`, not `SSH_KEY` |
| S4 | **The narrowest scope** | A secret belongs to one place. Only an approved version that names it gets it, only for that run, only in the steps that name it. The form asks for the narrowest credential that works |
| S5 | **Short-lived where possible** | A value an integration can mint is minted per run and revoked when it ends: `GITHUB_TOKEN` (part 4). Nothing to rotate, nothing stored |
| S6 | **Rotation is planned** | An optional *rotate by* date. A week before, the place's administrators are notified; on the day it shows overdue. A replaced value is used from the next run |
| S7 | **Revoking is one action** | *Turn off what uses it* switches every workflow that names it off at once and stops any run in progress. Then replace it at its issuer, and turn them back on |
| S8 | **Every use is recorded** | Set, replaced, deleted, and every run that used it, with who and when. Never the value. A run whose output masking caught a value is flagged *printed a secret* |

## The two kinds

| | Secret | Variable |
|---|---|---|
| What it's for | A value that must not be seen: a key, a password, a token | A plain setting: a host name, an environment, a region |
| Stored | Encrypted (S1); text, or a file of up to 48 KB stored as bytes | As it is |
| A person sees | Name, description, kind, when it was replaced. **Never the value** | **Its value**, and every change, old → new |
| An agent sees | Its name and description | Its name and value |
| A step gets it | Only if the step names it, as the file `/run/secrets/NAME`, byte for byte | If the workflow names it, every step has it as `$NAME` |
| In output | Masked | Shown |
| Used by | The workflows whose approved version names it | The same |
| Who changes it | The place's administrators (for a person's own storage, that person): typed or uploaded once, then only replaced | The same people, edited in place |
| Names it can't have | — | Any name that changes how programs run: shells (`PATH`, `HOME`, `SHELL`, `IFS`, `BASH_ENV`, `ENV`, `BASH_*`), loaders (`LD_*`, `DYLD_*`), interpreters (`NODE_OPTIONS`, `NODE_PATH`, `PYTHONPATH`, `PERL5OPT`, `RUBYOPT` and the like), proxies and certificate stores (`HTTP_PROXY`, `NO_PROXY`, `SSL_CERT_FILE`, `NODE_EXTRA_CA_CERTS`), and anything starting `GIT_`, `SSH_`, `GH_`, `GITHUB_`, `RUNNER_`, `XDG_` or `npm_config_` in either case. Refused when created; the executor sets these itself |

Names are capitals, digits and `_`. Agents never set or change either kind.

**A third kind of secret comes from an integration:** `GITHUB_TOKEN`, minted by hq for each run. It is listed with the
secrets as *From GitHub*, and can't be set or replaced.

**Saving a variable that looks like a secret** — a key's `BEGIN` line, a long random string, a known token prefix such
as `ghp_` — asks *"This looks like a secret. Add it under Secrets instead?"*

**Can changing a variable send a secret somewhere new?** Not off the site's network: the hosts a step may reach are part
of the approved version, so pointing `STAGING_HOST` at another server is refused by the egress proxy. Variables are
still administrator-only, and every change is recorded.

## Adding a secret

The form asks: name; what it is and what it reaches; where to get a new one; the value (text, or a file); an optional
rotate-by date; and, where the place's workspace has a GitHub repository, **Also set it on GitHub, for GitHub
workflows**. Ticking that proposes adding the name to `set-github-secrets` (part 4); saving opens that approval next, for
an administrator.

## A secret's journey

1. **Typed** by an administrator into the form; sent to hq over HTTPS.
2. **Stored** encrypted at once; the plain value is never written anywhere.
3. **Sent** decrypted in hq's memory only for a run of an approved version that names it, to the site over the control
   channel.
4. **Used:** held in the site's memory, written to the step's tmpfs, gone when the container is removed.
5. **Never** in an agent's container, a log, a page, or any database other than hq's, encrypted.

## Deleting and replacing

- **Replacing** keeps the name, its description and its record; the next run uses the new value.
- **Deleting** a secret or variable that an approved version names is refused while that version is on; the dialog
  names the workflows and offers *Turn off what uses it* first.
