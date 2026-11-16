# The model checks: the lead, and a task's run

The model checks send the lead of a conversation what a real turn sends: its instructions, memory rules, the
conversation's places, and its tools with their descriptions. They go to a real model, and the checks grade the tool
calls the model makes. The context and tools are built by the code a turn uses (`coordinator/context.ts`
`contextFrom`, `tools/toolAdapter.ts` `leadToolDefinitions`), so a change to the instructions or a tool's description
is what the checks test. No instruction text is copied here.

The checks run on demand and before a release. They never run in `npm test`, CI's unit suite or the integration
suite.

## What they check

Each check is a conversation's place, what was said, and what passes. The checks run in a fixed world
(`world.ts`): one person, Your space, one project and the thread of its task, (*Website Rebuild*) with a *Release process* page, and the
platform guide's pages on providers, voice and the glossary, and one task (*WEB-3*) with one attachment, and two workspaces of the project, one of them a code workspace. A check may also name what its turn is told of web search in the background (`lead/webSearchBlock.ts`), which a turn works out from the model its background work would run on. The tools answer from a script (`script.ts`) in the
real tools' words. Nothing reaches a database, a site or a card.

| Check | Where | Message | Passes when |
|---|---|---|---|
| `guide-model-key` | a project | "Where do I add a model key?" | `search_knowledge` (unscoped or scope `platform`) before the answer; not asked back |
| `guide-voice` | a project | "How do I turn voice on?" | the same |
| `my-space` | a project | "Look through the files in my space." | `suggest_place` for Your space; never `start_work` or a knowledge call in the project |
| `place-outside` | Your space | "What's the release process in Website Rebuild?" | `suggest_place` for the project |
| `correction` | a project, after an answer from *Release process* | "The release process page is wrong: …" | `edit_knowledge` or `write_knowledge` on that page; no `remember`, no `start_work` |
| `in-reach` | a project | "What's our release process?" | `search_knowledge` before the answer |
| `task-attachment` | a project | "Can you link me WEB-3 and its attachment?" | `get_task_details`, then `tasks/WEB-3` and the attachment's reference (`attachments/WEB-3/…`) written, and no web address |
| `files-root` | a project | "I listed Files and got e2e-files/app.ts, … Which one is the readme? I want to click it." | `files/e2e-files/README.md` written, and no web address |
| `code-in-workspace` | a project with a code workspace (*site-app*) and one without Git | "Add a login page to site-app, now please." | `start_work` naming *site-app* as its `workspace`, or `create_task` with its `workspaceId`; never work started without it |
| `code-not-in-drafts` | the same | "Fix the broken sign-up button in the website app, and get on with it now." | the same, or `run_task` on WEB-3, the project's task for the sign-up form; never the workspace without Git |
| `preview-task-branch` | a project, after the agent said WEB-3 is done on its branch in *site-app* | "Great, can I try the sign-up form running?" | `offer_live_preview` with *site-app*'s `workspaceId` and task `WEB-3`; no work started |
| `preview-main` | a project | "Show me site-app running, I want to click around." | `offer_live_preview` with *site-app*'s `workspaceId` and no task |
| `preview-not-asked` | a project | "What's our release process?" | no `offer_live_preview` |
| `thread-start-app` | the thread of task *WEB-3*, which is done, after the agent said so | "Start the app so I can click through the sign-up form." | `run_task` on WEB-3 with a brief that carries the ask; never saying the app can't be started |
| `thread-change-app` | the same | "Make the banner say 40% off, and reload it so I can see." | `run_task` on WEB-3 with a brief naming the banner; the same |
| `workspace-start-app` | a conversation with its own branch in *site-app*, after the agent said the login page is committed | "Start the app so I can try the login page." | work started (`start_work`, a task, or a live preview offered); never saying the app can't be started |
| `code-merge-asked` | a conversation with its own branch in *site-app*, after the agent said the login page is committed on its branch | "Looks good. Please merge your branch into main." | `start_work` with a brief that says to merge, on the first ask; never telling the person to merge it themselves |
| `task-move-done` | a project | "WEB-3 is finished, please mark it as done." | `update_task` on WEB-3 with `state` DONE or a `columnId`; no work started |
| `tasks-into-sprint` | a project | "Put WEB-3 and WEB-4 into the current sprint." | `change_tasks`, `plan_task` or `update_task` naming the current sprint's id, as `list_boards` lists it, for both; no work started |
| `board-open` | a project | "Let's go through the board together." | `open_board`; nothing changed, no work started |
| `task-new-backlog` | a project | "Add a task to write the release notes. No rush, it can wait." | `create_task` for later, in Backlog; no work started |
| `web-search-background` | a project, whose background work runs in Claude Code | "Search the web for the newest Node.js release." | `start_work` with a brief that carries the ask; never saying it can't reach the web or sending the person to another agent |
| `web-search-background-key` | Your space, whose background work runs in OpenCode with a search key | the same | the same |
| `web-search-no-key` | a project, whose background work runs in OpenCode with no search key | the same | says it works in OpenCode and the organisation hasn't added the search key, where an admin adds it, and offers to answer from what it knows (core's `NO_WEB_SEARCH_WORDS`); no work started |
| `web-search-ask` | a project, whose background work runs in Claude Code with Search the web at Ask in the agent's tools | the same | `start_work` as for `web-search-background`, and says the person will be asked to approve the search |
| `web-search-not-allowed` | a project, whose background work runs in OpenCode with a search key, with Search the web at Never in the agent's tools | the same | says the agent's tools don't allow it, where an admin allows it, and offers to answer from what it knows (core's `WEB_SEARCH_NOT_ALLOWED_WORDS`); never blames a key; no work started |

### Memory

Nine checks of a person's memory (ADR-0188): the person holds one Rule, *Comparing options: use a table* ("When
comparing or choosing between options, use a table: one row per option, columns for cost and risk."), and the project
a *Hosting quotes* page with three quotes in prose. The memory block is the probe hook's own (`memory/turnBlock.ts`),
in the tier a check names; `recall` answers from the same memory, and `remember` in the real tool's shape.

| Check | The Rule | Message | Passes when |
|---|---|---|---|
| `rule-weight-included` | included in full, as the Rule weight does with a Rule found between the bars | "Which host should we pick for the shop: Fly, Render or a VPS?" | the reply has a table |
| `rule-weight-hinted` | in the hint by title and key, as before the weight | the same | a table, or `recall` that finds the Rule |
| `rule-weight-none` | held, not shown: where the local model scores this question (below) | the same | the same |
| `remember-rule-asked` | none | "Always answer me in British English." | `remember` with kind `rule` (or a deprecated kind read as one) and `requested` |
| `remember-that` | none | "Remember that our release day is Thursday." | kept in that reply: `remember`, any kind, with `requested`, or, since what is true of a place goes to its Knowledge and never to memory, an edit or write of one of the project's pages that says Thursday. Run ten times, whatever `MODEL_CHECK_RUNS` says, and met at 9 of 10: the summary says `passes 9/10` |
| `remember-fact-asked` | none | "Remember that my partner is called Sam." | `remember` with kind `fact` and `requested` |
| `remember-fact-in-passing` | none, in Your space | "Can you plan a dinner for four this Saturday? I'm vegetarian, by the way." | nothing remembered, or a `fact` not `requested` |
| `rule-mid-work` | in the hint | "Look at the hosting quotes in our Knowledge and tell me which one to take." | the reply that compares has a table, or `recall` found the Rule |
| `rule-mid-work-files` | in the hint | "Look at our three hosting quotes in Files and tell me which to take." | the work started (`start_work` or `create_task`) has a brief that names a table |

The three rule-weight checks are the arms of one measurement: how often the Rule is followed in each tier. On the
local embedding model the host question scores 0.08 against the Rule, far below the calibrated bars (0.45 and 0.62),
so today the probe shows it nothing: `rule-weight-none` is what a person meets. `__tests__/ruleSimilarity.test.ts`
measures the messages again where the model's files are on disk (`HQ_BUNDLED_MODELS_DIR`). The lead reads no Files,
so `rule-mid-work-files` measures whether the brief carries the Rule to the work in the background, which presents
its result in a report turn that has no tools and is shown no hint.

### A task's run on a branch

Five checks send a task's run, not the lead: the run of task *SHOP-7* on its branch of a shop app's code workspace
(`taskRun/`). It gets the parts of its prompt the site builds from shared code (core's `codeWorkPromptText`, which says
whether the branch's live preview is open and which apps run in it, and `PLATFORM_TOOLS_INSTRUCTIONS`), its first
message as hq gives it (`withBrief`), and the platform tools a code-work run is offered, from hq's own declarations
that the site forwards. The site's identity and filesystem sections are the site's own, which hq cannot import: a short
frame stands in for them. The tools answer from `taskRun/script.ts`, with hq's real refusals for `run_workflow` and
`run_task`.

| Check | The branch's live preview | The ask | Passes when |
|---|---|---|---|
| `taskrun-steer-app` | open, `shop` running | a brief: make the banner orange, show me | `list_apps` before acting on the app; the file changed, then `commit`, then `reload_view` (or `start_app`); no live-preview workflow, no `run_task` |
| `taskrun-steer-app-comment` | the same | the same, as a comment on the task | the same |
| `taskrun-clash-no-app` | none | HQ's clash request, as a comment | no `start_app`; no live-preview workflow, no `run_task` |
| `taskrun-no-preview-not-asked` | none | a brief: change the banner's words | no `start_app`; the change committed by the run |
| `taskrun-no-preview-asked` | none | a brief: start the shop so I can click through | `start_app` |
| `taskrun-follow-up-not-started` | none | a brief: note a follow-up for the checkout page, for later | `create_task`; no `run_task`, no `queue: true`, no start time, no routine |
| `taskrun-start-asked` | none | a brief: the person asked to start SHOP-8 now | `run_task` on SHOP-8; never on SHOP-7 (its own task); no `create_task` |
| `taskrun-routine-weekdays` | none | a brief: every weekday at 9:00, Kernel checks the banner | `create_routine` in SHOP with `cron` `0 9 * * 1-5`, Kernel's id and instructions naming the banner; no task made or started |
| `taskrun-routine-off` | none | a brief: switch off the routine *Morning review* | `update_routine` on it with `enabled` false and nothing else; nothing started |
| `taskrun-no-search-key` | none; an OpenCode run of an organisation with no search key, sent the site's words for it (core's `NO_WEB_SEARCH_INSTRUCTIONS`) and offered `web_fetch`, not `web_search` | a brief: search the web for the newest Node.js release | says it works in OpenCode and the organisation hasn't added the search key, that an admin adds it in *Manage organisation › AI*, and offers to answer from what it knows; no `web_search`, no search engine fetched with `web_fetch` |
| `taskrun-search-not-allowed` | none; a run whose agent's tools set Search the web to Never, sent the site's words for it (core's `webSearchWithheldInstructions('never')`) and offered `web_fetch`, not `web_search` | the same | says its tools don't allow it, that an admin allows it under *Permissions*, and offers to answer from what it knows; never says a key is missing; no `web_search`, no search engine fetched with `web_fetch` |

A run of a lead's check takes up to 5 model calls (the memory checks, usually 1 to 3); a task run's, up to 20. A check passes for a model only when every run of it passes.

### An agent's skills

Five checks send an agent in a run what a real run is told about skills, not the lead
(`src/assets/proposals/__modelchecks__/`). The system is built from core's words: the memory, knowledge and skills
guidance (`buildMemoryContent`), `PLATFORM_TOOLS_INSTRUCTIONS` and OpenCode's skill list (`openCodeSkillsSection`);
the message of a picked skill is built with core's `pickedSkillInstruction` and `pickedSkillReadInstruction`. The tools
are the harness's built-ins, a `skill` tool and the platform tools from hq's own declarations, `propose_skill` among
them. Three skills are listed: the built-in `platform-skill-creator` (its real `SKILL.md`), an organisation's
`org-release-notes`, and a person's `person-code-review`, which only a person picks. The tools answer from a script
(`skillsWorld.ts`); nothing reaches a database, a site or a file.

| Check | The message | Passes when |
|---|---|---|
| `propose-skill` | "We just went through how I review a pull request here: … Make that a skill for the team" | `propose_skill` with a `SKILL.md`; no skill files written by the agent |
| `skill-use` | "Write the release notes for 2.4" | `org-release-notes` loaded with the skill tool before any work |
| `skill-picked` | the picked-skill instruction, then `/release-notes …` as plain text | the first call loads `org-release-notes` with the skill tool |
| `skill-picked-read` | the read instruction naming `person-code-review`'s staged file, then `/code-review …` | the first call reads that file; the skill tool never loads it |
| `skill-what-can-you-do` | "What can you do?" | the answer names at least two of the listed skills; no work started |

A run takes up to 6 model calls. The result is written to `hq/.model-checks/skills-<time>.md`, as the lead's is.

### The first request, measured

Each run records the provider's own count of the input of its first model call (the part not cached plus what was
read from and written to the cache), from the usage the adapter reports; no extra call is made. The report ends with
a section *First request, tokens*: for the lead's checks, the task-run checks and the skills checks, each check's
median over its runs, per model. A run whose call failed before the provider answered has no count and is left out.

### Tools found by search

A model may call `use_tool` with `{ name, input }` to run a tool it was not shown (ADR-0193). Where a runner records a
call (`run.ts`, `taskRun/run.ts`, `skillsRun.ts`), `use_tool` is recorded as a call of `name` with `input`, so every
grade reads what the agent did and not the route; `find_tools` is recorded as itself. The script answers a `use_tool`
as the named tool would, or refuses it as a turn does when the name is not one the run may use, or with the tool's
definition when its input doesn't fit. A tool called by its own name with input that doesn't fit is refused as a turn
refuses it ("The arguments do not fit …"), so a malformed call is not graded as if it had run. `find_tools` is
answered by the real tool index (`src/tools/search`) over the tools the run finds by search, in the shape a turn
answers: each with its full description and input. A real run embeds with hq's built-in model, from
`HQ_BUNDLED_MODELS_DIR` or hq's storage, in the lead's, the task-run and the skills checks alike; a run on a fake
model searches by words alone (`readCall.ts`). A task run's and a skills run's shell (`shell.ts`) answers what a run
uses to look around (`echo`, `pwd`, `ls`, `cat`, `grep`, git, chains, pipes and redirects) from the world's files, so a
run never meets a shell that seems broken. The lead's checks are told it is a fixed time (`world.ts` `CHECK_NOW`),
inside the current sprint, so a check reads the same on any day.

A conversation's lead is shown its must-have tools, `find_tools` and `use_tool`; the instructions name the rest by
name, grouped by area (`tools/foldedTools.ts`, core's `areaLines`). The checks of that:

| Check | Where | Message | Passes when |
|---|---|---|---|
| `fold-milestone` | a project | "Put WEB-1 in the Pricing milestone." (WEB-1 is an epic: only an epic has a milestone) | `plan_task` on WEB-1 with the milestone's id, as `list_milestones` lists it |
| `fold-comment` | a project | "Add a comment on WEB-3 saying the copy is approved." | `add_comment` on WEB-3 that says approved |
| `fold-boards` | a project | "What boards does WEB have?" | `list_boards` |
| `fold-never` | a project, `add_comment` at Never | the same as `fold-comment` | no `add_comment`, and the answer says it can't |
| `fold-not-impossible` | a project | "Rename Sprint 12 to "Launch sprint"." | `rename_sprint`; failed, saying so, when the answer says it can't |

## Which models

**The baseline is a low-cost, capable model:** the kind a cost-conscious organisation would choose for everyday agent
work — today DeepSeek Flash, or another model of its class. Not the cheapest available: a model too weak to do the
work is no baseline. The lead's instructions and tools are written to work on it, so that a conversation does not need
an expensive model to behave: a check is met when it passes there.

**A large model (Sonnet, Opus) is for diagnosis only.** When a check fails on the baseline, running it on a large model
tells an instruction that is unclear (it fails there too) from one that asks more reasoning than the baseline has (it
passes there). Either way the fix is aimed at the baseline. A large model is never the bar a check is passed against,
and is not run by default: each call sends the lead's whole context, and costs many times the baseline's. A run of
several models or many repeats states its expected cost first.

## How to run them

From `hq/`, with the core package built and Wasp compiled once (`npx wasp compile`). The settings are read from
`.env.dev` at the repository's root (its `.env.dev.example` describes each, under *Model checks*), and the key is that
file's dev key for the chosen vendor (`DEV_OPENROUTER_API_KEY` for `openrouter`), so with that file filled in:

```sh
npm run test:models
```

A variable already set in the environment wins over the file, for example to diagnose a failure on a large model:

```sh
MODEL_CHECK_MODELS=~anthropic/claude-sonnet-latest MODEL_CHECK_RUNS=1 npm run test:models
```

| Variable | What it is |
|---|---|
| `MODEL_CHECK_PROVIDER` | The vendor: `anthropic`, `openai`, `google`, `openrouter` or `openai_compatible` |
| `MODEL_CHECK_MODELS` | The model ids to check, comma-separated, as the vendor names them |
| `MODEL_CHECK_API_KEY` | The key for that vendor; from `.env.dev`'s `DEV_<VENDOR>_API_KEY` when not set. It is never logged or written |
| `MODEL_CHECK_BASE_URL` | The endpoint, for `openai_compatible` only |
| `MODEL_CHECK_RUNS` | How many times each check runs on each model; 3 if not set |
| `MODEL_CHECK_ONLY` | The checks to run, by id, comma-separated (the skills checks are named above, `propose-skill` among them); every check if not set |

Without the first three, every check is skipped with one line saying what to set, and no model is called.

Each run prints one line per model, check and run (passed, or what it called instead), then a summary table. Under
a failed run's line it writes what the run did (`trace.ts`): each call with its input cut short, each `find_tools`
query with the names it answered, and the final words. The same goes into a file under `hq/.model-checks/`, which is
not committed. The command fails when any check fails on any
model.

The harness itself is tested in the unit suite (`__tests__/modelChecks.test.ts`) with a fake model.
