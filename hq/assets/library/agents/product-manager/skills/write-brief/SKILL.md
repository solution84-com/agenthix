---
name: Write Brief
description: Translate confirmed vision into a unit of work's brief, in the project's files.
---

# Write Brief

Use this skill after the `understand-vision` interview is complete and the user has confirmed your summary.

## Before Writing

You must have:
- A confirmed vision summary from the user
- Answers to at minimum: what we're building, who it's for, what problem it solves, and key constraints
- Which unit of work this brief is for — a date and a short, hyphenated slug (e.g. `2026-09-27-onboarding-flow`)

If these are missing — run `understand-vision` first.

## Brief Structure

Write `work/<YYYY-MM-DD>-<slug>/brief.md` in the project's files (date = today, slug = the unit of work) using this exact structure:

```markdown
# Brief: [Unit of Work Name]

> Last updated: [date]

## Vision
One paragraph. What we are building and why it matters.

## Problem
What is the specific user problem we are solving? Who has this problem? What are they doing today instead?

## Goals
3-5 measurable outcomes. Be specific.
- Example: "Users can onboard without human support"
- Example: "Agents develop the product autonomously with fewer than 2 approval touchpoints per cycle"

## Scope

### In Scope
- [Feature or capability that is included]

### Out of Scope
- [Feature or capability explicitly excluded]

## Constraints
- Time: [deadline or horizon]
- Team: [who is available]
- Technology: [platform decisions already made]

## Success Criteria
How we know we have shipped successfully.

## Open Questions
Unresolved items that could materially affect the plan.
```

## After Writing

1. Show the draft: "Here is the brief I have written. Does this capture what you described?"
2. Revise once if the user has feedback — keep the revision focused
3. After confirmation: write `work/<YYYY-MM-DD>-<slug>/brief.md` to the project's files
4. Report: "Brief saved to `work/<YYYY-MM-DD>-<slug>/`. Ready to write the roadmap when you are."

## Rules

- Never commit the brief without user confirmation
- Keep the brief to one page — if it is longer, cut it
- Open Questions must be resolved before writing the roadmap
