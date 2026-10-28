# Skills Staging

How hq and the site together gather an agent's skills into the folder a turn uses. The concept is in [skills.md](./skills.md); this document is the algorithm and its edge cases. It is the same for Claude and OpenCode, which differ only in where the folder goes and how the model is pointed at it.

Nothing is merged: every valid skill hq names is staged, each under its own `<source>-<name>`. The only choice made is which of two skills that are the same skill, or would share a name, is kept.

---

## Algorithm

For each turn, in hq:

```
1. Collect the candidates
     built in     not switched off; working-with-git only when the run's
                  location is a git repository
     installed    every skill every agent has, and every skill this agent
                  has, each at its pinned version
     files        the place's skills (its own folder, this agent's folder,
                  the run's workspaces) that are switched on, by fingerprint
     person       the person's published skills, on a turn of their own
                  conversation only

2. Settle clashes by identity (else name, else folder):
     installed, then the project, then the person.
   The loser is set aside, with the reason.

3. Settle names: of two skills that would stage under one name, keep the
   one higher in that order, or at one level the one installed first;
   set the other aside.

4. Send the three lists with the dispatch; send the content of installed
   and personal skills the site lacks, by digest.
```

Then, in the site:

```
5. Make a fresh staging folder in the conversation's area of the runner's
   home. The container sees it read-only.

6. For each named skill, read its files into memory:
     installed / person   from the package cache; the files must still
                          fingerprint to the digest hq named
     files                from the place; the files read now must
                          fingerprint to the fingerprint hq named
   Anything that does not match, or cannot be read, is refused with a
   reason and recorded.

7. If two read skills have one name, stage neither; refuse both.

8. Write each skill: its files as read, and SKILL.md with the body as
   written under front matter rebuilt from an allowlist - name (the
   staged name), description, when_to_use, argument-hint,
   disable-model-invocation, user-invocable - text values quoted; every
   other key dropped.

9. Record on the run what was staged and what was refused.
```

On Claude the folder is a local plugin named `agenthix` (`.claude-plugin/plugin.json` beside `skills/`), given with the list of staged names. With none staged, Claude gets no plugin and an empty list, and OpenCode's prompt has no skills section.

Nothing in staging throws out of the run: a skill that fails is refused and the rest are staged.

---

## Files an agent can write

Skills in a place's files are read from a disk the agent can write, so they are treated as untrusted:

- Every directory and file is checked, at the moment it is read, to resolve to a path inside the place's files or the workspace's repository. A link anywhere in the chain is refused.
- Files are opened without following links; hard links, non-regular files (a named pipe would block forever) and unreadable files are refused.
- A tree is bounded: 1,000 entries, 16 MB and 8 levels deep. Past a limit the skill is refused.
- Hidden entries are left out of the fingerprint and of what is staged.
- What is staged is what was read and fingerprinted, never the folder read a second time, so what was checked is what the run gets.

Installed and personal skills come from hq, but they are fingerprinted again from the site's package cache before they are staged, and that cache is bounded and out of every container's reach, since unsigned uploads and personal skills now reach it.

---

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| A skill folder has no `SKILL.md` | That skill is refused |
| The same skill installed and also in the project's files | The installed one is staged; the project's is set aside, shown with the reason |
| Two different skills with one folder name in different levels | Both are staged, under different sources (`org-review`, `shared-review`) |
| Two skills that would share one staged name | Neither is staged; both are refused |
| A file skill changed after it was switched on | Not staged: "it has changed since it was switched on". Under *Off by default* it is off until switched on again |
| A name, with its source, longer than 64 characters | Refused |
| `SKILL.md` has no front matter, or an unclosed one | The whole text is kept as the body under fresh front matter carrying the name |
| Front matter with `hooks`, `allowed-tools`, `model` or any key outside the allowlist | The key is dropped; the skill is staged with its name, description and body |
| No skills at all | Claude: no plugin, an empty allowlist, so no skill, Claude Code's bundled ones included. OpenCode: no skills section |
| A skill is published between turns | The next turn stages the new version; on Claude a changed set replaces the process |
| A site too old to be told about skills | It is sent none; it stages only what it has of its own |

---

## Lifetime of the staged folder

| Runtime | Folder | Removed |
|---------|--------|---------|
| Claude | One per turn, handed to the process when it starts | When the process that took it ends. If the running process is kept because nothing changed, the turn's new folder is removed straight away |
| OpenCode | One per conversation, replaced by each turn | When the conversation goes idle or ends, with the rest of its staging |
