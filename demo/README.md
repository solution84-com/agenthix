# The demo's data

This folder is the data of the public demo of hq (`docs/adr/adr-0186-a-demo-is-a-setting-of-the-install.md`): the
sample organisation both apps seed at start, what each sample agent's conversation lead says and which tools it calls,
what each of its runs streams and writes, and the recorded voice clips. It is built into the hq and site images at `/demo` (`DEMO_DATA_DIR` in `@agenthix/core`), and
read only by an install with `DEMO_MODE=true`. Every other install ignores it.

It is the demo's data, not test data: what a visitor sees and hears comes from here. The names of people, projects
and tasks match the sample organisation, Fernhill & Co, that the demo seeds.

## Layout

| Path | What it holds |
|------|---------------|
| `agents/<handle>.json` | The lead script of the agent with that handle: intents, the fallback, its own closing lines (`spoken`), suggested prompts, voice lines and the first voice line |
| `runs/<handle>/<id>.json` | One run script of that agent: what it is for, its timed events, the files it writes, and how it ends |
| `voice/` | The recorded clips the scripts name, such as `writer-draft-home-page.mp3`, `writer-first-line.mp3`, `writer-fallback.mp3` and `writer-done.mp3`, one per spoken line. `scripts/demo/record-voice.mjs` records them again and sets `voiceClip` on each line |
| `seed/organisation.json` | hq's part of the sample: people, teams, agents, projects, task types, milestones, tasks, comments, attachments and routines |
| `seed/activity.json` | Past activity: the model, sessions, conversations and notifications |
| `seed/library.json` | The library and settings: skills, workflows, secret and variable names, providers (with a fake key), defaults, billing profiles and usage |
| `seed/site.json` | The site's part: workspaces, Knowledge pages and files, and the attachment files |

The seed's times are minutes from the moment hq starts, so the sample is dated around today, and every row both apps
share has a fixed identifier written in the seed. The script format, with every field, is `core/src/demo/scripts.ts`;
the seed's is `core/src/demo/seed.ts`. hq and the site load the whole folder at start and refuse
to start on any problem; `core/src/demo/__tests__/load.test.ts` loads this folder the same way, so a broken script
fails the tests.

## The rules a script follows

- **A lead script** answers a visitor's message with the intent whose phrasings share the most words with it, and
  with its fallback when none comes close. The fallback says this is a demo and names what to try. A lead tool call
  is carried out by hq's real tool of that name, with that input, so it names projects and tasks by their keys
  (`WEB`, `WEB-2`). A visitor is a viewer of the sample's projects and works in their own space, so a call that makes
  work names that space as `"projectId": "personal"` and the agent speaking as `"assignedAgentId": "self"`; hq puts
  in their ids, putting the agent on the space's roster first. Every call that starts work is a `create_task` there.
- **The lead's own lines** (`spoken`) close a turn after its tools: `workCameBack`, `done`, `refused` (the refusal's
  own words follow it in the thread, unspoken) and `waiting`, each with its clip in the demo voice.
- **A run** takes the script for its task (`{ "task": "WEB-2" }`) first, then for its task's type
  (`{ "taskType": "Launch step" }`), then the agent's default (`{ "default": true }`). An agent with run scripts has
  exactly one default.
- **A run's events** are the site's own run events — `text_delta`, `thinking`, `tool_call`, `tool_result` and
  `notice` — each with `afterMs`, the wait before it. A run ends `completed`, `failed` with an error, or stopped by a
  `limit` (`time` or `turns`). The files it writes are relative paths in the run's workspace. A run takes 6 to 10
  seconds in all, its steps arriving one by one: it is a demo, and nobody should wait. Each tool call is written to
  the run's tool-call log; a completed task run states its result and moves its task to a column with *review* in
  its name, as an agent hands work over; a `limit` end stops the run at that limit, as a real run is stopped.
- **A visitor's own runs** take their agent's default script (their tasks' keys are not known in advance), so each
  agent's default is the work it does for a visitor.
- **Voice clips** are named in lower case, such as `writer-draft-home-page.mp3`, and every clip a script names must be in
  `voice/`. A reply with no clip is shown as text.
