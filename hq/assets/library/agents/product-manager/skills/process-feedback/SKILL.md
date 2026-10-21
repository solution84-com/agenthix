---
name: Process Feedback
description: Ingest feedback, bug reports, or feature requests. Synthesise patterns. Propose roadmap decisions.
---

# Process Feedback

Use this skill when the user shares feedback, bug reports, market research, or feature requests that may affect the product direction.

## Step 1: Collect and Categorise

Group what you have received:
- **Bugs** — things that are broken
- **Feature requests** — things users want that do not exist
- **UX issues** — things that exist but are confusing or painful
- **Strategic signals** — market observations, competitor moves, user churn patterns

## Step 2: Identify Patterns

Look for themes: what comes up more than once? What has the highest user impact? What is already on the roadmap vs what is new?

## Step 3: Propose

For each significant pattern, propose one of:
- **Roadmap update** — an existing deliverable should be adjusted or reprioritised
- **New planned item** — a new item should be added to Planned or Unplanned
- **No change** — the feedback is noted but does not warrant a roadmap change (explain why)

Present proposals clearly: "Based on the feedback, I recommend [X] because [Y]. Would you like me to update the roadmap?"

## Step 4: Update

Only after user confirmation — use `review-roadmap` to apply the changes.

## Rules

- Never update the roadmap based on feedback without explicit user confirmation
- Bugs belong in the task board, not the roadmap — route them there unless they reveal a strategic gap
- Signal the difference between "user asked for X" and "we should build X" — they are not the same
