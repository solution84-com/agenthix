# Part 6 · Security, limits and proof

What the design trusts, what it stops, what it doesn't, the caps, and how it's proved. Board: *8 · Security and
limits*.

## Who trusts whom

| Party | Trusted to | Not trusted to |
|---|---|---|
| **hq** | Decide who may read what; sign tickets with a key only it holds | — |
| **Site** | Hold files; check every ticket against hq's public key before reading a byte | Make tickets |
| **Relay** | Pass requests and bytes for the sites assigned to it | Decide anything, make tickets, reach a site not assigned to it |
| **Browser** | Carry the ticket it was given | Anything else |
| **The file** | Nothing: an agent wrote it | — |

**A relay sees the bytes it carries, as a site sees the files it holds** (D12). Both are fleet members, enrolled and
trusted alike; making the relay blind would ask more of it than of the site. Whoever runs a fleet machine is trusted
with what it holds or carries.

## How many doors

hq's machine keeps one front door with two names, as today: `hq.example.com` goes to hq, `files.example.com` to hq's
relay instead of hq-server. File traffic stops reaching hq at all. A bare address has one name and still one door. The
only new door is a further relay on a machine of its own: opt-in, holding nothing. Sites have none.

## Threats and defences

| | Threat | Defence |
|---|---|---|
| T1 | A forged or altered ticket | Signed with hq's private key; the site verifies every field |
| T2 | A leaked ticket reused | Minutes long, one file, one purpose, dead if the file changes; `no-referrer`; never logged by a relay or a site; loaded in frames and fetches, not the address bar |
| T3 | The relay reads or alters bytes | Accepted as for a site (D12); hardening and enrolment as a site's |
| T4 | A rogue machine poses as a relay | A site dials only relays hq names, and checks the relay's enrolled identity first |
| T5 | A compromised relay asks a site for other files | It has no ticket for them; it can replay a ticket it saw, for that file, until it expires |
| T6 | An agent plants a symbolic link out of the place | The site resolves the real path and refuses anything outside the place's storage |
| T7 | A hostile file runs script as the viewer | The relay's address is another origin, with no hq session; `CSP: sandbox`, `nosniff`; active kinds only in a frame; text-like kinds drawn as text, never HTML. Markdown's only HTML is `<img>` with `src`, `alt`, `width` and `height`, sanitised to those four (D23) |
| T8 | Another page reads from the relay | CORS for the app's address only, never with credentials; the ticket is the only authority |
| T9 | Someone loses access but holds a ticket | It expires within minutes; no revocation list. IDE sessions are revoked (part 5) |
| T10 | Flooding: huge files, many requests, a slow site | The caps below; a slow site affects only its own relay streams, never hq |
| T11 | Nobody can tell who opened what | hq records every ticket it issues |
| T12 | A repository's own config runs code during a git read | Hooks, `fsmonitor` and external diff off for reads (part 4) |
| T13 | Opening a page tells another website who's reading | Outside images wait for a click (part 2) |

## Caps (D14)

| | Value | Why |
|---|---|---|
| Text, Markdown, code | 1 MB, on purpose; code highlighted to 512 KB | Today's cap. A larger text file is a smell: it gets Download, and a real need is a change request (pagination), not a raised cap |
| JSON | 5 MB as a tree | Parsed in the browser |
| CSV | 10,000 rows, 5 MB | A larger table isn't readable |
| Images | 20 MB | Decoded by the browser |
| PDF | 50 MB, by range | |
| Download through a relay | No cap, streamed | |
| Per person, at a relay | 16 streams at once | Thumbnails and a PDF; stops a runaway script |
| Per site | 32 reads at once, queued beyond | A site's disk is shared with its agents |
| Ticket life | 5 minutes | As the files address's signed links |

All but the text cap are admin settings.

## What it doesn't stop

| Gap | Why it stays | What limits it |
|---|---|---|
| A compromised relay reading what passes through it | A relay is trusted as a site is | Enrolment; it holds nothing at rest; tickets per file |
| A person sharing a downloaded file elsewhere | Download is the point | The audit row |
| A leaked ticket used within its minutes | Links must work in frames and downloads | Short life, one file, one purpose |

## How it's proved

| | Test | Kind |
|---|---|---|
| V1 | Ticket: signed by hq only; every field verified; expiry; version mismatch refused; purpose enforced | Unit (core), security suite |
| V2 | Site reads: only a valid ticket; path confinement against `..`, symbolic links and hard links out of the place; ranges | Unit (site), security suite |
| V3 | Relay: passes only for an assigned site; checks nothing else; headers and CORS on every response; never logs tickets; per-person stream cap | Unit (relay), container |
| V4 | Pass and identity: a site refuses a relay hq didn't name; a relay refuses a site without hq's pass | Cross-app, security suite |
| V5 | No byte through hq-server: opening, downloading and embedding a file of every kind sends no file content through hq-server. A record hq keeps in a file (a knowledge page's own text) is hq's to read and write (adr-0153, point 7) | Cross-app |
| V6 | hq's relay: starts with hq; answers `files.localhost` with nothing configured; serves hq's uploads read-only; bare-address path serves downloads and text, never inline | Install and image start tests |
| V7 | Renderers: each kind's face, caps, partial and failed reports; the frame's eight states | Unit (ui), e2e |
| V8 | Embeds: relative images and `<img>` tags resolve within the place only; an `<img>` keeps only its four attributes (an `onerror`, a `style`, a `srcset` dropped); every other tag stays text; outside images wait for Load; cards for other kinds | Unit (ui), e2e |
| V9 | Links and chips: a stable link opens in place; someone outside the place gets "not found"; chips in old and new messages | e2e |
| V10 | Git reads: status states; hooks and `fsmonitor` don't run; a read never blocks an agent's commit | Unit (site) |
| V11 | Hostile files: HTML, SVG with script, a PDF with JavaScript, a polyglot — none runs with hq's session | Security suite, e2e |
