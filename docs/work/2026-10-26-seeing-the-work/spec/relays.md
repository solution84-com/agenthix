# Part 1 · Relays and the file path

How a file's bytes get from a site to a browser without passing through hq. Boards: *1 · Today*, *2 · The fleet*,
*3 · Opening a file*, *5 · Relays*, *R1 · Relays: add, assign, watch*.

## Today

- A workspace, artefact or knowledge file is read by hq from its site over the **content channel**
  (`hq/src/storage/locationFileStore.ts`, `readFileOnSite`), held whole in memory, classified by extension
  (`hq/src/storage/fileContentService.ts`), and sent to the browser as JSON on the app's address, images as base64.
  Over 1 MB nothing is sent.
- Uploads (task attachments, pictures) are on hq's own disk (`hq/src/server/hqStoragePaths.ts`) and served by
  hq-server on the **files address** (adr-0114), through short-lived signed links.
- `hq-web` (`hq/docker/Caddyfile`) is hq's one published port (adr-0067). It routes the app, preview names (adr-0071)
  and the files name.

## Why a relay

A relay is the fleet's own tunnel: the one public door sites dial out to.

- **Most sites can't be reached.** A site runs on a laptop, an office server or a rack behind a firewall and listens on
  nothing (adr-0044, adr-0063).
- **A site is the last thing to expose.** It holds every file of the places on it and runs agents. A relay holds
  nothing and decides nothing.
- **One address and certificate per relay, not per site.**
- **The files address is the browser's safety wall** (adr-0114): an agent's file opened there can't act as the person
  in hq.

Considered and dropped: serving through hq-server, which makes hq the bottleneck when an organisation works the same
hours (D4); a tunnel service per site, which adds a vendor, cost and a second concept for no gain over a relay (D6); a
copy of each opened file in object storage, which leaves a second copy of the organisation's files and goes stale
(D7).

## The fleet

| Machine | Carries | Door |
|---|---|---|
| hq's machine | hq, hq's site, hq's relay | One: `hq-web`'s port, answering the app's name and the files name |
| Any other | A site **or** a relay, never both (D22) | A relay's own front door; a site none |

A machine is a site or a relay on purpose: sites dial out so they're never exposed, and a relay needs a door. A relay
beside a site gains almost no speed — the bytes leave the site's network once either way, and what costs time is
distance — so an organisation that needs more adds a relay near its sites, on a machine of its own.

## The ticket (R1, R2, D13)

hq signs every ticket with a private key only it holds; sites verify with hq's public key, so neither a site nor a relay
can make one.

| Field | Meaning |
|---|---|
| `purpose` | `preview` or `download` now; later `diff`, `ide-session` (R8) |
| `owner`, `path` | The place (project or person) and the file |
| `version` | The file's version when the ticket was made: size and modified time |
| `person` | Who it was made for, for the audit row |
| `site`, `relay` | Where it's served from, and through |
| `expires` | 5 minutes (D14) |

It travels in the link (`files.example.com/t/<ticket>`), reusable until it expires so a PDF viewer can read by range,
as the files address's signed links do today. Not a cookie (third-party inside hq's page, already blocked in some
browsers); not a header (a frame and a download can't send one).

## Opening a file

1. A person opens a file by its **stable link** (part 3), from anywhere.
2. hq checks access (`assertLocationAccess`) and finds the place's home site.
3. hq asks the site **about** the file on the control channel: size, modified time, version, a content-type guess from
   the name, and whether the first bytes look like text. No content crosses hq.
4. hq chooses the **kind** (part 2), signs a ticket, records who opened what, and returns the facts and the link on the
   site's relay.
5. The renderer fetches the link.
6. The relay passes the request down the line the site opened to it.
7. The site verifies the ticket, resolves the real path inside the place's storage and refuses anything outside it,
   checks the version, and streams the bytes or the range.
8. The relay returns them with `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`,
   `Referrer-Policy: no-referrer`, and CORS for the app's address only, without credentials.

**Downloading** is the same with `download` as the purpose: `Content-Disposition: attachment`, no cap.

**Changed while open:** the site refuses a ticket whose version no longer matches; the frame says so (part 2).

## hq's relay (D16, D18)

The default relay, always there and needing nothing set up, as hq's site does.

- **In hq's compose set**, on hq's machine.
- **Connected by configuration**: a shared secret with hq, as hq's site is (adr-0070).
- **Reached through `hq-web`**, which sends the files name to it (adr-0067). On `localhost` it answers at
  `files.localhost`, which hq already uses, so a developer's install previews files with nothing to configure.
- **Serves the files hq keeps itself**: task attachments and pictures, from hq's upload folder mounted read-only.
  hq-server stops serving any bytes.
- **On a bare address** (no name for files), `hq-web` sends a path on the app's address, `/relay/…`, to it. Downloads
  and text drawn as text work; nothing is served inline there (adr-0114), so PDF preview needs a files address.

## Relays carry, and nothing else does (D17)

There is no fallback through hq. hq's relay runs on hq's machine, so if it's down that machine is unwell anyway, and a
fallback would be a second byte path to build, secure and test, with its own caps and a second renderer input. When a
site's relay isn't answering, opening a file says so at once (part 2, F4) and the Fleet Console marks the relay.
Listing and browsing still work: they're typed requests, not bytes.

## The relay protocol (R8)

- A relay **carries streams, not just files.** Each stream is opened with a ticket naming its purpose; files are the
  first.
- **A site dials its relay** and keeps a line open; requests come down it and bytes go up. The line reuses the content
  channel's stream multiplexer (`core/src/protocol/contentMux.ts`), with the site as the server.
- **Each kind of traffic may have its own line**, so a large download never slows an interactive stream and a site can
  refuse a kind it has switched off. The MVP builds one line, for files, and narrows nothing to files.
- **Both ends prove who they are.** The site presents a pass hq signed (this site, this relay, an expiry); the relay
  presents its enrolled identity, which hq named to the site.
- **A relay dials hq** on the control channel: alive, load, and which sites may connect.
- **A relay's address is the files address** (R7): the files origin that exists for uploads becomes the address hq's relay
  answers on; each further relay gets its own name beside it (`files-2.example.com`). A hosted fleet uses names on a
  domain kept for files alone.

## More relays and placement (stretch; D9)

- **Added by a fleet admin** in the Fleet Console, as a site is (adr-0115): a one-off code, the host service on the new
  machine, signed images (adr-0117). *Add a machine* asks whether it runs a site or a relay; only a relay is asked for
  an address.
- **Placement is hq's.** Every site starts on hq's relay. When a relay is added, hq moves sites onto it until load is
  even (sites per relay, then bytes carried). A move is a typed message with the new relay and pass; the site opens the
  new line before closing the old, so open files carry on.
- **A relay quiet for a minute** has its sites moved to the others.
- **An admin can pin a site to a relay**, for example one in the same region; a pinned site isn't moved.

## What hq keeps

| Record | Fields |
|---|---|
| **Relay** (new) | id, name, address, whether it's hq's, credential, last seen, load, state (on · quiet · removed) |
| **Site** (changed) | its relay; whether an admin pinned it |
| **File opened** (new) | who, which place and path, which version, when, preview or download |

## The Fleet Console (R1)

- **HQ's page** gains a card for hq's relay: address, sites it serves, today's traffic, open streams. With no files
  address: "Answering on hq's own address: PDF preview is off", linking to the deployment guide.
- **A site's page** says which relay serves it, placed or pinned, with *Pin to a relay…* (stretch). A site's page never
  shows an address.
- **A relay-only machine** is listed with the sites by its machine name, tagged *relay* (stretch).
- **A relay not answering** is on the Dashboard's *Needs you*, with the words people see.
