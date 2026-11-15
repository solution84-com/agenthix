---
name: Read Context
description: Read the project roadmap, the brief for the unit of work in hand, and the current sprint plan before any planning work. Must run before any other skill.
---

# Read Context

Use this skill at the start of every planning session. Establish what is current before doing anything.

## Step 1: Read Strategic Artifacts

Read, from the project's files:
- `ROADMAP.md` at the root — what phase are we in, what are the deliverables
- The brief for the unit of work in hand, at `work/<unit>/brief.md` — if it is not already clear which unit that is, list `work/` to find it

From the roadmap, identify:
- The current phase name and its deliverables
- The exit criteria for the current phase
- What has already been completed (Story So Far)

## Step 2: Find and Read the Current Sprint Plan

List files in the project's files `sprints/` directory. Find the most recent sprint plan (highest date). Read it and identify:
- What deliverables are committed for this sprint
- Which ones are complete vs in progress vs not started

If no sprint plan exists — use `write-sprint-plan` before proceeding with anything else.

## Step 3: Check the Task Board

Use `list_projects` to find the relevant project, then `get_board` to see the current task state.

Note:
- Tasks in DONE since you last looked (need review)
- Tasks that are RUNNING or QUEUED (in progress)
- Tasks that are BLOCKED or FAILED (need attention)

## Output

After running this skill you should know:
1. What roadmap phase we are in and its deliverables
2. What this sprint is delivering and current status
3. The state of the task board

Carry this context into every subsequent skill you run this session.
