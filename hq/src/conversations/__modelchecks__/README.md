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
platform guide's pages on providers, voice and the glossary, and one task (*WEB-3*) with one attachment, and two workspaces of the project, one of them a code workspace. The tools answer from a script (`script.ts`) in the
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
| `code-not-in-drafts` | the same | "Fix the broken sign-up button in the website app, and get on with it now." | the same, and never the workspace without Git |
| `preview-task-branch` | a project, after the agent said WEB-3 is done on its branch in *site-app* | "Great, can I try the sign-up form running?" | `offer_live_preview` with *site-app*'s `workspaceId` and task `WEB-3`; no work started |
| `preview-main` | a project | "Show me site-app running, I want to click around." | `offer_live_preview` with *site-app*'s `workspaceId` and no task |
| `preview-not-asked` | a project | "What's our release process?" | no `offer_live_preview` |
| `thread-start-app` | the thread of task *WEB-3*, which is done, after the agent said so | "Start the app so I can click through the sign-up form." | `run_task` on WEB-3 with a brief that carries the ask; never saying the app can't be started |
| `thread-change-app` | the same | "Make the banner say 40% off, and reload it so I can see." | `run_task` on WEB-3 with a brief naming the banner; the same |
| `workspace-start-app` | a conversation with its own branch in *site-app*, after the agent said the login page is committed | "Start the app so I can try the login page." | work started (`start_work`, a task, or a live preview offered); never saying the app can't be started |
| `code-merge-asked` | a conversation with its own branch in *site-app*, after the agent said the login page is committed on its branch | "Looks good. Please merge your branch into main." | `start_work` with a brief that says to merge, on the first ask; never telling the person to merge it themselves |

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

A run of a lead's check takes up to 5 model calls; a task run's, up to 20. A check passes for a model only when every run of it passes.

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

From `hq/`, with the core package built and Wasp compiled once (`npx wasp compile`). The variables are read from
`.env.testing` at the repository's root (its `.env.testing.example` describes each), so with that file filled in:

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
| `MODEL_CHECK_API_KEY` | The key for that vendor. It is never logged or written |
| `MODEL_CHECK_BASE_URL` | The endpoint, for `openai_compatible` only |
| `MODEL_CHECK_RUNS` | How many times each check runs on each model; 3 if not set |
| `MODEL_CHECK_ONLY` | The checks to run, by id, comma-separated; every check if not set |

Without the first three, every check is skipped with one line saying what to set, and no model is called.

Each run prints one line per model, check and run (passed, or what it called instead), then a summary table. The same
goes into a file under `hq/.model-checks/`, which is not committed. The command fails when any check fails on any
model.

The harness itself is tested in the unit suite (`__tests__/modelChecks.test.ts`) with a fake model.
