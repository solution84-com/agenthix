---
created: 2026-11-12
description: Memory people can find, and Your space as a project place — memory's scope, kinds, saving and recall, the one memory screen, and Your space built as a project place.
---

# Memory people can find, and Your space as a project place — spec

**Status:** Approved by the owner, 12 Nov 2026. The decisions and the design pass are settled; the design below is
written from them, and the three points raised after it are settled in section 10. The background (today's memory, Your space
against a project) is in this folder's [`README.md`](README.md). The settled screens are
[`boards/design-pass.html`](boards/design-pass.html), the build baseline.

## Decisions (owner, 12 Nov 2026)

1. **A memory has a scope: always one person, optionally an agent, optionally a place.**
   - The scope is where a memory holds. It is separate from what the memory says (title, body, kind, tags).
   - **The person is the memory's authority.** Only they see it, correct it and forget it, and it is recalled only when
     work is for them. A scope with no person is not a memory.
   - **An agent or a place limits where the memory is recalled:**

     | Scope | Recalled when the work is for the person and |
     |---|---|
     | Person only | any agent replies, in any place |
     | Person + agent | that agent replies, in any place |
     | Person + place | any agent replies, in that place |
     | Person + agent + place | that agent replies, in that place |

   - **Recall checks the scope before the meaning search.**
     - Every turn already has a person, an agent and a place (`turnPrincipal`).
     - A memory may be recalled when every part its scope names matches the turn's. A part it leaves out matches any.
     - The meaning search then ranks what passed.
   - **The agent and the place are stored as references (ids), not names.** A screen shows their current names, so a
     rename changes nothing. Deleting the agent or place removes the memories scoped to it.
   - **The word is "scope"** in the spec, the code and the records, as it is today. On screen a person sees two badges: the
     agent's name or "Every agent", and the place's name or "Everywhere".
     - Not "context": it already means the prompt and its token budget.
     - Not "bounded context": in domain-driven design that means something else.

2. **One agent and one place per scope, for now. Several of each is a reachable later step, not ruled out.**
   - **Why not sets now:**
     - An agent writing a memory can only sensibly name itself and the conversation's place, so only a person editing
       by hand would ever pick several.
     - Sets would cost now:
       - two linked tables;
       - a harder uniqueness rule (a key is unique within its scope);
       - pickers for several values;
       - a recall query that checks membership;
       - tests for all of these.
     - The usual alternative works: leave the memory unscoped, or write two.
   - **A conversation with two agents** is served without sets. Each agent writes its own memory, scoped to itself and
     worded for its own work, and each is corrected or forgotten on its own.
   - **How "later" stays cheap:**
     - Everywhere a scope is passed (the contracts inside hq, the screens' queries and actions, a memory as the screens
       see it), it is a small object, `{ person, agent?, place? }`. It is not today's fixed list (`person`,
       `agent_person`, `agent_place`). The memory tools take no scope at all (decision 6).
     - Widening `agent?` to `agents?` and `place?` to `places?` is then an additive change under
       `docs/architecture/versioning.md`.
     - Storage goes the same way. Two linked tables are added, each memory's agent and place are copied in as one-item
       sets, and then the old columns are removed. That move is mechanical and loses nothing.
   - **When to revisit:** when several people and several agents work together in one place, so that one memory must
     serve a group of agents. That is the case the collaboration rooms reserved for later would bring, and their
     design revisits this decision.

3. **The unit holds four parts, built together before 0.1.0:**
   - **A. One memory screen.** Everything agents know about the person, in one list, newest first. It is filtered by
     kind, agent, place and tag instead of a tab chosen first, and each memory opens to promote or forget (decision 12).
   - **B. Every way into memory leads to that screen, filtered.** That covers an agent's page, a place, and a
     "Remembered …" line in a conversation, which opens the memory itself.
   - **C. Your space and personal projects are project places.** They get a project's sections, a Settings section,
     and the project Overview, which does not repeat the side menu.
   - **D. The scope change in decisions 1 and 2:** how memory is saved and recalled, and the memory tools.
   - **Why together:** A and D shape the same screen and code, so building the screen on today's three tabs would be
     done twice. C decides where a place's way into memory sits, which B depends on.
   - **The unit is therefore not screens only.**

4. **The shared place memory is dropped.**
   - This is today's agent-in-a-place scope, which has no person: the agent reads it for everyone in the place, and the
     place's admins look after it.
   - What an agent learns about a place goes into that place's Knowledge. Knowledge already has a checked gate, keeps
     every version and records who changed what.
   - That scope comes out of the memory tools, the probe, the access rule and the screens.
   - A decision record supersedes that part of ADR-0122.
   - Nothing is carried over: dev holds no place memories.
   - **Accepted cost:** until Knowledge search works by meaning (already planned), place facts are found by their
     words, not their meaning.

5. **Where a person reaches their memory.**
   - **The one memory screen is in the person's own Settings: Settings › Memory.** Memory is personal, like a profile.
   - **An agent's page keeps a Memory entry:** that agent's own memories first, then, folded, what every agent knows,
     with a link to all of the person's memory. It answers "what does Kernel know about me?" in full.
   - **A "Remembered …" line in a conversation opens the memory itself** on that screen.
   - **No place has a Memory section:** not Your space, a personal project or a shared project.
     - In a shared project's menu, "Memory" would read as the project's own.
     - What a place knows is its Knowledge.
     - A person's memories scoped to a place are found with the screen's place filter.
   - **The organisation admin's memory settings stay** as they are: how recall works, with no items.
   - **These screens get a design pass** with the owner on boards before they are built.

6. **An agent remembers for itself, where it is; the person promotes.**
   - **An agent always saves a memory scoped to the person, itself and the conversation's place.** `remember` has no
     scope choice, so the agent never judges what is "general".
   - **Each agent keeps its own memory of the person,** worded its own way. That is part of what makes agents feel
     distinct. In a conversation with two agents, each saves its own.
   - **Only the person widens a memory, by promoting it:**
     - to that agent in every place;
     - to every agent in that place;
     - to every agent, everywhere.
   - **The line shows only when the person asked** ("remember…", or a correction). A memory the agent saves on its
     own is silent in the conversation and found on the memory screen, newest first. This follows Claude's and
     ChatGPT's direction: memory works in the background and is seen in settings (owner, 12 Nov).
   - **When it shows, it is one quiet line, styled as a system message:** "Kernel remembered this",
     with one button, **Show**. It carries no title, scope or tags: what was remembered is
     the message right above it.
   - **Show opens the memory in a dialog, centred over everything.** The chat may be docked narrow on the right,
     expanded over the page, or the whole Chat page; a panel beside it would squeeze it or be hidden, and a dialog fits
     all three. On a phone it fills the screen. It holds the two
     switches (*Which agents remember it*: Kernel / Every agent; *Where*: Shop / Everywhere), what it says (read
     only), and Forget. **Promoting happens there,** and on the memory screen. Each press of a switch takes effect at once.
   - In a call, the person says "for every agent" in the same sentence, or presses Show in the transcript afterwards.
   - **Consequence, accepted:**
     - What Kernel learns in Shop is not known to Kernel in Your space, nor to Scout, until it is promoted.
     - In return, nothing said in one place reaches another, or a conversation other people read, unless the person
       chose that (decision 9).

7. **Tags stay free, and become something to filter by.**
   - **Tags are free words,** written by the agent or the person, with no fixed list. They are still called tags:
     scope is now its own concept, so the name no longer causes confusion.
   - **The memory screen filters by tag,** alongside kind, agent and place.
   - **`recall` takes optional tag and kind filters,** so "everything tagged writing" or "all my rules" is one call. This lets an agent drill
     down from one memory it found to the others on the same subject.
   - **Tags stay folded into the meaning search,** as today.
   - **Agents are not told to drill down by tag yet.** That waits for a model check on the baseline model that runs the
     same questions with and without it and counts what is found.

8. **A memory belongs to the person whose message the agent is answering.**
   - It may mention other people ("Bob likes short updates"), and it is still that person's private memory.
   - Nothing is ever written into another person's memory. A person's own preference reaches their memory only when
     they say it.
   - What is true for everyone in a group or place goes into the place's Knowledge, once, not into each person's
     memory.

9. **A conversation other people can read recalls no person's memory.**
   - **This is today's rule, kept.**
     - A project conversation is private to the person who opened it (`readingRule.ts`).
     - A task's thread is read by every member of its project, and it reads no person's memory (`personOfTurnHome`).
   - **With the shared place memory dropped,** a task's thread reads no memory at all, only the place's Knowledge.
   - **A run follows the same rule:** a run in the person's own home (their own Run of a task) reads their memory; a
     run in a home other members' runs share (a project's task runs) reads none.
   - **Group conversations (the collaboration rooms reserved for later) start from this rule.** Their design may loosen
     it, for example to recall a person's memories scoped to that room, but only deliberately.

10. **A memory is one of two kinds: a Fact or a Rule.**
    - **Fact:** something true about the person ("Avery is job hunting"). **Rule:** how the person wants things done
      ("When comparing options, use a table").
    - **They replace today's five** (fact, preference, decision, feedback, project). Preference, decision and feedback
      behave as a Rule; a project detail belongs to the scope or to the place's Knowledge.
    - **Two kinds because there are exactly two behaviours:**

      | | Recall | A near-duplicate |
      |---|---|---|
      | **Fact** | By meaning, as today | Joined onto the old one, when the two fit in one memory |
      | **Rule** | By meaning, then weighted (below) | The newer one replaces the old |

    - **Why a Rule is weighted.** The meaning search finds related words; it cannot tell that a memory is a rule. A
      rule matched only moderately lands in the hint tier, which the agent may pass by, and is then not followed. So,
      once meaning has found a Rule:
      - a Rule that reaches the hint tier is **included in full** instead;
      - Rules come **first within a tier**, ahead of Facts of the same score;
      - the caps stay (three in full, three hints), and a Rule below the hint bar stays out: the weight acts only on
        what meaning found.
    - **Nothing is carried in every turn for rules,** and no step is added to a turn: recall stays the search before
      the turn, with no model call, and `recall` when the agent is unsure how the person wants something done.
    - **The agent chooses the kind when it saves:** "always", "whenever", "I prefer", "don't" make a Rule; anything
      else is a Fact.
    - **A model check on the baseline model** measures rule recall with and without the weight, on questions whose
      words don't name the rule ("which host should we pick?"), and counts how often the rule is followed.
    - Nothing is carried over: dev data is wiped before 0.1.0.

11. **The memory screen is one flat list, newest first, every agent on equal terms.**
    - No groups by agent: grouping puts one agent above another by order and by size.
    - **Each memory shows three badges on the line under its title:** its kind ("Fact" or "Rule"), which agents
      ("Kernel" or "Every agent"), then where ("Shop" or "Everywhere"), followed by its tags and date. They use the same words as the
      two switches that change them, so what a person reads is what they change. One plain style; no pictures and no
      colour.
    - **Filters: kind, agent, place, tag and search.** The agent and place menus hold the badges' values (Every agent,
      Kernel, Scout; Everywhere, Shop, Your space), and each matches its badge exactly: Kernel shows the memories marked
      "Kernel". "What does Kernel know about me?", which also counts what every agent knows, is Kernel's page.
    - **A memory opens in the same dialog everywhere:** from the memory screen, an agent's page, or Show in a
      conversation. One way to show a memory, built from the shared `Modal` and `SegmentedControl`.
    - **Who wrote a memory, and whether it was promoted,** is shown when the memory is opened, not on the row. The
      record already holds the writer (`writtenByAgentId`, `writtenByUserId`) apart from the scope.

12. **Memory is the agent's own, formed through conversation. A person can promote or forget a memory, and nothing
    else.**
    - **No adding and no editing.** A person cannot write a memory, nor change a memory's title, text, kind or tags.
      What an agent remembers is what it took from working with the person, in its own words; a memory written for
      it would defeat that.
    - **What a person can do:**
      - **promote** it, with the two switches (decision 6);
      - **forget** it. The word is "Forget" everywhere, never "Delete" or "Remove".
    - **To have an agent remember something,** the person tells it in conversation ("remember that…"), and it is saved
      the usual way. **For a standing instruction,** the person uses the instructions (their own, for one agent or for
      every agent).
    - **To correct a memory,** the person tells the agent; the newer memory replaces or joins the old one (decision 10).
      Or they forget it.
    - **No Pin.** A pinned memory went into every turn, which is the cost decision 10 avoids; a Rule is weighted instead.
    - **What comes out:** the add form, the edit fields and Save, and Pin, from the screens, the actions behind them,
      and the record's pinned flag.

13. **"Secrets and variables" is renamed "Vault",** in every place's menu, its screens and the user guide. The old name
    was long for a side menu. A vault can hold plain variables as well as secrets; what is hidden and what is readable
    stays as it is. The label appears in about 16 places across hq and the guide; identifiers in code and stored data
    are unchanged.

## Design

The decisions above say what is wanted and why. This part says how it is built. Paths are under `hq/src/` unless
another module is named.

### 1. The memory record

`MemoryItem` (`hq/schema.prisma`) after the change:

| Field | Today | After |
|---|---|---|
| `scope` (enum `PERSON`, `AGENT_PERSON`, `AGENT_PLACE`) | Which of three scopes | **Removed.** The scope is the three columns below |
| `userId` | Optional (none for a place's memory) | **Required:** the person, the memory's authority |
| `agentId` | Optional | Optional: set means "only this agent", empty means every agent |
| `placeType`, `placeId` | Optional | Optional: set means "only in this place", empty means everywhere |
| `scopeKey` | One string per scope, for the key's uniqueness | Kept, made from the three: `person:<userId>/agent:<agentId or *>/place:<type:id or *>` |
| `kind` (five values) | Fact, preference, decision, feedback, project | **`FACT` or `RULE`** |
| `pinned` | In every turn | **Removed** (decision 12) |
| `writtenByAgentId` | Optional | The agent that saved it: always set when saved, since only an agent saves a memory; emptied if that agent is deleted |
| `writtenByUserId` | Set when a person wrote it | **Removed:** a person never writes one |
| — | — | **New, `savedInPlaceType` and `savedInPlaceId`:** the place it was saved in, kept when it is promoted |

- **Why the saving agent and place are kept apart from the scope:** the two switches flip between the memory's own
  agent or place and "every" or "everywhere". Flipping back needs to know which agent and place it came from, and the
  dialog's *Kernel saved this in Shop* line reads them.
- **Deleting an agent or a place** removes the memories scoped to it (decision 1). A promoted memory it saved, or
  saved there, is no longer scoped to it and stays; its *saved by* line then reads "an agent since deleted" or "a
  place since deleted". With its agent gone it can no longer be kept for one agent; with its place gone, or none
  recorded, "its own place" means everywhere.
- **The key** stays unique within its `scopeKey`. Promoting a memory into a scope that already holds its key is a
  near-duplicate (section 2) when the two are alike, and otherwise takes the key with a number added.
- **Indexes:** `userId` with `archived` for recall and the screen; `agentId`; `placeType` with `placeId`.
- **The migration is destructive and carries nothing over** (clean slate before `0.1.0-rc.1`): the table is emptied
  and reshaped. It runs only with the owner's consent (the `database-migrations` skill).

### 2. Saving: `remember`, `forget` and the near-duplicate rule

- **`remember`** (`server/controlplane/toolSchemas.ts`, `conversations/memory/leadMemoryTools.ts`,
  `server/controlplane/memoryOps.ts`) takes a title, a body, a **kind (`fact` or `rule`)**, optional tags, and an
  optional key to replace.
  - **`requested`, a yes/no:** the person asked for this memory, by "remember…" or by correcting the agent. The
    agent sets it, as it marks a correction today. Only a requested memory gets a line in the conversation.
  - **The scope is not an argument.** hq sets it from the turn or run: its person, its agent, its place. A call with
    no person (a pulse's or a schedule's run, a task's thread) is refused with the reason, as a place-only call is
    today.
  - **The old `scope` argument is deprecated and ignored.** **The old kinds are deprecated:** `preference`,
    `decision` and `feedback` are read as `rule`, `project` as `fact` (`docs/architecture/versioning.md`).
- **The near-duplicate rule** (`memory/items.ts`, `duplicateAction`) turns on the kind: a `RULE` replaces the old
  memory; a `FACT` is joined onto it when the two fit, and otherwise replaces it. A memory that says nothing new
  changes nothing. The tidy (`memory/tidy.ts`) uses the same rule.
- **A near-duplicate in a wider scope** (one the person promoted) is never written into, so nothing an agent saves
  widens on its own:
  - a Rule the person asked for (`requested`, a correction included) replaces it in the wider scope the person chose,
    and its line is written;
  - anything else is saved in the agent's own scope, and the promoted memory stays as it is.
- **`forget`** takes a key. It forgets a memory the turn could recall (section 3), so an agent forgets only what it
  would itself use. Its `scope` argument is deprecated and ignored.
- **The person forgets** on the memory screen or in the dialog (section 5): `forgetMemoryItem`, their own memories
  only. Forget deletes; nothing is kept.

### 3. Recall

- **The scope check comes before the meaning search.** A memory may be recalled when its `userId` is the turn's
  person, its `agentId` is empty or the turn's agent, and its place is empty or the turn's place
  (`conversations/memory/turnPrincipal.ts`, `memory/scopes.ts`). Nothing else is searched.
- **The search before the turn is unchanged** (`conversations/memory/composedQuery.ts`, `probe.ts`): the new message,
  the topic and the last two exchanges, embedded by the local model, with no model call.
- **The tiers, with the Rule weight** (`conversations/memory/tiers.ts`):
  1. Meaning decides what was found, against the two bars, as today.
  2. **A Rule between the bars moves up to "included in full".**
  3. **Within a tier, Rules come first,** then Facts; each group by meaning × warmth, as today.
  4. The caps hold: three included in full, three named in the hint. A Rule or Fact past the first cap moves down to
     the hint.
- **The bar tuner** (`memory/barTuner.ts`) learns from similarity. A Rule included only because of its weight is
  recorded as `INCLUDED` with a mark saying so, and the tuner leaves it out of its samples, so the weight does not
  pull the bars down.
- **`recall`** takes an optional `kind` and optional `tags`, beside its key and query. Its `scope` argument is
  deprecated and ignored.
- **A run's memory replaces its pinned memory** (`memory/runPinnedMemory.ts`, `core/src/protocol/runContext.ts`).
  At the run's start hq runs the same search, with the run's brief as the query (the task's title and description, or
  the message that started it), under the run's person, agent and place. What it finds goes in a new run-context
  field, `memory`: the items included in full, then the hint's titles and keys. The site writes it as the read-only
  file it writes today. `pinnedMemory` is deprecated. A run for no person gets no memory.
- **A call** (voice) uses the same search before each turn, as a typed turn does.
- **The lead's instructions** (`conversations/lead/instructions.ts`, `leadMemoryRules`) change in three places:
  - choosing the kind: a standing instruction ("always", "whenever", "I prefer", "don't") is a Rule, anything else a
    Fact;
  - a Rule's body says when it applies as well as what to do;
  - what is true of a place goes to the place's Knowledge, never to memory.

### 4. Screens

Every screen here is drawn with hq's own components and the shared `@agenthix/ui` primitives; nothing new goes into
`ui/` (it holds only what hq and Cloud share). Colours come from the tokens. The settled boards are the baseline.

- **The memory dialog** (new, `memory/screen/pages/MemoryDialog.tsx`, built on `Modal` and `SegmentedControl`): the
  one way a memory is shown. Top to bottom:
  - *Which agents remember it*: the agent's name / Every agent; *Where*: the place's name / Everywhere. A press takes
    effect at once (`setMemoryScope`).
  - The title, the body, the kind and the tags, read only.
  - *Kernel saved this in Shop, 6 Nov, 14:02 · recalled 9 times · the conversation*.
  - **Forget**, and *All your memory ›* when opened from outside the memory screen.
  - On a phone it fills the screen.
- **Settings › Memory** (`/settings/memory`, `MemoryPage.tsx`): one list of the person's memories, newest first.
  - **A row:** the title; under it the badges *kind*, *agents*, *place*, then the tags and the date. The kind badge is
    drawn apart from the two scope badges. No pictures, no colour for any scope.
  - **Filters:** kind, agent (Every agent and each agent), place (Everywhere and each place), tag, and search. Each
    menu matches its badge exactly. Search matches the words of the title, body and tags.
  - *Show archived* lists what the tidy archived; each can be forgotten.
  - Pressing a row opens the dialog. `?item=<id>` opens it at once.
- **An agent's page › Memory** (`AgentMemoryTool.tsx`): that agent's own memories, then, folded, *Also known to every
  agent*, then *All your memory ›*. The same rows and dialog.
- **The "Remembered" line in a conversation** (`conversations/tools/actionLines.ts`): one line styled as a system
  message, **✓ Kernel remembered this**, and one button, **Show**, which opens the dialog over everything, whether the
  chat is docked, expanded or the whole Chat page. The line's target names the memory's id; the old scope
  parameters are deprecated. **Only a requested memory gets a line** (section 2), one line for each.
- **The admin's memory settings** (`/admin/settings/memory`) are unchanged.

### 5. Places

- **Your space is drawn as a project place** (`projects/place/useProjectPlace.tsx`), from the personal project behind
  Chat. Its separate section list, `SPACE_SECTION_ORDER` (`chat/chatPlace.tsx`), goes. Your space and a personal
  project share one menu: a shared project's, less Sprints, Timeline, Workroom, Members and GitHub.
- **Your space gets Settings** (`projects/pages/settings/SettingsTabs.tsx`): General with the description only (no
  name, no key), Task types, Custom fields, Runs and finished tasks. No Delete.
- **Your space and a personal project get the project Overview** (`projects/place/ProjectOverview.tsx`, drawn by
  `ui/src/people/ProjectOverviewView.tsx`): the work, and the Agents card; no Lead, no People. Your space adds a
  Personal projects card. An agent's page keeps the generic Overview.
- **A shared project loses its Memory section** (`ProjectMemoryTool.tsx`, and `memory` in its section order).
- **"Secrets and variables" becomes "Vault"** wherever the label is shown, and in the user guide. The section's id,
  routes and stored values keep `secrets`.

### 6. What is removed

- The `AGENT_PLACE` scope, everywhere: the tools, the probe, the access rule (`memory/screen/access.ts`), the scope
  labels, the screens.
- Adding and editing a memory: `saveMemoryItem`, `MemoryEditor.tsx`, the add form.
- Pin: `setMemoryPinned`, the `pinned` column, `memoryService.pinned`, the probe's pinned tier.
- The memory screen's tabs and their scope names.
- A shared project's Memory section.

### 7. What others receive

Each change follows `docs/architecture/versioning.md`: something new is added, and what it replaces is marked
deprecated, never removed in the same major.
- **The memory tools,** as a run on a site calls them: `remember` (`kind` values, `requested` added), `recall`
  (`kind` and `tags` added) and `forget`, each with `scope` deprecated (sections 2 and 3).
- **The run context:** `memory` added, `pinnedMemory` deprecated.
- **A conversation's stored action line:** the memory's id added to its target; the scope parameters deprecated.
- **The client's operations:** `getMemory`'s filters, `setMemoryScope` added; `saveMemoryItem` and `setMemoryPinned`
  deprecated.

### 8. Decision records

- **[ADR-0188](../../adr/adr-0188-memory-is-a-persons-saved-by-an-agent-where-it-works.md)**, Accepted at the unit's
  start: memory is a person's, saved by an agent where it works, promoted or forgotten only by the person, a Fact or
  a Rule. It records decisions 1, 2, 4, 6, 10 and 12, and supersedes the three scopes and pinned items of
  [ADR-0122](../../adr/adr-0122-memory-is-recalled-by-meaning-in-three-scopes.md), whose decision carries the mark.

### 9. How it is checked

- **Unit tests:** the scope match; the tiers with the Rule weight and the caps; the near-duplicate rule by kind;
  the scope key; promoting and flipping back; the deprecated arguments read as before.
- **Integration tests** (`memory/screen/__tests__`): a person sees and forgets only their own memories; the filters;
  `setMemoryScope`; the tools refuse a call for no person.
- **The site's container test** (`site/src/agents/runtime/__tests__/pinnedMemory.container.test.ts`): a run writes
  its `memory` file.
- **Model checks on the baseline model** (the `testing-a-change` skill), each with its arms, calls per cell and cost
  stated before it runs:
  1. **The Rule weight:** questions whose words don't name the rule ("which host should we pick?"), with and without
     the weight, counting how often the rule is followed.
  2. **The kind and `requested`:** how often the agent saves a standing instruction as a Rule and a fact as a Fact,
     and marks a memory requested exactly when the person asked for it.
  3. **Rules met mid-work:** how often a rule that only comes up after the turn starts is found and followed. Its
     number decides whether more is needed later.
- **Reviewers:** the designer reviewer on every build; the usability reviewer for what the screens say when
  something fails, such as a Forget or a switch that does not save (the `handling-errors` skill).
- **The owner's walk.**
- **The user guide:** `agents/instructions-and-memory.md`, `projects/projects.md` (Your space),
  `your-tools/your-settings.md`, and `workflows/secrets-and-variables.md` (Vault).

### 10. Settled after the design pass

1. **A personal project's memory place — settled (owner, 12 Nov):** a personal project is part of Your space, so
   its memory place is the person's own space, as today (`memory/principal.ts`, `placeOfProject`). The Where badge
   reads "Your space" for both.
2. **One line per memory saved — settled (owner, 12 Nov):** each with its own Show; lines are never merged.
3. **Search on the memory screen — settled (owner, 12 Nov):** by the words of the title, body and tags; recall
   already finds by meaning.
