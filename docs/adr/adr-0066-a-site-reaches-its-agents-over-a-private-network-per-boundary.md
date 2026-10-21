---
created: 2026-09-24
description: A site reaches each agent container over a private network of its own, one per storage boundary, and a deployed site publishes no port on its machine.
---

# ADR-0066: A Site Reaches Its Agents over a Private Network per Boundary

**Status:** Accepted

## Context

Agent containers call two endpoints on their site: `/mcp`, through which every tool an agent uses is
forwarded to hq, and the git-credential endpoint. Each call carries only an opaque run token that the
site exchanges for the run's capability, so an agent never holds a credential hq would accept on its
own. That is why agents call the site rather than hq.

While the site ran directly on its machine, agents reached it through `host.docker.internal`. Once
the site itself runs in a container and starts agent containers beside it through the machine's
Docker, the machine is no longer where the site listens, so agents need another way to reach it.

A site accepts no inbound connections from hq — it dials out — and may sit on a laptop on any
network. Nothing outside the machine has a reason to reach it.

Containers on one network can reach each other. A container is bound to one storage boundary
(adr-0057), and anything an agent starts that listens on every address — a dev server, a tool it
runs — would be reachable from a run in another boundary. The site itself never reaches agents over
the network: it reaches a preview by a relay run inside the container. Traffic only ever goes from an
agent to the site.

## Options considered

**Publish the site's port on the machine; agents reach it through the machine's address.** Closest
to how development already works. Rejected: on Linux the address agents use for the machine is the
container bridge, not loopback, so binding the port to `127.0.0.1` does not work and the port ends up
open on every interface — reachable from any network the machine joins. The run-token check would
then be the only thing between `/mcp` and the network, permanently.

**Run the site on the machine's own network.** No change to how agents find it. Rejected: host
networking is Linux-only in practice, and the site again listens on every interface the machine has.

**One private network for the site and all its agents.** Simplest. Rejected: every agent container
can reach every other, so a run reaches what listens in another boundary's container.

**One network, with container-to-container traffic switched off.** Rejected: the switch applies to
the site as well, which is a container on the same network, so agents could no longer reach it.

## Decision

**Each agent container runs on a private network of its own — one per storage boundary — whose only
other member is the site.** The site creates the network when it creates the container, joins it,
and removes both together. Agents reach the site by its container name. **A deployed site publishes
no port on its machine**, and its database sits on a network no agent is on.

**The site allocates each network a small address block from a configurable private range**, rather
than taking Docker's default, which runs out after a few dozen networks.

The address agents are given is a setting of its own, not derived from the site's public address.
A site run directly on its machine in development reaches agents through the machine, each container
still on its own network.

## What this binds

- **Nothing on a site is reachable from outside its machine.** A new endpoint for agents joins the
  private network; nothing a site serves is published.
- **Anything that has to reach a site from elsewhere does so over the channel the site opens to
  hq** — preview traffic already does (adr-0063). A design that needs inbound access to a site reopens
  this decision.
- **Nothing is shared between two boundaries' containers over the network.** Anything that has to
  pass between boundaries goes through the site or hq, where it is checked.
- **Creating or removing an agent container creates or removes its network**, and the site's sweep
  of leftover containers sweeps leftover networks.

Undoing it means publishing a port and guarding it against every network the machine joins.

## Consequences

### Positive
- A site on a laptop on public Wi-Fi exposes nothing.
- The same arrangement works on Linux, macOS and Windows.
- Agents cannot reach the site's database.
- A run cannot reach anything listening in another boundary's container.

### Negative
- The site manages networks and their address blocks as well as containers.
- Creating a container takes one more step.
- Development and deployment reach agents differently, so the agent address is one more setting.

### Risks
- **The address range can clash with a network the machine is on.** The default is chosen to avoid
  common ones, and whoever runs the site can change it.

## References

- adr-0050 — hq dispatches and executes nothing; the site runs the containers
- adr-0057 — a container is bound to one storage location
- adr-0063 — preview traffic crosses on its own transport, not through a published port
- adr-0065 — a site has no operator page
