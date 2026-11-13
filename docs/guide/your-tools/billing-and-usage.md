---
title: Billing profiles and usage
description: See what the organisation's AI use costs and who used it, and choose which billing profile each project's cost belongs to.
sidebar:
  order: 3
---

Every call to a model or a voice is costed and recorded in an append-only ledger in **HQ**, your organisation's home in
Agenthix. Each cost is charged to a **billing profile**: a name that says who the cost belongs to, such as the
organisation itself or one client. Only an organisation admin sees these pages. Open **Manage**, then find **Billing
profiles** and **Usage** under **Models and billing**.

## Billing profiles

![Billing profiles, with the default profile and one for client work, each with its projects and this month's cost](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/billing-profiles.png)

There is always exactly one **Default** profile, made at setup from the organisation's name. A project bills to it
unless it names another; so do everyone's own places and HQ's own calls. Each line lists the profile's projects and
**This month**, its cost so far.

- **New billing profile**: give it a **Name**, shown on cost reports, and optionally tick projects to bill to it now.
- **Make default** on another line changes which profile takes everything that names none.
- **More about** the profile has **Rename** and **Archive**. Archiving asks where its projects move; its costs so far
  stay on it, and it stays on reports for the months it was used. The default cannot be archived.

### Which profile a project bills to

When an organisation has two or more profiles, **New project** asks an organisation admin **AI cost billed to**, and a
project's **Settings** shows it too. A project anyone else makes bills to the default profile. After a project is made, only an organisation admin changes it, from the project's next call. Everyone who
can see a project can read which profile it bills to.

## Usage

![Usage for the month, by project, with each billing profile's cost](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/usage.png)

**Usage** shows a month of cost. Choose the month with **‹** and **›**; **Group by** sets the rows to billing profile,
project, agent or person, and when the organisation has two or more profiles, a second menu narrows to one. **Export
CSV** saves the month, for the profile chosen, as a file.

A month is cut in the organisation's time zone, which is shown beside the report and can be changed there. Setup asks for
it.

The report keeps each currency and each kind of figure apart, and never adds them together. Only the kinds that occur
get a column:

| Column | What it means |
|---|---|
| **Estimated** | Your own providers' keys, worked out from list prices. Your provider's bill may differ. Voice is costed this way, at the provider's list price |
| **Included in subscriptions** | Runs on a person's own Claude subscription. They cost nothing per call |
| **Unpriced** | Calls to a model with no known price. They are counted, but have no cost here |
