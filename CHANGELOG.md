# Changelog

All notable changes to Agenthix are listed here, newest first, in the form of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each entry is written for the people who use or run
Agenthix, not for its developers. The rule for when an entry is written is in
[`CONTRIBUTING.md`](CONTRIBUTING.md#the-changelog).

## [Unreleased]

## [0.1.0] - 2026-11-17

The first release.

### Added

**Setup and sign-in**
- Installing on your own machine or a server, with one installer and an `agenthix` command for what comes after.
- A guided setup of your HQ: your administrator account, your organisation, how agents reach AI models and voice
  (now or later), and a final check of everything.
- Sign-in with a username and password, invitations to join, recovery of the administrator's access, and passwords
  that people can change or reset.
- Roles, teams and an admin area for the organisation.

**Conversations**
- Conversations with agents in a chat panel beside whatever you are looking at, with replies that stream in, files
  and images in the message, voice, and Try again when a reply fails.
- A lead agent, Kernel, that every organisation starts with, and Your space: a personal place for each person, with
  their own projects, memory and Vault.
- Voice that lets you finish a thought before the agent answers, and says something short while a slow reply comes,
  with one setting for each person, Adaptive voice.
- Notifications, and a phone-friendly layout.

**Tasks, boards, sprints, routines and runs**
- Projects with their own members, tasks by type and column, boards, custom fields and sprints with a timeline.
- The Workroom, where a person and agents work on a task together, and Runs, with approvals for anything an agent
  needs a person to allow.
- Routines that start an agent on a schedule, and limits on what agents may start on their own.

**Agents and permissions**
- Agents with their own instructions, rosters per project, and permissions that decide what each may do alone and
  what needs approval.
- Memory that belongs to a person: an agent saves a fact or a rule where it is working, and the person promotes or
  forgets it on one screen.
- One list of what agents can do, chosen in setup and on one AI page, including web search, with web tools asking
  first by default.
- Agents that find the tools they need by searching, so what they are sent stays small however many tools there are.
- Pictures for every agent, person, team and the organisation, drawn for them or cropped from an upload.
- Rules for shell commands that are judged as the shell runs them, and approvals that grant exactly the command
  shown.

**Library and skills**
- The Library, where skills and other assets are found, added, kept up to date and given to agents or places.
- Skills that agents follow in a conversation, that agents can propose, and a record of when one was used.
- A built-in editor for writing and reviewing a skill's files.

**Knowledge**
- Knowledge for the organisation, a place and a person, kept in sections of pages with history and Recently deleted,
  searched together and available to agents through the Knowledge tool.
- A platform guide built into HQ that agents can read.

**Workflows and secrets**
- Workflows that use a secret, so no agent ever holds one: proposed, checked, approved by a person and run by the
  platform.
- Secrets and variables screens, and GitHub connected through workflows, including a client's own GitHub
  organisation.

**Code work and files**
- Code work on branches: each task and code conversation has its own branch and working copy, with a merge into
  main, versions of main, and Restore.
- A workspace view of a branch and its files, and files that open in place, in a browser tab, or as a download,
  including previews of documents, images and PDFs.

**Host management and the Fleet Console**
- The Fleet Console, where fleet administrators install, upgrade, back up, move and look after the machines HQ and
  its sites run on.
- Backups and restore, upgrades, remote access and diagnostics for each machine, from the Fleet Console or the
  `agenthix` command.
- A host of its own for files (`agenthix install --files`, `agenthix hq files-address`), kept through upgrades, moves
  and a new address.

**Sites**
- Execution Sites, the machines where agents run, and the ability to add more of them, on other machines.
- A choice of AI providers, models and voice (Inworld among them, for language models as well as voice), set up in
  one step, and a billing and usage view.

### Changed

- Nothing yet; this is the first release.

### Deprecated

- Nothing yet; this is the first release.

### Removed

- Nothing yet; this is the first release.

### Fixed

- Nothing yet; this is the first release.

### Security

- Agents run in containers and cannot act outside them: every path, link, message and file that comes from a
  container is checked before anything outside it acts on it.
- Each agent's commands are contained by the Linux kernel's Landlock, so on Linux Agenthix needs kernel 6.12 or newer:
  installing, joining a machine and upgrading refuse on an older kernel, change nothing, and say how to get a newer
  one.
- A secret is used only by a workflow a person approved, and never reaches an agent.
- Files open only for a ticket that HQ signed, inside the place and at the version it names.
- Installing a skill or package is signed and verified, and install scripts in packages are blocked by default.
- HQ checks every message it receives from a site or machine before using it.
