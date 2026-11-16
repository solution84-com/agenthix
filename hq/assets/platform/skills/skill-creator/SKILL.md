---
name: skill-creator
description: How to write a good skill and get it published — whether something belongs in a skill, in instructions or in knowledge; the skill format; and proposing it with propose_skill instead of writing it into files. Use when a person asks you to make, change or capture a skill, or when you see a routine that is worth writing down as one.
---

# Writing a skill

A skill is written steps that agents follow for one kind of task. Agents draft skills; people publish them. You
write a skill only by proposing it with `propose_skill`. Never write a skill folder into files yourself.

## 1. Decide whether it is a skill at all

Three things shape what an agent does. Pick the one that fits:

| It is… | Write it as… | Because |
|---|---|---|
| A rule for all work, every turn ("always answer in British English") | **Instructions**: ask a person to add a line to the organisation's or the project's instructions | Instructions apply every turn |
| A way to do one kind of task ("how we review a checkout change") | **A skill** | A skill applies when the task matches its description, or when a person picks it |
| Something to know (a policy, a decision, reference facts, a process) | **Knowledge**: a page, with `write_knowledge` if a person asked you to | Knowledge informs; it is read when someone looks it up |

**A process is both:** write the process once as a knowledge page, and make the skill short, saying when to follow it
and pointing to the page ("When asked for release notes, read `org:processes/release-notes.md` with
`read_knowledge` and follow it"). A skill instructs; knowledge informs.

If it is not a skill, say so to the person and suggest the right place. Stop here.

## 2. Check it doesn't exist, and agree it with the person

1. Look at the skills you already have. If one covers this, propose a change to it instead (step 4, with `edits`).
2. When the person asked you for the skill and said its steps, their ask is the yes: go on to step 3. Otherwise
   tell the person, in a short message: the skill's name, when it applies, its steps (5 to 10), what it produces,
   and where you saw it done. Ask whether to propose it.
3. Wait for their yes. If they change it, confirm the new version. If they say no, drop it and don't raise it again
   unless something new comes up.

## 3. Write it

A skill is a folder whose name is the skill's name: lowercase letters, digits and single hyphens, at most 64
characters, such as `checkout-review`. In it, `SKILL.md`:

```markdown
---
name: checkout-review
description: Review a change to the checkout. Use when a change touches src/checkout or the payment settings.
---

# Checkout review

One or two sentences: what this is for.

## Steps

1. Do X. Give the exact command, tool or path when it is not obvious.
2. Do Y.

## When you are done

What to report, and where.

## Rules

- What never to do while following it.
```

- **The description is what agents see** before they open the skill, so it decides whether the skill is ever used.
  Say what it does and when to use it, in one or two sentences, at most 1024 characters.
- **Write for an agent:** short imperative steps it can follow without reading anything else. Only the steps the
  routine needs; nothing optional or speculative.
- **Keep it short.** Under about 400 words is a good size; over 500 lines is too long. If it does two things, make it
  two skills.
- **Other files** (a script, a longer reference) go beside `SKILL.md`, such as `scripts/check.sh`, and `SKILL.md`
  says when to use each. Every file `SKILL.md` names must be in the proposal.
- **Front matter** keeps only these keys when the skill runs: name, description, when_to_use, argument-hint,
  disable-model-invocation and user-invocable. Other keys are ignored. `user-invocable: false` hides it from the people's
  `/` list; `disable-model-invocation: true` means only a person can start it.
- **Never put a secret, token or password in a skill.**

## 4. Propose it

Call `propose_skill` with:

- `name` and `description`: as in `SKILL.md`.
- `files`: each file's path in the folder mapped to its text, `SKILL.md` included.
- `why`: one or two sentences for the person who reviews it.
- `aim`: `project` (every agent working in this project), `organisation` (the organisation's Library), or `person`
  (the person you work for, in their own conversations). Choose what the person asked for; if they didn't say,
  choose `project` for something about this project's work, and ask when unsure.
- `edits`: only when changing an existing skill: its Library name (`publisher/name`) or its folder name in this
  place.

The answer says whether it became the person's draft, which they publish, or a proposal waiting for review. Tell the
person which, in one line. If it lists problems, fix them and call again. You may propose at most 5 skills in one run.
You hear on a later turn whether it was accepted.

## Rules

- Never write a skill into `.agents/skills/`, `.claude/skills/`, `.github/skills/` or an agent's skill folder, and
  never ask another agent to. `propose_skill` is the only way.
- Never publish, switch on or install a skill yourself. A person does.
- One skill per routine. Only write down what has been done successfully, not what might work.

For how people review and publish skills, search the guide with `search_knowledge` (scope `platform`, pattern
`skill`) and read the page it finds with `read_knowledge`.
