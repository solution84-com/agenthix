# Notifications and Runs

Part of the unit's design spec: see [the index](README.md).

## Notifications and Runs

They stay separate because they answer different questions.

| | Notifications | Runs |
|---|---|---|
| Question | What needs me, or concerns me? | What are agents doing? |
| Items | Messages addressed to the person; kept until handled or dismissed | Live runs; change constantly |
| Count | Needs you not yet seen, red | The person's runs going now, green |
| Acts | Approve, deny, renew, open, dismiss | Approve, stop, cancel, open |

Each opens as a **panel beside the navigation**, over the screen's content, without covering the conversation's
message box or the tools panel. Closing it returns to exactly where the person was. Agreed on its own mockup.

**Every item is two lines and one action.** Line 1: what it is, with its key (*WEB-27 Fix the checkout redirect*).
Line 2: why, or the agent, place and state, in one line. At the right: the time and one button.

**The Notifications panel:** **Needs you** first, then **Earlier** (read, or handled). An item is marked seen once
it has been in view in the open panel; a Needs you item stays there until it is handled. A **persistent
notification** is a kind any feature may raise: it stays under Needs you until what it is about is addressed, or
until a person dismisses it where its kind allows. Execution Sites raises the first ones ([Execution Sites](sites.md)). **The bell counts what is
new and what is still wrong:** Needs you items not yet seen, plus every persistent notification still open, seen or not, so the bell stays lit while a site is down. Persistent is a class a notification's kind declares, and there is only ever one per thing and problem: it stays open while the problem lasts and comes back up, not twice, if the problem returns. The Needs you heading keeps the total. One item per task: its latest request. A waiting item moves to
Earlier by itself when the run moves on or someone answers it. "Needs you" lives here and not on Home.

**The Runs panel** is personal: filters **All of mine · Started by me · On my behalf**. It is grouped:

- **Waiting for you** — runs stopped for a person, each with its action (Approve…).
- **Running** — each with how long, and a **Stop**.
- **Queued** — each with the reason it waits (for example "next round 14:30") and a **Cancel**.
- **Finished** — the last three days, with how it ended. A click on any row opens its task or conversation.

Line 2 names who started a run only when it was not the person: "by automation", "for Ana". A waiting run shows in
both panels — as a request in Notifications, as a run in Runs — and answering it in one clears the other.

**One button per item, and it acts at once:** a waiting request's button is **Approve**, which approves it
there; Deny and everything else are a tap on the item away. **Tapping an item** opens it inside the panel,
which it takes over with one header row (‹ Notifications · WEB-27, or ‹ Runs): the task and its agent, what the agent wants to run, its reason in its own words, Approve, Deny
and "Open the task". A long command shows its first six lines, then **Show the full script**.

**Show all ›** at the top of the Runs panel leads to the Runs screen, the only way in.

### The Runs screen

Agreed on its own mockup. The panel is what needs the person now and a little of what finished; the screen is all of
their runs, for looking back. A run is as the [Terms](README.md#terms) define it.

- **The list** is the person's own runs, as the panel's filters say (All of mine · Started by me · On my behalf),
  grouped Waiting for you, Running, Queued, Finished. It loads the newest 25; **Older runs ›** adds the next 25,
  keeping the place, and goes when there are none. **When**, **place**, **agent**, **how it ended** and **search**
  narrow it first. No total is shown. Each page is one request per site, never one per conversation or task.
- **One run is open beside the list.** Arriving from Show all, the newest is open; picking a row shows that run.
  There is no close. A run has its own address, `/runs/<run>`, carrying its conversation or task so it is found in
  one request: on desktop the list with the run beside it, on a phone the run alone with ‹ Runs. Someone who may not
  see it reads "This run isn't available".
- **A run shows** what it was for and where; the agent; who started it and for whom; its **runtime and model**
  together; its usage (tokens, an estimated cost, energy); the site; when and how long; how it ended, with the
  error; what was asked and who approved it; and its tool calls. Its buttons are **Open the task** or **Open the
  conversation**, and **Stop**, **Approve** and **Deny** while it is live. There is no Run again: a run is history.
- **Tool calls** are listed in order, one line each with the time and its **risk label**; High and Flagged stand
  out; a call that asked first says who approved it; a blocked call says why; **All · High and Flagged** switches
  between them. Tapping a call opens it in place to inspect its input and output; a long one shows its first lines,
  **Show all N lines** and Copy.
- **Empty states:** with no runs at all, what will show here and **Start a conversation**; with filters that match
  nothing, "No runs match" and **Clear the filters**.
- **Organisation-wide** views of runs, and the organisation's Stop all, are decided with the organisation's numbers
  ([Not in this pass](README.md#not-in-this-pass)); until then admins keep that Stop all on this screen.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **A waiting task raises a notification** | When a task starts needing its person (run state "Needs you"), the person it runs on behalf of gets a notification with an action to open it. Today only approvals, model-access health and organisation setup raise notifications |
| **The Runs screen** | All of a person's runs, 25 at a time with filters and search, one opened beside the list with its own address; a run's runtime, model, usage, approvals and tool calls with their risk labels, each call opening to show its input and output. Each tool call's id is kept on its transcript line so a call finds its own output. Today /runs is the panel's last three days in a card, a row opens the whole conversation or task, and nothing shows a run's tool calls or their risk labels |
| **The Runs panel reads once per site** | The panel reads its runs with one request per site, not one per conversation or task as today |
| **An approval is for the next run only** | A run never waits for approval: what needs it is refused and listed, and the run ends with the list. Approving starts the next run — of the task or the conversation alike — and that run alone gets what was approved, with a note telling the agent; after it, the levels apply again. A request nobody answered is replaced by anything newer in its task or conversation (a new message, Run again, Dismiss, a newer run) and leaves Needs you, the Runs panel and the approval card. Today a conversation's approval resumes nothing, a task's latest approval is carried into every later run, and a dismissed or superseded request stays waiting forever |
| **Persistent notifications** | A notification kind any feature can raise, kept under Needs you until what it is about is addressed or, where its kind allows, dismissed; it clears itself when addressed. Today a notification is handled only by the action it carries |

## Not in this pass

- How a request was answered, and by whom, on its notification; older requests superseded where a new
  one is created, not when the list is read.
