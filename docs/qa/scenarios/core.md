# Scenarios — `core/`

> Module contract: what `@agenthix/core` promises its consumers (`site/`, `hq/`, `ui/`). Flat capability list.
> The agent proposes changes (additions, rewordings, removals); a human reviews and approves — see [`../README.md`](../README.md).
> Tests in this module's source tree assert these.

`core/` is a pure TypeScript library — shared types plus pure functions, no I/O, no UI. Every runtime export is deterministic and safe to import from both client and server. Consumers (`site/`, `hq/src/`, `ui/`) route through these helpers so labels, derivations, and rules stay identical across surfaces. The runtime surface is `shared/*` (format / derive / status / validate / identifiers / timezone) plus the run limits, who started a run, and the protocol version; everything else is type-only.

---

## Formatting helpers (`shared/format`)

- `timeAgo` renders a relative label by bucket: "just now" (<1m), then "Xm / Xh / Xd / Xw / Xmo ago"; empty string for an unparseable date.
- `statusLabel` / `priorityLabel` map a `TaskStatus` / `TaskPriority` to its display label.
- `projectKeyPrefix` formats a task reference as `<projectKey>-<taskNumber>`.
- `initials` returns up to two uppercase initials (first + last word, or first two chars of a single word); `?` for empty/blank input.
- `avatarColor` deterministically maps a seed string to one colour from a fixed palette (same seed → same colour).
- `formatNumber` abbreviates: `<1k` verbatim, `1k–999k` with an optional one decimal, `≥1M` as `X.XM`.
- `formatCost` renders USD: `$0.00` for zero, `<$0.01` sub-cent, `$X.XX` under 100, rounded `$X` at/above 100.

## Index derivations (`shared/derive`)

- `groupTasksByStatus` buckets tasks into `{ todo, in_progress, done }` arrays.
- `countTasksByStatus` returns `{ todo, inProgress, done }` counts.
- `countTasksByRunState` returns a count per run state.
- `isOverdue` flags an open (non-done) task whose `updatedAt` exceeds the 7-day staleness threshold; never overdue when done or when the date is unparseable.
- `projectProgress` returns done/total as a rounded percentage (0 when there are no tasks).
- `projectsWithProgress` augments each project with its `progress` percentage.
- `totalOpenTasks` sums todo + in_progress across projects.
- `statusBreakdown` returns per-status `{ status, count, pct }`, with `pct` guarded against a zero total.

## Status state machines (`shared/status`)

- Exposes canonical lists `TASK_STATUSES`, `TASK_RUN_STATES`, `TASK_PRIORITIES` and a `DEFAULT_*` for each; the run states are `RUN_NONE`, `RUN_QUEUED`, `RUN_THROTTLED`, `RUN_ACTIVE`, `RUN_BLOCKED` and `RUN_FAILED`.
- `canTransitionStatus` gates a move per the transition table; a no-op (`from === to`) is always allowed. A task's run state has no table: the system alone moves it.
- `nextTaskStatuses` returns the statuses reachable from a given status.
- `isTerminalStatus` is true only for `done`.
- `isRunPending` is true for a run state of `RUN_QUEUED`, `RUN_THROTTLED` or `RUN_ACTIVE`.

## Validation (`shared/validate`)

Each returns `{ ok, reason? }` so callers can short-circuit on `!ok` or surface `reason` directly.

- `validateTaskTitle` — 1–200 chars after trim.
- `validateProjectKey` — 2–6 uppercase alphanumerics, starting with a letter.
- `validateSlug` — non-empty, ≤64 chars, lowercase alphanumerics separated by single hyphens.
- `validateEmail` — contains `@` and length ≥ 3.
- `validatePassword` — at least 8 chars.

## Identifier derivation (`shared/identifiers`)

- `deriveSlug` lowercases + hyphenates a name (stripping leading/trailing hyphens), falls back to `untitled`, and resolves collisions against `existingSlugs` with a `-2`, `-3`, … suffix.
- `deriveProjectKey` derives a Jira-style key: multi-word → word initials (≤6); single-word → first 3 chars, expanding to 4–6 on collision (words shorter than 3 padded with `X`); empty/no-letters → `PROJ`; remaining collisions resolve with a digit suffix.

## Timezones (`shared/timezone`)

- `normalizeTimezone` returns an IANA zone name (a region/city name or `UTC`) that the runtime knows, and null for anything else — an offset such as `+10:00`, an abbreviation such as `EST`, or a non-string.
- `localDateTimeText` renders an instant as a person would read it in a given zone, such as "Sunday 4 October 2026, 14:05".

## Run limits (`protocol/runLimits`)

- `DEFAULT_RUN_LIMITS` is 60 minutes and 100 turns; the bounds are 1 minute to 24 hours and 1 to 1000 turns.
- `effectiveRunLimits` returns, for each limit, the stricter (lower) of the organisation's value and the project's own choice, and the organisation's alone for a project that chose nothing.
- `runLimitReason` words the reason a stopped run records, naming the limit and its value; `isRunLimitReason` recognises it, so hq can tell a run stopped by a limit from any other stop.

## Who started a run (`protocol/runtimeData`)

- `parseRunStartedBy` reads what started a run — a person, the pulse, a schedule or an agent — off an untrusted value (a verified token's payload, a stored column) and returns null for anything else; callers treat null as not a person, so an automated run is never read as one a person started. The turn limit and `run_task` both depend on it.

## Versions and the one compatibility rule (`protocol/compatibility`, `protocol/connection`, `protocol/siteMethods`, `host/relay`, `client/`, `cloud/version`)

Every connection between parts that are installed or upgraded apart carries a `major.minor` protocol version of its own; every one was at 1.0 at the version baseline of 2026-10-21. The rule, and how to move a version, are in [`docs/architecture/versioning.md`](../../architecture/versioning.md).

- **SC-1127** — `checkProtocolCompatibility(own, peer)` is the one rule every connection asks: a peer at the same major works at the lower of the two minors; one major behind works at the peer's version; one major ahead works at this side's own, the peer adapting; two or more majors apart is refused, naming the side behind as the one to upgrade. A peer that states no version and one that states something other than `major.minor` are told apart, so each connection chooses whether to accept the first; surrounding whitespace is read; a malformed version of this side's own throws. `protocolRefusalMessage` words a refusal naming both versions and the side to upgrade, or what was presented; `peerRefusalMessage` reads a 426 by the version the peer stated with it, and says which side must upgrade, or that the peer stated none this side can read. · fulfils AC-348a · tests `core/src/protocol/__tests__/compatibility.test.ts`
- **SC-1128** — The site protocol, between hq and a site, is `SITE_PROTOCOL_VERSION` 1.0, stated in `X-Site-Protocol-Version`; core exports no `*_MIN_PROTOCOL_VERSION` floor, so hq sends a site whatever the version it speaks with that site holds. Every control-channel and content-transport method a constant names is declared once, in `SiteMethods` or `SiteContentMethods`, with its parameters and its result; nothing is declared that no constant names but `site.describe`; every event a site sends is declared with its data. · fulfils AC-348a, AC-349a · tests `core/src/protocol/__tests__/connection.test.ts`, `core/src/protocol/__tests__/siteMethods.test.ts`
- **SC-1129** — The host protocol, between the Fleet Console or Agenthix Cloud and a host service through hq's relay, is `HOST_PROTOCOL_VERSION` 1.0, stated in `X-Host-Protocol-Version`. hq's relay refuses a dial two or more majors from its own, or one it cannot read, with 426 stating its own version, and accepts one one major ahead or with no version; the relay and the host service read a frame of their major or one major apart and drop one two or more apart or without a readable version. The Fleet Console states its version when it dials hq, and on a 426 says which side must upgrade, or that hq stated no version. · fulfils AC-348a · tests `hq/src/fleet/relay/__tests__/relay.test.ts`, `hq/src/fleet/relay/__tests__/frames.test.ts`, `host/src/link/__tests__/frames.test.ts`, `console/src/__tests__/wsLink.test.ts`
- **SC-1130** — The client protocol, between hq and the mobile app (and any later app), is `CLIENT_PROTOCOL_VERSION` 1.0, stated in `X-Client-Protocol-Version` and, in a socket handshake, in `clientProtocolVersion`. `decideClientProtocol` serves a client that states no version, and one at hq's major or one major apart; it refuses one two or more majors apart, naming the side to update (`upgrade: 'client'` or `'hq'`), and one it cannot read (`1`, `1.0.0`, `v1.0`) as the app to update. A refusal carries the sentence, the reason (`too_far_apart` or `malformed`), both versions and the side. · fulfils AC-348b · tests `core/src/client/__tests__/protocol.test.ts`
- **SC-1131** — The Cloud protocol, between hq and Agenthix Cloud, is `CLOUD_PROTOCOL_VERSION` 1.0, stated in `X-Cloud-Protocol-Version` and refused with 426. On Cloud's side a call that states no version, one that cannot be read, or one two or more majors apart is refused, and one at most a major apart is served; on hq's side an answer without the header is read as 1.0, and one two or more majors apart is refused, naming who must upgrade. · fulfils AC-348a · tests `core/src/cloud/__tests__/version.test.ts`
- **SC-1132** — Core lists what the mobile app relies on of hq: the paths it uses outside the operations, each operation with its kind and the path Wasp serves it at, and the socket events in each direction. No operation is named after a vendor and the voice operations are named by what they do; every voice event of the conversation is listed in its direction; the conversation's room is listed by its join, without the desktop's own summarise; each name is listed once, and no event in both directions. Every listed operation has a declared argument and result: none is left undeclared. · fulfils AC-349a · tests `core/src/client/__tests__/mobileApp.test.ts`, `core/src/client/__tests__/mobileAppDeclared.test.ts`
- **SC-1133** — Each connection — site, host, client, Cloud — matches its committed snapshot, `core/snapshot/<name>.json`, read from core's declarations with the TypeScript checker: a date is recorded as superjson's, a type or field marked `@experimental` is left out, and the types a message reaches elsewhere in core are recorded too. A difference fails, saying what changed and what the version must become: an optional field, a new type, a new value of a closed set or a new message needs the minor to move; a required field added, a field removed, renamed, retyped or made optional, a value removed, or `null` where a value was always sent needs the major to move; a type renamed with its shape unchanged needs only the snapshot; a version that went back is refused. `npm run snapshot:update` records a new shape only once the version allows it. · fulfils AC-349b · tests `core/src/__tests__/protocolSnapshot.test.ts`, `core/src/__tests__/protocolSnapshotCompare.test.ts`
- **SC-1134** — A deprecation mark, on a type or a field, reads ``@deprecated since X.Y; stops working in (X+2).0. Use `name` instead.``, or ends `Nothing replaces it.`; a mark without all three, or whose "stops working" is not two majors after its "since", fails wherever it is. A new mark is an addition, named for the version it ships in; past its "since" major the deprecated thing has left the current code, and at its "stops working" version it is gone from the previous major's code too. A field, a type or a named message gone from the code needs a mark on it in the committed snapshot, whatever the version; a literal value, which cannot carry a mark, needs only the major move. · fulfils AC-349c · tests `core/src/__tests__/protocolSnapshotMarks.test.ts`
- **SC-1135** — hq's address, as Cloud registers it, is its origin and path with no trailing slash, the same however it is written, and is refused with credentials, a query, a fragment or a scheme other than http and https; Cloud sends a sign-in back only to that address with the sign-in path, exactly; hq telling Cloud its address, and Cloud's answer, are read field by field. Each of Cloud's errors carries its status, as RFC 6749 and RFC 6750 have them. The fields of the Cloud operations hq answers are read by one rule on every side, naming the first that is missing or not valid, with Cloud's organisation id held to the rule the connection uses; hq's answer to `organisation.key` carries the address Cloud registers with the key, and is refused without a valid key, client id or address. · fulfils AC-337a, AC-338b · tests `core/src/cloud/__tests__/hqAddress.test.ts`, `core/src/cloud/__tests__/answers.test.ts`, `core/src/host/__tests__/cloudOperations.test.ts`
- **SC-1136** — Cloud's address is one setting, `CLOUD_URL`, read the same way by hq, the host service and the Fleet Console, and Cloud's own address when it is unset or blank. · tests `core/src/cloud/__tests__/connection.test.ts` (the describe *Cloud's base URL*)

## Stored formats

- **SC-1137** — Every stored format number counts from 1 from the version baseline: the package contents format (`PACKAGE_FORMAT_VERSION`), the voice settings and the board templates. A reader given a number it does not know reads it safely: the voice lab shows the settings version a saved log was recorded under and applies nothing from it, reading one that is not a number as unknown; a site refuses a package format that is not its own, in words; a board template whose version differs from its asset's is seeded again from the asset. · tests `hq/src/conversations/voiceClient/lab/__tests__/log.test.ts` (the describe *a log recorded under another settings version*; the package and template readers have no test that names this scenario)

## Approval (`protocol/capability`, `protocol/approvalWording`)

- **SC-750** — An agent's approval is one of `bypassed`, `deferred` or `immediate`, listed loosest first; `isApproval` accepts those three and nothing else, so the old autonomy words are not read as an approval, and a capability's effective permissions carry `bypassed` and the tools that stay `never` even then.
- **SC-751** — `approvalItems` words a request in plain terms: each tool as the action a person allows ("Fetch a web page") with what the call named, each command as the command itself, never a tool name or a pattern; `approvalAnswer` reads the request's state as waiting, approved, denied or not answered (replaced by a newer message); `approvalItemsLine` folds a list to its first two items and how many more.

## Conversation record (`protocol/transcript`, `conversationOrder`, `runFailureReason`, `contextUse`)

- **SC-752** — A conversation is read run by run: `orderTranscript` keeps each run's rows together with the runs in the order they began, so a message sent while a reply was still being written reads after that reply and not inside it; within a run a failure, a stop, an approval asked or a summary stands last, and a row with no run stands at its own time.
- **SC-753** — `latestFailure` offers Try again only while the latest reply is a failed run, naming the person's message to send again, and is null once anything newer was said — a reply, a message, a stop or an approval asked; `isWaitingMessage` knows a person's message still pending behind a running reply; `replyCounts` counts the replies and how many failed.
- **SC-754** — `plainFailureReason` words a failed run in a plain sentence for the conversation: the agent's memory full, the provider overloaded, rate limited, refusing the credential or erroring, the connection lost, the agent's process stopped, the run unable to prove what it was allowed to do; an error already written for a person (a closed conversation, a missing credential) is kept as it is, and anything unrecognised reads as a plain "Something went wrong" and never as the raw error.
- **SC-755** — `contextShare` turns the runtime's own reading of an agent's memory into a percentage of its window and a level — room under 70%, filling from 70%, nearly full from 90% — and the share where the runtime summarises by itself (null when unknown); `parseContextUse` reads a stored value back only when it is one. `SUMMARISE_NOW_INPUT` is the hidden message that asks the runtime to summarise.
- **SC-756** — `workLine` turns a run's rows into plain steps in the order they happened — what it looked at, changed or ran, its thinking, the approval it asked for, how it ended — and one folded line that names them with the thinking time; steps of one kind in a row fold together but a change or a command never does, a tool under any harness's name reads as one canonical tool, a tool nobody knows reads as "Used a tool", and a run that did nothing has no line.

## Site health and diagnostics (`protocol/siteHealth`, `protocol/siteDiagnostics`)

- **SC-757** — `parseSiteHealth` accepts a site's health report only field by field — when it was taken, runs now against the most at once, disk free and total, whether Docker answers, the agent image and its version, the ceilings in force and whether memory is nearly full — returns null for anything that is not a report, or one that does not say whether memory is nearly full, drops an untrustworthy disk rather than the whole report, reads ceilings it cannot trust as none, and clips text; `diskNearlyFull` is true under 10 GiB free, or under a tenth free on a disk smaller than 100 GiB, and says nothing of a disk it does not know. The event is `site.health`.
- **SC-758** — hq asks a site for its logs and health with `site.readLogs` (one page of the site's own log) and `site.healthNow` (its health taken now); each is a method of its own, and a site that does not know a method answers `unknown_method`.

## Run usage (`protocol/runUsage`)

- **SC-759** — `run.usage` is its own method name, so a site never answers it with another method's unfiltered total; it asks for usage grouped by session, agent or storage owner, optionally for one agent and a period, and answers rows of run counts and token counts by kind with the newest run's time, at most 5000 rows before it says `truncated`.

## Owner folders (`protocol/locationFiles`)

- **SC-760** — An owner's `artefacts/` and `knowledge/` folders are read through four methods of their own (`location.listArtefacts`, `readArtefact`, `listKnowledge`, `readKnowledge`) addressed by the owner and not by a location; an artefact is one file named directly in `artefacts/`, and the knowledge listing is bounded by file count and depth.

## Conversations, memory and knowledge (`naming/features`, `protocol/locationFiles`, `protocol/runtimeData`)

- **SC-1017** — Two control-channel additions carry the conversational experience to a site. `location.searchKnowledge` asks a site for a bounded excerpt of an owner's `knowledge/` files that match a query (the query and a `maxChars` budget in; excerpts with their path, 1-based inclusive line range and text, the files left out and whether the listing was cut short, out), owner-addressed like the other four owner-folder methods. `RunContextPayload.pinnedMemory` carries the pinned memory items a run may read (key, scope `person`, `agent_person` or `agent_place`, title, body), absent when there are none. A run's context no longer carries the person's memory whole, nor a voice flag.
- **SC-1018** — ~~An unfinished feature is switched by one list of flags and nothing else: a flag (today `pledge`) is on in development and in tests, off in production, and fails closed when `NODE_ENV` is unset or unknown (or differently cased); no other setting turns one on; an operation behind an off flag is refused with a disabled-feature error and goes through when it is on.~~ **Retired 2026-10-19** — the last flag, `pledge`, is removed and the flag list with it; ADR-0116 still holds for the next feature that needs one.

## Logging (`logging/`)

- **SC-761** — A log line never holds a secret: `makeLogLine` removes, from the message and from every string and field of the line, the credentials this codebase carries by their shape (model provider keys and logins, GitHub tokens, a site's registration token, machine credential and device code, connection tokens, JWTs, private keys, the user info of a URL, Authorization headers) and any value written under a secret's name (`password`, `token`, `apiKey`, `authorization`…), in an error, its cause, nested objects and arrays, and survives a circular object; ids, counts, project keys and ordinary words are kept. `sanitizeLogLine` checks a line that came from a site and removes secrets again rather than trusting the sender, and refuses what is not a line.
- **SC-762** — `RollingLog` writes one JSON line per call to a file named for its UTC day, starts a new file each day and past 10 MB, carries on in the day's latest file after a restart, never throws when the disk refuses (it reports the failure once), and keeps 7 days or 100 MB whichever is reached first, dropping the oldest whole file first and never the one being written.
- **SC-763** — `RollingLog.read` answers newest first, at errors and warnings unless everything is asked for, across files and days, narrowed by a time range and a search without regard to case, a page at a time by a cursor that neither repeats nor skips a line; a line cut short by a crash is skipped and a cursor the log did not make is ignored. `parseLogQuery` checks every field of a query and caps a page at 1000 lines; `logLineText` reads a line as date, level, source and message, with an error's stack below when asked.

---

## Out of scope

- **Type-only exports** — model shapes (`models/*`), index/dashboard shapes, and protocol message interfaces (`protocol/connection`, `protocol/m2m`, `hq/index`) carry no runtime behaviour to test; `tsc` enforces them.
- **I/O, network, persistence** — core is pure; there is none.

## Agenthix Cloud (`host/join`, `host/cloud`, `host/crypto`, `cloud/`)

- **SC-1079** — A Cloud enrolment derives its own lookup and its own bindings, with the role `cloud` in them: the machine's binding carries the machine id Cloud named it by, Cloud's binding covers both fingerprints and the machine id, a Cloud code can never be replayed as a Fleet Console join and a Fleet Console join can never be taken as a Cloud enrolment; Cloud's acceptance names a Cloud identity and a binding and nothing else. · fulfils AC-333a, AC-333c · tests `core/src/host/__tests__/cloudJoin.test.ts`
- **SC-1080** — The Cloud-only operations for remote access are checked before they are run: allowed addresses are an IPv4 `/32` or an IPv6 `/64` (made canonical, in RFC 5952 form) and nothing wider, one to twenty, without repeats; the port is not 80, 443, a privileged one or the Fleet Console's own; the end is in the future and at most eight hours away; the name is a DNS name and the certificate a PEM chain; the authenticator's secret is long enough, with ten different recovery-code hashes and a claim time that is not past or too far. · fulfils AC-336a, AC-336b · tests `core/src/host/__tests__/cloudRemoteAccess.test.ts`
- **SC-1081** — `frontDoor.set` reads a certificate and its key together, as a pair of PEM texts allowed more room than any other field, and refuses one without the other. · fulfils AC-334b · tests `core/src/host/__tests__/operations.test.ts`
- **SC-1082** — The connection protocol hq and Cloud follow is the shape of the OAuth 2.0 Device Authorization Grant and signed client assertions: Cloud's address is https (or http to this machine) with no path, query or credentials, and names each endpoint by its full URL, which is an assertion's audience; a connection request carries a 32-byte public key, hq's address and the organisation's name; Cloud's answer is refused when the approval page is not on Cloud's own origin or the user code cannot be checked by a person; polling reads each answer the flow names and refuses an approval for another client; a token is short-lived and Bearer; hq's key is an Ed25519 key whose client id is the RFC 7638 thumbprint; an assertion is verified with the registered key and is refused under another key, at another endpoint, out of its time or changed, and no two share an identifier. · fulfils AC-337a · tests `core/src/cloud/__tests__/connection.test.ts`, `core/src/cloud/__tests__/crypto.test.ts`
- **SC-1083** — The Fleet Console reads HQ's connection to Cloud as each state HQ answers, and shows nothing of an answer that is not the shape. · fulfils AC-337a · tests `core/src/cloud/__tests__/hqState.test.ts`
- **SC-1084** — Signing in with an Agenthix account asks for `openid` only, with PKCE S256, a state and a nonce, and Cloud refuses a request asking for more or without PKCE; the code exchange needs the verifier and the answer an ID token; the PKCE values match RFC 7636 and are never the same twice; HQ takes an ID token only when it is from Cloud, for this hq and this nonce, gives the subject, and refuses an unsigned or malformed one. · fulfils AC-338b · tests `core/src/cloud/__tests__/signIn.test.ts`
- **SC-1085** — The downtime notice hq sends Cloud is a shape Cloud reads and refuses when it is not. · fulfils AC-339a · tests `core/src/cloud/__tests__/signIn.test.ts` (the describe *the downtime notice*)
