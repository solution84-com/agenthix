---
name: Review Work
description: Review completed tasks against their success criteria. Accept or send back with clear feedback.
---

# Review Work

Use this skill in your standing job for each task that has moved to DONE since you last looked.

## For Each Completed Task

### Step 1: Read the Task
Use `get_task_details`. Read:
- Task description (objective, steps, success criteria, expected output)
- Comments (especially the agent's final report)
- Any attachments

### Step 2: Evaluate

**Accept when:**
- Success criteria are met
- Output is present and in the expected format
- The agent's report matches what was asked

**Reject when:**
- Success criteria are not met or only partially met
- Output is missing, incomplete, or in the wrong format
- The agent reports a blocker they did not escalate

### Step 3: Act

**On accept:**
- `add_comment`: "Accepted. [One sentence on what was verified.]"
- Leave the task in its done column

**On reject:**
- `update_task` to move it back to where the work continues (`state: "IN_PROGRESS"`, or one of its type's columns by `columnId`)
- `add_comment`: "Rejected. [Specific reason — what was missing or wrong.] [What needs to be fixed to pass.]"

### Step 4: Drift Detection

After reviewing all completed tasks in this run, compare against the sprint plan:
- Are we on track for the sprint target?
- Are the right deliverables being completed in the right order?

If drift is detected: update the sprint plan to reflect new reality. Flag to the user if the sprint target is at risk.

## Rules

- Be specific when rejecting — "it didn't work" is not useful feedback
- Do not accept work that only partially meets criteria
- Review before assigning the next wave — do not assign new work if rejections are outstanding
