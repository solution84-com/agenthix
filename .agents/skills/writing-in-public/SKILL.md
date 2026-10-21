---
name: writing-in-public
description: Use before writing anything other people outside the maintainers can read — a committed file, a commit message, an issue or its comments, a pull request and its review, a discussion, release notes. Covers what never goes in, how to describe what lives elsewhere instead of naming it, and why text on GitHub must be right the first time.
---

# Writing in public

Everything in this repository and on its GitHub pages — files, commit messages, issues, comments, pull requests,
reviews, discussions, release notes — can be read by anyone. Write each of them as if a stranger, a competitor and a
journalist will read it, because they can.

## Right the first time

**Editing does not remove text.** GitHub keeps every earlier version of an issue, a comment or a pull request's
description, and anyone who can read it can open that history. A commit message is permanent once it is pushed. So a
slip cannot be fixed by editing it out; check before you post, not after.

If something private has been posted, do not edit it quietly: tell a maintainer, who deletes the revision or the
comment, and rotates anything that works as a credential.

## What never goes in

| Never | Write instead |
|---|---|
| **Private places** — the names, paths, contents or issue numbers of private repositories, the maintainers' own tooling, skills and planning, or which private place holds what | Describe it: *"a decision recorded outside this repository"*, *"a hosting provider's controller, outside this repository"* |
| **Plans of other products or of the business** — launch dates, early-access or availability schedules, product pipelines, pricing, what a hosted service will offer and when | The platform's own work, its epics and their dates, may be written. Another product may be mentioned generically and undated: *"a hosted service may connect to an hq"* |
| **Private architecture of a hosted service** — how it is built, its tenancy, the providers it is weighing | The contract this repository exposes to it, and nothing behind that contract |
| **Personal and business details** — a person's real name used as sample data, home paths, personal email addresses, business registration or tax details | Sample people (*Avery Chen*), `<you>` in paths, the licensor's name as it appears in `LICENSE` |
| **Legal self-assessment** — that something *appears to breach*, *reads against* or *risks* a vendor's terms or the law | The question to ask and who answers it: quote the public terms, list the questions, record the answer when it comes |
| **Internal infrastructure** — hostnames, addresses, server names, bucket, account or board ids, secret and environment-file names of a real deployment | Placeholders (`<host>`, `example.com`) and the names this repository's own configuration defines |
| **Secrets** — tokens, keys, passwords, connection strings, even expired or "test" ones from a real system | Fixtures that are obviously fake, and secrets referenced by name only (`${{ secrets.NAME }}`) |
| **Security problems before they are fixed** | A private report through the repository's **Security** tab, never an issue, discussion or pull request |

## Before you post

1. **Read it as a stranger.** Does any sentence only make sense to someone who knows a private place, a private plan
   or a person? Rewrite it so it stands alone, or cut it.
2. **Check the names.** Every repository, product, service, person and file named is public, or is described instead.
3. **Check the dates.** Every date is the platform's own; none belongs to another product or a launch.
4. **Check pasted material.** Logs, stack traces, screenshots and copied documents carry paths, hostnames, names and
   tokens; trim them to what the reader needs.
5. **Links resolve for a stranger.** A link into a private repository, a private document or a gitignored path is dead
   for everyone outside, and tells them where to look.

## Why this matters here

Agenthix is source-available, and its repository is how people outside judge it. The maintainers also run private
work alongside it; keeping that work out of public text is what lets them write freely in both places.
