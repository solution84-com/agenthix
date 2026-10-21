# Model Relay

How a harness in an agent container reaches a model provider without the provider's key ever entering
the container. The Execution Site holds each turn's keys and adds the right one to each request as it
passes through (`site/src/server/modelRelay/`).

A harness's file tools and commands can be turned against it (see
[opencode-tools.md](../tools/opencode-tools.md)); whatever the harness can reach, the agent may one day
reach too. A provider key — often the organisation's, and usable outside Agenthix — is the most costly
thing it could hold. So no key is in the container, the harness's environment or its home: a harness
holds only secrets scoped to Agenthix, among them a **relay token** that works only from its container,
only for its turn.

How each harness is started is [agent-runtimes.md](./agent-runtimes.md).

---

## Where each harness sends its requests

| Harness | Addressed at | Sends the relay token as |
|---|---|---|
| OpenCode, every provider | Its configuration gives each provider the base URL `<site>/api/v1/model-relay/<provider>` (Anthropic's with `/v1` added, which its SDK expects), and a placeholder key, since OpenCode builds no provider without one | The header `x-agenthix-turn`, set on each model request by Agenthix's plugin (`chat.headers`) from the turn it fetched |
| Claude, with an API key, in a container | `ANTHROPIC_BASE_URL=<site>/api/v1/model-relay/anthropic`, Anthropic's documented gateway pattern | Its key (`x-api-key` or a bearer): what Claude Code's `apiKeyHelper` printed |
| Claude, with a subscription | Anthropic directly | — never relayed |

**A subscription is never relayed.** Anthropic's terms say developers may not collect, store or
intermediate Claude.ai credentials or session tokens, and its gateway documentation describes a
subscription only as passing through with the login in the client. So a subscription's login is written
into the runner's harness home, where the CLI reads it. **Claude without container isolation** is not
relayed either: it runs as the site's own child with the key in its environment.

## Relay tokens

A relay token (`relayTokens.ts`) is bound to one container and one conversation when it is issued, and
names a turn only while one runs: it is pointed at the turn — its run and the API keys of every provider
the turn may use — when the turn starts, and at nothing when it ends. A request still streaming when its
turn ends is cut off. Once the run is stopped the token names nothing, whatever its binding says.

- **OpenCode** gets a new token for every turn. The site records it as the turn's model header, and the
  plugin fetches it with the turn (`POST /api/v1/harness/turn`); it is revoked when the turn ends.
- **Claude** gets one token per process, pointed at each of its turns. The process's `docker exec` carries
  a one-use ticket in `SITE_HARNESS_KEY` (`server/runtime/claudeKeyTickets.ts`), and Claude Code's
  `apiKeyHelper` — which Claude Code runs itself, with its own environment and outside the command
  sandbox — trades it once at `POST /api/v1/harness/claude-key` for the token. The helper's cache
  lifetime is set beyond any process's life, so it runs once, at start, before any tool has run. The
  launcher strips the ticket from every command. A second trade gets nothing, so a `401` costs that turn,
  and the process, whose turn failed, is replaced at the next turn with a new ticket. An unused ticket
  expires after five minutes.

**Every provider the turn may use has its key.** hq resolves one credential for the turn's model and one
for each fallback model's provider, by the same rules — the boundary's own, then the org's
(`hq/src/model-access/fallbackCredentials.ts`) — and the dispatch carries them as a set. The relay
picks by provider. A provider with nothing configured is left out; its requests are refused, and the turn
fails only if it needs one.

## What the relay checks

For each request to `/api/v1/model-relay/<provider>/…` (`modelRelayApi.ts`), in order, and without
contacting the provider unless all pass:

1. The provider is one Agenthix offers (`404` otherwise), and the rest of the path cannot leave the
   provider's base — no `.` or `..` segment, plain or encoded, and no encoded `/` or `\` (`400`).
2. The token names a running turn: `401` for a token the site never issued or has revoked, `403` for one
   whose harness is between turns — never `401` there, which would make Claude Code run its
   `apiKeyHelper` again and spend its one ticket.
3. The request comes from that turn's container (`403`; `relaySource.ts`). The source is the socket's
   peer address, never a forwarded-for header, compared with the container's address on its own agent
   network, read from Docker and read again if it no longer matches. Where Docker runs in a virtual
   machine and the site on the host — Docker Desktop — every container's request arrives from the host's
   loopback address, so there a loopback source is accepted for any container: it proves only that the
   request came from this machine, and the token alone ties it to the turn. A deployed site, and a site on
   a Linux machine, match the turn's container.
4. The turn has a credential for the provider (`403`).

A bare `GET` or `HEAD` of a provider's base is answered `200` without any of that and without contacting
the provider: Claude Code sends one, without its key, to check the address.

## What the relay sends

- **The upstream is never taken from the request** (`relayProviders.ts`): a built-in provider's is fixed —
  OpenRouter, OpenAI, Google, Anthropic — and an OpenAI-compatible endpoint's is its credential's base URL,
  which must be `http:` or `https:` with no user name or password in it. A person's own endpoint is
  therefore reached from the site, not the container.
- **Every credential header is removed** — `authorization`, `x-api-key`, `x-goog-api-key`, `api-key`,
  `x-agenthix-turn`, `proxy-authorization`, `cookie` — along with forwarding and hop-by-hop headers, and the
  key is set in the provider's own header: `Authorization: Bearer` for OpenRouter, OpenAI and a compatible
  endpoint (none if it has no key), `x-api-key` for Anthropic, `x-goog-api-key` for Google.
- **The body and the answer stream through unbuffered.** No body parser is mounted on the route (`site/src/server/app.ts`),
  so a body is never read or capped; the answer's status and headers pass back, `retry-after` included, so
  OpenCode's own retries work. The relay sets no deadline of its own: a streamed answer can run for
  minutes. A closed client request aborts the upstream one; an unreachable provider is a `502`.
- **One line is logged per request**: conversation, run, provider, model, status, bytes and timings —
  never a key, a token or a body.

## Proxies

Node's `http` and `https` ignore proxy settings, so the relay reads the site's own environment at each
request (`relayProxy.ts`):

- an `https:` provider goes through `HTTPS_PROXY` in a `CONNECT` tunnel, so the key stays inside TLS end to
  end and the proxy sees only the host and port;
- `NO_PROXY` is honoured — hosts, domain suffixes, `host:port` and `*` — and `localhost`, `127.0.0.1` and
  `::1` always go direct;
- an `http:` provider — a person's own endpoint over plain HTTP — never goes through a proxy, which would
  receive the key in clear. It is reached directly, so a site with no direct route cannot reach one;
- a proxy setting that is not a usable address is a `502`, logged without the address.

## Key files

| File | Role |
|---|---|
| `site/src/server/modelRelay/modelRelayApi.ts` | The relay endpoint: checks, streaming, logging |
| `site/src/server/modelRelay/relayTokens.ts` | Relay tokens, pointed at each turn |
| `site/src/server/modelRelay/relaySource.ts` | Whether a request came from its turn's container |
| `site/src/server/modelRelay/relayProviders.ts`, `relayRequest.ts` | Upstreams, key headers, what crosses in each direction |
| `site/src/server/modelRelay/relayProxy.ts` | The site's proxy settings |
| `site/src/server/runtime/claudeKeyTickets.ts`, `claudeKeyApi.ts` | Claude's one-use ticket and its trade |
| `site/src/agents/runtime/claude/claudeStart.ts` | Claude's relay settings and `apiKeyHelper` |
| `site/src/agents/runtime/opencode/openCodeConfig.ts` | OpenCode's providers, addressed at the relay |
| `hq/src/model-access/fallbackCredentials.ts` | The fallback providers' credentials |
