# Logs and diagnostics

Part of the unit's design spec: see [the index](README.md).

Agreed on its own boards, one per feature, each shown as it is today and as it will be. **Logs and diagnostics** is
one page in **Organisation › Infrastructure**, for organisation admins only, like every Infrastructure page
([settings](settings.md)). It answers *what is wrong, and what have HQ and its sites recorded?* Later it moves with
the rest of Infrastructure to the separate portal of host management.

## Where it lives

- **Reached from** the **Logs and diagnostics** row on Organisation › Infrastructure. The row says how things stand,
  for example *6 errors in the last 24 hours · logs from HQ and 2 sites · support bundle*.
- **Admins only, for real.** A member who opens its address reads *Only organisation admins can see this*, as on
  every Infrastructure page. Today's debug page has no such check: any signed-in member who types `/debug` can open it
  and use its buttons.
- **`/debug` is removed, with no forwarding**, and so is the debug page (see *Today's developer tools* below).
- **The page, top to bottom:** Health, then Recent errors, then **Logs** and **Download support bundle** as buttons.
  **Check again** asks every site now; otherwise the page updates by itself. On a phone it is the same, in one
  column.

## Health

One card for HQ and one for each site, so everything it runs on is seen in one glance. Each card opens its own page
(Infrastructure › HQ, or the site's page) for the full facts.

- **HQ:** running since; version; whether its database answers (today's *Database Pulse*); when its scheduler last
  ran; how many sites it knows.
- **Each site:** its state as on Execution Sites; runs now against the most it takes; Docker; disk free — all from
  the health report it already sends. A site whose run store does not answer says so (computed today, never shown).
- **Gone:** *Fast-Track Engine* and *Concurrency Slots*, fixed values that describe nothing.
- **The public `GET /health`** answers `{"status":"ok"}` and nothing more, as the site's already does. Today HQ's
  also gives anyone its exact version and commit, which tells an attacker which known flaws to try. The version and
  commit stay on Infrastructure › HQ for admins, and are added to `./agenthix status` — answered by HQ only on its
  own machine — so hosting, upgrades and support can read them without them being public.

## Recent errors

Errors from every run, every site and HQ itself, **grouped by what failed**, with how often and when last — the last
24 hours, and up to 7 days with **All · last 7 days**. Three runs failing the same way are one problem with a count.

- **Each says what to do**, in plain words: *the login of the person the run was for has expired; they renew it in
  Settings › Your model logins*; *every run there fails until Docker is started on that machine*; *give the GitHub
  App access to that repository*. This replaces today's out-of-date guide and its fixed list of API keys.
- **Not only runs.** A site's problems (Docker not running, not connected) and HQ's own failures (GitHub, the
  scheduler) are errors too.
- **The whole organisation**, because the page is for admins. Today's table shows only the viewer's own runs.
- **A task run's error** links to its run on the Runs screen. **Another person's chat run** shows the error, the
  agent and the site, without the person, the conversation or a link: a chat is its owner's alone
  ([adr-0041](../../../adr/adr-0041-chat-session-privacy.md)).
- **No run table here.** Runs stay on the Runs screen.

## Logs

**Logs** opens the logs of one source at a time: HQ, or one of its sites. HQ's own site is named **HQ · Built-in site**, apart from HQ. Reading them no longer needs a terminal on
that machine.

- **Each line** has a date and time, a level (Error, Warn, Info), its source and its message; opening one shows it in
  full, with **Open the run** where it is about one and **Copy this line**.
- **Filters:** the level starts at *Errors and warnings* (*Everything* adds the informational lines); a time range
  starting at the last 24 hours; a search. **Follow new lines** keeps the newest in view. **Older lines ›** pages back.
- **Download** saves the chosen source and range as a text file.
- **Each service keeps its own logs on its own disk**, structured and rolling: **7 days or 100 MB, whichever comes
  first**, the oldest dropped first. Not a setting for now.
- **A site's logs are read from the site, over the channel it already has with HQ, when an admin asks** — opening that
  site's logs or building a support bundle. Nothing is copied into HQ's database, so a site that is not connected
  says so, and its logs can be read when it is back; its recent errors and last health report still show. Reading is not authority over the machine, so this fits host management's
  boundary.
- **No secrets in a log.** Tokens, keys, passwords and model logins are removed before a line is written, not when it
  is shown.
- On a phone each line wraps, and tapping one opens it in full.

## Support bundle

One file to attach when asking someone for help, from **Download support bundle**. Agenthix sends it nowhere: the
admin chooses who gets it ([adr-0042](../../../adr/adr-0042-hq-is-the-orgs-own.md)).

- **What goes in:** versions (HQ, each site, the protocol, the agent image); the name of each setting and whether it
  is set, never its value; health (HQ, and each site's last report); recent errors (the last 7 days); logs from HQ
  and each connected site, by default the last 24 hours of errors, warnings and information.
- **Never in it:** what people wrote and agents replied (no message text, task descriptions, or tool call inputs and
  outputs); files (no project files, workspaces or people's files); secrets (no keys, tokens, passwords or model
  logins, even where a log line held one). People, projects and agents are named `person-1`, `project-2`,
  `agent-3`, the same throughout the file.
- **Seen before it leaves:** **See what is in it** opens every file in the browser before **Download**. The page says
  its size and what it covers, for example *HQ and 2 sites · Design laptop not connected, so only its last health
  report*.

## Today's developer tools

**The debug page and all its tools are removed**: they were only useful while HQ was being built. What replaces each:

| Today | After |
|---|---|
| The status pills | Health |
| The run table | The Runs screen |
| The *Diagnostic Guide* and *API Key Health* | Recent errors, each saying what to do |
| **Force Test Run**, which sends a real message into the conversation used last | Talking to the agent in a conversation: that is the check that a run works on its site, and Health shows connected, Docker, disk and run slots without running anything |
| **Reset History**, which deletes every run record of the person's conversations in one click | Nothing: run records go when a conversation is deleted or a person is erased |

There is no *Try a run* and no developer section, in development or otherwise.

## New behaviour this design needs

| Behaviour | Why |
|---|---|
| **Logs and diagnostics as an Infrastructure page**, admins only, with `/debug` and the debug page removed | Today it is a page outside the organisation that any signed-in member can open and use |
| **Structured, rolling logs in HQ and the site** — date, level, source, message, secrets removed before writing, 7 days or 100 MB | Today both print undated lines to standard output only, with nothing kept and nothing to filter on |
| **A site's logs read over the HQ–site channel on demand** | An admin who cannot reach a site's machine cannot see why anything failed there |
| **Recent errors recorded by HQ for 7 days**, grouped, from runs, sites and HQ's own work, each with what to do | Today only the viewer's own run failures are shown, raw |
| **HQ's own health:** running since, database, the scheduler's last tick | Nobody can see whether HQ's scheduler is running |
| **The support bundle**, built by HQ with its sites' parts, with names replaced and secrets left out | Asking for help today means copying from each machine's terminal |
| **The public `/health` answers status only**; the version and commit added to `./agenthix status` | Today it tells anyone HQ's exact version and commit |
