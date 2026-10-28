# 4 · Skills in files

Part of the [Skills and the asset layer spec](../spec.md). Boards 2, 3 and 4.

Skills in a place's files (L4, L5), a workspace's repository (L6) and a person's own space belong to whoever owns the
files. hq can't pin them: a file changes when someone writes it, a repository when someone commits. Files stay the
store; hq lists them, installs into them and switches them (D13).

## Observed, not controlled

| | Rule |
|---|---|
| F1 | The site reports each skill folder's fingerprint; each run records the one it used |
| F2 | **A place's skills are versioned by publishing** (D25): see *Versions for skills in a place* below. A workspace's repository keeps git's history and is read-only in hq |
| F3 | A skill copied in with *Add to this place* records its identity and version in its `metadata`, so hq can show "agenthix/pm-sprint-planning 1.3, edited here" or offer 1.4. An offer, never enforced |
| F4 | On or off, by fingerprint, is the control hq has, and it covers agent-written skills too |

## Versions for skills in a place (D25)

| | Rule |
|---|---|
| FV1 | The same editor, draft and publish as the Library. hq keeps the draft, never in the place's live folder, so no agent sees it; *Publish* writes the files through the site |
| FV2 | Publishing gives the skill a version: hq records version, fingerprint and content, and writes the number into the skill's `metadata` (`version: "4"`) |
| FV3 | History and roll back from hq's record; rolling back publishes the older files as the next version |
| FV4 | A change made outside the editor (an agent's file tools, Files, anyone writing the folder) shows as *changed in files, not published*, with its changes and two actions: *Publish as version 5* or *Put back version 4*. Under *off by default* it is off until then |
| FV5 | Your space works the same, with the person publishing |
| FV6 | A workspace's repository skills are read-only in hq; their versions are their commits |

The content of every published version, and of every version a run used, is kept as long as the run's record, and
cached in both hq and sites (D26).

## Who acts on a place's skills (D27)

**Writing is open; publishing is the control.** A project's skills are files, so anyone with write access edits them:
its members, in the editor as a draft or directly in the files, and agents working there. **Only the project's
administrators publish**, switch skills on and off, roll back, review proposals aimed at the project, and set its
default. Viewers read the Skills page. An organisation administrator doesn't act inside a project's skills they don't
administer; they govern through the organisation's default (D32). Each person sees their own skills there as a private group. In Your space, the
person does everything. A project on *on by default* chooses to skip the gate: everything found runs.

## Defaults and switches (D13)

| | Control | Who | Choices |
|---|---|---|---|
| C1 | **The organisation's default**, *Skills found in files* | Administrators | **Off by default** (shipped): everything is listed but stays off until switched on, and a changed skill goes off again. **On by default**: everything found runs, and anyone can switch one off; choosing it says that agents' writes then run unreviewed. **Never**: hq doesn't read skills from files |
| C1b | **A place's default**, for a project or Your space | The project's administrator, or the person | Only stricter than the organisation's, as every override is (adr-0072) |
| C2 | **Each skill's switch**, on the place's Skills page, grouped by where it was found (the place, one agent, each workspace), with **All on** and **All off** for the page and each group | The same | On or off, remembered by fingerprint |

The site scans the place's skill folders and its workspaces' repositories when hq asks, under staging's bounds and a cap
on skills reported per place, and reports each skill with its fingerprint. hq names the switched-on skills in each
dispatch, keyed by **place, path and fingerprint**. **Staging checks what it copies** (security review H3): the site
reads each file-skill folder into memory under staging's bounds, computes its fingerprint over exactly those bytes, and
stages it only if it equals the fingerprint hq named for that place and path; a mismatch is not staged and is reported.
Switching a skill on shows every one of its files, `scripts/` and references included, not only `SKILL.md`. *Add to this
place* copies an installed asset's skill into the place's folder, through the same site call that writes files today.
*Remove* deletes a place's skill folder; a workspace's skill can only be switched off, since its repository decides
what it holds.

## The person's skills (D15)

A person's own skills live in Your space's files and **follow them into their own conversations everywhere**,
projects included. hq reads the switched-on ones through the person's site and delivers them by fingerprint, so it
works when Your space and the project sit on different sites. **Only a version the person published follows them**
(FV5), whatever the place's default; an unpublished change in Your space never leaves it (security review H4). They
apply to the turns of the person's own conversation only: not to runs someone else started, to scheduled or automated
runs, or to worker runs started from the conversation.

Safe because a skill adds no capability: in the person's own conversation it can only make the agent do what the
person could ask by typing the same words, and the conversation stays within the person's access (adr-0152). The
organisation can turn this off with one setting, *Personal skills outside Your space*, on by default.

## When the same skill comes from two places (D12, D16)

| Order | Level | Why |
|---|---|---|
| 1 | **Installed** by the organisation: built in, every agent, or this agent | The organisation always uses the same version |
| 2 | **The project**: its files and workspaces | A project's procedures and standards prevail |
| 3 | **The person**: their own skills | They add to the project. To change how the project works, a person writes a complementary skill, or updates the project's knowledge or memory |

Only the same identity clashes; different skills all apply. The one set aside is shown on its Skills page as *set
aside*, with the reason. Renaming a skill in files makes it a different skill, a deliberate choice that the switches
still govern.
