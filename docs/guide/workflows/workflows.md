---
title: Workflows
description: Review and approve a workflow, switch it on or off, run it, and follow its run.
sidebar:
  order: 1
---

A **workflow** is a named set of steps, each running in a container of its own, with only the secrets that step
names. It can take **parameters**, values that whoever starts it fills in. An agent writes a workflow and proposes it,
but it never runs until a person has approved that exact version, and a change to it is a new version that needs
approving again. Until you approve the new version, the one already approved keeps running.

Open **Workflows** in a project, under the project's tools. In your own space, **Workflows** works the same way for
your own secrets. Its count is the number of workflows, or **N need you** when versions are waiting.

![A project's Workflows before any workflow has been proposed](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.5/workflows-list.png)

## What the list shows

- **Needs you**, shown to the people who can approve: each waiting version, who proposed it and in which
  conversation, the reviewer's level, and **Review**. Everyone else sees **Waiting for an administrator**.
- **All workflows**: each one's name, what it does, its number of steps, the secrets it uses, its last run, an
  **On** or **Off** switch and **Run**. A workflow that is off is dimmed and can't be run.

Select a row to open the workflow. Its **Steps** tab shows the approved version as you would read it: each step, what
it runs, and the secrets that step gets, marked with a lock; a step with none says so. It also lists the variables,
the hosts the workflow may reach and its time limit. **Versions** lists every version, who proposed it, the
reviewer's level and who approved or declined it; tick two and select **Compare**. **Runs** lists its runs.

## Approve a version

Who approves: in a project, its administrators; in a person's own space, that person. Never an agent.
A wider GitHub permission in a person's own space also needs an organisation administrator.

When an agent proposes a version, Agenthix reads it twice before you decide:

- **Plain checks** look for risks with no guesswork: a secret printed or sent out, a host the files use but the
  workflow doesn't list, an install that isn't pinned to an exact version, a destructive command, a step that runs
  code from the workspace while holding a secret, and anything new compared with the approved version. Each one is a
  flag.
- **The reviewer** is a model that reads the files and gives a level, **low risk**, **look closely** or **high
  risk**, with up to five points that each name a file and line. It holds no secret and no tool, and it can be
  wrong. Read the flags whatever it says; it can't hide one. It needs a model provider the organisation has set up with
  an API key or address; without one, it says it could not read the version.

### From the card

The conversation shows a card with a one-line summary of the change, the reviewer's level and every flag. The card
offers **Approve** only when the plain checks allow it: no step newly gets a secret, no step that holds a secret
changes what it runs, no host, GitHub permission or parameter pattern changes, and nothing is flagged. Otherwise the
card offers only **Review all of it**, with the reason in one line. Only people who can approve see the buttons.

### The full review

**Review all of it**, or **Review** in **Needs you**, opens the version. From the top:

1. **The reviewer**, with its level and points.
2. **Checks**, the flags from the plain checks, the high ones marked.
3. **Changes**, what differs from the approved version, or from the version you compare it with, and **Settings
   that changed**.
4. **All files** and **Steps**, to read everything the version contains.

Select **Approve version N**, or **Decline**. A first version that gives a step a secret always needs this full
review. Declining leaves the approved version running.

## Switch it on or off

Use the switch on a workflow's row or at its top. **Off** stops anyone starting it and stops a run in progress;
only people who can approve can change it. To switch off every workflow that uses one secret at once, see
[Turn off what uses it](secrets-and-variables.md#turn-off-what-uses-it).

## Run one and follow the run

An agent runs an approved workflow when it needs it. You can run one yourself: select **Run** on its row. If it takes
parameters, a dialog shows each one with its rule in words, such as "Letters, digits, . _ / - · up to 100", and
refuses a value that doesn't match before anything starts. Choose the workspace under **Run on** if there is more
than one, then select **Run**.

The run's page has one row per step: waiting, running, passed, failed or skipped, with its time. The running step
opens to its live output, with every secret value shown as `***`; a failed run opens the failed step and says why.
Select **Stop** to end a run.

In a conversation, a run in progress shows in the work bar with the step it is on and **Follow the run**. When it
finishes it stays in the conversation where it ended, with its time or its failed step, and **Open the run**.

If a run prints a secret, hiding it works for the plain value and common encodings, not every disguise. The run's
page then says a secret was printed and hidden, and an administrator should replace it.
