# 2 · The asset layer

Part of the [Skills and the asset layer spec](../spec.md). Boards 2c and 4.

One layer, for every library asset: **skills, agent templates, board templates and team templates** (D20). It applies
to the library item. An agent, board or team already made from a template is its own definition, edited in place
(adr-0072), and never follows its template's later versions.

## Identity

Every asset has `publisher/name` and a version, from the manifest that library packages already carry
(`hq/src/library/packages/packageManifest.ts`). A template's role skills are named under it
(`agenthix/project-manager/read-context`); a shared skill keeps its own name (`agenthix/pm-sprint-planning`).

**The publisher is the verified signer, never the manifest's claim** (D10, I4; security review C1). It is the signer's
name as this organisation recorded it when trusting it ([part 3](03-install.md#who-signs-d9)). Every asset inside a
package, embedded skills included, takes the outer package's verified publisher, and a claim to any other publisher is
refused. An unsigned package or folder is installed under `unsigned/<name>`, and never de-duplicates against, updates
or sets aside a signed asset. `agenthix/` is reserved for Agenthix's exact release identity, and no installed asset may
take a built-in's identity. A different signer is always a different asset, never an update.

## Self-contained packages

**Every package carries every skill it needs** (D10, I1). There are no references between packages, for anyone, so
nothing can go missing and hq needs no resolver. Agenthix's own build copies each skill into every package that uses
it from a single source, which ends the hand-kept copies (I5).

## De-duplication on install

Installing matches identities (I3), publisher and name together. A skill already installed at the same version is reused. A newer version is
offered as an update. An older one leaves the installed skill alone. One identity is installed once and shared by every
agent that has it. Installing says what comes with it: "This template brings 7 skills: 5 for its role, 1 you already
have, 1 newer than yours, update offered" (I6).

## Versions (D11)

| | Rule |
|---|---|
| V1 | Installing pins the version: hq records identity, version and content fingerprint, like a lock file |
| V2 | Update and roll back are explicit. *Update available* shows what changed. *Roll back* goes to any earlier installed version |
| V3 | Any version can be installed on purpose, newer or older, by administrators and Library maintainers, after a confirmation; going back says so, and the history records who, when and why (D30). Versions compare as SemVer (major.minor.patch). A version its publisher withdrew is installed only after a warning naming why (Agenthix's withdrawn versions ship in hq's image, so the warning works offline) |
| V4 | One version per asset per organisation at a time |
| V5 | Sites cache by fingerprint, as they already do; each run records the fingerprint it used |
| V6 | hq keeps every installed version's content while it is installed or in the history |

Different versions side by side, such as one project held on an older version, come later.

## Editing: draft, then publish (D24, D25)

**Agents draft, people publish**, the same rule as workflows (`propose_workflow`). *Publish* shows the full difference
since the last version, every file including `scripts/`, and publishes only the draft revision the publisher saw: it
is refused if the draft changed since. Each change to a draft records its author, or the run that proposed it. *Edit* makes a **draft** of the
asset that no agent sees: one draft per asset, shared by everyone who may edit it (collaboration). A draft saves itself a moment after the person stops typing; *Discard draft* is the way back, and *Publish*,
when it can't be used yet, says why. *Publish* asks for
a note and makes the next version, writing that version into `SKILL.md`'s `version:` (and a `package.json` beside it)
so the files and hq's record of the version agree; every agent that has it gets it on its next turn, and roll back stays one click.
*Ask an agent to edit* opens a dialog that names, before anything is sent, the agent that will answer (the person's main agent unless they
pick another) and where the conversation will be (their own space), and opens a conversation with the asset attached: the agent's `propose_skill` edit updates the
person's draft when that person may edit the asset, and is a proposal for review when they may not. The editor is
drawn on board U3b and described in [part 6](06-screens.md#the-editor).

*New skill* asks for a name and a description (what it does and when to use it), offers a plain skill, one with
`scripts/` and `references/`, or asking an agent to write it, and opens the editor on a draft. Its first publish is
version 1; it then offers *Add to agents…*.

## Editing makes your own copy (D18)

Editing an installed asset that another publisher signed makes the organisation's own copy: `agenthix/code-review
1.3` edited by Fernhill becomes `fernhill/code-review`, made here. The copy takes the original's place for the agents
that had it; the original stays installed but set aside, one click to switch back. In the Library the two are **one entry**, the
copy's: the original is not a row of its own, but shows on the copy's row and page as what it replaced, with its
version and *Use the original again*. A newer upstream version shows on
the copy as news, with what changed, and is never merged automatically. An asset the organisation made itself is
edited in place, with history.

## Provenance (D19)

A copy carries a dated **"based on"** list in its manifest (`basedOn`), **written once, when the copy is made**: it
inherits the original's list and adds the original as one line. Nothing changes it afterwards; hq's editor edits the
asset, never the manifest. People can only add `stated` credits for sources hq never saw.

```json
"basedOn": [
  { "skill": "agenthix/code-review", "version": "1.3", "fingerprint": "sha256:9f2c…",
    "copied": "2026-10-27", "recorded": "hq" },
  { "skill": "blog.example.com/review-checklist", "copied": "2026-10-27", "recorded": "stated" }
]
```

A line shows as *verified* only when hq wrote it in this organisation and holds it in its own records, and can match
the original's fingerprint; a line from an imported manifest shows as *stated* by that package's signer, whatever its
`recorded` field says (security review M5). The `licence`
travels with it and is shown. Removing a line outside hq is on whoever does it. Credit is recorded and shown, never
required or certified.

## History and Library maintainers (D17, D27, D28)

Every published or installed version records who and when, and a note.

Every Library asset belongs to the organisation, so there is **one role beside administrators: Library maintainer**,
an organisation role that administrators name in the organisation's settings. Library maintainers create, edit and
publish every Library asset, accept updates, roll back, and review proposals. Installing from outside (unless the
organisation lets maintainers, P3), removing, choosing which agents have an asset, the trust settings and naming Library
maintainers stay with administrators. There are no maintainers per asset. A project's skills are published by its
administrators ([part 4](04-files.md#who-acts-on-a-places-skills-d27)); in Your space, the person does everything.

**Reach is shown when someone is named** (security review M1): *"Library maintainers publish skills that run for every
agent, in every project, including ones they can't access."* That trust is an accepted risk, stated in the decision
record with what would make it worth revisiting. Maintainers per team or department, each looking after its own
skills, may come later.

When a member leaves, their role is dropped and the history still names them. Every role-and-action pair has a test.

## Which agents have it (D23)

An installed skill is had by **every agent** (L2) or by **chosen agents** (L3): *Add to agents…*, *Remove from Ada*. A
template's role skills go to the agent made from it. Built-in skills are on for every agent unless an
administrator switches one off. Removing an installed asset names the agents that have it and asks first; their pages
then show it as missing, with *Install*. There are no per-agent exceptions to an every-agent skill (R7).

## Validation (R8)

On every save, upload and install, against the Agent Skills specification: a name of 1–64 lowercase letters, digits
and hyphens, unique by identity (which also closes the taken-name fault before an organisation exists); a description
of 1–1024 characters; a warning, not a refusal, for a body over 500 lines; header keys staging drops are flagged
*ignored when run*. Installing grants no capability (R10).
