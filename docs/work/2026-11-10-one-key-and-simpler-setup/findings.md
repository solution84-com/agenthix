---
created: 2026-11-10
description: What was measured against Inworld's language-model service with the development key before any code — the sign-in header, chat, tools and streaming, Claude Code through the Anthropic-compatible address, prompt caching, rate limits, the model list, release dates, each vendor's key page and the exact error answers — and what each result changes in the spec and plan.
---

# Findings · One key, and a simpler AI step (phase 1)

Measured on 9 and 10 Nov 2026 (the service's own clock said 9 Nov, evening) with the development key, by scratch scripts that are not
committed. No secret, key or machine path is recorded here. Recorded answer bodies were checked to contain no key.

## Strategy

This is a feature check, not a speed benchmark. Four arms, all reached as `provider/model` ids on the OpenAI-compatible Chat
Completions path at `https://api.inworld.ai/v1`: a cheap Claude (`anthropic/claude-haiku-5-5`), a small GPT
(`openai/gpt-5.4-nano`), a Gemini Flash (`google-ai-studio/gemini-3.5-flash-lite`) and DeepSeek twice: the Inworld-hosted
`inworld/models/deepseek-v4-flash` and the maker's `deepseek/deepseek-v4-flash`. Model ids come from the list endpoint, not memory.
About five calls per cell (chat, tool turn, tool result, streamed chat, streamed tool turn); calls one at a time except in the
limits test, with a back-off on a `429`; very short prompts and at most a few hundred output tokens. Total spend was a few cents
(the longest prompts were about 9,000 tokens, twice, on the cheapest Claude). Not measured: anything needing a second account, a paid
plan or an account without credit.

## 1. The sign-in header

| Test | Result |
|---|---|
| Plain HTTP, `Authorization: Basic <key>` | 200 |
| Plain HTTP, `Authorization: Bearer <key>` | 200, same answer. Also 200 on the model list |
| `Authorization: Token <key>`, or no header | 401 |
| `x-api-key: <key>` on `/v1/messages` | 401 (Basic and Bearer both 200 there) |
| hq's `createOpenAI({apiKey, baseURL}).chat(id)` from the installed `@ai-sdk/openai` (sends `Bearer`) | 200; text, usage returned |
| The same SDK with a fetch wrapper that sets `Basic` | 200 |
| OpenCode 1.18.32 (the agent image's binary), `@ai-sdk/openai-compatible` provider with `options.apiKey` (Bearer) | 200; a `read` tool call also worked |
| OpenCode with `options.headers.Authorization = "Basic …"` | 200 |

Means: `Bearer` and `Basic` both work; `x-api-key` does not. hq's existing OpenAI-compatible code, and the site relay's default
`Authorization: Bearer` for non-Anthropic providers (`site/src/server/modelRelay/relayProviders.ts`), need no special header for Inworld.
The relay's Anthropic case sends `x-api-key`, which Inworld refuses, so a Claude Code run through Inworld would need `Bearer`.

## 2. Chat, tool turn, streamed turn (OpenAI-compatible path)

Every cell passed on every arm.

| Arm | Chat | Tool call (non-streamed) and result turn | Streamed chat | Streamed tool call | Usage |
|---|---|---|---|---|---|
| Claude Haiku 5.5 | ok | `get_time` called with `{"city":"Paris"}`, `finish_reason tool_calls`, answer after result ok | 4 chunks, `[DONE]` | arrives as deltas (4 chunks), arguments complete | returned (also in the stream's last chunk with `stream_options.include_usage`) |
| GPT 5.4 nano | ok | ok | 11 chunks | 6 delta chunks | returned |
| Gemini 3.5 Flash Lite | ok | ok; arguments pretty-printed with whitespace | 3 chunks | 1 chunk (whole call at once) | returned, adds `text_tokens` |
| DeepSeek V4 Flash (Inworld-hosted) | ok | ok | 4 chunks | 1 chunk | returned |
| DeepSeek V4 Flash (maker) | ok; 30 reasoning tokens counted in completion | ok | 42 chunks | 8 chunks | returned, adds `completion_tokens_details.reasoning_tokens` |

Through the AI SDK as hq uses it (`streamText` with one tool, three-step limit), Haiku and the Inworld-hosted DeepSeek both ran
tool-input start/delta/end, tool call, tool result, then the final text, with usage totals. Tool call ids differ by vendor (`toolu…`,
`call_…`, `call-…`), which is harmless. Not measured: through the site relay itself (that is code, not yet written).

Means: tool calling and streaming work for all four families on the one path. Streamed tool calls may arrive in one chunk, so code
must not assume incremental arguments.

## 3. Claude Code through the Anthropic-compatible address

`claude -p` (the installed CLI) in a scratch directory with its own empty config folder, `ANTHROPIC_BASE_URL=https://api.inworld.ai`,
`--model claude-haiku-5-5` (a bare id), `--max-turns 3`.

| Check | Result |
|---|---|
| Key as `ANTHROPIC_AUTH_TOKEN` (sent as Bearer) | Works. "Say ok" answered, cost reported |
| Key as `ANTHROPIC_API_KEY` (sent as `x-api-key`) | Fails: the CLI ended with an OAuth-refresh error and never reached the model; the raw check shows `x-api-key` gets 401 from Inworld, which is consistent with it |
| A tool call (read a small file I created) | Works: 2 turns, returned the file's exact content, no permission denials (bypass mode) |
| Extended thinking (`MAX_THINKING_TOKENS=3000`, streamed JSON) | Thinking content blocks and thinking deltas arrive, then the text block; the final usage's `thinking_tokens` stayed 0 even so |
| Prompt caching | Works. First call wrote 22,305 tokens to the cache; the next two identical calls read 22,305 (`cache_read_input_tokens`), and cost fell from about 0.0028 to 0.0002 USD |
| Interrupting | Works: SIGINT mid-stream ended the process within one second and the result said `error_during_execution`. Whether Inworld stops generating is not observable from here |
| Streaming | Works (streamed partial messages arrived) |

Not measured: a long multi-turn session, subagents, and Claude Code's other models (Sonnet, Opus) through it.

Means: Claude Code runs on Inworld for a Claude model with tools, thinking, caching and streaming intact, provided the key is
presented as Bearer.

## 4. Prompt caching on the OpenAI-compatible path

| Model | Prefix | Result |
|---|---|---|
| Haiku 5.5 | about 3,000 tokens, plain text | No caching: `cached_tokens` 0 both times |
| Haiku 5.5 | same size, last block marked `cache_control: {type: "ephemeral"}` | First call: `prompt_tokens_details.cache_write_tokens` 2986; second call: `prompt_tokens_details.cached_tokens` 2986 |
| Haiku 5.5 | about 9,300 tokens, marked | Write 9321, then read 9321 |
| GPT 5.4 nano | about 2,300 tokens, plain | First call 0; second call `cached_tokens` 1792 (automatic) |
| DeepSeek V4 Flash (Inworld-hosted) | tool run through the SDK | `cached_tokens` 256 seen on a short prompt (automatic) |

Fields: `usage.prompt_tokens_details.cached_tokens` (read) and `cache_write_tokens` (write, Anthropic models only).
`prompt_tokens` includes the cached tokens. The list prices carry a cache-read price, and a cache-write price for Anthropic and
Google, per model.

Means: a Claude model needs explicit `cache_control` markers to cache on this path, and hq already has that for OpenRouter
(`openRouterCaching.ts`); the same hints would be sent to Inworld. Automatic caching exists for GPT and DeepSeek. The ledger can
read the cached count from one field for all of them.

## 5. Limits (development account)

- Three concurrent requests: all 200. Twelve started within one second (all in flight together): all 200.
- Bursts with a tiny answer: 20 in one second, 19 OK and 1 refused; 25 in one second, 18 OK and 7 refused; 40 in one second, 18 OK
  and 22 refused. So the apparent limit here is about 18 to 19 requests a second, a rate and not a concurrency limit; concurrency of
  at least 12 was fine. Inworld's published free-plan figures (2 to 5 concurrent) did not apply to this account.
- The refusal: status 429, `content-type: text/plain; charset=utf-8`, body `Rate limit exceeded` plus a newline, 20 bytes. Headers
  are only the gateway's (`server: istio-envoy`, `via: 1.1 google`, `x-envoy-upstream-service-time`, `alt-svc`, `date`,
  `content-length`). No `Retry-After`, no rate-limit headers.
- A single request one second after a burst succeeded every time; a back-off of 1 second recovers.

Means: a 429 is recognised by status alone (the body is not JSON). A one second back-off, with a few retries, is enough here.
Three agent runs, a title call and a voice call at once are well under this account's limit; the limit on other plans is not
measured.

## 6. The model list

`GET /llm/v1alpha/models` with the key (Bearer or Basic): 200, JSON `{"models":[…]}`, 119 entries, about 94 KB. A wrong key gives
403 JSON (section 9). `GET /v1/models` does not exist (404).

- **Fields per entry:** `model`, `provider`, `modelCreator`, `pricing`, `spec`, `isSupported`. `pricing` has `promptToken`,
  `completionToken`, and where they exist `promptCacheReadToken` and `promptCacheWriteToken` (dollars per token). `spec` has
  `inputModalities`, `outputModalities`, `contextLength`, `maxCompletionTokens`, `supportedParameters` and `capabilities`
  (`functionCalling`, `webSearch`, `reasoning`, `promptCaching`, `responseSchema`, `vision`, `reasoningCapability` with levels,
  `responseFormatCapability`).
- **Not there:** no `deprecationDate` on any of the 119 models, no health field, no release or creation date, no model name or label.
  `isSupported` is present on all and true on all. The documentation's `deprecationDate` and health are not observed today.
- **Samples:**
  - `claude-haiku-5-5`, provider `anthropic`, creator Anthropic: prompt 1e-7, completion 5e-7, cache read 1e-8, cache write 1.25e-7 per token; context 1,000,000; function calling, reasoning, caching, vision.
  - `gpt-5.4-nano`, provider `openai`, creator OpenAI: 2e-7, 1.25e-6, cache read 2e-8; context 400,000.
  - `models/deepseek-v4-flash-0731:free`, provider `inworld`, creator DeepSeek: price 0 and 0; context 65,536; no caching flag.
- **Names.** `provider` is the host and is used as the id prefix: `anthropic`, `openai`, `google-ai-studio`, `deepseek`, `deepinfra`,
  `groq`, `inworld`, `meta`, `mistral`, `xai`, `gmicloud`. `modelCreator` is the maker in display form: Anthropic, OpenAI, Google,
  DeepSeek, Alibaba, Meta, Kimi, Z AI, Mistral, xAI, MiniMax, NVIDIA, Xiaomi, Sao10K. Maker and host differ (a Google Gemma model is
  hosted by `inworld` and `deepinfra`; `openai/gpt-oss-120b` appears under both `deepinfra` and `groq`).
- **Per provider:** openai 27, google-ai-studio 15, anthropic 13, deepinfra 22, inworld 22, mistral 6, xai 5, groq 3, meta 3, deepseek 2,
  gmicloud 1. By creator: OpenAI 31, Google 20, Anthropic 13, DeepSeek 14, Alibaba 7, Meta 7, Z AI 6, Mistral 6, xAI 5.
- **Inworld-hosted models** carry a `models/` prefix inside the name (`models/deepseek-v4-flash`) and are called as
  `inworld/models/deepseek-v4-flash`. The list holds image-generation and safety models too (`gpt-image-*`, `qwen3guard-*`), and
  dated or `:free` variants beside the plain name, so a picker must filter by output modality and tool support.
- **Callable?** The id is `provider/model` exactly as listed. Eight picked at random, including the newest or oddest
  (`google-ai-studio/gemini-4-argon`, `openai/gpt-6.1-terra`, `inworld/models/qwen3.8-flash`, `anthropic/claude-fable-5-1`,
  `xai/grok-4.7`, `mistral/mistral-small-latest`, `meta/muse-spark-1.3`, `groq/openai/gpt-oss-20b`) all answered 200. Two returned an
  empty answer text at 30 output tokens (reasoning used them up), which is not a failure. A bare model name such as
  `gemini-3.5-flash-lite` also works (the service adds the provider), but a bare name with no match is a 404.
- **Trap:** `inworld/<name>` without the `models/` part is read as a saved router: `404 Router not found: deepseek-v4-flash`.

Means: the model is chosen by `provider/model`, and the id the list gives is what the call takes; the picker needs filters, and
Inworld's own hosted models need the `inworld/models/…` form.

## 7. Release dates

- OpenCode's catalogue (`/usr/local/lib/agenthix/opencode/models.json` in the agent image, OpenCode 1.18.32, the version in
  `core/src/models/openCodeModels.generated.ts`; 223 providers) has **`release_date`** (a `YYYY-MM-DD` string) and `last_updated` on
  every model of the four providers kept: anthropic 14 of 14, openai 48 of 48, google 39 of 39, openrouter 374 of 374. It also has
  `family` (for example `claude-sonnet`) and `knowledge`.
- Examples: `claude-sonnet-4-6` release 2026-02-17; `claude-sonnet-5` 2026-06-29; `gpt-5.4` 2026-03-05; `gpt-6-astra` 2026-09-04;
  `gemini-3.1-pro-preview` 2026-02-19.
- `core/scripts/generate-model-list.mjs` reads the catalogue but keeps only id, label, provider, price, cost rank and image input;
  it drops `release_date`. Keeping it is a small change to the generator.
- **The catalogue lags Inworld's list:** Inworld has `claude-haiku-5-5`, `claude-opus-5-5`, `claude-sonnet-5-5`, six newer GPT ids
  (`gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6.1-terra` and others) and `gemini-4-argon` that the pinned catalogue does not
  have. So Sonnet 5 is the newest Sonnet by the catalogue's dates while Inworld offers Sonnet 5.5.
- Inworld's own list has no release date or any date field (section 6). A date for a model only Inworld lists must come from the
  version in its name.
- The catalogue has no entry for Inworld itself (the providers are `opencode`, `opencode-go`, `deepseek` and others, no `inworld`).

Means: the newest-of-a-family helper can order by `release_date` for models in the catalogue; for models only in Inworld's list it
must read the version from the name. An Inworld-listed newer model needs the name ordering to win, or the default will lag.

## 8. Key pages, for the guide

Wording for each, three steps: *1. Sign in, or create an account. 2. Add credit if asked. 3. Create a key, copy it and paste it
here; it is shown once.* Pages were fetched; a sign-in page is what a person not signed in sees.

| Vendor | Address | Verified | Trap |
|---|---|---|---|
| Anthropic | `https://platform.claude.com/settings/keys` | The old `console.anthropic.com/settings/keys` answers 301 to it; it shows a sign-in gate titled "API keys \| Claude Platform" | A Claude chat plan is not an API key and is billed separately |
| OpenAI | `https://platform.openai.com/api-keys` | The fetch tool got 403 (blocked automated reads); the address is the one third-party guides and the page's own sidebar give; not confirmed by loading | A ChatGPT plan does not include API credit; the key is shown once |
| Google AI Studio | `https://aistudio.google.com/apikey` | 302 to Google sign-in, with the key page as the return address; documentation also sits at `aistudio.google.com/docs/api-key` | A key may need a project with billing to go past the free quota |
| OpenRouter | `https://openrouter.ai/settings/keys` (documentation gives `https://openrouter.ai/keys`) | The first showed a sign-in page; the documentation says name it and optionally set a credit limit | Credit is bought first; a key with no limit can spend the whole balance |
| Inworld | `https://platform.inworld.ai/api-keys` | The documentation gives this address: sidebar, Manage, API Keys, Generate new key, choose type and permissions, Generate, then copy the **Basic (Base64)** value | Copy the Basic (Base64) value as it is; do not encode it again. Choose a Standard key (not Realtime-only), which is the type that covers models, hearing and speaking |
| AssemblyAI | `https://www.assemblyai.com/dashboard/api-keys` | Showed the sign-in page; documentation says Workspace, Manage, API Keys, Create New API Key | A free account may need a card before streaming is allowed |

Honest limits: no address was loaded signed in, since there is no account to sign in with here. The OpenAI address and the traps
for OpenAI, Google and AssemblyAI are from third-party guides and are not confirmed by a signed-in page; they should be read by a
person once before the guide ships.

## 9. Real error answers

Wrong key means any string Inworld does not know (`invalid`, and a well-formed but unknown base64 credential gave the same). Headers
other than the content type were the gateway's only. Bodies below are exact (newline shown as `\n`).

| Case | Status | Content type | Body |
|---|---|---|---|
| Wrong key, chat (Basic or Bearer) | 401 | `text/plain; charset=utf-8` | `Unauthorized\n` |
| Wrong key, `/v1/messages` | 401 | `text/plain; charset=utf-8` | `Unauthorized\n` |
| Wrong key, model list | 403 | `application/json` | `{"code":7, "message":"Invalid authorization credentials"}` |
| No credit | not measured: the development account has credit and the case cannot be caused; it is not known if it is 402, 403 or a 429 |  |  |
| Rate limit | 429 | `text/plain; charset=utf-8` | `Rate limit exceeded\n` |
| Known provider, unknown model (`openai/gpt-nope-9`) | 400 | `application/json` | `{"error":{"message":"All 1 model(s) failed:\n- openai/gpt-nope-9: rpc error: code = InvalidArgument desc = The requested model 'gpt-nope-9' is currently not supported. Please reach out to support@inworld.ai.","type":"api_error"},"metadata":{"attempts":[{"model":"openai/gpt-nope-9","status_code":400,"error":"rpc error: code = InvalidArgument desc = The requested model 'gpt-nope-9' is currently not supported. Please reach out to support@inworld.ai.","success":false}]}}\n` |
| Unknown provider (`foo/bar`) | 400 | `application/json` | the same shape, for `foo/bar` |
| No provider, no match (`nope-model`) | 404 | `application/json` | `{"error":{"message":"No models available for \"nope-model\"","type":"not_found_error"}}\n` |
| `/v1/messages`, unknown model | 404 | `application/json` | `{"error":{"message":"No models available for \"claude-nope-9\"","type":"not_found_error"}}\n` |
| Missing `model` field | 400 | `application/json` | `{"error":{"message":"'model' field is required","type":"invalid_request_error"}}\n` |
| `inworld/<name>` without `models/` | 404 | `application/json` | `{"error":{"message":"Router not found: deepseek-v4-flash","type":"not_found_error"}}\n` |
| `GET /v1/models` | 404 | `application/json` | `{"code":5, "message":"Not Found", "details":[]}` |

Means: a refused key on a chat call is a plain-text 401, not JSON; the check must read the status, not a body. The model list gives
a JSON 403 for a bad key and is itself a cheap, authenticated check (but 94 KB); a one-token chat is the other. A model not
supported by the vendor is a 400 with the vendor's wording, not a 404, so "model unknown" is told apart by the text
"is currently not supported". The no-credit state is unknown, so the check's "out of credit" state cannot be tested against a
recorded answer and must be built from the first real case.

## What this changes in the plan

- **Spec §1, the key header:** both `Bearer` and `Basic` work everywhere measured (plain HTTP, the AI SDK, OpenCode). Use `Bearer`;
  the relay's default needs no change. `x-api-key` is refused.
- **Spec §1, a `429` retried with a back-off:** confirmed, and it is plain text, not JSON. The development account's limit is
  about 18 requests a second, not the published free-plan numbers; operational limits are still not for screens.
- **Spec §2, health and `deprecationDate`:** neither exists in the list today. The marking of a model near its deprecation date has
  nothing to read yet; keep the read defensive, but do not build screens or a warning on it in this unit.
- **Spec §2, prices per provider:** the list has a price for each host, so the same maker's model can differ per `provider` entry.
  The list has no model name or label: a label comes from the id (or the OpenCode catalogue where the model is in it).
- **Spec §2, maker names:** the list gives `modelCreator` in display form (Google, Kimi, Z AI); `provider` is the host. Patterns by
  maker can use `modelCreator`.
- **Spec §1, the model id:** Inworld-hosted models are `inworld/models/<name>`; `inworld/<name>` alone is a router lookup and
  fails, which fits ADR-0183 and means the id must be taken exactly from the list.
- **Spec §4, the release date:** OpenCode's list has `release_date`, filled everywhere checked, and the generator drops it today and
  must keep it. The pinned catalogue is behind Inworld's list (no Sonnet 5.5, no GPT 6.x, no Gemini 4), so ordering by catalogue
  date alone would pick Sonnet 5 where Inworld offers Sonnet 5.5. For Inworld, order by the version in the name over Inworld's own
  list (which has no date); use the date for the catalogue's providers and to break ties.
- **Phase 1, caching:** the cached count is `usage.prompt_tokens_details.cached_tokens`. Anthropic models cache only when the
  request marks `cache_control`; other vendors cache by themselves.
- **Spec §1, harness:** Claude Code works through Inworld (tools, thinking, caching, streaming, interruption), but only with the
  key as a Bearer token; OpenCode also works for Claude, GPT, Gemini and DeepSeek on the one path with tools and streaming.
  **Decided: OpenCode for every model via Inworld.** One harness and one OpenAI-format path for every vendor, and the relay needs
  no new case; Claude Code's extra value is not needed for a first release. Revisit only if a Claude-specific feature (subagents,
  Skills through Claude Code) is required on an Inworld key.
- **Not measured:** the no-credit answer; the free-plan limits; the site relay path (code not yet written); OpenCode with a streamed
  tool call on non-Claude models; Claude Code with models other than Haiku.
