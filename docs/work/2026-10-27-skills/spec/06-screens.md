# 6 · Where people meet it

Part of the [Skills and the asset layer spec](../spec.md). Decided in D21, D23–D27; drawn on the UI boards U1–U5,
U3b, P1, P2, A1, C1–C3, R1 and R2.

## The main sidebar

Home, Chat, Your space, Projects, **Tasks, Agents, Library** (D26). Tasks moves before Agents because it is used more
often; the Library joins after Agents. The Overview card and `/skills` give way to it.

## The Library

**One searched view of every installed asset**, filtered by type (skills, agents, boards, teams) rather than tabbed
(D26). Each row shows the name, identity and version, the signer or *made here*, which agents have it, and its state:
*Update available*, *Draft*, *Waiting for review*, *Set aside*, *Unsigned*. *Add* offers Agenthix's shelf, upload, a
link, and *New skill*. **Marketplace** is a button that opens its own page, behind a feature flag that is on only in
development; in production its button doesn't appear and its server routes refuse (adr-0116), until it is built.

**An asset's page** holds its content, *Agents with this skill*, versions with roll back, news from the original,
credit (verified or stated) and licence, signer and source, and *Remove*, which names the agents that
have it.

## The editor

A small file explorer for one asset (board U3b): the asset's files in a tree, each with a change marker (A added, M
modified, ✕ deleted and struck through, R renamed with its old name; a letter or cross and a design-token colour,
never colour alone), and three modes: **View** (the file frame's renderers), **Edit** (CodeMirror 6, added to `ui/`,
for every text file; binary files are replaced by upload) and **Changes** (a per-file diff against the version in use,
in one column, as a renderer behind the file frame's boundary). The same diff serves every "what changed": a draft,
an update, a proposal, a skill changed in files. Checks run as the person edits: the Agent Skills rules, every file
`SKILL.md` names exists, ignored header keys flagged. Limits are staging's bounds; text over 1 MB opens read-only.

## A place's Skills page

In a project's panel under *Agents at work*, and in Your space. The skills found in its files and workspaces, grouped
(this place, one agent, each workspace), each with its version, switch, and state (*new*, *changed in files, not
published*, *set aside*), with *All on* and *All off* per page and group, the place's default, *Add to this place* and
*New skill*. Anyone with write access edits; its administrators publish and switch; viewers read; each person's own skills are a
private group.
Your space's page adds the person's skills that follow them.

## The agent's page

Everything the agent will see, in the clash order: built in, every agent has these, the agent has these, each place it
works in (one line with counts), and anything set aside and why; the listing's estimated cost per run, with the
warning above about 20 skills or 4,000 tokens. Administrators add and remove; members read what they can see.

## The conversation

The `/` picker (board C1), a used skill opened beside the thread at the version the run used (C2), and the proposal or
draft card with its review outcome (C3).

## Settings

*Library and skills* in the admin area's Settings group: trusted publishers, unsigned assets, who may install from
outside, Library maintainers, skills found in files, personal skills outside Your space, and the built-in skills'
switches (board R2).
