---
title: Address and front door
description: Give HQ an address your people can open, put HTTPS in front of it, and change it later.
sidebar:
  order: 7
---

This page is for whoever sets up HQ's machine, its machine admin, and for fleet admins who change HQ's address later:
how to give HQ an address your people can open, serve it over HTTPS, and change the address.

**HQ** is your organisation's home in Agenthix; *sites* are the machines where agents run; the Fleet Console is where
fleet admins look after the machines. [Run it on a server](index.md) explains them. Unless you gave another address
when you installed, HQ answers only on its own machine, at `http://localhost:7800`. To let your people reach it from
their own computers, give it a domain and serve it over HTTPS.

## What a server's address needs

HQ's address is the one setting asked when Agenthix is installed. It has three jobs, and so three rules:

- **It must be exactly what people type into their browser:** the scheme, the host and the port if there is one, with
  no slash at the end. `https://agenthix.example.com` is right; `https://agenthix.example.com/` is refused.
- **It must also work from every site's machine.** Each site, and each machine's host service, connects to HQ at
  this address. `localhost` means "this machine", so it won't do once a site runs on another machine. An `https://`
  address is the safe choice: over plain `http://`, a machine's credential, the secret it proves itself to HQ with,
  would cross the network unencrypted, so a machine refuses plain `http://` to anything but a private network.
- **It decides how HQ listens on its machine**, which `agenthix front-door` shows:
  - an `https://` address: HQ listens on `127.0.0.1:7800`, the machine only, and a front door (below) serves it;
  - a `http://` address on the machine itself, such as `localhost`: HQ listens on the machine only;
  - any other `http://` address, such as `http://192.168.1.20:7800`: HQ listens on the network, on that port, with
    no encryption. Use it only on a network you trust, while you try Agenthix out. Voice and dictation do not work
    at such an address: a browser lets a page use the microphone only on `https://`, or at `localhost` on the
    browser's own machine.

The port in these examples is HQ's default, 7800. If you chose another at install
([Choose the ports](../getting-started/install.md#choose-the-ports)), use yours wherever 7800 appears. A web server
or front door in front of HQ answers on 443 and passes on to HQ's port.

Files are opened from an address of their own, described under [The files address](#the-files-address) below.

Check what HQ has under **Manage › Infrastructure › HQ**, in **Address and environment**. It shows the
address and whether each setting is set, never the value.

![Manage › Infrastructure, with HQ, Execution Sites, Storage and More](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.4/infrastructure.png)

## The files address

When someone opens or downloads a file in HQ, the file reaches their browser from an address of its own, so that a file an
agent wrote can never act as HQ. It is `files.` followed by HQ's host, such as `files.agenthix.example.com`, and it is
answered by **HQ's relay**, a small part of HQ that runs on HQ's machine and carries the file's bytes from the site that
holds it. Point that name at the machine too, with a certificate, as for HQ's own address; the host service's front door
below does both.

An address with no name to put `files.` in front of, such as `http://192.168.1.20:7800`, has no files address. HQ then
carries files on its own address, where it never shows a file inline. Everything still works, with two differences:

- **Text, Markdown, code, tables and pictures open**, drawn by HQ's page from the file's bytes.
- **A PDF can't be previewed**: it says **PDF preview needs a files address. An admin can set one up.** and offers
  **Download**. Every file can be downloaded.

On the Fleet Console's **HQ** page, the card for HQ's relay shows its address, how many sites it serves, what it has
carried since it started and how many streams are open, or **Answering on hq's own address: PDF preview is off** when
there is no files address. If the relay stops answering, files can't be opened anywhere in HQ until it does, and the
Dashboard's **Needs you** says so; it runs with HQ, so check HQ is running on its machine and restart it if it is.
Nothing else is affected.

## Change HQ's address

Changing HQ's address is a move, because every site and machine finds HQ at its address. A fleet admin, in the Fleet Console, opens the **HQ** page, selects **Change** on
**How people reach it**, then **Change…** beside **HQ's address**. Or, on HQ's machine, a machine admin runs:

```sh
agenthix hq address <address>
```

HQ tells every connected site, every host service and the Fleet Console the new address over the connection each already
has, and tells everyone in HQ. Then it stops, a sealed backup is taken (encrypted, so only its key opens it), and it
starts again at the new address. Each switches once the new address passes its check, and keeps the old one until
then. If HQ does not answer at the new address, it is put back at the old one. With the front door on, turn it off
first.

A site or machine that was offline meanwhile is pointed afterwards, on its own machine: run
`agenthix console hq-address <address>`, then `agenthix site hq-address <address>`.

## Choose how HTTPS reaches HQ

HQ itself speaks plain HTTP. Something in front of it, called a *front door* (also known as a reverse proxy), holds
the domain's certificate, the file that proves to browsers the address is really yours, and passes each request on to
HQ. Choose the case that matches your machine. Either way, first give HQ its `https://` address, at install or with
`agenthix hq address`, and point the domain's DNS at the machine.

### The machine has no web server yet

The host service, the small program that runs Agenthix on every machine, includes a front door that serves HQ over
HTTPS itself, with certificates it gets and renews on its own. It needs:

- HQ's `https://` address on a domain name, not a network address, `localhost` or a `.local` name;
- that domain, and the `files.` name for files, pointing at the machine in DNS;
- ports 80 and 443 free on the machine and reachable from the internet, so a certificate can be issued.

**It takes ports 80 and 443.** While it is on, nothing else on the machine can serve web traffic on them: a web server
you run there now or install later will fail to start. It is refused while either port is in use. In the Fleet Console,
choose **The host service's front door** under **Front door** on the **Address and front door** page. On the machine:

```sh
agenthix front-door            # show whether it is on, and how HQ listens
agenthix front-door on         # turn it on; asks first, or add --take-ports-80-and-443
agenthix front-door off        # stop it and free the ports
```

`--files <host>` names the host that files are served from, if not `files.` followed by HQ's host. It waits up
to three minutes for each certificate; if one cannot be had, everything is put back as it was.

### The machine already has a web server

Point your own web server at HQ. `agenthix front-door`, with nothing after it, prints exactly where:

1. Route HQ's domain, and the `files.` name for files, to `127.0.0.1:7800`, with a certificate for each.
2. Pass on each request's own host name, so HQ can tell HQ's address from the files' address.
3. Pass WebSocket connections through: browsers, sites and host services hold them open.

For Caddy, the whole configuration is:

```text
hq.example.com, files.hq.example.com {
	reverse_proxy 127.0.0.1:7800
}
```

Examples for Traefik and nginx are in the
[deployment notes](https://github.com/solution84-com/agenthix/blob/main/docs/architecture/deployment.md).

HQ is set up for one front door between it and the caller whenever its address is `https://`, so it records where
each caller really came from. Nothing else needs setting.

## Live previews

**Live previews are not available yet, so none of this needs setting up today.** When they are, an agent can serve the app it is building as a live preview (see [Live previews](../projects/live-previews.md)), each app
from a host name of its own, `p-<id>.<preview domain>`. That needs:

- **A domain for HQ.** An HQ reached by a bare network address has no live previews, and says a domain is needed.
  On a laptop, HQ at `http://localhost` works with no setting: apps open at `http://p-<id>.preview.localhost:<port>`, for that
  laptop's own browser only.
- **A preview domain and one wildcard DNS record** pointing at the machine, then
  `agenthix front-door on --previews <preview domain>` with the host service's front door. Each app gets its certificate the first
  time it is opened.
- **Live previews switched on for each site** that should run them, in the Fleet Console.

The steps, the checks and the settings are on [Live previews on a site](live-previews-on-a-site.md). With your own web server,
send the wildcard name to HQ's address with a certificate that covers the wildcard. Everything else in HQ works without any
of this.
