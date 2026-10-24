---
name: Write Implementation Plan
description: Produce a detailed implementation plan per deliverable in the project repo docs/plans/.
---

# Write Implementation Plan

Use this skill for each deliverable in the sprint plan.

## Before Writing

You must have:
- Run `read-context` to understand the current phase
- Read the sprint plan deliverable description and exit criteria
- Brought the project repo up to date with the `pull` workflow (the repository connected to the workspace is already there)

## Implementation Plan Structure

Create `docs/plans/YYYY-MM-DD-{feature-slug}.md` in the project repo:

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Implement this plan task by task, in order, checking off each step as you finish it. Steps use checkbox (`- [ ]`) syntax for tracking.

## Summary

**Goal:** [One sentence describing what this builds]
**Scope:** [What is and is not included]
**Approach:** [2-3 sentences on the implementation strategy]
**Key decisions:** [Significant choices and why]
**Files changed:** [High-level list of files to create or modify]

---

### Task 1: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts`

- [ ] **Step 1: [Action]**
[Exact description with code if relevant]

- [ ] **Step 2: [Action]**
...

- [ ] **Commit**
`git commit -m "feat: [description]"`

---

## Deviations

_Filled in during finishing-a-feature. List anything that changed from the plan and why. If nothing changed, write "None."_
```

## Rules

- Every task must have exact file paths — no "find the relevant file"
- Every step must be actionable without reading anything else — the plan must stand alone
- Include actual code in steps where the implementation is non-obvious
- If you cannot write a step without guessing at the implementation, note it as a decision and flag to the user before proceeding
- One plan per deliverable — do not bundle unrelated work

## After Writing

1. Commit the plan to the project repo with `git`, then share it by running the `push` workflow (`list_workflows` shows it; if it is missing, waiting or off, say so and ask a person who administers the place)
2. Use `assign-work` to create tasks from this plan
