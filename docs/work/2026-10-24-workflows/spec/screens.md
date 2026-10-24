# Part 5 · Screens

What people see. The boards under [`../boards/`](../boards/) are the build baseline for each screen — layout, wording
and the phone view — and this part says what each must do. Every screen has a phone view, using the drawer and layouts
hq already has (the `app-layout` skill).

## Where it lives (U1)

- **Workflows**, in a project's *Agents at work* group, after Automation. Its count is the number of workflows, or
  *N need you* in the panel's existing needs tone when versions wait for approval.
- **Secrets and variables**, beside Members and Settings: set-up, set once by an administrator, rarely visited.
- **GitHub**, a project section of its own: the default account and the workspaces' repositories (below).
- A person's own space (`/space`) gets Workflows and Secrets and variables too, for their own storage.

## The Workflows section (U2)

- **Needs you** first, only for the place's approvers: each waiting version, who proposed it and where, the reviewer's
  level, the one-line change, *Review*. Others see *Waiting for an administrator*.
- **All workflows:** name, description, number of steps, the secrets it uses, its last run, the On/Off switch (approvers
  only; others see the state) and Run. Off rows are dimmed and Run is unavailable.
- Run asks for the parameters, if any, then opens the run. A row opens the workflow.

## A workflow (U3)

- Header: name, description, the approved version and who approved it, any version waiting, the switch, Run.
- **Steps** tab: the approved version as people read it — each step's name, what it runs (files one click away), and
  the secrets that step gets, each marked 🔒; a step with none says so. Then the variables with their values, the hosts
  and the time limit.
- **Versions** tab: every version — proposed by, reviewer's level, approved or declined by and when — any two
  comparable.
- **Runs** tab: this workflow's runs.
- **Run dialog:** each parameter with its rule in words (*Letters, digits, . _ / - · up to 100*), refused before sending
  if it doesn't match.

## Approving a version (U4)

- **The card in the conversation:** the one-line change written by the plain checks, the reviewer's level, every flag
  (a secret given to a step, a new host, a GitHub permission, a permission the App lacks). **Approve** only when the
  plain checks allow it (part 1); otherwise only **Review all of it**, with the reason in one line. Buttons only for
  approvers.
- **The full review**, on the workflow's page: the reviewer's points first, then the checks, then *Changes*, *All
  files* and *Steps*. Approve and Decline in the header; the approved version keeps running until a decision.
- A conversation's existing approval card (`APPROVAL_REQUEST` and `APPROVAL_ANSWER`) carries it; the version is
  identified by its hash, so an answer can only approve what was shown.

## A run (U5)

- **The run's page:** one row per step — waiting ○, running ●, passed ✓, failed ✕, skipped — with its time. The running
  step opens to its live, masked output; a failed run opens the failed step. **Stop** for anyone who could start it.
- **In the conversation:** while it runs, a card in the work bar with the step it's on and *Follow the run*. Once
  finished, it leaves the bar for the thread, placed where it ended: ✓ with the time, or ✕ with the failed step and its
  last line, and *Open the run*.
- A workflow's run is shown apart from an agent's runs: it is fixed steps, not an agent thinking.

## Secrets and variables (U6)

- **Two tabs, the same columns:** name and description, value, used by, changed, actions.
- **Secrets:** the value column says only the kind — text, file, *From GitHub* — never the value. Rotate-by shows a week
  before and *Overdue* after. ⋯ holds *Turn off what uses it*, Delete and the history. *Also on GitHub* shows where and
  when.
- **Variables:** the value in plain sight; Edit for administrators; the history old → new with who and when; the
  *looks like a secret* question.
- **Add a secret:** the form in part 3, then the `set-github-secrets` approval straight after, when ticked.
- **Turn off what uses it:** lists the workflows and any run in progress, then says what to do next.

## The GitHub page (G1)

*Manage organisation › Settings › GitHub*, in the admin area's left panel. Infrastructure's GitHub App card becomes a
link here.

1. **The App:** its name and owner, homepage, Disconnect; its permissions read from GitHub, each with what uses it, and
   that each run gets only what it declares; *Change on GitHub*.
2. **GitHub accounts:** *wants to connect* cards with Allow and Ignore; a table of accounts — what the App can reach
   (all, or N selected, with *can't create new repositories · how to fix*), whether the latest permissions are
   accepted, and *which places can connect* with Change.
3. **Install on one of your GitHub accounts**, and **Get an install link for a client** with the note to send.
4. **The Allow dialog**, in two sections, each list searchable: *Projects* (every shared project, or chosen ones) and
   *People* (none by default; a chosen person's own storage and personal projects).

## A project's GitHub section

The default account (a list of the accounts this project may connect to), the workspaces with their repository and
account (*default* or *changed*), and the workflows that reach GitHub with a link to Workflows. `/projects/:key/github`
opens it, instead of redirecting to Files as today.

## Connecting a repository (G2)

New or existing repository; the account, starting at the project's default; the name, checked as it is typed (*✓ Free on
acme-tests*); the how-to-fix note for a selected-repositories account; *Create and connect*. Then **When it's
connected**: the three starter workflows waiting, each with *Review*. *Approve all three* approves those the card rule
of part 1 lets the card approve; a first version of a starter always needs the full review, so it says so.

## A connected workspace (G3)

The workspace's About:

- the repository, with Disconnect;
- **Workflows that reach GitHub**, with their state and last run;
- **GitHub workflows in the repository**, with their last run, read from GitHub — run one through a workflow or on
  GitHub, with no second Run button here;
- **Secrets on GitHub**, by name, each saying whether it came from Secrets or is *Outside hq*.

The **Add a secret (sent to GitHub)** box in the workspace's About and the Operations panel is removed. Files' *Back up
to GitHub* line stays and opens the connect flow.
