---
created: 2026-10-05
description: hq's code is organised by feature — each feature folder holds its pages, operations, tests and its own Wasp declaration file — on a Wasp version that supports declarations split by file.
---

# ADR-0093: hq Is Organised by Feature, Each Feature Declaring Itself

**Status:** Accepted

## Context

hq declares every route, page, action, query and API in one file: 352 declarations in about 1,700 lines.
Every feature's change edits it, and anyone working on one feature has to read past every other. Wasp
0.21, which hq ran on, accepts exactly one declaration file. Wasp 0.24 replaced that format with a
TypeScript one that can be split across files, which the Wasp project documents as the way to keep a
feature's declarations beside its code.

## Options considered

**Keep one declaration file, grouped into a section per feature.** Rejected: the file still grows with
every feature and is still shared by all of them; grouping is a convention nothing enforces.

**Split the declarations with Wasp 0.21's preview TypeScript configuration.** Rejected: it works only
through an undocumented pattern, on a format Wasp has since retired, so it would be rewritten again at the
next upgrade.

**Organise by technical layer** (all pages together, all operations together). Rejected: a change to one
feature still touches every layer's folder, which is the cost this decision exists to remove.

## Decision

hq is organised by feature. Each feature has one folder holding its pages, its operations, its tests and
its own Wasp declaration file (`<feature>.wasp.ts`), which the app's root declaration file only composes.
Code used by several features lives in a shared folder, not in one feature reaching into another. hq runs
on a Wasp version that supports declarations split by file (0.24 or later).

## What this binds

Every new page, operation or API in hq goes in its feature's folder and is declared in that feature's
declaration file. Undoing it means merging the declarations back into one file and moving code back by
layer — about as large as making the change.

## Consequences

### Positive

- A feature's change stays in its folder; reading one feature does not mean reading all of them.
- The declarations follow the format Wasp documents, so upgrades follow its guides.

### Negative

- Moving hq into feature folders touches most of its files once.
- Where a feature ends is a judgment call for code several features use.

### Risks

- Wasp's TypeScript declaration format is newer than the one it replaced and may still change between
  versions; an upgrade may need its declarations adjusted.

## References

- adr-0094 — how hq is tested
