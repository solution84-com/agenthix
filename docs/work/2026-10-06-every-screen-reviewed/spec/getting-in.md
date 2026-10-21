# Installing, setup, signing in and onboarding

Part of the unit's [spec](README.md).

Agreed on its own boards, one per feature (2026-10-11). HQ is the organisation's own
([adr-0042](../../../adr/adr-0042-hq-is-the-orgs-own.md)), so every way in carries the organisation's identity, not
ours. HQ keeps no email address and Agenthix sends no email.

## The ways in

- **Two names, kept apart.** **Setup** happens once per HQ, for its first admin, and carries our brand. **Onboarding**
  happens for every invited person, and carries the organisation's. Both start from an invitation link,
  `/invite/<code>`: the first admin's opens setup, everyone else's opens onboarding. Setup then lives at
  `/setup?step=…` and onboarding at `/onboarding?step=…`. There is no `/accept-invite` and no forwarding from it.
- **Invite only.** Nobody signs up without an invitation; the framework's sign-up route stays refused.
- **Password only, for now.** Passkeys, single sign-on and signing in with an Agenthix Cloud account are designed with
  the cloud offering.
- **Four ways in:** the first person on a fresh HQ, an invited person, someone returning, and someone who has forgotten
  their password. Each ends where the person's work begins.
- **Our name stays out of the organisation's data.** The product's name appears on screens and in the installer's
  words, never in what is stored — an agent's name or handle, a default, a seeded row.

## Installing

- **One command, two questions.** From the repository, with only Docker installed, `./agenthix install` asks where
  people will open Agenthix (`HQ_URL`, default `http://localhost:4100`) and whether to run agents on this machine too.
  - It makes every secret inside a container, so nothing else need be installed: hq's database password,
    `JWT_SECRET`, `SECRETS_MASTER_KEY` for hq and for the site, and `HQ_PAIRING_SECRET`.
  - It writes `hq/compose.env` and `site/compose.env`, the pairing secret already the same in both, and never prints a
    secret. It says to keep a copy of both files: without them, saved keys and logins cannot be read.
  - It builds and starts HQ and its site, waits until HQ answers and the site is connected, and ends by printing the
    first-admin link.
  - Running it again is safe: an existing value is never replaced.
- **A further site** on another machine still connects with `agenthix-site register <hq-url>`.
- Considered and rejected: HQ making its own secrets in a data volume, with the site reading the pairing secret from a
  shared one. It moves secrets out of the settings files, needs HQ and its site in one compose project, and makes
  backing up the master key a matter of finding a volume.

## Setup — the first admin, once per HQ

- **No standing key.** `SITE_ADMIN_KEY` goes: from the settings, from the start check and from the Settings list.
- **A one-time link.** While HQ has no users, it makes a one-time key, stores only its hash with a 24-hour expiry, and
  prints in its log: "No admin yet. Open this link to set up Agenthix (valid 24 hours)", with the link built from
  `HQ_URL`, never the browser's address. Each start with no users makes a fresh key and the old one stops working;
  `./agenthix invite-admin` prints a fresh one without restarting.
- **The link** is an invitation, `/invite/<key>`, and opens setup's account step with the key already filled in: no
  code field. Once read, the key leaves the
  address bar. The same checks as today: compared in constant time, accepted only while no user exists, the account
  made in one transaction under an advisory lock.
- **Setup is three steps and a review**, once per HQ — an admin invited later accepts an invitation like anyone else
  and is never sent through setup. The step is in the address (`/setup?step=…`), so a refresh keeps it and Back and
  Forward move between steps; `/setup` alone starts at step 1. Every step after the first has **Back**. Setup is two
  columns, the form on the left and, on the right, our brand until the organisation has a picture or cover, then a
  live preview of its sign-in page (the real page, scaled down); the sign-in page itself is one column.
  Setup is not yet the organisation's HQ, so it carries **our** brand: the Agenthix mark and name at the top of
  each step, and no "Powered by Agenthix", which belongs on the organisation's own pages.
  1. **You:** "You're the first person here, so you'll be its admin" — name, username, password. Once the account
     exists, coming back shows the name to edit, the username (which can't change) and the password as set.
  2. **Your organisation:** name, an optional picture and an optional cover, each upload showing what was uploaded,
     with Change and Remove, and what the image should be (square at least 256×256, or wide about 1600×400; PNG, JPG
     or WebP, up to 10 MB). Vision, mission and handle are added later on the Organisation page.
  3. **Model access, optional but asked for:** "Agents need a model to answer. Add at least one — you can change
     this any time." One **Add model access** menu, each option saying what it gives access to: **Claude
     subscription** (recommended) — Claude models, on the admin's own Claude account
     ([adr-0105](../../../adr/adr-0105-a-run-uses-the-login-of-the-person-it-is-for.md)); **Anthropic API key** —
     Claude models; and, under *Other providers*, **OpenRouter**, **OpenAI**, **Google Gemini** and **your own
     endpoint**. The options speak of models, never runtimes: a key is used by whichever runtime an agent runs on
     that can use it. Choosing one opens a small dialog (a sheet on the phone): the Claude sign-in, or that provider's
     key. What is set is listed with whose it is (yours, or the organisation's) and **Remove**; the menu leaves out what
     is set. Continue reads **Skip for now** until something is set. HQ's own site shows here only when it is not
     connected, since Sign in with Claude needs it.
  4. **Review:** each step summarised — the person, the organisation with its images, the model access with what
     each gives access to (or "Not set — agents can't answer until one is set") — each with **Edit**, which returns to
     the review; and **Where agents run**: HQ's own site and whether it is running, with no Edit. Then **Finish**.
- **Then Home and the first conversation.** Today's Welcome and Done screens go. While *Jump back in* is empty, Home
  shows suggestions sent to the built-in agent — "What can you do?", "Set up my first project", "Invite my team";
  suggestions at each stage of a person's experience come later.
  The built-in agent keeps its neutral name, **Kernel** (`@kernel`), and its instructions cover helping with the rest
  of setup. No product name is stored in an organisation's data: a name or handle written into every HQ's database
  could not change without converting stored data, should the product's name ever have to change.
- **Skipped steps live where they belong:** cover and mission on Organisation; inviting people in Organisation › People;
  a person's own model login in Settings › Your model logins; the organisation's model access in Organisation ›
  Settings; sites in Organisation › Infrastructure. Without model access, a line under Home's message box says agents
  cannot answer yet and links to the fix, and admins see it in Needs attention. Today's global model-access banner goes.

## Signing in

- **The sign-in page shows the organisation, in one column:** a cover banner across the top with the organisation's
  picture overlapping its lower edge, its name, handle and vision under it, then the form in one centred column on
  white — "Sign in to Acme Corp's HQ". Before a cover is set, a plain cover with its initial; never our logo. An admin chooses
  whether the page shows the whole cover, the name only, or nothing.
- **One title, one action:** Username, Password, **Remember my username**, **Forgot your password?**, **Sign in**, and
  "New here? Ask an admin of Acme Corp for an invitation."
- **After signing in, where they were going:** the address they opened, else Home.
- **A wrong password** says "That username and password don't match", never which was wrong. After 10 wrong tries in 15
  minutes, that address waits 15 minutes, as invitation codes already do.

## Onboarding — every invited person

Onboarding mirrors setup's shape — steps in the address, Back on each, a last look before starting — but it is the
organisation's: every screen carries its identity (the one-column cover banner and picture of the sign-in page) and
"Powered by Agenthix". The step indicator counts the steps the person has to do; the last look is not counted.

1. **Join** (`/invite/<code>`; the code leaves the address once read): "Avery invited you to join Acme Corp as a
   Member, and to Website Redesign and Merchant app", with the invitation's label and when it closes; **their name**,
   a username and a password; **Join Acme Corp**. No "Invite code verified" step, and the role is words, not a
   coloured badge. Beside the form, a few people already in the organisation and the projects they are joining. Once
   the account exists, `/onboarding?step=join` shows it to review and edit, as setup's first step does.
2. **You** (`/onboarding?step=you`): a picture (uploaded and shown, with Change and Remove) and a time zone, filled in
   from the browser and changeable; beside it, how they will appear to others.
3. **Model access, only when needed** (`/onboarding?step=model`): shown only when neither the organisation nor their
   projects give them model access — "Acme Corp has no shared model access for your own conversations" — offering
   their own Claude subscription through the same **Add model access** menu as setup. Skipped otherwise.
4. **A last look** (`/onboarding?step=review`): them, their model access (or "Provided by Acme Corp") and what they are
   joining, each with **Edit**; then **Start working**.

**Where they land:** the first project the invitation names, with its message box ready and a one-time welcome line;
every project the invitation adds is pinned for them. With no projects named, Home.

**The invitation link** is built from HQ's configured address. When that address works only on this machine, the
admin is told before sending it.

## Getting back in

Every way back in is an admin acting in the app, or someone who can run commands on HQ's machine — the same proof of
control the site's `agenthix-site` relies on. Nothing waits in the configuration.

- **Forgot your password?** on the sign-in page explains that HQ keeps no email, says to ask an admin of the
  organisation for a reset link — naming no one, since the page is public — and says what the only admin can do.
- **Another admin resets it:** Organisation › People › the person › ⋯ › **Reset password** makes a one-time link, valid
  for 1 hour, shown once, built from HQ's configured address, for the admin to send. No one learns the new password.
- **The only admin:** `./agenthix reset-password <username>` on HQ's machine prints the same kind of link; any other
  admins get a notification that a password was reset from HQ's machine.
- **No admin can get in** (the only admin left or was erased): `./agenthix invite-admin` also works when users exist,
  making an admin invitation valid for 24 hours. The invitation is recorded as coming from HQ's machine, and Organisation › People shows the new admin as "Invited
  from HQ's machine".
- **The reset page** names the account and who made the link. Setting the password signs them in and ends their other
  sign-ins. Changing one's own password in Settings › Sign-in stays as it is.

## When something is not right

Each problem screen shows the organisation's identity, says plainly what happened, and offers one way forward.

- **An invitation that no longer works** (expired, used, withdrawn): one sentence naming who to ask, and Sign in
  instead. An unknown code still says only that it does not work.
- **The first-admin link after setup:** "Acme Corp's HQ is already set up", with Sign in.
- **A removed person:** "You no longer have access to Acme Corp", on its own page.
- **Opening an invitation while signed in**: "You're
  signed in as Avery. This invitation is for someone new." **Sign out and continue** or Cancel; never a silent switch.
- **HQ's site not connected during setup:** the model-access step says so and what to check, with Check again.

## New behaviour this design needs

| Feature | What it does |
|---|---|
| **One command installs HQ and its site** | `./agenthix install` makes every secret, writes both settings files already paired, builds and starts both, and prints the first-admin link. Today a Docker install means copying two files, making six secrets by hand and pasting the pairing secret into both |
| **A one-time first-admin link** | While HQ has no users it makes a key, stores its hash with a 24-hour expiry, and prints a link from `HQ_URL`; restarting or `./agenthix invite-admin` makes a fresh one. Today `SITE_ADMIN_KEY` is invented by the installer, required for ever, never expires, and is pasted by hand |
| **Recovery without email** | An admin's one-time reset link; `./agenthix reset-password` and `./agenthix invite-admin` on HQ's machine for a locked-out or missing admin, recorded and announced. Today there is no recovery at all (blocks release) |
| **Setup once, in three steps and a review** | You · Your organisation · Model access (optional) · Review, kept in the address, then the first conversation with suggestions; setup runs once per HQ. Today Welcome, Organisation and Done, with no model access, and any admin who has not finished it is sent through it, so an admin invited later is asked to rename the organisation |
| **The organisation before sign-in** | A public read of the organisation's name, handle and vision (its images are already served without sign-in), and an admin's choice of how much the sign-in page shows |
| **Signing in goes where you were going** | After signing in, the address first opened, else Home. Today always Home |
| **Sign-in attempts limited** | 10 wrong passwords in 15 minutes from one address make it wait 15 minutes. Today only invitation codes are limited |
| **An invitation says what it is, and asks a name** | The invitation page reads the organisation, the inviter and the projects; accepting stores the person's name, pins the projects it adds, and lands them in the first. Today no name is stored and a new person lands on an empty Home |
| **Accepting while signed in asks first** | Sign out and continue, or Cancel. Today it silently replaces the session |
| **Links from HQ's address** | Invitation, reset and first-admin links are built from HQ's configured address. Today from the admin's browser |
| **The built-in agent helps with setup** | Its instructions cover the rest of setup, and the unused "org setup" completion goes; it keeps the name Kernel, so no product name is stored in an organisation's data. Today its instructions say onboarding is not its job |
| **Model access asked for where it is missing** | A line under Home's message box and a Needs attention item replace the global banner that tells a subscription owner to "Set an API key" |
