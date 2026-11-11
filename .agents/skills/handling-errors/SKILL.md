---
name: handling-errors
description: Use whenever a change makes, moves or removes something the screens say about a failure, a refusal or a result — a failed press, a read that did not come back, a site that did not answer, a conversation's action that failed, a confirm before deleting, a success the screen does not show — in hq, the shared ui library or the Fleet Console. Says which of the sixteen handlers a situation gets, which piece draws it, the retry policy, and how to check it by making it fail on purpose.
---

# Handling errors

## The principle

**A dialog stops the person. Interrupt only when stopping them is the point:** a press that failed, a question before
something whose effects cannot be taken back, or typed work about to be lost. Everything else is said without
stopping them.

**If the person did not just press something, it is never a dialog** — typed work about to be lost aside.

The decision is [ADR-0185](../../../docs/adr/adr-0185-a-dialog-only-when-stopping-the-person-is-the-point.md); how each
handler looks is [`ui/DESIGN-SYSTEM.md`](../../../ui/DESIGN-SYSTEM.md) *Messages*.

## Which handler: take the situation's row

| The situation | Handler | Piece |
|---|---|---|
| The person pressed something and it did not happen | 1 Attention dialog, with Try again where there is a way | `useAttention().show`, or `useAttentionWhen` / `ShowAttention` with `kind: 'alert'` |
| An autosave keeps failing while the person types | 1 | the same |
| A refused control is pressed anyway | 1, with the full reason | `refusal` / `useRefusal` (it opens the dialog itself) |
| Before a press whose effects cannot be taken back (delete, stop or start work at once, wider reach, a merge, a safety check removed) | 2 Confirm dialog | `ConfirmDialog` (`@agenthix/ui/primitives`) |
| The press worked and the screen does not show it (Copied, Invitation sent) | 3 Toast | `toast(words)` / `useToast()` |
| The press worked and the screen shows it | 16 No message | — |
| The press worked and the screen shows it out of date | Read again after success; 16 | — |
| A file handed straight to the browser | 16 (the browser shows the download) | — |
| HQ is not answering at all; HQ read-only during a move | 4 Frame line (hq only; the screens' read nudges are held back) | the frame feeds `FrameLine`; `ReadNudgesHeld` |
| One thing someone should know or act on (a site down while work waits, a scheduled site change) | 5 Notification | a persistent notification in `hq/src/notifications` |
| During a call: the agent's state, reconnecting, voice ending | 6 Call bar | `VoiceBar`, `LiveLine` |
| A read the screen made on its own failed once | 15 Quiet retry (nothing shown) | hq's query default; `retryRead` for a hand-written read |
| …kept failing, nothing on screen yet | 7 Nudge in place of the content, replacing the empty state or "Loading…" | `useBackgroundRead(...).nudge` when `failedWithoutData`; `ReadFailure` |
| …kept failing, content held and over a minute old | 8 "Not up to date · read HH:MM · Try again" in the meta line | `useBackgroundRead(...).nudge` |
| A final answer: not found, not allowed, admins only | 7 in its own words, no Try again | `ReadFailure` with `final` |
| A site did not answer (not retried: HQ already waited) | 8 in the meta line or the site's row; 7 when nothing is held | `UnansweredSitesNotice`, `useSiteRead` (hq) |
| A conversation's own action failed (Stop, Retry, Keep, a card's button, Approve or Deny) | 9 Line in the thread, with Try again; gone on reload or success | `useThreadNudges` (hq), `Nudge place="thread"` |
| A message could not be sent; dictation stopped part-way | 10 In the message box's own slot; the words stay | the message box |
| A new conversation could not be started (no thread yet) | 1; the words stay in the box | — |
| The screen knows before the press that a control cannot work | 11 Refused control | `refusal` on `Button`, `Switch`…; `useRefusal`; `Refused` |
| A form field's value is refused | 12 Under the field (any other failure of the same Save is 1) | `FormField`'s `error` |
| A reply, task or run failed | 13 Drawn in the thing, kept | the thing's own card or row |

**Never:** a toast for an error or for anything to act on; a snackbar with buttons; a banner in the page flow; a toned
notice box; `role="alert"` outside the dialog; the browser's `alert`, `confirm` or `prompt`. The design guard
(`ui/src/__tests__/designGuard.test.ts`) refuses what it can match.

## Rules that are easy to get wrong

- **Check held data before the error.** Never `if (error) return <ReadFailure/>` over content the person is reading: a
  failed refetch must not replace it. `useBackgroundRead` decides: `failedWithoutData` → in place; data held → nothing
  until stale, then the meta nudge.
- **A read whose failure today says nothing** ("Loading…" for ever, an empty list, "No … yet", "not found") is a bug:
  give it the quiet retry, then 7. "Could not ask" is never drawn as "nothing here".
- **A re-read after an action is not the action.** Keep it out of the action's `try`: a message accepted whose
  re-read failed is never "Not sent" (the person would send it twice).
- **A hand-built nudge reads `ReadNudgesHeld`** and draws nothing while the frame line says HQ is not answering.
- **The signed-in person is never read again on its own** (hq's query client: `readsOnItsOwn`). Wasp's page wrapper
  replaces the whole app with an error box when that read fails, even with the person known, so a refetch on a page
  opening while HQ is away would stop the person. Keep it so.
- **A nudge never moves a control.** It uses a slot that is there anyway (in place of the content, a meta line, a
  row's detail, after a thread's last message); it wraps as one sentence with its action whole; `role="status"`.
- **A shared component used in a thread and elsewhere** takes its handler from its caller (9 in a thread, 1 elsewhere).
- **Words say what is true.** "HQ did not answer" only when it was HQ; a Fleet Console read that failed names the
  Fleet Console or Cloud.

## The retry policy

Three retries after the first failure, at 1, 2 and 4 s, each ±20 %; none on a final answer (400, 401, 403, 404, 409,
422) and none for a site that did not answer; a hidden tab waits. Nothing is shown during the retries (about 7 s).
`backgroundRetry`, `backgroundRetryDelay`, `retryRead`, `isFinal` in `@agenthix/ui/attention`; hq's query default is
`siteReadRetry`. A query with a retry rule of its own keeps it.

## How to check a change

1. **Unit tests** for what you added: one failure shows nothing; after the retries the nudge; success clears it; held
   data shows no nudge until stale; a press that fails opens the dialog.
2. **Make it fail on purpose** in the running app: block the request (`page.route(…, r => r.abort())` in Playwright),
   stop the site, stop hq. Watch what the person sees: nothing stops them unless they just pressed something; they can
   carry on; nothing jumps or covers a control.
3. The design guard passes.
