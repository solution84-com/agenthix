# Ports and address blocks

Every port Agenthix listens on, and every block of private addresses it gives Docker networks, in one place. Read
it before you add a service, choose a port for a test, or wonder why an installed copy and a development copy can
run side by side.

The numbers are written once, in [`core/src/ports/ports.ts`](../../core/src/ports/ports.ts), a file of plain data
with no imports. The host service, hq's and the Fleet Console's build configurations and the cross-app test harness import it;
the dev scripts read it through `scripts/dev/ports.sh`. The tables below carry the same numbers, and a test in
`core` (`core/src/ports/__tests__/portsDocument.test.ts`) fails when a table and the file disagree. If you change a
number, change the file and then this document.

## Two kinds of port

| Kind | Who chooses | Where |
|---|---|---|
| **Our own convention** | the code | inside every installation's containers, and in development on the machine |
| **An installation's published ports** | the machine admin, with quiet defaults | the machine's own network address, where other software also listens |

Only a published port can clash with other software on the machine, so only those are the admin's to choose. Our
own numbers stay the same everywhere, so what runs in development is what runs inside an installation.

## Our own convention

Each service owns a hundred, and the last two digits say what listens: **41 hq, 42 site, 43 Fleet Console, 44 relay; 00
the web page, 01 the server, 09 the database.**

<!-- ports:convention -->
| Service | x00 web page | x01 server | x09 database |
|---|---|---|---|
| hq (41) | 4100 | 4101 | 4109 |
| site (42) | — | 4201 | 4209 |
| Fleet Console (43) | 4300 | 4301 | — |
| relay (44) | — | 4401 | — |

- The x09 database ports are for development, where a database listens on the machine. Inside an installation's
  containers every database keeps PostgreSQL's own port (5432), because each is on a private network of its own.
- The Fleet Console's 4300 is its screens' development server (Vite, in `console-web/`). The Fleet Console's own
  server, which also serves those screens once built, listens on 4301 in development and inside its container.
- Tailscale serve, for reaching a development copy from your other devices, uses the two ports in the next table. It
  listens on the tailnet address only.
- The relay carries file bytes, live apps' traffic and branches sent between sites, for the sites assigned to it. It
  has no web page and no database: its server answers browsers on the files address and on the preview address, and
  the lines sites dial to it, on 4401 in development and inside its container. In development a live app is at
  `http://p-<id>.preview.localhost:4401`, a name browsers resolve to the machine itself.

<!-- ports:constants -->
| Name | Value |
|---|---|
| `CONTAINER_DATABASE_PORT` | 5432 |
| `DEV_TAILSCALE_PORTS.hqWeb` | 4443 |
| `DEV_TAILSCALE_PORTS.hqServer` | 4444 |

### Every port inside an installation

| Container | Listens on, inside | Reached by | Published as |
|---|---|---|---|
| hq web (Caddy) | 4100: hq's browser app, and the forwarder to hq's server | browsers, through the published port; the front door | hq's published port |
| hq server | 4101, and a control socket (a file) | hq web; the site, over the hq link network; the host service, through the socket | not published |
| hq database | 5432 | hq's server | not published |
| site server | 4201, and a control socket | hq's server; agent containers, for models | not published |
| site database | 5432 | the site's server | not published |
| Fleet Console | 4301: its server, which also serves its screens; a control socket; on a machine Agenthix Cloud runs, the remote-access port | fleet admins' browsers, through the published port; Agenthix Cloud | the Fleet Console's published port, on 127.0.0.1 only; the remote-access port as Agenthix Cloud names it |
| hq's relay | 4401: browsers' requests on the files address and on every live app's address (the preview address), and the lines sites dial | hq web, which sends it the files address, the preview address's names and the sites' lines | not published |
| Front door (Caddy), when on | 80 and 443 | anyone opening an https address | 80 and 443 |
| Host service | none: sockets only | its command line, the Fleet Console | not published |
| Agent containers | 4096 on the container's own loopback address (the OpenCode server); an agent's own preview, on whatever port its app uses | only from inside the container: the site reaches both through `docker exec` | not published |
| A live preview's container | each live app on the port the agent's `start_app` names, on the container's own address | the site, only for a stream carrying an app ticket; the app is never published | not published |
| A live preview's service | the image's own port (`postgres:5432`), on the live preview's services network | the live preview's container, by the service's name | not published |

A site publishes no port at all, so any number of sites on one machine never clash on ports.

### Ports inside an agent's container

What the agent's harness listens on in an agent's container, on its loopback address only. A live app may not take
it: an app's port is 1024 to 65535 except these (`LIVE_PREVIEW_RESERVED_PORTS` is built from this table's source).

<!-- ports:harness -->
| Name | Value |
|---|---|
| `HARNESS_PORTS.openCode` | 4096 |

## Tests take free ports

The cross-app suite and the user guide's screenshots ask the operating system for free ports (they bind port 0) and
pass them to the hq, site and stand-ins they start. Nobody types a test's address, so nothing needs remembering and
no run clashes with development or with another run.

hq's browser tests (`hq/e2e/`) start no hq of their own. They run against the one already running, development's by
default or another named by `E2E_CLIENT_URL` and `E2E_SERVER_URL`; only the stand-in model they start takes a free
port.

Free ports do not keep two cross-app runs apart in one thing, the shared test databases
([ADR-0035](../adr/adr-0035-test-data-isolation.md)), so one cross-app run at a time holds them.

Tests that are real installations (the install test, the host service's container tests) publish ports like any
installation, and use free ones for it: see [Several installations on one machine](#several-installations-on-one-machine-for-testing).

## What an installation publishes

An installation publishes two ports, and the machine admin chooses them.

<!-- ports:published -->
| Published | Default |
|---|---|
| hq | 7800 |
| Fleet Console | 7801 |

| Published | Chosen with | Changed later with |
|---|---|---|
| hq | the port in hq's address, or `--hq-port` | `agenthix hq address` |
| Fleet Console, on 127.0.0.1 only | `--console-port` | `agenthix console port <port>` |
| Front door, when on | turning it on: 80 and 443 | not chosen |
| Remote access, on a machine Agenthix Cloud runs | Agenthix Cloud's request | Agenthix Cloud |

The choice is recorded in the installation's state and kept across every upgrade, a re-run of `install`, and the
host service's own update. A restore or a move chooses afresh on the machine that receives it, because ports belong
to a machine, not to the organisation's data. An hq address and `--hq-port` that disagree are refused.

**What may be chosen:** any port in the range below, or 80 or 443 for hq. Anything else is refused, and the refusal
says why.

<!-- ports:range -->
| Name | Value |
|---|---|
| `CHOSEN_PORT_RANGE.first` | 1024 |
| `CHOSEN_PORT_RANGE.last` | 32767 |
| `HQ_STANDARD_PORTS` | 80, 443 |
| `FRONT_DOOR_PORTS` | 80, 443 |

**Why 7800 and 7801:**

1. **Between 1024 and 32767.** A lower port needs extra privileges on Linux. Higher ports are where operating
   systems hand out ports for outgoing connections (Linux from 32768, Windows and macOS from 49152), so a service
   there can find its port taken at random.
2. **The quietest hundred in the registered range.** The public registry of known port uses lists one obscure use in
   7800 to 7899 and nothing at 7800 or 7801. The busy places are avoided: 3000 to 3999 (Node, Grafana, Rails, MySQL),
   4200 (Angular), 4443 and 4444, 5000 and 7000 (macOS's AirPlay receiver holds both by default), 5173 (Vite), 5432
   (PostgreSQL), 6379 (Redis), 6443 (Kubernetes), 7700 to 7799 (game servers), 8000 to 8099 and 8443 (web frameworks
   and proxies), and 9000 to 9999.
3. **Far from our own 41xx to 43xx**, so an installed copy and a development copy always run together, and an
   installed hq (78xx) is never mistaken for development's (41xx).
4. **One pair to remember:** hq on 7800, its Fleet Console next door on 7801.
5. **Only a default.**

## The check before anything is published

Every command that is about to publish a port asks the host service to check it first, before anything is fetched,
written or started: `install`, `restore`, a move received, `console install`, `hq address`, `console port`,
`front-door on`, turning remote access on, and an upgrade before it swaps containers. The check refuses a port that
is out of range, one this installation already publishes for another of its parts, one another installation on the
machine holds (running or stopped), and one held now by anything else, naming the holder. Every problem goes into one
refusal that ends "Nothing was changed."

If another program takes a port while the installation is stopped, the container that cannot start is reported in
`agenthix status` and in the Fleet Console, with the reason. The commands and their words are in
[deployment.md](deployment.md).

## Several installations on one machine, for testing

Supported for people is one hq and one site per machine ([ADR-0108](../adr/adr-0108-a-machine-carries-at-most-one-hq-and-one-site.md)).
For tests, a machine can run more installations, each one host service with a namespace and a state folder of its
own. The namespace is set at the host service's first start by `INSTALL_NAMESPACE`, and what the installation chose
is recorded in `<state>/installation.json` and as labels on every container it runs. Another installation's check
reads those labels. A clash of ports or address blocks is refused; another hq on the machine is not. How to start a
test installation is in the `running-locally` skill and [deployment.md](deployment.md).

## Address blocks

Docker networks take private addresses (RFC 1918) away from Docker's own and routers' usual defaults, in blocks of
their own, so none overlaps another.

<!-- ports:blocks -->
| Name | Block | For |
|---|---|---|
| `installationNetworks` | 10.214.0.0/16 | an installation's own networks (Fleet Console, hq, site, edge, hq link): a free /24 each, picked automatically |
| `agents` | 10.213.0.0/16 | installations' agents: a slice of /20 per installation |
| `devAgents` | 10.212.0.0/16 | development's site's agents |
| `tests` | 10.211.0.0/16 | networks that tests create |

### The agent slice

Each installation with a site gets a **/20 slice** of the agents' block: 4,096 addresses, which is 16 slices in the
/16, so up to 16 installations with a site per machine. Within its slice the site gives each agent container its own
network, a /29 of 8 addresses: room for 512 agent containers per slice, of which the lower half, 256, is for ordinary
agent containers and the upper half for live previews (*The live-preview part*, below).

<!-- ports:slice -->
| Name | Value |
|---|---|
| `AGENT_SLICE_BITS` | 20 |
| `AGENT_CONTAINER_BITS` | 29 |
| `LIVE_PREVIEW_PART_BITS` | 21 |

The slice is picked when an installation's site is first installed: the first of the 16 that overlaps no Docker
network, no address of the machine and no other installation's recorded slice. It is recorded in `installation.json`,
given to the site as `AGENT_NETWORK_RANGE`, and the firewall rules that keep agents off the machine's own ports
cover that slice alone. When no slice is free the install is refused before anything is written. An installation
without a site, such as a Fleet Console alone, takes none.

**The live-preview part.** The upper half of the slice, its last /21 (`LIVE_PREVIEW_PART_BITS`, `livePreviewPartOf`
in `core/src/ports/livePreviewPart.ts`), is for live previews' networks on every machine:
2,048 addresses, so 256 live-preview networks of a /29. A live preview's own network and its services network (a /28 of 16 addresses, for the live preview's container and up
to ten services) are both allocated there and nowhere else, and ordinary agents take the lower half. The host service
closes the live-preview part to private addresses, the machine's own and public addresses and cloud metadata addresses
on every machine, so a live preview reaches only the public internet and its own site; ordinary agents keep reaching
what they reach today. In development, where `AGENT_NETWORK_RANGE` is a /16, the live-preview part is the range's last
/21.

256 ordinary agent containers at once is more than one machine's CPU and memory run, and sixteen installations leaves room
for test installations beside the real one.
