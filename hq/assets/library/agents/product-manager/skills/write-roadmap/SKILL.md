---
name: Write Roadmap
description: Produce ROADMAP.md from the confirmed brief, following the Agenthix roadmap structure.
---

# Write Roadmap

Use this skill after the unit of work's brief is confirmed and saved.

## Before Writing

Read the current brief: read the brief for the unit of work in hand from the project's files (`work/<unit>/brief.md` — list `work/` if it is not already clear which unit). If it does not exist — run `understand-vision` and `write-brief` first. Confirm all Open Questions in the brief are resolved.

## Roadmap Structure

Write `ROADMAP.md` in this exact format:

```markdown
# Roadmap: [Product Name]

> Living strategy document. Immediate focus in **Current**. Upcoming work in **Planned**.

---

## Vision
[Copy vision from brief — one paragraph]

---

## Launch Definition
What "done" looks like when the product is ready for real users. 3-5 bullet points.

---

## Current — [Phase Name]
**[Date range]**

[One sentence on what this phase achieves]

- [Deliverable 1]
- [Deliverable 2]
- [Deliverable 3]

> **Exit criteria:** [What must be true to call this phase done]

---

## Planned

### [Next Phase Name]
**[Date range]**
[One sentence goal]
- [Key deliverable]

---

## Story So Far

> Archive of completed phases. Added as phases complete.

---

## Unplanned

Items without a scheduled phase. Revisited as capacity allows.
- [item]
```

## After Writing

1. Show the draft: "Here is the roadmap. Does this match your timeline expectations?"
2. Revise once if needed
3. After confirmation: write `ROADMAP.md` to the project's files
4. Report: "Roadmap saved. The Project Manager can now plan from this."

## Rules

- Each phase must be achievable in 2-4 weeks
- Each deliverable must be specific enough for the Project Manager to plan tasks from
- Do not include implementation details — that is the Project Manager's domain
- If the roadmap requires more than 6 phases to be realistic, the scope is too large — tighten the brief first
