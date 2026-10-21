---
created: 2026-09-24
description: hq's and the site's images are built entirely inside Docker, with the Wasp build in a pinned builder stage, so a machine that builds them needs only Docker.
---

# ADR-0069: Images Are Built with Only Docker

**Status:** Accepted

## Context

hq and the site are Wasp apps. Wasp's own deployment guidance runs `wasp build` on the machine and
then builds an image from what it generates, so the machine needs Node and the Wasp CLI installed at
the right versions. The generated build also knows nothing of packages that live beside the app in
the same repository, which had to be copied in and the generated Dockerfile patched to find them.

Every machine that runs hq builds at least its browser app (adr-0068), and those machines include
self-hosters' servers and people's own computers.

Wasp 0.21 publishes its Linux CLI for Intel processors only; an ARM build first appears in a later
release. Its output is plain JavaScript, not tied to a processor.

## Options considered

**Build on the machine, as Wasp documents.** Rejected: every machine that builds installs and keeps
Node and Wasp at the right versions, and the copying and patching stay.

**Build elsewhere and copy the images over.** Rejected: it still has to build for the target's
processor, and it moves the build to one privileged machine — the first step of publishing, which is
decided separately.

**Upgrade Wasp to the release with an ARM build.** Not now: that release is a candidate, and upgrading
Wasp is work of its own.

## Decision

**hq's and the site's images are built entirely inside Docker.** Each Dockerfile begins with a builder
stage that installs a pinned Wasp CLI and runs `wasp build` over the whole repository, and later
stages build the final image from its output. A machine that builds needs only Docker.

**The builder stage is fixed to Intel.** On an ARM machine it runs under emulation; the final images
are built natively for the machine. The pin disappears when Wasp publishes an ARM build.

> ⚠️ **The Wasp builder stage, its Intel pin and the pinned Wasp version now apply to hq's image
> only; the decision is not changed.** *(annotated 2026-10-02)* The site no longer runs on Wasp
> (adr-0086): its image is still built entirely inside Docker, in native stages on every
> architecture, with no Wasp stage and nothing emulated.

## What this binds

- **Nothing in a build may depend on tools installed on the building machine** beyond Docker.
- **The Wasp version is pinned in the Dockerfiles** and changed there, deliberately.
- **Packages shared across the repository are available to the build as they are**, with nothing
  copied or patched into generated files.

Undoing it means installing Node and Wasp on every machine that builds.

## Consequences

### Positive
- Building is `docker compose up --build` on any machine.
- Every machine builds with the same Wasp.
- The copying and patching around the generated Dockerfile go.

### Negative
- On ARM machines — Apple-silicon Macs included — the Wasp stage is emulated and slower, and needs the
  container runtime's Intel emulation turned on.
- A build downloads Wasp and its dependencies, so it needs internet access.

### Risks
- **Building Wasp inside Docker is our pattern, not Wasp's.** A Wasp upgrade that changes what
  `wasp build` expects is found in our build rather than in Wasp's documentation.
- **Emulation faults**: an emulated install step can fail in ways a native one does not.

## References

- adr-0068 — hq's browser app is built for its address, on the machine that runs it
- adr-0086 — the site is a plain Node server, so its image has no Wasp stage
