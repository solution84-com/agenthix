# Part 5 · Your own IDE

A person's own desktop IDE connects to a live workspace, for a session they start under their own identity. Agenthix
bundles and hosts no IDE. **Designed, not built**; the proof of concept is stretch (D3). Boards: *7 · Your own IDE*,
*I1*.

It will be asked for: Agenthix previews common kinds only, and people working with their own formats need their own
tools.

## What the MVP leaves room for (R8)

Same relay and door, its own line. The relay carries streams opened by a purpose-naming ticket, so an IDE session is one
more purpose, on a line of its own from the site: downloads never slow typing, and a site with IDE access off refuses it
outright. Nothing else in the MVP anticipates it.

## The design

1. **Started in hq.** *Open in your IDE* on a workspace, shown to people who may change its files. hq records a
   **session**: who, which workspace, when, for how long (an hour, renewable).
2. **An access container.** The site starts a container for the session — not an agent's container, not the site's
   machine — mounting that one workspace and nothing else: no secrets, no workflows. It ends with the session; the
   workspace stays.
3. **Through the relay.** The IDE's SSH connection travels through the site's relay: a small helper on the person's
   computer (an SSH `ProxyCommand`) opens a stream to the relay with the session's ticket. Nothing on the site listens.
4. **Ended anywhere.** On expiry, by the person, by an admin from Activity, or when membership changes. hq tells the
   site on the control channel and the site stops the container at once: a session is revoked, not left to expire.

**While open:** the person sees "You have site-redesign open in your IDE · 48 min left", with Renew and End. Others, and
agents starting a run there, see "Sam has this open in an IDE": a heads-up, not a lock. Every session is in Activity.

## What the proof of concept must answer

| Question | The design's answer, to prove |
|---|---|
| How hq authorises, starts and revokes a session | A session record, a ticket for the relay, revocation over the control channel |
| Exposing one workspace without the rest | A container per session, one workspace mounted, nothing of the site's administration, secrets or workflows |
| Self-hosted and hosted fleets, and sites behind NAT | The relay carries it; nothing on the site is opened |
| What VS Code Remote SSH installs | Its own server, from its vendor, in the container, as on any SSH host; Agenthix redistributes nothing. To measure: size, memory, whether it downloads from the internet |
| Agents and a person editing at once | Not collaborative editing: the IDE sees agents' changes on disk; conflicts are the person's, as in any shared folder |
