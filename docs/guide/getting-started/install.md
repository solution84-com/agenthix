---
title: Install Agenthix
description: Run HQ and its Execution Site on your own computer or a server.
sidebar:
  order: 2
---

This page is for whoever installs Agenthix on a computer or a server. One install sets up everything on one machine:
**HQ**, your organisation's home in Agenthix; its **Execution Site**, where agents run; the **host service**, which
runs them; and the **Fleet Console**, where the machines are looked after.
[How Agenthix works](how-agenthix-works.md) explains them.

## Install from an image

Most installs start from Agenthix's published images: the packaged programs Docker runs, built and signed by
Agenthix's release, for Intel and ARM machines alike. Nothing is built on your machine.

### What you need

- **On Linux, kernel 6.12 or newer**
  That is Debian 13, Ubuntu 24.04 with its newer kernel (`linux-generic-hwe-24.04`), or Debian 12 with the kernel
  from its backports. Agenthix needs it to keep each agent's commands contained, and won't install without it.
- **On a Mac or Windows, a current Docker Desktop**
- **Docker with Compose v2.** Docker is the tool that runs each part of Agenthix in its own *container*, a packaged
  program kept apart from the rest of the machine; Compose v2 is its part that runs several containers together, the
  `docker compose` command.
- **Internet access** while it installs, to download the images.
- **HQ's address**, chosen as [below](#choose-hqs-address-first).

### Install

1. Start the host service, the container named `agenthix-host`, from the release you want. Its version is on
   [Releases](https://github.com/solution84-com/agenthix/releases), for example `0.1.0-alpha.1`:

   ```sh
   docker run -d --name agenthix-host --restart unless-stopped \
     -v /var/run/docker.sock:/var/run/docker.sock -v ~/.agenthix:/state \
     -v agenthix-host-figures:/run/host-figures -e TZ=Europe/London \
     --network host --cap-add NET_ADMIN \
     --label com.docker.compose.project=agenthix-host ghcr.io/solution84-com/agenthix-host:<version>
   ```

   Replace `<version>` with the release, and `Europe/London` with the machine's own time zone (on Linux,
   `timedatectl show -p Timezone --value` prints it).

2. Install HQ and its site:

   ```sh
   docker exec -it agenthix-host agenthix install
   ```

   It asks for HQ's address. Before it fetches anything it checks that every image is signed by Agenthix's release,
   and refuses one that is not; then it starts everything and prints a link that makes the first account. The link
   works once, for 24 hours.

3. Open the link and [set up your HQ](setup-hq.md).

What it sets up, what to do right after, and what to do if something goes wrong are the same as for an install from
source: [What it sets up](#what-it-sets-up), [Right after you install](#right-after-you-install),
[If something goes wrong](#if-something-goes-wrong). If it says an image's signature **could not be checked**, the
machine could not reach the registry or the public log of signatures: check its internet connection and run
`agenthix install` again. If it says an image **carries no signature**, or **is signed, but not by** Agenthix's release
for that version, it was not made by Agenthix's release: nothing was fetched or changed.

## Install from source

Installing from source means getting a copy of Agenthix's code and building it on your machine.

### What you need

- **On Linux, kernel 6.12 or newer**
  That is Debian 13, Ubuntu 24.04 with its newer kernel (`linux-generic-hwe-24.04`), or Debian 12 with the kernel
  from its backports. Agenthix needs it to keep each agent's commands contained, and won't install without it.
- **On a Mac or Windows, a current Docker Desktop**
- **Docker with Compose v2.** Docker is the tool that runs each part of Agenthix in its own *container*, a packaged
  program kept apart from the rest of the machine; Compose v2 is its part that runs several containers together, the
  `docker compose` command. Nothing else is installed on the machine: every part is built and run inside Docker.
- **Internet access** while it installs, to download what it builds from.
- **Git**, to get a copy of Agenthix.

### Choose HQ's address first

The installer asks one question: the address people will type to open HQ. Choose it before you start.

- **Trying it on your own computer:** take the default, `http://localhost:7800`. Only that computer can open it.
- **On a server for your team, or if you will add sites on other machines:** use an `https://` address on a domain
  you own, such as `https://agenthix.example.com`. Other computers, and every other site's machine, connect to HQ at
  this address, so `localhost` won't do: it means "this machine" to each of them.
- **The machine's network address over plain http,** such as `http://192.168.1.20:7800`, lets other computers on
  your network open HQ while you try it, but **voice and dictation do not work there**. A browser lets a page use
  the microphone only when the page is on `https://` or at `localhost` on the browser's own machine. For voice, use
  an `https://` address, through a web server with a certificate or the optional front door that Agenthix can run
  for you ([Address and front door](../running-agenthix/domain-and-https.md)), or install at `localhost` and open HQ
  on that machine. The install says so when you give such an address.

The number at the end is the port HQ is published on. The installer uses 7800 for HQ and 7801 for the Fleet Console
unless another program on the machine already uses one, or you choose others: see
[Choose the ports](#choose-the-ports) below.

You can change it later with `agenthix hq address`, but every site and machine then has to follow HQ to the new
address. [Address and front door](../running-agenthix/domain-and-https.md) has the rules and how HTTPS reaches HQ.

### Install

1. Get a copy of Agenthix:

   ```sh
   git clone https://github.com/solution84-com/agenthix.git
   cd agenthix
   ```

2. Build its images, the packaged programs Docker runs. This takes a while the first time:

   ```sh
   docker build -f hq/docker/Dockerfile --target server -t agenthix-hq-server .
   docker build -f hq/docker/Dockerfile --target web -t agenthix-hq-web .
   docker build -f relay/docker/Dockerfile --target relay -t agenthix-relay .
   docker build -f site/docker/Dockerfile -t agenthix-site-server .
   docker build -f site/docker/agent.Dockerfile -t agenthix-agent .
   docker build -f console/docker/Dockerfile -t agenthix-console .
   docker build -f host/docker/Dockerfile -t agenthix-host .
   ```

3. Start the host service, the container named `agenthix-host`:

   ```sh
   docker run -d --name agenthix-host --restart unless-stopped \
     -v /var/run/docker.sock:/var/run/docker.sock -v ~/.agenthix:/state \
     -v agenthix-host-figures:/run/host-figures -e TZ=Europe/London \
     --network host --cap-add NET_ADMIN \
     --label com.docker.compose.project=agenthix-host agenthix-host
   ```

   Replace `Europe/London` with the machine's own time zone (on Linux, `timedatectl show -p Timezone --value` prints
   it): nightly backups, the maintenance window and every scheduled change run by it, and without it they run in UTC.
   `~/.agenthix` is the host service's folder on the machine, where it keeps its settings, secrets and backups.
   The host service needs the Docker socket to start the other parts, and `--network host --cap-add NET_ADMIN` to
   set the firewall rules that keep agents off the machine.

4. Install HQ and its site:

   ```sh
   docker exec -it agenthix-host agenthix install
   ```

   It asks for HQ's address, starts everything, and prints a link that makes the first account. The link works
   once, for 24 hours.

5. Open the link and [set up your HQ](setup-hq.md).

Every later `agenthix` command runs the same way, as `docker exec -it agenthix-host agenthix <command>`; the install prints
how to save a shortcut, so you can type `agenthix <command>` instead.

### Choose the ports

HQ and the Fleet Console are each published on one port of this machine: **7800** for HQ and **7801** for the Fleet
Console, unless you choose others. Choose them only if another program on the machine already uses one of these, or
you want different numbers. Add the flags to step 4:

```sh
docker exec -it agenthix-host agenthix install --hq-port 8080 --console-port 8081
```

A port is a number from 1024 to 32767. HQ may also use 80 or 443. If HQ's address is a plain `http://` address that
ends in a port, such as `http://192.168.1.20:8080`, that port is HQ's and `--hq-port` is not needed. The two cannot be
the same.

The ports are kept from then on, and running `install` again does not change them. To move one later:

- HQ: `agenthix hq address <address>`, with the new port at the end of the address. Every site and machine then
  follows HQ to the new address.
- The Fleet Console: `agenthix console port <port>`.

### What it sets up

- **The host service**, the container named `agenthix-host`: a small program that installs, runs, upgrades and backs up
  everything else on this machine. Every `agenthix` command runs in it.
- **HQ**, at the address you gave, and **its site**, named after this machine.
- **The Fleet Console**, at `http://127.0.0.1:7801` on this machine only: the screens for looking after the machines,
  with backups, upgrades and more sites. It is not HQ's address. On a server you reach over SSH, open it through a
  tunnel, as [Run it on a server](../running-agenthix/index.md#open-the-fleet-console) describes.

The first account, made with the link, is both HQ's first organisation admin and a *fleet admin*: the role, separate
from organisation admin, that lets an HQ account sign in to the Fleet Console and look after the machines.

To run agents on another machine as well, don't install there: add it as a site, as
[Add, move or remove a site](../running-agenthix/add-a-site.md) describes.

### Right after you install

**Choose a backup location.** The machine backs itself up every night, but by default the backups stay on the
machine, so **if the machine is lost, its backups are lost with it**. Point it at a folder somewhere else, such as a
network drive:

```sh
docker exec -it agenthix-host agenthix backup location <path>
```

It shows a key, once: write it down and keep it away from the machine, because without it the copies cannot be
opened. [Backups and restoring](../running-agenthix/backups-and-restoring.md#where-the-copies-go) explains it.

### If something goes wrong

- **The link has expired.** It works for 24 hours. Run `agenthix hq invite-admin` on the same machine to print a new
  one.
- **`The site … has not connected to HQ yet.`** Look at what the site says with `agenthix site logs site`.
- **`HQ did not answer within 10 minutes.`** Look at what HQ says with `agenthix hq logs hq-server`.
- **`The image … is not on this machine.`** One of the images in step 2 was not built, or failed: build it again,
  then run `agenthix install` again.
- **`Port 7800, for HQ, is held by …` or `is held by another installation`.** The install checks every port before it
  starts anything, and refuses when another program already uses one. It says what holds the port and nothing was
  changed. Stop that program, or choose another port with `--hq-port` or `--console-port` and run `install` again.
- **A part is stopped after the machine restarted.** If another program took HQ's or the Fleet Console's port while
  the machine was off, that part cannot start. `agenthix status` says which port and what holds it. Free the port, or
  move the part to another one as described under *Choose the ports*.
- **Is it running?** `agenthix status` says how HQ and its site are doing, each in a sentence that ends in what to do
  next.

Running it again is safe: it starts what is stopped and never changes a setting it already wrote.

