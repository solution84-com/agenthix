# Skills Staging

How the site gathers an agent's skills into the folder a turn uses. The concept is in [skills.md](./skills.md); this document is the algorithm and its edge cases. It is the same for Claude and OpenCode, which differ only in where the folder goes and how the model is pointed at it.

There is no merge in the sense of one skill winning over another: every valid skill from every source is staged, each under its own `<source>-<slug>` name.

---

## Algorithm

For each turn:

```
1. Make a fresh staging folder in the conversation's area of the runner's home.
   The container sees it read-only.

2. Take the sources in a fixed order:
     platform    the platform package's skills/
     org         the organisation package's skills/        (if the agent has an org)
     agent       the agent's own package's skills/
     boundary    .agents/agents/<agentId>/skills/ in the boundary's files  (if present)
     shared      .agents/skills/ in the boundary's files                   (if present)

3. For each source, in name order, for each sub-folder that is not a link:
     a. name = <source>-<slug>; skip it, with a warning, if the slug is invalid
        or the name is over 64 characters
     b. read <folder>/SKILL.md; skip the skill if it is missing or unreadable
     c. copy the rest of the folder
     d. write SKILL.md: its body as written, under front matter rebuilt from an
        allowlist — name (the staged name), description, when_to_use,
        argument-hint, disable-model-invocation, user-invocable — text values
        quoted; every other key is dropped

4. Return the staged skills. On Claude the folder is a local plugin named
   agenthix (.claude-plugin/plugin.json beside skills/), given with the list of
   staged names. If there are none, Claude gets no plugin and an empty list,
   and OpenCode's prompt has no skills section.
```

Nothing in staging throws out of the run: a skill that fails is skipped and the rest are staged.

---

## Sources on the boundary's disk

The `boundary` and `shared` sources are read from files an agent can write, so they are treated as untrusted:

- Every directory and file is checked, at the moment it is read, to resolve to a path inside the boundary's files. A link anywhere in the chain, including the `skills/` folder itself being replaced by a link, is refused.
- Files are opened without following links; hard links, non-regular files (a named pipe would block forever) and unreadable files are skipped.
- The whole boundary tree is bounded per turn: 1,000 entries, 16 MB and 8 levels deep. Past a limit the rest is skipped, with one warning per limit.

The platform, organisation and agent packages are held by hq and verified when delivered, so they are copied without these limits.

---

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| A source folder does not exist | Skipped silently |
| A skill folder has no `SKILL.md` | That skill is skipped |
| Same slug in two sources | Both are staged, as `org-review` and `agent-review` (for example) |
| A slug that is not lowercase letters, digits and hyphens | Skipped, with a warning |
| `SKILL.md` has no frontmatter, or an unclosed one | The whole text is kept as the body under fresh frontmatter carrying the name |
| Front matter with `hooks`, `allowed-tools`, `model` or any key outside the allowlist | The key is dropped; the skill is staged with its name, description and body |
| No skills at all | Claude: no plugin is passed and the skills allowlist is empty, so no skill — Claude Code's bundled ones included — is listed. OpenCode: no skills section |
| A skill is edited between turns | The next turn stages the new content; on Claude a changed set replaces the process |

---

## Lifetime of the staged folder

| Runtime | Folder | Removed |
|---------|--------|---------|
| Claude | One per turn, handed to the process when it starts | When the process that took it ends. If the running process is kept because nothing changed, the turn's new folder is removed straight away |
| OpenCode | One per conversation, replaced by each turn | When the conversation goes idle or ends, with the rest of its staging |
