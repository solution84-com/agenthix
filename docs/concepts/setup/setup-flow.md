# Setup

Setup happens once per HQ, for its first admin. It carries Agenthix's own brand, because the HQ is not yet the
organisation's: the Agenthix mark and name at the top of each step, and no "Powered by Agenthix". Everyone invited
afterwards goes through [onboarding](../onboarding/onboarding-flow.md) instead, in the organisation's identity.

Setup needs no Execution Site, agent or model credential to finish: a missing site or model login is shown, never a
reason the person cannot continue.

## Entry

The first admin opens the one-time link HQ printed in its log, or that `agenthix install` prints when it finishes (`/invite/<key>`, valid 24 hours, see
[invitations](../auth/invite-auth.md)). That page makes their account and sends them on to `/setup?step=organisation`.
`/setup` alone starts at step 1.

Setup is theirs only while it is unfinished: `needsSetup` (`hq/src/setup/setupState.ts`) is true for the person who
consumed the `FIRST_ADMIN` invitation, while `Org.setupCompletedAt` is empty and their role is admin. For anyone else,
and once it is done, `/setup` sends the person to Home. Home sends an unfinished first admin to `/setup`.

## The steps

The step is in the address (`/setup?step=you|organisation|model|review`), so a refresh keeps it and Back and Forward
move between steps. Every step after the first has **Back**. Setup is two columns: the form on the left and, on the
right, Agenthix's brand until the organisation has a picture or cover, then a live preview of its sign-in page.

1. **You** — name, username, password. The account exists already; coming back shows the name to edit, the username
   (which cannot change) and the password as set.
2. **Your organisation** — name, an optional picture and an optional cover, each showing what was uploaded, with
   Change and Remove.
3. **Model access** — optional but asked for. One **Add model access** menu that names models, not runtimes; what is set
   is listed with whose it is and **Remove**. HQ's own site shows here only when it is not connected.
4. **Review** — each step summarised with **Edit** (which returns to the review), and where agents run. **Finish**.

Finishing calls `completeSetup`, which records `Org.setupCompletedAt` and lands the person on Home. It never reaches
an Execution Site, so a site outage cannot hold setup open.

## Where the code is

| File | Role |
|---|---|
| `hq/src/setup/pages/SetupPage.tsx` | The page and its step state |
| `hq/src/setup/pages/steps/` | One component per step, the sign-in preview, the image upload |
| `hq/src/setup/queries.ts` | `getSetupData`: the organisation, whether setup is the person's, HQ's site |
| `hq/src/setup/actions.ts` | `completeSetup` |
| `hq/src/setup/setupState.ts` | Whose setup it is and when it is done |
| `hq/src/setup/hqSiteState.ts` | Whether HQ's own site is running |
