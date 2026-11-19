# The conversation layer

How a conversation is answered from hq while its longer work runs on sites. [The concept](../concepts/conversations/conversations.md)
says what a conversation is to a person; this page says how it is built.

```mermaid
flowchart LR
    BR["Browser"] -->|"actions; Socket.io room conversation:id"| ADM["Admission"]
    subgraph HQ ["hq"]
        ADM --> REC[("The record: messages, turns, operations, segments, ledger")]
        REC --> CO["Coordinator: one turn at a time per conversation"]
        CO --> CTX["Context assembly"]
        MEM["Memory probe"] --> CTX
        CTX --> MOD["Model adapter, direct to the provider"]
        MOD --> CO
        CO <-->|"in process, with the turn's capability"| TOOLS["hq's own operations"]
        CO --> WORK["Operations: workers, tasks, detached calls"]
        WORK --> MB["Mailbox: completions and requests become cards"]
        MB --> CO
    end
    MOD --> PRV["Model provider"]
    WORK <-->|"control channel: run.dispatch, run.status"| SITE["Execution Site: standing worker, a harness session in a container"]
    TOOLS --> KN["Knowledge tools: search, read, write, edit, delete"]
    KN --> SITEK["location.*Knowledge: a place's pages, asked of its site, and the guide in hq's image"]
    CO --> PLC["The conversation's places: its own, and those its person added"]
    PLC -.->|"limit"| KN
    PLC -.->|"limit"| WORK
```

**What is new here is that hq answers.** hq still starts no harness and touches no site's disk. But the reply a person
reads in a conversation is produced in hq's own process, by a direct call to a model provider, and hq holds the words of
the conversation in its database. A site is asked only for work (a harness run), for a place's knowledge, and for a
run's detail when a person opens it.

**In a demo, the model is scripted.** With `DEMO_MODE` set, the adapter is given a scripted model in place of the provider's: it picks a reply by matching the message to a script and calls hq's own tools as the script says, and no provider is called ([ADR-0186](../adr/adr-0186-a-demo-is-a-setting-of-the-install.md)).

## The record

hq's database holds the conversation (`hq/schema.prisma`):

| Table | A row is |
|---|---|
| `Conversation` | One thread: its home (`PERSON`, `PROJECT` or `TASK`), who opened it, its agent (read from the task for a task's thread), status (`ACTIVE`, `ARCHIVED`, `CLOSED`) and closed reason, the talking model and the access it opened on, who holds voice, the one-turn lock and its lease, and the ledger |
| `ConversationMessage` | One thing said, numbered 1, 2, 3 with no gaps (`seq`): a role (person, agent or platform) and a kind (`TEXT`, `OPERATION_STARTED`, `ACTION`, `TASK`, `RESULT`, `APPROVAL_REQUEST`, `APPROVAL_ANSWER`, `SUMMARISED`, `VOICE_STARTED`, `VOICE_ENDED`, `FAILED`, `NOTICE`). A person's message carries the id its browser gave it, so sending twice stores it once; it is `WAITING` while a reply runs and `TAKEN` when a turn answers it |
| `InferenceTurn` | One direct-inference turn: state, what started it (a message, a report, a continuation), the person it acts as, model, usage and timings |
| `Operation` | One piece of work commissioned: kind (`WORKER`, `TASK`, `TOOL`), mode, brief, target boundary, state, result, the site and run or the task that carries it, an idempotency key and what it may continue with |
| `ConversationSegment` | One compaction, written once |
| `RunResult` | What one run said it achieved, from `set_result` |
| `AgentSession` (also on the site) | A standing worker, with `conversationId` and a boundary |

**Message text is encrypted at rest** with hq's data key (`hq/src/conversations/sealing.ts`), as the other sealed fields hq
keeps; a backup carries the ciphertext. A reading person gets it decrypted, after the reading rule has decided they may
read. **Nothing is held twice:** the site keeps a worker's runs, transcripts and tool calls as it always did, and a run's
detail is fetched from it only when a person opens it. A conversation stays readable, and can be written in, while a site
is offline.

## One turn at a time

Anything may ask for a conversation to be scheduled: a message admitted, a card written, a turn ending, recovery. Only one
claim wins (`coordinator/scheduler.ts`).

- **The lock** is `Conversation.activeTurnId` and a lease (30 seconds, renewed every 10 while the turn runs), claimed by
  one conditional update that succeeds where the lock is free or its lease has run out (`coordinator/lock.ts`). It holds
  across hq processes. A process that dies loses it when the lease runs out, and recovery fails the turn it held.
- **Admission** (`coordinator/admission.ts`) checks the sender may speak, stores the message under the conversation's row
  lock and, when a turn is running, stores it as waiting. By the sender's `busyConversationMode` it then waits for that
  turn (`WAIT`) or stops it (`INTERRUPT`). Messages are taken in order, and a batch is the oldest and every consecutive
  one by the same author (`coordinator/batch.ts`).
- **The turn** (`coordinator/turn.ts`) resolves the model and provider (the resolver), mints its capability, assembles its context, then
  loops: a model call streams text to the room, the step's tool calls run together through the tool adapter, and the
  results go back, to at most 8 steps; the last is words only. One agent message is committed at the end, with the reply's
  steps. After 4 steps that looked something up, the model is called once more; only if that call asks for more tools
  does hq start the rest as work itself and end the reply with a fixed line, and a call that answers in words ends the
  reply as any other (`coordinator/moveToBackground.ts`).
- **Report and continuation turns** (`coordinator/cardTurn.ts`) answer no one: the mailbox wrote a `RESULT` card, and one
  turn over all the cards waiting speaks and starts no work. A continuation replaces it when a completed operation carries
  an obligation whose three checks (member of the boundary, agent assigned, tool allowed) still pass, acting as the person
  who authorised it.
- **What the screens receive** goes to the Socket.io room `conversation:<id>`, joined only after the reading rule: `message`,
  `messageUpdated`, `delta` (text as streamed), `turn`, `steps`, `operation`, `operationLines`, `summarise`, and on joining a
  `replay` of what the running turn has streamed so far, so a dropped browser loses nothing
  (`CONVERSATION_SOCKET`, `hq/src/shared/conversations/protocol.ts`). Text being streamed is held in the process running the
  turn; the committed message is in the database.
- **Recovery** (`coordinator/recovery.ts`), at start and then every lease: a turn whose lock ran out is failed with
  "HQ restarted", a tool call hq was making is marked uncertain and then reconciled (a read is run again, a write is reported
  as unknown whether it happened), task operations stranded by a change on their board are read against their task, and
  waiting messages and unanswered cards are scheduled again in order. Workers' and tasks' operations are reconciled when
  their site connects (`work/reconcile/`).

## The lead in hq

**Context.** Four parts, ordered by how often each changes so the provider's cache of the front survives
([long conversations](../concepts/conversations/long-conversations.md)): the lead's base instructions with the agent's and
the organisation's; the compaction block; the window of messages since the last compaction; and the turn block appended to
the turn's own message. The lead sees no override or `AGENTS.md`, which are files on a site (`coordinator/context.ts`).

**The model adapter** (`hq/src/conversations/model/`) is the only code that names a provider's SDK. It uses the Vercel AI
SDK that hq already carried, for Anthropic, OpenAI, Google, OpenRouter and an OpenAI-compatible endpoint, and adds each
provider's caching hints. The talking model, its provider and the billing profile its cost belongs to come from the one
resolver ([model-resolution.md](model-resolution.md)): the model the conversation is fixed to, which began as the agent's
own default model or the organisation's and which the person changes with the picker, narrowed by the lists that
apply (`access/talkingModel.ts`). The key is the organisation's provider's, read for the turn.

**Tools.** Every tool is defined once, in hq's control-plane registry, behind one permission check. A harness reaches it
through its site's `/mcp` endpoint; the lead's turn reaches it in process with a **turn capability**, minted per turn for the
author of the message being answered, carrying the agent's tool permissions in the place, the strictest level winning
(`tools/mintTurnCapability.ts`, `server/controlplane/turnCaller.ts`,
[ADR-0082](../adr/adr-0082-a-conversation-acts-with-its-current-turns-authority.md)). A turn calls only quick tools, never
one that starts work or acts for a run in its container; a tool at *ask* is not called but offered (`work/toolCalls/ask.ts`).
Each call of a step runs under the **wait limit** of 4 seconds; past it the same call is detached, with the operation row
created before the call started and an idempotency key (the tool and its arguments), so an identical call while the first
is pending is the same operation. A result over 16,000 characters is cut with a line telling the lead to brief a worker.
The conversation's own tools are `start_work`, `create_task`, `run_task`, `cancel_operation`, `answer_approval`, `ledger`,
`expand`, `messages`, `offer_new_conversation` and `suggest_place`, beside `recall`, `remember`, `forget`, the five
knowledge tools (`search_knowledge`, `read_knowledge`, `write_knowledge`, `edit_knowledge`, `delete_knowledge`;
`hq/src/conversations/memory/leadKnowledgeTools.ts`) and hq's task, board and project tools. `recall` searches memory
only. The change tools are offered only in a turn that answers a person.
A turn is shown only its must-have tools in full; every other tool it may use is named in the instructions under its area, found with `find_tools` and called with `use_tool`, which the turn runs as the tool it names ([tool-search.md](tools/tool-search.md)).

## Work on a site

**A brief** becomes an `Operation` and waits in hq, `QUEUED`, in front of its boundary's **standing worker**. The queue takes
one at a time per worker, under a Postgres advisory lock, so it holds across processes (`work/workers/queue.ts`); the brief
is dispatched with `dispatchChatRun` as a run of the worker's session, as a person's message into a chat would be. Admission
checks the person, the agent and the tool for that boundary, and the run's capability is the boundary's, never the
conversation's place's. The briefs wait in hq, and not on the site, so a site restart loses none and a brief can be stopped
without reaching it.

**A brief can name a workspace** of its boundary (`start_work`'s `workspace`), admitted only when the workspace is that
boundary's own and the person may work in it (`work/workers/briefWorkspace.ts`). It then goes to a worker of its own: a
worker's slot is the conversation, the boundary, the person and that workspace, since a harness session keeps the folder it
started in. A worker in a code workspace works on the conversation's own branch there, one per conversation and workspace,
made at its first run (`branches/runCodeWork.ts`, which checks again at each run that the person may still work there).
The lead is told the conversation's open branches each turn, so a merge asked for in the conversation goes to that work.

**Events come back** through the same `run.status` listeners the task state machine uses
(`work/workers/runEvents.ts`): the run's end settles the operation, writes a `RESULT` card, and starts the worker's next
brief. A run that asks for approval ends asking; hq writes the `APPROVAL_REQUEST` card, the operation waits, and the answer
(`answerConversationApproval`, or the lead's `answer_approval`) is forwarded to the site (`run.approve` or `run.reject`) and
continues the worker in a new run of the same session. A worker's context use is read from the site and, past 70% of its window, its slot gets a fresh
session between briefs (`work/workers/freshStart.ts`).

**A task** is the project's task, started by `run_task` as it is from a person's Run; the operation is completed by the
run it started, with the run's stated result. In a task's thread, `start_work` is `run_task` on the task, and every run of
the task leaves a card there.

## A conversation's places

A conversation reaches its own place and the places its person added, and no other. `ConversationPlace` rows hold each added
place, who added it and when (`hq/schema.prisma`); the conversation's own place is not a row but is read from the
conversation (`hq/src/conversations/places.ts`).

- **One re-checked list serves everything.** On every turn the list is rebuilt from the rows, keeping only places the
  person can still open; a place they lost drops out and is no longer named. The knowledge tools' reach
  (`hq/src/knowledge/reach.ts`), `start_work`'s admission and the lead's own account of its places all read this list.
  Removing a place takes effect from the next turn; work already started there carries on.
- **Knowledge.** The turn's tools search and read every place in the list, the organisation and the platform guide, each hit
  marked with its place. A task's thread has its task's project only and cannot add places.
- **`start_work`.** Its admission (`admitToBoundary`, `work/boundaries.ts`) refuses a place the conversation does not hold,
  in words that say how to add it, after it has checked the person, the agent and the tool for that place as before.
  A worker's capability is still its boundary's alone.
- **Telling the lead.** The turn block, appended after the cached part of the context, names the places by the names the
  person sees ("Your space" for the person's default personal project; any other personal project by its own name),
  says the organisation's knowledge and the platform guide are always in reach, and says that anything else is out of
  reach until the person adds it, never to be answered as if empty (`lead/placesBlock.ts`). A search that finds nothing
  names the places it covered.
- **Only the person adds.** `addConversationPlace` and `removeConversationPlace` (`placesOperations.ts`) are the person's
  own operations; the person must be the conversation's. The lead's `suggest_place` (`placesSuggest.ts`) only writes a
  card into the thread, looked up among the places the person can open and answered in fixed words when there is none;
  the person's click on it calls `addConversationPlace`.

## Knowledge

The lead reaches knowledge through its five knowledge tools, in process, with the turn's capability: the same operations
a worker reaches through its site's `/mcp` endpoint ([MCP tools](mcp/tools.md#what-the-knowledge-tools-do)). A search asks
the sites holding the places' and the organisation's knowledge, and reads the platform guide from hq's own image, at once.
Nothing of a page is stored in hq; hq stores only the record of who changed one. Each call is shown as a work step of the
reply (*Searched knowledge*, *Updated page*), and a change leaves the version before it for Undo
([knowledge](../concepts/knowledge/knowledge.md)).

## Memory

`MemoryItem` rows hold an embedding each; the local model (`all-MiniLM-L6-v2`, 384 dimensions) runs in hq's own process
through ONNX Runtime's WebAssembly build, loaded once on first use from files hq's image carries (about 90 MB; fetched once into hq's storage if an image lacks them). Search is exact over the rows a principal may read; no
vector extension is installed, so every install keeps its pinned database image. Before each turn the probe composes a query
and the turn block carries what it finds (`conversations/memory/`); hq runs a background re-embed each minute, and, once a
day, the tidy and the tuning of each organisation's bars (`memory/maintenance.ts`). See [memory](../concepts/memory/memory.md).

## Voice

A spoken turn is an ordinary turn. Speech to text runs in the browser against the organisation's speech service, on a short-lived,
single-use token hq mints; the message arrives marked `spoken`. Text to speech runs in hq from the lead's stream, a sentence at a time with
word timings, and its audio goes only to the holder's sockets (`conversationVoice:*` events,
`CONVERSATION_VOICE_SOCKET`). The holder (`voiceHolderId`) is taken and released under the conversation's row lock; the
silence rule and the speech in progress are held in the process that has the holder's socket
(`conversations/voice/registry.ts`) and a restart ends voice with a line saying so.
A step's last sentence is spoken when the step ends, not after its tools and the next step's first word, and a step's
calls that only read run side by side while one that writes, asks for approval or starts work runs alone, in the order
asked (`voice/session.ts`, `coordinator/stepTools.ts`). Two development-only pages exist: the voice lab
(`/dev/voice-lab`, for debugging a real conversation) and the voice playground (`/dev/voice-playground`, standalone).
See [voice](../concepts/conversations/voice.md). With the flag `voiceListener` on, a light model listens while the person
speaks and decides whether the agent is needed at all: [voice-listening.md](voice-listening.md). Everything below is voice
with the flag off, which is also plain voice with the person's Adaptive voice off.

A voice client calls two operations named for no vendor: `getVoiceServices` says which speech services the defaults
resolve to now, for any member (a provider's vendor, nothing secret), and `getSpeechToken` gives a short-lived token for
the listening provider that works, the agent's own choice first, then the organisation's, else Inworld. The client
says which services it can stream to (`hears`); one that says none (dictation and web voice name theirs, the mobile app
does not) is given AssemblyAI only. A token that cannot be minted falls to the next provider (`voice/hearingAccess.ts`,
`speechMint.ts`). Speech is always Inworld TTS 2, and still goes through hq. Listening is Inworld's one model or one of
AssemblyAI's three live models, chosen with the other model choices; Inworld is one provider row for speaking and
hearing, and AssemblyAI stays supported as the fall-over; the providers' keys are managed only on Providers in
the admin area ([model-resolution.md](model-resolution.md)).

### What a voice client must do

The events say what hq and the client tell each other; they do not say when to send them. hq's web client
(`hq/src/conversations/voiceClient/`, its thresholds in `settings.ts`) does the following today, and any other client
(the mobile app) must do the same for voice to behave the same:

1. **Hear the person and turn their speech into words.** The client runs speech to text itself, against the provider
   `getSpeechToken` names, fetching a token before the person starts and a fresh one before it expires. It keeps the
   agent's own voice, heard back through the microphone, out of what it takes for the person's words (`stt/echo*.ts`,
   `acoustic/`). When speech to text stops working for good, it sends `end` with `failed: 'speech-to-text'`.
2. **Decide when the person has finished speaking.** Silence alone is not enough. When the person pauses, a turn model
   scores whether they have finished (`semantics/`); at each mark of the pause (0.5, 1 and 2 s) the score answers
   *finished*, *still speaking* or *not sure*, and at 3 s of silence the turn ends whatever the score. If the model
   gives no answer within 300 ms, silence decides. The message goes only once speech to text has heard the person's
   last words. It goes as an ordinary message with `spoken: true`, and with `trailedOff: true` when the 3 s limit ended
   a turn the model still heard as mid-thought.
3. **Add to a message just sent.** If the person speaks again after the message went but before any of the reply has
   been heard, the client sends `continue` with the reply's `turnId`; hq cancels that reply and answers the whole
   message. A reply that only asked the person to go on (a sentence marked `encouragement`) leaves the message open
   the same way. When the lead held the turn (`conversationVoice:turnHeld`, below), there is no reply to cut and the
   words join the held message. Words that name a reply already cut join the same message too, so one spoken message
   is answered by one turn. If hq has not started a reply yet, the words go as a message of their own.
4. **Keep voice alive while the person speaks.** hq ends voice after two minutes of silence on both sides
   (`silenceWarning` comes 15 s before). The client sends `activity` while the person is speaking, at most every 5 s.
5. **Play the reply, and say how much was heard.** Sentences come with their words' timings, then their audio
   (24 kHz, 16-bit PCM, in order); the client plays them in order and shows the written reply only as far as it has
   been spoken. When the person speaks over the reply, the client lowers it at once, and decides from their words
   (`orchestration/bargeIn.ts`): a stop word or enough of their own words stop it, an acknowledgement ("mm-hm") lets it
   go on. On a stop, it sends `interrupt` with `heardThrough`, the index of the last sentence heard to its end (-1 for
   none), so hq keeps only what the person heard.
6. **Fill the wait, and show it is listening.** (With `voiceListener` on, the timed family and the standard
   acknowledgement below never play: the light model's lines and the stored fallback phrases fill the wait,
   [voice-listening.md](voice-listening.md).) The `phrase` events, sent as voice starts, are short stored clips in the
   agent's voice, none of them written into the conversation. Two things use them, both off with the person's Adaptive
   voice off:
   - *One standard acknowledgement.* If a message was sent and, by a ceiling of about 4 s, no reply has started, no
     hold has come (`reply.held`) and the floor is free, the client plays one clip, once. There is no ladder of
     phrases and no short word at once.
   - *The listening family* (`orchestration/listening.ts`, `fit.ts`, `listeningTiers.ts`). Three tiers of clips: hums,
     acknowledging words and invitations ("Go on."). A hum or word plays in a brief pause (0.3 s) where the heard text ends in punctuation (any pause after the longest wait), after 8 s of
     speech, counted across held messages, at an irregular gap, without waiting for the turn model or the lead; a local check of the
     person's last words decides whether a word fits, and where it does not only a hum plays. A hum or word is left to finish if
     the person goes on; an invitation is cut. An invitation
     plays after a stop word with the person silent, or after a held turn with the person silent. None of the last 6
     clips repeats, and nothing plays over the person.
   **Holding a turn** (flag `voiceListener` off). For a spoken message the lead decides in its own call whether the person has finished: a
   `keep_listening` call (its reason logged, no text) holds the turn. hq then sends `conversationVoice:turnHeld` to the
   holder, with no message and no second model call, and the person's next words join the held
   message. Otherwise the lead replies, opening with one short sentence only when the reply needs real work (an
   Adaptive voice that is off leaves the sentence out). The lead's voice instructions come in the turn block, added to
   a spoken message only, after the cached part (`conversations/lead/voiceTurnBlock.ts`, `voiceLogic.ts`); with the
   `voiceBridge` flag on, the base instructions carry no voice text.
7. **Let an agent's update wait its turn.** An `update` is a raised hand: the client shows it and sends `invite` at the
   next opening (the floor open for 2 s), or when the person taps it or invites it in words. A critical update is
   invited at once, after the current sentence.

## What must not break

- **Exactly one turn owns a conversation**, across processes; a turn that lost the lock writes nothing.
- **A turn never waits on a call longer than the wait limit, and a detached call is never run twice.**
- **An operation is authorised for its own boundary**, at admission and again before any continuation. Nothing is unioned
  across a conversation's places, and a worker holds its boundary's authority and none of the conversation's.
- **A conversation reaches only its own place and the places its person added**, and only the person adds one.
- **Nothing in the first three parts of the context changes within a turn**; an expansion is appended, never substituted.
- **The record is hq's.** A site holds the work and a worker's own history; the words of a conversation are not copied there.

## Where in the code

| You want | Look in |
|---|---|
| The record's access, sealing, reading rule | `hq/src/conversations/store/`, `sealing.ts`, `readingRule.ts` |
| Admission, the lock, turns, the mailbox, recovery | `hq/src/conversations/coordinator/` |
| The model adapter and caching | `hq/src/conversations/model/` |
| The turn's tools and capability | `hq/src/conversations/tools/`, `hq/src/server/controlplane/turnCaller.ts` |
| Workers, tasks, tool calls as operations | `hq/src/conversations/work/` |
| A task's thread | `hq/src/conversations/taskThread/` |
| Compaction, the ledger, zooming | `hq/src/conversations/long/` |
| Memory | `hq/src/memory/`, `hq/src/conversations/memory/` |
| Voice, on hq and in the browser | `hq/src/conversations/voice/`, `voiceClient/` |
| What crosses to the browser | `hq/src/shared/conversations/`; a run's events, rebuilt from the site's frames, in `runEvents.ts` and `hq/src/sites/channel/clientRunEvents.ts` |
| The knowledge tools and their reach | `hq/src/knowledge/`, `hq/src/conversations/memory/leadKnowledgeTools.ts` |
| A conversation's places | `hq/src/conversations/places.ts`, `placesOperations.ts`, `placesSuggest.ts`, `lead/placesBlock.ts` |
| Knowledge on a site | `core/src/protocol/locationFiles.ts` (`location.searchKnowledge` and the other `location.*Knowledge` methods) |

## Decisions behind this

[ADR-0042](../adr/adr-0042-hq-is-the-orgs-own.md) (hq is the organisation's own) ·
[ADR-0075](../adr/adr-0075-work-in-a-boundary-runs-in-parallel-only-a-conversation-is-ordered.md) (only a conversation is ordered) ·
[ADR-0082](../adr/adr-0082-a-conversation-acts-with-its-current-turns-authority.md) ·
[ADR-0096](../adr/adr-0096-a-conversation-belongs-to-a-place.md) ·
[ADR-0101](../adr/adr-0101-a-run-is-bounded-by-the-person-it-is-for.md) ·
[ADR-0150](../adr/adr-0150-agents-reach-knowledge-only-through-tools-shaped-like-the-native-ones.md) ·
[ADR-0152](../adr/adr-0152-a-conversation-reaches-only-its-own-place-and-the-places-its-person-added.md)
