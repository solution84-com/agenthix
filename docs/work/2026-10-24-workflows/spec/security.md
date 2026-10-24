# Part 6 · Security

What the design stops, what it doesn't, and what the build must prove. Board: *10 · What it stops, and what it does
not*. The design was put through a security design review on 2026-10-24; every finding is in parts 1–4.

## Each attack, and what stops it

Every row becomes a test in the security suite: it plants dummy secrets (canaries), runs the attack, and fails if a
canary turns up anywhere the agent can read — its container, its output, the workspace, or a host it can reach.

| | Attack | What stops it |
|---|---|---|
| A1 | The workflow prints or encodes a value | Review before it can run; masking catches the plain forms |
| A2 | A dependency is swapped, or a package steals a secret while installing | Installs pinned, from a lock file that is one of the version's files, only from approved hosts; a step that installs holds no secret unless it names one, and the plain checks flag a step that does both |
| A3 | A process from one step waits for a later step's secret | Each container is removed before the next starts |
| A4 | An encoding that masking misses | Review only |
| A5 | The value is left in a file for the agent | The snapshot; changes come back only after a scan by content, git's objects included |
| A6 | The agent's container inspects an executor container | No shared network or process space; neither has the Docker socket |
| A7 | The value is sent out, directly or by DNS | No network by default; with hosts, only those through the proxy, which answers DNS and refuses private addresses |
| A8 | The files change between approval and run | One hash, rechecked by the site; steps run the approved files from a read-only folder |
| A9 | A run while the workflow is off | Checked on every run; a running one is stopped |
| A10 | A parameter becomes code or an option | Patterns or lists checked by hq; values as files; no leading `-` |
| A11 | The workflow steers the reviewer | The reviewer holds nothing; the plain checks decide the card |
| A12 | The agent's command gets a GitHub token from git | No helper, no credential endpoint, no token in the agent's container |
| A13 | The agent changes what an approved step runs: a script, a lock file, a build output, a git hook or config | Steps run the approved files on a snapshot; a secret step that runs workspace code is flagged and can't be card-approved; git with a token only in a clean repository |
| A14 | A steered reviewer gets a harmful version approved in one tap | Only the plain checks decide whether the card offers Approve, and they write its summary |
| A15 | A member links someone else's repository into their own storage and approves workflows there | A person's own storage and personal projects connect to no account unless an administrator chooses that person; wider GitHub permissions there need an administrator |
| A16 | A secret set on GitHub is read by code the agent pushes | Environment secrets only, on protected branches; `push` and `open-pull-request` refuse protected branches |
| A17 | A token for the wrong repository, project or client | The mint gate: repository from the workspace, by GitHub ids, connect rule at every mint, no agent exception, one token per run, revoked at its end |
| A18 | A link in the workspace points the site at a file outside it | Links never followed; a version can't contain one |

## What it does not protect against

- **An approved workflow written to misuse a secret.** If a person approves code that sends a value to an approved host,
  or uses it to do damage, it will. The design moves the risk from *any prompt can leak a secret* to *a person approved
  code that leaks it, after the plain checks and a reviewer read it*.
- **An approved host that takes anyone's data.** `github.com`, `registry.npmjs.org` and the like accept data from any
  account, so allowing one doesn't stop a step sending a value to an account an attacker owns there. What stops it is
  that steps run only approved code (A13); the allow-list narrows where, it doesn't prevent.
- **What the secret itself allows.** A run can do anything its secret permits. Narrow credentials stay the operator's
  job; the form asks for them.
- **The agent's own outbound network.** Unchanged; there is nothing secret in its container to send, but it can still
  send the workspace's files.

## What the build must prove

Each is a test early in the build. If one fails, the design changes before anything ships.

| | Check | If it's wrong |
|---|---|---|
| V1 | A container on an internal Docker network with `--dns` set to the proxy can't resolve names through Docker's own resolver | Steps with hosts can leak by DNS lookups. **Proved 2026-10-24** on Docker Desktop: the embedded resolver forwards only to the `--dns` server and never falls back; re-run once on a Linux site |
| V2 | An installation token asked for with `permissions` and `repository_ids` gets exactly those; `contents: write` can't change `.github/workflows/`; revoking ends a token at once | Token narrowing and revoking don't hold. **Proved 2026-10-24**; a mint with no `permissions` gets all of the App's, so the gate always names them |
| V3 | No site endpoint the agent's run token can call returns a run instruction, unmasked output or a secret | Masking is pointless |
| V4 | The executor image has no git credential helper from the shared tools stage | A leftover helper decides how git authenticates |
| V5 | `gh pr create` takes the title safely from a file or one quoted argument, without tripping the plain checks | The starter needs another way to pass the title. **Answered 2026-10-24:** no title file; `--title "$(cat /run/params/title)"` is one argument, and the plain checks accept that form |
| V6 | Whether one agent container serves several conversations in a place, so one conversation could change what another's workflow sees | The snapshot is all that separates them; it must be per run |
| V7 | An environment secret limited to protected branches isn't given to GitHub workflows on other branches or on pull requests | Secrets for GitHub Actions aren't kept from pushed code. **Proved 2026-10-24** |
