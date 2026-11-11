---
name: Kinds of error message, and a strategy for error handling — spec
description: Every message the screens give gets a kind and one of sixteen handlers, so a dialog stops the person only when stopping them is the point.
created: 2026-11-11
---

# Kinds of error message, and a strategy for error handling — spec

**Status:** Design agreed by the owner on 11 November 2026: the seven questions, the toast and the sixteen handlers.
Phase 1 (the recount and the map) next. The decision is [ADR-0185](../../adr/adr-0185-a-dialog-only-when-stopping-the-person-is-the-point.md).

## Purpose and outcome

The design system unit applied one rule: a message is never part of the page, so whatever needs attention became a
centred dialog. In the playtest that followed, a dialog for everything was too heavy. A passing network error while a
thread re-read its messages opened one; a site that was asleep opened one on every visit to the Agents page and twelve
other screens; the Fleet Console's dashboard opened one on the first refresh that failed. Being stopped on page after
page is jarring enough to put people off the product.

**Done when** a background read that fails once shows nothing, a site that is asleep opens no dialog anywhere, a
conversation's failures appear in its thread, every message in the screens is on the handler the map gives it, and the
owner's playtest finds nothing that stops them that should not.

## The principle

**A dialog stops the person. Interrupt only when stopping them is the point:** a press that failed, a question before
something that cannot be undone, or typed work about to be lost. Everything else is said without stopping them.

A builder's shortcut: **if the person did not just press something, it is never a dialog** — the one exception is typed
work about to be lost.

## Today

Drawn in [`boards/kinds-and-handlers.html`](boards/kinds-and-handlers.html), board 1:

1. A read fails once, and a dialog covers the conversation, with Close only.
2. One site is asleep, and the Agents page (and twelve other screens) opens a dialog on every visit.
3. A refresh fails once, and the Fleet Console's dashboard opens a dialog over figures still on the page.
4. Five failures use the browser's own `alert()`; three deletions use the browser's `confirm()`.
5. Fifty of the seventy-eight places that say a read failed offer Close only, and leave the page empty behind it.

**The scale** (11 November, before the recount): 578 messages in 314 files (hq 245, ui 29, console-web 40). About 219
stay dialogs, 124 become a quiet retry and 35 a soft nudge; the rest are unchanged. Phase 1 recounts them against
today's code.

## Design

### The kinds

Take the first that fits:

1. **Known before the press?** A refusal on the control.
2. **Part of the thing shown?** A failed reply, a held task, a run's failed step, a form field's error: drawn in the
   thing.
3. **A read the screen makes on its own?** (opening, polling, refreshing, catching up after a reconnect, more on
   scroll) A **quiet retry**. If it keeps failing, a soft nudge where the content would be. Never a dialog.
4. **Something shown is incomplete or out of date, and the person can carry on?** A **soft nudge** where that thing is
   shown.
5. **A conversation's own failure?** A soft nudge in its thread. A message not sent stays in the message box.
6. **About HQ as a whole?** The frame line. **About one thing someone should know or act on?** A notification.
7. **The press worked and the screen shows it?** No message. **The screen does not show it?** A toast.
8. **Otherwise** — the person pressed something and it did not happen, or typed work would be lost: a **hard alert**,
   the dialog.

### The sixteen handlers

A handler is where and how a message is said. These are all the handlers allowed, from loudest to quietest (boards 10
and 11):

| # | Layer | Handler | Used when | How it goes away |
|---|---|---|---|---|
| 1 | Over the page | Attention dialog | A press that failed; typed work about to be lost | Close, Try again, or its own action |
| 2 | Over the page | Confirm dialog | Before a press whose effects cannot be taken back once they happen: a deletion, work stopping or starting at once, wider reach or authority, unreviewed code running, a merge others build on, a safety check removed (a question, not an error) | Cancel or the action |
| 3 | Over the page | Toast | A press that worked whose result the screen does not show | By itself |
| 4 | Frame | Frame line | HQ as a whole: not answering; read-only during a move | By itself when it clears |
| 5 | Frame | Notification | One thing a person should know or act on, raised by HQ for the right people | Handled, put away, or clears itself |
| 6 | Frame | Call bar | During a call: what the agent is doing, reconnecting, the call ending | With the call |
| 7 | Page | Nudge in place of the content | A first read that failed through its retries; the site holding the content not answering; a final answer (not found, not allowed), in its own words and without Try again | By itself on the next good read; Try again |
| 8 | Page | Nudge in a meta line or row | Part of what the screen shows is missing or old | By itself when the cause clears |
| 9 | Thing | Line in a thread | A conversation's own failure; voice stopping | On reload, or when the action next works |
| 10 | Thing | Message box "Not sent" | A message that could not be sent; the words stay | When it is sent |
| 11 | Thing | Refused control | Known before the press; pressed anyway, it opens the dialog with the full reason | When the reason clears |
| 12 | Thing | Field error | A form field's own error, under the field: only a refusal of the value (any other failure of the same Save is 1) | When the field is fixed |
| 13 | Thing | Drawn in the thing | The failure is part of the record | Kept |
| 14 | Not on screen | Spoken | In a call, where the person may not be looking | — |
| 15 | Not on screen | Quiet retry | A read the screen makes on its own failed | The next good read |
| 16 | Not on screen | No message | The screen already shows the result | — |

**Not allowed anywhere:** a toast for an error or for anything to act on, a snackbar with buttons, a banner in the page
flow, a toned notice box, an inline alert line, and the browser's `alert`, `confirm` and `prompt`.

### Situation to handler

The table the error-handling skill holds (board 12):

| The situation | Handler |
|---|---|
| The person pressed something and it did not happen | 1, with Try again where there is a way |
| The person is about to do something that cannot be undone | 2 |
| An autosave keeps failing while the person types | 1 |
| The press worked and the screen does not show it | 3 |
| The press worked and the screen shows it, but out of date | Read again after success; 16 |
| A file handed straight to the browser | 16 (the browser shows the download); an export that arrives later is 3 |
| The press worked and the screen shows it | 16 |
| The screen knows before the press that a control cannot work | 11 |
| A form field's value is wrong | 12 |
| A read the screen made on its own failed once | 15 |
| …and kept failing, nothing on screen yet | 7 |
| …and kept failing, old content on screen for over a minute | 8, "Not up to date · read 10:42 · Try again" |
| A read whose failure today says nothing ("Loading…" for ever, an empty list, "not found") | 15, then 7 |
| A final answer: not found, not allowed, admins only | 7, in its own words, no Try again |
| A press that does the same work as an automatic read, or "Show earlier" | 1 (the automatic read's failure stays 8) |
| A site did not answer; part of the screen is missing | 8, in the meta line or the site's row |
| No Execution Site at all | 8 in the meta line where content is shown; 7 only where the list is empty because of it |
| HQ is not answering at all | 4; each screen's own nudges held back |
| HQ is read-only while it moves | 4; a save pressed meanwhile is 1 |
| Something about one site, provider or task needs a person | 5, to the people who should act |
| A change to a site is scheduled | 5, and the fact on the project's site line (13) |
| A conversation's action failed (Stop, Retry, Keep, Summarise, a card's button, Approve or Deny) | 9 |
| A message could not be sent | 10; a message accepted whose re-read failed is a quiet retry, never "Not sent" |
| Dictation stops part-way | 10's place under the message box, cleared on the next dictation; failing to start is 1 |
| Approve or Deny on a request card outside a conversation (a task's page) | 1 |
| A new conversation could not be started (no thread yet) | 1; the words stay in the box |
| Voice is about to end, or stopped, in a call | 14, 9 and 6 |
| A reply, task or run failed | 13 |

### The decisions

The seven questions on board Q1–Q7, and the toast on board 13, each agreed on 11 November:

1. **A press that failed is always a dialog**, with Try again where there is a way. It is the one message a person
   waits for; the playtest's weight came from background reads and sleeping sites, not from these.
2. **A conversation's own failures are a line at the end of its thread**, with Try again, not stored: gone after a
   reload or when the action next works. A message not sent stays in the message box with "Not sent · Send again". A new
   conversation, which has no thread yet, keeps the dialog.
3. **Voice ending or failing in a call is not a dialog.** It is spoken, it is a line in the thread (with Start voice),
   and the call bar shows the call ending. In a call the person may not be looking, and closing a dialog does not keep
   the call.
4. **The frame line holds only the state of HQ as a whole**: HQ not answering (a connection problem only the browser
   can know, so the bell cannot carry it) and HQ read-only during a move (today a dialog once per visit). One line at a
   time, the most serious first. A new frame line must pass the same test: about HQ as a whole, on every screen, clears
   by itself. One thing someone should act on goes to Notifications; a gap in one screen is a nudge on that screen.
   The Fleet Console has no frame line: most of its screens do not need HQ, so HQ away there is a Needs-you card and
   the menu's state words.
5. **A scheduled change to a site is a notification** to the people whose work runs on that site: dismissible, put away
   everywhere rather than per device, cleared by itself once the change is done, and saying so when it will stop work
   that is running. The project's site line shows the fact while it is ahead ("Kitchen Mac · restarts at 22:00"), as
   part of the page.
6. **A soft nudge never becomes a dialog by itself or on a timer.** A dialog comes only from a press the failure blocks
   (better: the control refused in advance with the nudge's reason) or from typed work about to be lost.
7. **The browser's dialogs go.** The three `confirm()` move to the confirm dialog, the five `alert()` to their kind, and
   the design guard refuses `alert`, `confirm` and `prompt`.
8. **A toast, for one purpose**: a press that worked whose result the screen does not show (Copied; Invitation sent).
   Never an error, never anything to act on, never something that happened elsewhere. An Undo toast in place of a
   delete's confirm is not part of this change: it needs deletions that can be taken back.

### The quiet retry

- **One policy for every read a screen makes on its own**: up to three retries after the first failure, at 1, 2 and
  4 seconds, each ±20 % so tabs do not retry together; none on a final answer (400, 401, 403, 404, 409, 422); a hidden
  tab waits and retries when it is shown. Set once as hq's query default, and as a wrapper for hand-written reads and
  the Fleet Console's polls. Queries with a retry rule of their own keep it.
- **Nothing is shown during the retries** (about seven seconds).
- **Data before error**: a screen checks whether it holds content before whether its read failed, so a failed
  refetch never replaces what the person is reading.
- **After them**: nothing on screen yet → handler 7; old content on screen → it stays, with no message until the last
  good read is over a minute old (or two poll intervals, whichever is longer), then handler 8. A poll keeps polling;
  the nudge goes on the first success.
- **HQ not answering** — the live connection down and reads failing for 30 seconds — is the frame line, which holds
  back each screen's own nudge while it shows.
- **A site that did not answer** is not retried by the page: HQ already waited for it. It is a nudge at once; the
  page's normal poll is its retry.

### How a nudge looks and where it sits

- One line of small secondary text: a small outline icon, the words, and at most one plain-text action ("Try again",
  "Which", "Dismiss"). No box, no fill, no state colour. `role="status"`, so a screen reader hears it without being
  interrupted.
- **It wraps as one sentence**: the icon and the action flow inline with the words, and the action never breaks across
  lines. A nudge in a page's header takes its own line under the count rather than being appended to it.
- **It never moves a control.** It sits in a slot the screen has anyway: in place of the content (replacing the empty
  state, never beside it), in a page's or section's meta line, in a row's detail, or as a row after a thread's last
  message.
- **Once per cause**: shown once per screen, its words changed in place when the cause changes, not again on every
  poll.

### How a toast looks

A few words, no buttons, at the bottom centre above anything at the bottom (in a conversation, above the message box);
never over a control. It goes by itself after about four seconds and waits while hovered or focused; one at a time, a
new one replacing the last; `role="status"`.

### The shared pieces

- **In `@agenthix/ui`**: the `Nudge` (its places), the `Toast` and the one place that draws it, the frame line (hq only), one
  confirm dialog (replacing hq's `ConfirmDialog`, ui's `sessions/ConfirmDialog` and console-web's `ConfirmModal`), the
  retry policy (`backgroundRetry`, its delay, `retryRead`, one `isFinal`), `useBackgroundRead` (nothing during retries or
  while data is fresh; a nudge after), and a required `kind` (`'alert' | 'nudge'`) on `useAttentionWhen` and
  `ShowAttention`. `ReadFailure` becomes a nudge in place, with `retry` required.
- **In hq**: the retry policy as the query client's default; `useThreadNudges` for a conversation's own failures, drawn
  after the last message, and a conversation's own re-reads no longer reported as a failed action; the frame line in
  `ShellFrame`; a notification kind for scheduled site changes, replacing `ShellNotices`' dialogs.
- **The design guard test** refuses: the browser's `alert`, `confirm` and `prompt`; a message without a `kind`; a
  dialog handed a query's failure; a site's silence (`UnansweredSitesNotice`, `SilentSitesLine`) drawn as a dialog;
  `role="alert"` outside the dialog.
- **Behaviour tests**: one failed read shows nothing; after the retries, a nudge; a success clears it; old data shows no
  nudge until stale; a `Nudge` has the same height with and without it; a failed re-read in a conversation sets no
  action error.

### The error-handling skill

`.agents/skills/handling-errors/`, a repository skill so contributors follow it too. It opens with the principle, holds
the situation-to-handler table, names the helper for each handler, states the retry policy, and says how to check a
change: make it fail on purpose and watch what the person sees. It holds only rules agreed with the owner and proved in
this unit; `ui/DESIGN-SYSTEM.md` *Messages* keeps how each handler looks.

## Out of scope

- **An Undo toast in place of a delete's confirm**: it needs deletions that can be taken back, a change of its own.
- **Server-side error handling** (what the API returns, logging): this unit is about what the person sees; no route,
  message or stored format changes, so no version moves. The one exception, the scheduled-change notification, is
  checked against [`versioning.md`](../../architecture/versioning.md) in phase 3 in case the mobile app's client protocol
  carries notification kinds.
- **The wording of each message**: kept as it is unless moving it to its handler needs a change.

## Risks

- **Silence hiding a real outage.** The minute rule and the frame line prevent it; both are tested.
- **"Nothing here" against "could not ask."** A nudge in place of the content replaces the empty state, never sits
  beside it.
- **Layout shift.** A nudge uses a slot that is there anyway; a height test on `Nudge` and the reviewers check it.
- **Double retries.** Queries with their own retry rule keep it; console-web's hand-written polls guard against a retry
  overlapping the next poll.
- **Tests that look for the dialog.** Twenty-six test files assert the dialog after a failed read; each lane updates
  the ones it moves, in the same commit.
