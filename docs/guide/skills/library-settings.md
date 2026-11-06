---
title: Library and skills settings
description: For administrators — whom the organisation trusts to sign what it installs, who may install, and how skills found in files reach agents.
sidebar:
  order: 7
---

Open **Manage**, then **Settings**, then **Library and skills**. These settings are for organisation administrators.
They decide whom the organisation trusts to sign what it installs, and how skills reach agents. The page has these
parts, top to bottom.

## Trusted publishers

The signers whose packages install without asking. A signature proves who published something, not that it is safe.
**Agenthix** is always on the list. Each row shows the name your organisation gave the publisher and what proves it.

- **Add a publisher or a public key…** trusts a new signer in advance. Choose **How it signs**: **Keyless, with an
  identity**, such as a repository's release workflow, where you give the identity provider, the certificate identity
  exactly as signed (without the ref and without wildcards), the repository, and whether tags or one branch may sign; or
  **A public key**, pasted in PEM form (never a private key), which lets an organisation sign offline. Give it a **Name**
  (what it signs installs as `name/…`) and **Shown as**, then select **Trust this publisher**.
- **Rename** changes the name shown.
- **Remove** stops trusting a signer. What it signed stays installed under its name, and anything new it signs asks first.
  **Trust again** brings back one that was removed.

A new signer met during an install is added from the install dialog: see [Add a skill](add-a-skill.md#what-the-check-says).

## Unsigned assets

What happens to a package with no signature:

- **Allowed after a warning**: the person installing reads it and confirms.
- **Never**: only signed packages install. Skills made here are not affected.

## Who may install from outside

Who may add from an upload or a link:

- **Administrators**: only administrators.
- **Administrators and Library maintainers**: Library maintainers may then install new assets from outside, not only accept updates.

## Skills found in files

The organisation's default for skills in a project's files, its workspaces' repositories and Your space. A project can
choose a stricter one: see [Skills in a project or in Your space](skills-in-a-place.md#the-default).

- **On by default**: everything found runs.
- **Off by default** (recommended): everything found is listed and stays off until switched on. A skill that changes goes off again.
- **Never**: skills in files are not read. Only installed skills run.

Choosing **On by default** first shows a warning: it runs every skill found in files, including ones agents write,
without anyone reviewing them first. Select **Run them unreviewed** to go ahead.

## Personal skills outside Your space

- **On**: a person's own skills come with them into their own conversations in projects.
- **Off**: they stay in Your space.

## Library maintainers

A **Library maintainer** is a member an administrator names to look after the Library without being an administrator.
They create new skills, edit and publish, accept updates, return to an earlier version and review proposals aimed at the organisation, and
install from Agenthix's shelf. Choosing which agents have a skill, removing, the trust settings and naming
Library maintainers stay with administrators.

Choose a member, then **＋ Add a Library maintainer**. HQ shows what the role reaches and asks you to confirm with **Make
Library maintainer**. **Remove** takes the role away. With none named, administrators do everything a maintainer does.

A project's skills are published by the project's administrators, and anyone with write access edits them.
