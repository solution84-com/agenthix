---
name: User-journey coverage map
description: For each kind of person who uses Agenthix, the journeys that matter to them, what "works" means, which scenarios cover each, and whether a test backs them. Written from users' expectations, not from the code.
updated: 2026-10-28
---

# User-journey coverage map

This is the traceability layer between what people need and what the QA contract promises. [`scenarios/`](scenarios/hq.md) says what the product promises; [`stories/hq.md`](stories/hq.md) says why, in business words; this file says **which journeys each kind of person cannot do without, what "works" means for them, and how much of it is covered.** It is refreshed at every QA audit, and by hand whenever a journey or a scenario changes.

Written 2026-09-26 from five reviews of the product done from the user's side (one per role below), then checked against the code. Where a review claimed something about the code that the code did not bear out, the claim was dropped.

## What "critical" means

A journey is **critical** when a person cannot do their job without it, or when getting it wrong can lose their work, their money, their privacy or their access, or when it is a security boundary — something that keeps one person, one role or one machine out of what belongs to another. A journey is **important** when the person can still do their job without it but only with real difficulty, or it is what they do most days. Nice-to-have journeys are not mapped.

**Target:** every critical journey has at least one scenario. Important journeys are mapped as far as the product offers them; an important journey the product has no capability for yet is listed as *Not covered* with the reason, not invented.

## How a status is decided

- **Covered by a scenario and a test** — every scenario listed for the journey has at least one test that cites it (`@SC-NNN`, see the strategy).
- **Scenario only (no automated test)** — the journey has scenarios, but at least one has no citing test. The *Tests cite* column says how many do; many tests already exist that assert these promises without carrying the tag, and adding the tag is cheap.
- **Not covered** — no scenario, because the product makes no promise yet.

A citing test is not proof that it asserts the current wording; the audit that closes a unit re-reads them. Retired scenarios never count.

Re-derive the citations with the command in the strategy (`grep -rhoE '@SC-[0-9]+' core/src hq/src hq/scripts hq/e2e site/src host/src console/src console-web/src relay/src relay/viewer ui/src tests/cross-app | sort -u`).

## First-time installer

Someone who has cloned the repository on their own machine, has never seen Agenthix, becomes the organisation's first admin and wants an agent to answer them, then to bring one colleague in.

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **INS-1** Start hq and its own site and see them connected | Critical | The Execution Sites page shows the site Online within moments; when it does not, a sentence names the cause and the fix. | SC-356, SC-357, SC-358, SC-359, SC-360, SC-292, SC-293, SC-425, SC-436 | 2 of 9 | Scenario only (no automated test) |
| **INS-2** Create the first admin account without being locked out | Critical | Exactly one Admin is created and signed in and lands in setup; afterwards nobody can create an account except by invite, so a stranger cannot take the first place. | SC-001, SC-006, SC-112, SC-361, SC-362, SC-003, SC-708, SC-709 | 5 of 8 | Scenario only (no automated test) |
| **INS-3** Give the organisation a model provider and know it worked | Critical | The Providers page says the provider works and shows only the end of its key, the key is never shown back, a key the vendor refuses stores nothing and is explained in the vendor's words, and a failure to store it is explained before a one-time code is spent. | SC-1170, SC-1171, SC-1172, SC-1176, SC-1178, SC-1185, SC-363 | 6 of 7 | Scenario only (no automated test) |
| **INS-4** Chat with an agent and get an answer | Critical | A reply streams into the conversation; when it cannot, the conversation itself says which thing to change and who can change it. | SC-077, SC-337, SC-1192, SC-1195, SC-1199, SC-410, SC-411, SC-360 | 5 of 8 | Scenario only (no automated test) |
| **INS-5** Get through first-run setup | Important | You, how your agents reach AI, a model provider and voice, your organisation and a last look; setup cannot finish until models and voice work, and it writes the organisation's defaults. | SC-008, SC-147, SC-710, SC-711, SC-1182, SC-1183, SC-1184, SC-1185, SC-1186, SC-1187 | 10 of 10 | Covered by a scenario and a test |
| **INS-6** Create the first project and the first agent | Important | The project and the agent appear and the agent can be spoken to in the project. | SC-017, SC-044, SC-287, SC-394, SC-020 | 4 of 5 | Scenario only (no automated test) |
| **INS-7** Invite a first colleague | Important | A link that opens on the colleague's computer, once, with the role chosen; they appear in Users and the link cannot be reused. | SC-101, SC-378, SC-379, SC-007, SC-113, SC-114, SC-380, SC-604, SC-605, SC-718, SC-719 | 7 of 11 | Scenario only (no automated test) |
| **INS-8** Recover from a wrong setting, a site that is down, a forgotten password | Important | The message names the cause and the fix and nothing has to be reinstalled; a password can be changed or reset. | SC-357, SC-296, SC-344, SC-322, SC-340, SC-375, SC-376, SC-377, SC-358, SC-363, SC-715, SC-716, SC-721 | 7 of 13 | Scenario only (no automated test) |

**Scenarios above whose promise the product does not yet keep (checked against the code on 2026-09-26):** SC-003, SC-357, SC-358, SC-359, SC-361, SC-363, SC-364, SC-375, SC-376, SC-377, SC-379, SC-385. These are the audit's findings, queued as work; the scenarios stay because they are what people expect.

## Organisation admin

Runs the organisation day to day: brings people in and out, makes sure agents can run, stops runaway work, decides who is in which project, keeps the machines and agents in order.

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **ADM-1** Bring people in, set their roles, remove them | Critical | Only an admin can; a role change bites on the next action; a removed person cannot sign in or act and their work stops; removal that would orphan a project is refused with the project named. | SC-101, SC-378, SC-379, SC-380, SC-381, SC-382, SC-383, SC-384, SC-096, SC-205, SC-214, SC-215, SC-602, SC-603, SC-606, SC-607, SC-608, SC-609, SC-610 | 12 of 19 | Scenario only (no automated test) |
| **ADM-2** Make sure agents can answer (the organisation's providers and the item on the Organisation page) | Critical | At least a working model, listening and speech provider; every organisation admin is told once when a provider stops working, and only until it works; the person who cannot talk is told under Home's message box. | SC-1170, SC-1177, SC-1196, SC-666, SC-722, SC-1199 | 6 of 6 | Covered by a scenario and a test |
| **ADM-3** Stop runaway work | Critical | Stop-everything asks, stops every run on every machine, reports the count and any machine it could not reach; one switch turns automation off for the whole organisation so that nothing starts by itself afterwards; every run is limited in time, and a run nobody started also in turns; one agent, one run or one project's work can be stopped on its own. | SC-076, SC-415, SC-416, SC-417, SC-057, SC-056, SC-408, SC-451, SC-476, SC-503 | 5 of 10 | Scenario only (no automated test) |
| **ADM-4** Decide projects and who is in them | Critical | Open and private behave as promised everywhere; a project always has an admin; changes take effect at once; deleting says what is lost and stops the work. | SC-017, SC-394, SC-395, SC-396, SC-398, SC-399, SC-400, SC-401, SC-405, SC-019, SC-588, SC-589, SC-590, SC-591, SC-592, SC-593, SC-594, SC-595, SC-596, SC-597, SC-598, SC-599 | 16 of 22 | Scenario only (no automated test) |
| **ADM-5** See, connect and revoke machines | Important | The list is truthful; a machine joins only when its code is typed by an admin; a revoked machine is refused at once; the machine that comes with hq cannot be removed. | SC-282, SC-292, SC-293, SC-420, SC-421, SC-422, SC-424, SC-425, SC-286, SC-290, SC-628, SC-629, SC-630, SC-631, SC-632, SC-633, SC-634, SC-635, SC-636, SC-637, SC-638 | 16 of 21 | Scenario only (no automated test) |
| **ADM-6** Create and configure agents | Important | Only admins shape agents; each change takes effect at the agent's next run, and each run records what it ran with; the kernel agent is protected. | SC-044, SC-045, SC-052, SC-390, SC-138, SC-047 | 5 of 6 | Scenario only (no automated test) |
| **ADM-7** Oversee activity across the organisation | Important | Today and Needs attention are for admins, count what is true and name machines that did not answer. | SC-010, SC-418, SC-665, SC-666, SC-667, SC-668 | 6 of 6 | Covered by a scenario and a test |
| **ADM-8** Set a spending limit or an alert | Important | — | — | — | Not covered — Nothing in the product offers one; no promise has been made yet. |
| **ADM-9** Retire a machine: move its projects elsewhere, or delete or restore it | Important | — | — | — | Not covered — Moved to the fleet admin on 2026-10-16: moving, removing and restoring a site are done in the Fleet Console (**FLT-4**, **FLT-5**, **FLT-6**); an organisation admin no longer acts on a machine. |
| **ADM-10** Set how far automation may go, and how long runs may last | Critical | The organisation's maximum depth, queue limit, throttle, interval, batch size, schedules by agents, run limits and archiving are set in one place by an admin; no project can go beyond what the organisation allows, an organisation that tightens wins at once without rewriting a project's choice, and automation can be turned off everywhere in one step. | SC-451, SC-452, SC-457, SC-459, SC-476, SC-483 | 1 of 6 | Scenario only (no automated test) |
| **ADM-11** Find out what is wrong without a terminal | Important | An admin reads HQ's and each site's health, the recent errors with what to do, the logs and a support bundle that holds no secret; the public health check says only that it is up; a site problem stays one open notification until it is fixed. | SC-723, SC-724, SC-725, SC-726, SC-727, SC-728, SC-729, SC-730, SC-731, SC-732, SC-733, SC-628, SC-629, SC-633 | 13 of 14 | Scenario only (no automated test) |
| **ADM-12** Narrow what an agent may do, and never widen it | Critical | An agent's permissions are set for the organisation and narrowed per project and per person; the strictest wins, a run carries it, and a project's Viewer starts nothing. | SC-611, SC-612, SC-613, SC-614, SC-615, SC-616, SC-617, SC-618, SC-619, SC-620, SC-621, SC-622, SC-623, SC-624, SC-625, SC-626, SC-627 | 17 of 17 | Covered by a scenario and a test |
| **ADM-13** Gather people and agents into teams | Important | An admin makes a team and who is in it; adding it to a project writes its people and agents in with the team's role, the highest role wins, and a change to the team follows it. | SC-669, SC-670, SC-671, SC-672, SC-673, SC-674, SC-675, SC-676 | 8 of 8 | Covered by a scenario and a test |

**Scenarios above whose promise the product does not yet keep (checked against the code on 2026-09-26):** SC-379, SC-385, SC-386, SC-390, SC-392, SC-393, SC-397, SC-401, SC-402, SC-403, SC-405, SC-415, SC-416, SC-418, SC-424, SC-425. These are the audit's findings, queued as work; the scenarios stay because they are what people expect.

**Since 2026-10-16** an organisation admin only sees the machines (**SC-637**, **SC-638**, **SC-939**): connecting, revoking, re-keying and removing one are the fleet admin's, in the Fleet Console (**FLT-3**, **FLT-5**, **FLT-13**). ADM-5's scenarios from before then — SC-282, SC-286, SC-290, SC-292, SC-293, SC-420 to SC-425, SC-628 to SC-636 — are left for the next full audit to reconcile with that; SC-634 and SC-635 are retired.

## Operator

A member who does the hands-on work with agents: chats, runs tasks, works in the projects they belong to.

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **OPR-1** Get in from an invite and sign in again later | Critical | The link creates my account once with the role it names; a used, expired or revoked link says so; my session is never replaced without my knowing. | SC-007, SC-113, SC-114, SC-378, SC-385, SC-002, SC-005, SC-380 | 4 of 8 | Scenario only (no automated test) |
| **OPR-2** Chat with an agent, in my own space and in a project | Critical | I start a conversation where I am — in a project with its agents, in Chat with any — and find it there again; I get an answer or a visible reason; my message is kept; only I can read my chat; a viewer cannot send. | SC-077, SC-244, SC-245, SC-278, SC-410, SC-411, SC-412, SC-387, SC-495, SC-496, SC-499, SC-507 | 8 of 12 | Scenario only (no automated test) |
| **OPR-3** Run a task, watch it, and stop it | Critical | The task shows its column and whether a run is queued, throttled, running, needs me, failed or held, with the reason, and says why a queued task has not started; Stop really stops the run and the task says I stopped it; I can run again or dismiss a failed run; the board updates by itself. | SC-034, SC-021, SC-030, SC-406, SC-408, SC-409, SC-339, SC-340, SC-056, SC-075, SC-470, SC-471, SC-472, SC-484, SC-461, SC-513, SC-515, SC-523 | 10 of 18 | Scenario only (no automated test) |
| **OPR-4** Work only where I belong | Critical | A private project I am not on never appears to me; if I am removed I can no longer send into it. | SC-395, SC-396, SC-397, SC-400, SC-402, SC-414, SC-281, SC-278, SC-588, SC-590, SC-591, SC-592 | 8 of 12 | Scenario only (no automated test) |
| **OPR-5** Understand why something did not work | Important | Every failure — site down, held, no credential, refused — names its cause where I am looking and is never shown as an empty list. | SC-296, SC-322, SC-344, SC-418, SC-1195, SC-410, SC-406, SC-393 | 5 of 8 | Scenario only (no automated test) |
| **OPR-6** Use my own Claude subscription | Important | I sign in once and am told plainly which of my work uses it: my own place only, never a shared project. | SC-367, SC-1197, SC-1231 | 2 of 3 | Scenario only (no automated test) |
| **OPR-7** Work with files and a repository | Important | I can read what an agent produced, and connect a repository where I am allowed to. | SC-265, SC-266, SC-267, SC-247, SC-240, SC-241, SC-398, SC-042 | 4 of 8 | Scenario only (no automated test) |
| **OPR-8** See what an agent did and why | Important | The transcript, the tool calls and the approvals are readable for work I may see. | SC-059, SC-054, SC-055, SC-155, SC-278, SC-281 | 4 of 6 | Scenario only (no automated test) |
| **OPR-9** Never lose work by an accidental click | Critical | Deleting a session, workspace or project asks first and names what is lost. | SC-413, SC-039, SC-175, SC-074 | 3 of 4 | Scenario only (no automated test) |
| **OPR-10** Keep what agents remember about me private | Critical | My memory reaches only the runs and turns that act for me, is recalled by meaning and never delivered whole, and only I can read and curate it. *(Rewritten 2026-10-17: SC-426 and SC-427 are retired.)* | SC-986, SC-987, SC-988, SC-990, SC-991, SC-992 | 6 of 6 | Covered by a scenario and a test |
| **OPR-11** Put a file into a project or workspace, download one, see what an agent changed in a repository | Important | — | — | — | Not covered — The explorer reads only; a task takes an upload; no promise has been made yet. |
| **OPR-12** Turn on automation for a project or my own tasks and trust it to stay bounded | Critical | Automation is off until I turn it on and I can only make it stricter than the organisation allows; each agent works through its queue one task at a time; chains of agent-queued work stop at the maximum depth and agents cannot pile up more than the queue limit, each saying so to the agent; the optional throttle starts work in rounds; a queued task says why it waits, and the project's Automation tool says what runs, what is stuck and what starts next, and pauses it in one step. | SC-451, SC-452, SC-453, SC-455, SC-456, SC-457, SC-458, SC-459, SC-460, SC-485, SC-477, SC-481, SC-511, SC-512 | 4 of 14 | Scenario only (no automated test) |
| **OPR-13** Start a task at a time, or keep a routine going | Important | A start time starts the task once, on time, as if I pressed Run, and never early; a routine always has its next round ready, a round obeys its board, and I can edit, pause, skip, unlink or delete; a routine of someone who lost access pauses; agents set either only when I asked; the times mean my timezone. | SC-461, SC-462, SC-463, SC-464, SC-465, SC-466, SC-467, SC-468, SC-469, SC-482, SC-681, SC-682, SC-683, SC-684, SC-685, SC-686, SC-687, SC-688 | 8 of 18 | Scenario only (no automated test) |
| **OPR-14** Answer for work done on my behalf | Critical | Every task names the person it is done for, and every run the person who started it; a request an agent could not be allowed to make asks whoever the run is for and notifies them; a task that stops and needs me tells me once; if I lose access to a project my tasks there stop with a reason and only a project admin hands them on. | SC-473, SC-474, SC-475, SC-479, SC-520, SC-521, SC-528 | 4 of 7 | Scenario only (no automated test) |
| **OPR-15** Keep my own tasks in my own project | Important | I have a private space from the start, Your space, with its conversations listed in Chat, and I never choose where its files live; its runs are mine and nobody else sees them, finished tasks leave its board by themselves, routines can live there, and Your tasks shows everything done for me anywhere. | SC-477, SC-481, SC-483, SC-465, SC-507, SC-517, SC-1042 | 3 of 7 | Scenario only (no automated test) |
| **OPR-16** Connect my own tool to hq | Critical | A connection acts as me and no more — my role, my projects, only the permissions I gave it, reading only by default; its token is shown once; I can renew or revoke it at once; an expired, revoked or unknown token, and the old organisation key, are refused alike. | SC-478, SC-479, SC-480 | 0 of 3 | Scenario only (no automated test) |
| **OPR-17** Find my way around, and keep what I use in reach | Important | One navigation on every screen names the places I work; I pin what I come back to and the pins follow me; Home lets me start talking at once; a place's sections are the left panel, which drills into it, opens on its Overview and works on a phone; ‹ and the breadcrumb's lists go anywhere; the foot keeps my pins and my menu in one place. *(Changed 2026-10-18: Home's Jump back in, SC-510, is retired; the tools panel, the layouts and the small-screen place page, SC-501, SC-505 and SC-506, are retired for the left panel.)* | SC-011, SC-150, SC-151, SC-152, SC-491, SC-492, SC-493, SC-509, SC-654, SC-655, SC-656, SC-657, SC-658, SC-659, SC-660, SC-1021, SC-1022, SC-1023, SC-1024, SC-1043, SC-1044, SC-1045, SC-1046 | 23 of 23 | Covered by a scenario and a test |
| **OPR-18** See what needs me and what agents are doing, from any screen | Critical | A request that waits on me reaches me at once, once per task, and I can approve it in one step or read it first; the count says only what is new; a request someone else answered clears itself; my runs are listed by what they need, and I can stop or cancel them. | SC-014, SC-154, SC-524, SC-525, SC-526, SC-527, SC-528, SC-529, SC-530, SC-640, SC-641, SC-642, SC-643, SC-644, SC-645, SC-734 | 16 of 16 | Covered by a scenario and a test |
| **OPR-19** Work on a shared task with my colleagues | Important | Anyone on the project who may start runs can step into a task's session, steer, stop or approve it; every message names its sender and every stop names who stopped; a run is on behalf of whoever started it; the agent reads what we wrote since its last run. | SC-516, SC-518, SC-519, SC-520, SC-521, SC-522, SC-523 | 7 of 7 | Covered by a scenario and a test |
| **OPR-20** Look through my runs and read what one did | Important | The Runs screen lists my runs, filtered, in two lines each; one opens with its facts, its approval in plain words and every tool call; I see only runs I may reach. | SC-646, SC-647, SC-648, SC-649, SC-650, SC-651, SC-652, SC-653 | 8 of 8 | Covered by a scenario and a test |
| **OPR-21** Plan work on boards, in sprints, on a timeline | Important | Every task is on a board that lasts; a sprint is finished with a place for the unfinished tasks; a task has a plan apart from its start time; the timeline shows plans and runs and changes only plans. | SC-540, SC-541, SC-542, SC-543, SC-544, SC-545, SC-546, SC-547, SC-548, SC-549, SC-550, SC-551, SC-552, SC-553, SC-554, SC-555, SC-556, SC-557, SC-558, SC-559, SC-560, SC-561, SC-562, SC-563, SC-564, SC-565, SC-566, SC-567, SC-568, SC-569, SC-570 | 31 of 31 | Covered by a scenario and a test |
| **OPR-22** Read a conversation, and recover when a reply fails | Critical | A reply names its agent, what it did is one folded line, a failure sits where the reply would be with a reason and Try again, a message sent while busy waits and can be sent now, and an approval is answered in the conversation. | SC-689, SC-690, SC-691, SC-692, SC-693, SC-694, SC-695, SC-696, SC-697, SC-698, SC-699, SC-700 | 12 of 12 | Covered by a scenario and a test |
| **OPR-23** Join a project, and leave it | Critical | I preview an open project and join it as a Member once; a private one is invisible; leaving asks where my open tasks go. | SC-588, SC-589, SC-590, SC-591, SC-592, SC-593, SC-594, SC-595, SC-596, SC-597, SC-598, SC-599, SC-600, SC-601 | 14 of 14 | Covered by a scenario and a test |

**Scenarios above whose promise the product does not yet keep (checked against the code on 2026-09-26):** SC-385, SC-387, SC-393, SC-397, SC-400, SC-402, SC-406, SC-408, SC-410, SC-411, SC-412, SC-413, SC-418. These are the audit's findings, queued as work; the scenarios stay because they are what people expect.

### Journeys added at the close of *The conversational experience* (2026-10-17)

These are not yet counted in the summary below; the full audit before the first release counts them.

| Journey | Weight | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **OPR-24** Talk to an agent and get an answer at once | Critical | I start a conversation, the reply is written as I watch, my conversation is mine alone, and the agent acts with my permissions and is paid for by the right access. | SC-940, SC-941, SC-942, SC-943, SC-944, SC-945, SC-946, SC-947, SC-948, SC-949, SC-950, SC-951, SC-952, SC-953, SC-1019 | 15 of 15 | Covered by a scenario and a test |
| **OPR-25** Let an agent work in the background while I keep talking | Critical | The agent starts work only where we are both allowed, says what it started, the result comes back once and nothing is lost or done twice when HQ restarts; I can stop it and say okay to what it asks. | SC-957 to SC-973 | 17 of 17 | Covered by a scenario and a test |
| **OPR-26** Put a task to work now, later or at a time | Important | The task lands on the board as I meant, and the run's result is on the task. | SC-969, SC-970, SC-1013 | 3 of 3 | Covered by a scenario and a test |
| **OPR-27** Talk about a task with my team | Important | The project reads and speaks in the task's conversation, which follows the task's agent and goes with the task. | SC-976, SC-977, SC-978 | 3 of 3 | Covered by a scenario and a test |
| **OPR-28** Keep a long conversation going | Important | The older part is folded into summaries I can open, and decisions and open work survive. *(Changed 2026-10-18: SC-985 is retired.)* | SC-979 to SC-984 | 6 of 6 | Covered by a scenario and a test |
| **OPR-29** Have agents use the team's knowledge | Important | The agent finds the place's knowledge files through its site and says when the site cannot be reached. | SC-993, SC-1015, SC-1017 | 3 of 3 | Covered by a scenario and a test |
| **OPR-30** Talk by voice, and dictate | Important | Voice runs inside the conversation, hands-free, with interruption, shown parts, approval by read-back and a bar across pages; dictation fills the box. | SC-994 to SC-1001, SC-1003 | 9 of 9 | Covered by a scenario and a test |
| **OPR-31** Trust voice on a laptop's speakers | Critical | The agent's own voice is not heard as mine, my words are not dropped and not late. | SC-1002 | 1 of 1 | The promise is not yet met, and this blocks the first release. The tests replay recorded speech and do not stand for it. |
| **OPR-32** Read, archive, delete and find | Important | The thread reads as prose with the work kept quiet; idle conversations archive, deleting names what goes, and a run is found from its conversation. | SC-973, SC-974, SC-975, SC-1004 to SC-1010, SC-1012 | 14 of 14 | Covered by a scenario and a test |

### Journeys added at the close of *the desktop shell* (2026-10-18)

These are not yet counted in the summary below; the full audit before the first release counts them.

| Journey | Weight | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **OPR-33** Keep one conversation beside my work, at any width | Important | The conversation I opened stays beside whatever page I go to, in the address, through reloads, streaming replies and window resizes; I start a new one from anywhere in the place I am on and can cancel back to the one I had; a wide window docks it, a medium one slides it over, a phone shows it full screen with a pill. | SC-1020 to SC-1041 | 22 of 22 | Covered by a scenario and a test |

### Journeys added at the close of *models from one place* (2026-10-23)

These are not yet counted in the summary below; the full audit before the first release counts them.

| Journey | Weight | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **ADM-14** Add, check and remove the organisation's providers | Critical | An organisation admin adds a provider whose key the vendor accepts, replaces a key, sees what falls to what before a removal and cannot leave a type empty; the key is never shown back; every change is recorded and told to every organisation admin; a member cannot; Agenthix Cloud is connected from HQ and says when it is not available yet. | SC-1170, SC-1171, SC-1172, SC-1173, SC-1174, SC-1175, SC-1176, SC-1177, SC-1178, SC-1179, SC-1181, SC-1221 | 12 of 12 | Covered by a scenario and a test |
| **ADM-15** Choose the organisation's models and voice, and which models may run | Important | Four defaults and the lists, an agent's own models, a voice chosen by ear; no other speech model can be saved; a model through a provider that stops working falls to another and comes back by itself. | SC-1192, SC-1193, SC-1194, SC-1195, SC-1196, SC-1198, SC-1200, SC-1201, SC-1202, SC-1203, SC-1204 | 11 of 11 | Covered by a scenario and a test |
| **ADM-16** Know what AI costs and whose it is | Critical | Every call is costed once to a billing profile and written to a ledger that is only added to; the Usage report keeps estimated, actual, included and unpriced apart and exports; the default profile cannot be archived; a month is cut in the organisation's time zone. | SC-1211, SC-1212, SC-1213, SC-1214, SC-1215, SC-1216, SC-1217, SC-1218, SC-1219, SC-1220, SC-1222, SC-1228, SC-1229 | 13 of 13 | Covered by a scenario and a test |
| **ADM-17** Manage the organisation in the admin area | Important | Only organisation admins reach it, with its own menu; the old addresses lead where things went. | SC-1188, SC-1189, SC-1190, SC-1191 | 3 of 4 | Scenario only (no automated test) |
| **OPR-34** Make personal projects of my own | Important | I make as many as I like with a name only; only I see them, an organisation admin included; I can delete them and never my space; my work in them runs as me. | SC-1207, SC-1208, SC-1209, SC-1210 | 4 of 4 | Covered by a scenario and a test |
| **MCH-14** Add the organisation's providers from the machine | Important | One command adds, lists or removes a provider, the key is asked for unseen and never put on a command line. | SC-1180, SC-1233, SC-1234 | 3 of 3 | Covered by a scenario and a test |

### Journeys added at the close of *seeing the agents' work* (2026-10-27)

These are not yet counted in the summary below; the full audit before the first release counts them. Every scenario below has a citing test. Most citations are on a whole group of tests (a `describe`), not on each test, so the audit re-reads them; the end-to-end specs (`hq/e2e/filesFrame.spec.ts`, `hq/e2e/fileLinks.spec.ts`) and the cross-app suites that carry some of the tags have not been run for this unit by the contract's authors.

| Journey | Weight | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **OPR-35** Open what an agent made, where I am | Critical | A file opens read-only, in place, from Files, a workspace, an artefact, a knowledge page, a task, a link or a chip; each kind is drawn properly, a file too large shows its start, and every way it cannot open is said in words with the machine named; someone outside the place gets "not found". | SC-1447 to SC-1451, SC-1490, SC-1491, SC-1509 to SC-1517, SC-1532 to SC-1534, SC-1575 to SC-1577, SC-1578 to SC-1590 | 35 of 35 | Covered by a scenario and a test |
| **OPR-36** Download any file, and attach one | Important | Download is there for every file of any kind and size; a task attachment of up to 10 MB uploads and a larger file is refused with the limit said first. | SC-1494, SC-1518, SC-1531 | 3 of 3 | Covered by a scenario and a test |
| **OPR-37** See pictures and files where they are written | Important | Images in files, knowledge pages, task text and replies are drawn where written; another website's image waits for Load; only an image with its four attributes is drawn inside text. | SC-1550 to SC-1558, SC-1580, SC-1581 | 11 of 11 | Covered by a scenario and a test |
| **OPR-38** Reach a file from where it is named | Important | One link per file; chips for files, folders, tasks and attachments; Mention and `@` put them in a message; agents are told how to name them. | SC-1535 to SC-1548 | 14 of 14 | Covered by a scenario and a test |
| **OPR-39** See a task's files beside the task | Important | Attachments and the task's working files open beside it, with a link that names the task and the file. | SC-1516, SC-1517, SC-1557, SC-1559 to SC-1561 | 6 of 6 | Covered by a scenario and a test |
| **OPR-40** See where a workspace stands in git | Important | One line: branch, clean or how many changed, last commit; reading runs nothing the repository sets up and never blocks an agent. | SC-1465, SC-1505 to SC-1508, SC-1549 | 6 of 6 | Covered by a scenario and a test |
| **ADM-18** Be sure a file opens only for who may see it, and costs hq nothing | Critical | A ticket hq signed for one file and one person is the only way in; nothing from a file can act as the person opening it; no file byte passes through hq's server; every opening is recorded; the limits hold. | SC-1562 to SC-1577 | 16 of 16 | Covered by a scenario and a test |

**Promises with no automated test that cites them:** the image start test and the install test for hq's relay (`scripts/images/start-test-all.sh`, `scripts/install-test/run.sh`) prove that hq's relay starts with hq and answers `files.localhost` with nothing configured (AC-397a); they are scripts and carry no `@SC` tag. Nothing else written for this unit is without a citing test. Designed but not built, so with no scenario: further relays on machines of their own, placement and pinning, the Fleet Console's relay screens beyond HQ's card, changed-file markers, diffs and the log, a person adding an image to a conversation, and a person's own IDE reaching a workspace.

### Journeys added at the close of *skills and the asset layer* (2026-10-28)

These are not yet counted in the summary below; the full audit before the first release counts them. Every scenario below has a citing test. Most citations are on a whole group of tests (a `describe`) or on each test of an end-to-end spec, so the audit re-reads them. Some promises are asserted at more than one level: SC-1607 by the site's unit tests, the cross-app suite and the runtime container tests (which need Docker and are run by hand), and SC-1661 and SC-1604 by unit, integration and cross-app tests. SC-1614 is also asserted by a release script's test that a trust root older than the limit cannot ship.

| Journey | Weight | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **ADM-19** Install an asset knowing who signed it and that it was not changed | Critical | Add skill offers the shelf, an upload and a link; the person is told who signed it or that it is not signed; a changed package is refused with no way round; the publisher is the signer, never the package's claim; a link is fetched only from a public https address. | SC-1609 to SC-1618, SC-1623 | 11 of 11 | Covered by a scenario and a test |
| **ADM-20** Nothing reaches an agent that no person approved | Critical | A skill found in files runs only while switched on at the fingerprint hq names and goes off when it changes; an agent proposes and a person publishes, an agent's publish, roll back or install is a card for the person it acts for; staging copies only what hq named; a picked skill is checked by the site. | SC-1604, SC-1605, SC-1607, SC-1642, SC-1643, SC-1645, SC-1651, SC-1661, SC-1663 to SC-1665 | 11 of 11 | Covered by a scenario and a test |
| **ADM-21** Update, roll back and remove what is installed | Important | Versions in order; an update only from the same signer; roll back or any version with a reason; a withdrawn version warns first; skipping an update; Remove names the agents or what was made from a template. | SC-1619 to SC-1622, SC-1628, SC-1629, SC-1637 | 7 of 7 | Covered by a scenario and a test |
| **ADM-22** Choose which agents have which skills, and what it costs | Important | The agent's page lists everything it will see in the clash order; an administrator adds and removes; the listing's cost is estimated and warned about; built-in skills are on and can be switched off. | SC-1633, SC-1634, SC-1650, SC-1652 to SC-1655 | 7 of 7 | Covered by a scenario and a test |
| **ADM-23** Decide whom the Library trusts and who looks after it | Important | Trusted publishers bound exactly; unsigned assets and installing from outside set by the organisation; Library maintainers named after the reach is shown; the settings page is for administrators. | SC-1614 to SC-1617 | 4 of 4 | Covered by a scenario and a test |
| **ADM-24** Use the ready-made templates | Important | Agent, board and team templates install, update and are removed through the asset layer, each carrying its skills; an agent is created from one and a team used through its review; an agent can be exported; Kernel's skills ship with HQ. | SC-1635 to SC-1640 | 6 of 6 | Covered by a scenario and a test |
| **OPR-41** Write and publish a skill | Important | A draft no agent sees that saves itself; an editor with change markers and a diff; Publish with a note makes the next version; editing another publisher's skill makes the organisation's own copy with its credit; the same in a place's files. | SC-1624 to SC-1627, SC-1629, SC-1644, SC-1647 | 7 of 7 | Covered by a scenario and a test |
| **OPR-42** Pick a skill and see it used | Important | `/` at the start of the message box picks from the agent's skills; typed `/` text is plain text; the work says which skill was used and opens it at the version used for whoever may see it; the skill says when it was last used. | SC-1607, SC-1656 to SC-1660 | 6 of 6 | Covered by a scenario and a test |
| **OPR-43** Keep my own skills with me | Important | Skills published in Your space follow the person into their own conversations, projects included, and into no one else's run. | SC-1648, SC-1649 | 2 of 2 | Covered by a scenario and a test |
| **OPR-44** Review what an agent proposes | Important | A proposal or a draft by who asked; reviewers at each level are counted and see it; accept, edit then accept, or reject with a note; the card in the conversation shows the outcome. | SC-1661 to SC-1663, SC-1666 | 4 of 4 | Covered by a scenario and a test |
| **OPR-45** Decide which skills found in a place's files run | Important | The place's Skills page lists them grouped, with defaults, switches by fingerprint, versions by publishing, changes made in files, and who may do what. | SC-1641 to SC-1647 | 7 of 7 | Covered by a scenario and a test |

## Viewer

A stakeholder who reads what agents did and never starts work.

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **VWR-1** Get in as a viewer | Critical | My account has the viewer role and no more; I am told what that allows. | SC-007, SC-114, SC-384, SC-386, SC-313 | 2 of 5 | Scenario only (no automated test) |
| **VWR-2** Never see, or learn of, a private project I am not on | Critical | Not its name, key, counts, runs or transcripts, on any page or number. | SC-395, SC-396, SC-397, SC-402, SC-281, SC-278 | 3 of 6 | Scenario only (no automated test) |
| **VWR-3** Never start work or spend, however I try | Critical | Every route that would start, queue or fund work, or stop or delete another person's, is refused naming the role. | SC-387, SC-388, SC-389, SC-390, SC-464, SC-625 | 2 of 6 | Scenario only (no automated test) |
| **VWR-4** Read a task properly | Critical | Its state and reason, comments, attachments with a visible download, and what the agent concluded. | SC-406, SC-407, SC-041, SC-042, SC-409 | 2 of 5 | Scenario only (no automated test) |
| **VWR-5** Find the projects and tasks I may see | Important | Lists, keys and empty states are honest about what I may open. | SC-022, SC-043, SC-159, SC-177, SC-404, SC-150 | 5 of 6 | Scenario only (no automated test) |
| **VWR-6** Read what an agent did | Important | Transcripts of work in projects I may see; other people's chats are unreadable. | SC-281, SC-278, SC-155 | 2 of 3 | Scenario only (no automated test) |
| **VWR-7** Get a clear no | Important | Every disabled control and every refusal says, on screen, what role or membership is needed. | SC-387, SC-393, SC-386 | 0 of 3 | Scenario only (no automated test) |
| **VWR-8** Be told when a task I follow finishes | Important | — | — | — | Not covered — Notifications are read but nothing creates them for this; no promise has been made yet. |

**Scenarios above whose promise the product does not yet keep (checked against the code on 2026-09-26):** SC-386, SC-387, SC-388, SC-389, SC-390, SC-393, SC-397, SC-402, SC-403, SC-404, SC-406, SC-407. These are the audit's findings, queued as work; the scenarios stay because they are what people expect.

## Site machine operator

Owns a machine that runs the organisation's agents (an Execution Site) and joins it to an organisation.

*These journeys predate host management. Since 2026-10-16 a machine is installed, joined and looked after through its host service — the **Machine admin** journeys below — and SMO-2 (registering with an admin's approval), SMO-6 and SMO-7 describe a way of joining that no longer exists. They are left for the next full audit to retire or reconcile.*

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **SMO-1** Install a site on my machine safely | Critical | An unsuitable folder or Docker setup is refused with the fix; nothing is published on my network; it survives a reboot and keeps its identity. | SC-430, SC-431, SC-432 | 0 of 3 | Scenario only (no automated test) |
| **SMO-2** Register my machine only with my consent and an admin's | Critical | A code is printed and waited on; the machine joins only after an admin types it; interrupting leaves nothing; my credential never travels unprotected. | SC-433, SC-434, SC-435, SC-420, SC-421, SC-436, SC-443 | 0 of 7 | Scenario only (no automated test) |
| **SMO-3** Know and limit what agents may do on my machine | Critical | The limits and their defaults are stated and settable, including how many runs the machine runs at once and what a run may take in time and turns; the reach of a container and what is stored are stated; write permission is enforced at the filesystem. | SC-441, SC-442, SC-328, SC-334, SC-335, SC-487, SC-488 | 3 of 7 | Scenario only (no automated test) |
| **SMO-4** See where my machine stands | Important | Status works with hq down and says in a sentence what is wrong and what to do. | SC-437, SC-438, SC-292, SC-293 | 2 of 4 | Scenario only (no automated test) |
| **SMO-5** Know what happens across restarts and outages | Important | It reconnects by itself; an upgrade is reported as an upgrade; runs cut short are reported failed. | SC-440, SC-291, SC-342, SC-341, SC-340, SC-444 | 4 of 6 | Scenario only (no automated test) |
| **SMO-6** Leave the organisation cleanly | Important | hq is told, what stays on my machine is stated, and a machine that cannot leave says so. | SC-439, SC-424 | 0 of 2 | Scenario only (no automated test) |
| **SMO-7** Cut off a leaked credential and recover | Important | An admin revokes it, the old holder is refused at once, and the machine registers again. | SC-286, SC-290, SC-422, SC-442, SC-312, SC-307 | 4 of 6 | Scenario only (no automated test) |
| **SMO-8** Cut off or re-key my own machine's credential from the machine | Important | The machine leaves the fleet from its own command line at once, even with HQ unreachable, its credential forgotten and HQ told; a new credential comes only by joining again (no credential is ever rotated, since 2026-10-21). | SC-848, SC-849, SC-845 | 3 of 3 | Covered by a scenario and a test |

**Scenarios above whose promise the product does not yet keep (checked against the code on 2026-09-26):** SC-432, SC-433, SC-436, SC-437, SC-438, SC-439, SC-441, SC-442, SC-443, SC-444. These are the audit's findings, queued as work; the scenarios stay because they are what people expect.

## Fleet admin

A person in HQ who holds the fleet admin role and looks after the machines — HQ and its sites — in the Fleet Console, on HQ's machine at `127.0.0.1` on its published port (7801 unless chosen otherwise). Written on 2026-10-16 from the finished code at the close of the host management unit ([`stories/console.md`](stories/console.md)).

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **FLT-1** Sign in, and nobody else can use the Fleet Console | Critical | Only an HQ account with the role gets in; nothing from the network, another page or another name for the machine is answered; losing the role ends my sessions at once; a new tab signs in from an open one. | SC-861, SC-862, SC-863, SC-864, SC-865, SC-892, SC-893, SC-921 | 8 of 8 | Covered by a scenario and a test |
| **FLT-2** See the fleet and what needs me | Important | One page says what needs me, then HQ and every site in words, then the totals; each machine has its page. | SC-888, SC-889, SC-894, SC-895, SC-896, SC-897, SC-899, SC-900, SC-902, SC-938 | 10 of 10 | Covered by a scenario and a test |
| **FLT-3** Add a site, and know which machine I approved | Critical | A one-time code, the fingerprint compared, the site named after its machine; the code never reaches HQ; a machine online is never replaced. | SC-868, SC-869, SC-870, SC-871, SC-872, SC-903, SC-925, SC-926 | 8 of 8 | Covered by a scenario and a test |
| **FLT-4** Move a site or HQ without losing it or running it twice | Critical | It moves at the time chosen with everything it holds, never runs on both, and comes back where it was if the move fails. | SC-873, SC-874, SC-875, SC-876, SC-912, SC-913, SC-927, SC-858, SC-859 | 9 of 9 | Covered by a scenario and a test |
| **FLT-5** Disconnect or remove a machine | Important | The machine's name is typed, what stays is said, and it stays listed until removed; one that left by itself says so. | SC-878, SC-879, SC-898, SC-914, SC-930 | 5 of 5 | Covered by a scenario and a test |
| **FLT-6** Restore a lost site onto a new machine | Critical | Offered only for a site whose machine is offline; the backup is shown before I confirm; the old machine is refused afterwards. | SC-880, SC-904, SC-928, SC-834 | 4 of 4 | Covered by a scenario and a test |
| **FLT-7** Know the backups can bring the fleet back | Critical | Every machine's last backup and whether a copy is elsewhere; a warning for those on their own machine only; an export downloaded with its key shown once. | SC-887, SC-905, SC-906, SC-830, SC-831 | 5 of 5 | Covered by a scenario and a test |
| **FLT-8** Plan maintenance with members told first | Important | Which, what and when in one panel; never too near for members' notice; planned and recent maintenance listed, moved and cancelled. | SC-867, SC-885, SC-907, SC-908, SC-909, SC-931, SC-932 | 7 of 7 | Covered by a scenario and a test |
| **FLT-9** Suspend, resume or erase HQ | Critical | Suspending keeps everything; erasing needs the address typed, keeps a final backup 30 days, and shows everyone a countdown when dated. | SC-910, SC-911, SC-933, SC-842, SC-843 | 5 of 5 | Covered by a scenario and a test |
| **FLT-10** Be told when a machine stops, without noise | Important | Ticked machines are reported after 10 minutes of silence, HQ's always; a machine stopped on purpose or unticked tells no one. | SC-881, SC-882, SC-897, SC-901, SC-929 | 5 of 5 | Covered by a scenario and a test |
| **FLT-11** See my notices and what was done | Important | The bell holds my notices, each opening what it is about; Activity is a year's record nobody can edit. | SC-883, SC-884, SC-916, SC-917, SC-922 | 5 of 5 | Covered by a scenario and a test |
| **FLT-12** Give and take away the fleet admin role | Critical | Only a fleet admin or HQ's machine admin can; every change is announced; the last fleet admin is kept. | SC-886, SC-918, SC-920, SC-852 | 4 of 4 | Covered by a scenario and a test |
| **FLT-13** Only the Fleet Console commands a machine | Critical | Every command is signed and sealed, HQ passes it unread and cannot make one; a handover is followed only when the running Fleet Console signed it. | SC-866, SC-877, SC-891, SC-923, SC-924, SC-937, SC-847 | 7 of 7 | Covered by a scenario and a test |
| **FLT-14** Change how people reach HQ | Important | The front door and address are shown and changed with a warning; every machine follows only once the new address is HQ. | SC-890, SC-915, SC-935, SC-936, SC-855, SC-856, SC-857 | 7 of 7 | Covered by a scenario and a test |
| **FLT-15** Read how it works without leaving the Fleet Console | Important | Help shows the guide's running pages with working links. | SC-919 | 1 of 1 | Covered by a scenario and a test |
| **FLT-16** Know hq's relay is answering | Important | HQ's page shows hq's relay — address, sites served, traffic, streams — and a relay that is not answering is on *Needs you* in the words people see. | SC-1467, SC-1530, SC-1591, SC-1592, SC-1593 | 5 of 5 | Covered by a scenario and a test |

No browser suite drives the Fleet Console's screens: they are covered by component tests against a fake server, and the server by unit tests; the cross-app suite covers the relay and sign-in only (SC-921, SC-923).

## Machine admin

Whoever can use Docker on a machine Agenthix runs on, typing `agenthix` commands there; not an account in Agenthix. Written on 2026-10-16 from the finished code at the close of the host management unit ([`stories/host.md`](stories/host.md)).

| Journey | Priority | What "works" means | Scenarios | Tests cite | Status |
|---|---|---|---|---|---|
| **MCH-1** Install Agenthix on one machine | Critical | One question; HQ, its site and the Fleet Console start; one first-account link; a bad address refused before anything changes; only signed images on a release. | SC-816, SC-817, SC-818, SC-819, SC-820, SC-821, SC-860 | 7 of 7 | Covered by a scenario and a test |
| **MCH-2** Know how the machine is doing | Important | `agenthix status` in sentences that end in what to do next. | SC-822, SC-823, SC-832 | 3 of 3 | Covered by a scenario and a test |
| **MCH-3** Keep agents off the machine | Critical | The protections hold with no setting; when they cannot, no agent starts and I am told why. | SC-824, SC-825, SC-826 | 3 of 3 | Covered by a scenario and a test |
| **MCH-4** Back up every night, with a key only I hold | Critical | Nightly sealed backups; a location with a key shown once; a plain warning when backups would die with the machine. | SC-827, SC-828, SC-829, SC-832 | 4 of 4 | Covered by a scenario and a test |
| **MCH-5** Bring HQ or a lost site back on a new machine | Critical | From the location or an export, with my key, which never leaves the machine. | SC-833, SC-834 | 2 of 2 | Covered by a scenario and a test |
| **MCH-6** Upgrade safely | Critical | Signatures checked, a backup first, rolled back by itself if unhealthy; fixes only in the window. | SC-835, SC-836, SC-837, SC-838 | 4 of 4 | Covered by a scenario and a test |
| **MCH-7** Schedule, suspend and erase | Important | Times in words; missed or failed changes say why; suspend keeps everything; erase can be undone for 30 days. | SC-839, SC-840, SC-841, SC-842, SC-843, SC-844 | 6 of 6 | Covered by a scenario and a test |
| **MCH-8** Join or leave the Fleet Console | Critical | A code and a fingerprint; only signed commands from a short list; disconnecting at once, even offline. | SC-845, SC-846, SC-847, SC-848, SC-849, SC-850, SC-851 | 7 of 7 | Covered by a scenario and a test |
| **MCH-9** Get the fleet back when nobody can sign in | Critical | The fleet admin role, and a way into HQ, from HQ's machine; the Fleet Console moved or removed. | SC-852, SC-853, SC-854, SC-860 | 4 of 4 | Covered by a scenario and a test |
| **MCH-10** Serve HQ over HTTPS, and change its address | Important | The front door warns before taking ports 80 and 443 and rolls back on failure; an address change is followed only once checked. | SC-855, SC-856, SC-857 | 3 of 3 | Covered by a scenario and a test |
| **MCH-11** Move HQ or a site | Critical | Never on both machines; back on the old one if the new one does not take over; `hq move recover` when needed. | SC-858, SC-859 | 2 of 2 | Covered by a scenario and a test |
| **MCH-12** Take Agenthix off the machine | Important | Refused while HQ or a site is there; what goes and what never does is listed first; the bin only after its address is typed; nothing named after the install left, and nothing of mine touched. (Added 2026-10-21.) | SC-1159, SC-1160, SC-1161, SC-1162, SC-1163 | 5 of 5 | Covered by a scenario and a test |
| **MCH-13** Keep the install apart from the rest of the machine | Important | Every name from the install's namespace, one group per part, and networks that never overlap the machine's own. (Added 2026-10-21; *at most one HQ* retired 2026-10-24 with SC-1157.) | SC-1155, SC-1156, SC-1158, SC-1154 | 4 of 4 | Covered by a scenario and a test |
| **MCH-14** Choose the ports HQ and the Fleet Console are published on | Critical | Two ports with quiet defaults (7800, 7801) chosen at install, kept through upgrades, changed with one command. (Added 2026-10-24.) | SC-1242, SC-1243, SC-1249 | 3 of 3 | Covered by a scenario and a test |
| **MCH-15** Be told before a port clash changes anything, and after one stops a part | Critical | One check before anything is published, one refusal ending "Nothing was changed."; a part a taken port blocks is reported. (Added 2026-10-24.) | SC-1244, SC-1245 | 2 of 2 | Covered by a scenario and a test |
| **MCH-16** Run several installations on one machine, for testing | Important | A namespace of its own, an address slice for its agents and firewall rules for it alone; only a clash is refused. (Added 2026-10-24.) | SC-1241, SC-1246, SC-1247, SC-1248, SC-1253 | 4 of 5 (the install test is a script) | Covered by a scenario and a test |
| **MCH-17** Have hq's relay start with hq | Important | hq's compose set runs the relay beside hq with a secret the install makes, publishing nothing of its own, from the image whose signature was checked. (Added 2026-10-27.) | SC-1524, SC-1594, SC-1595 | 3 of 3 | Covered by a scenario and a test |

Some of these scenarios are also asserted by container tests (`npm run test:container` in `host/`), which need Docker and the built image; each scenario has at least one unit test too.

## Summary

| Role | Critical journeys | Covered by a scenario and a test | Scenario only | Not covered | Important journeys | Covered | Scenario only | Not covered |
|---|---|---|---|---|---|---|---|---|
| First-time installer | 4 | 0 | 4 | 0 | 4 | 0 | 4 | 0 |
| Organisation admin | 6 | 1 | 5 | 0 | 7 | 2 | 3 | 2 |
| Operator | 12 | 3 | 9 | 0 | 11 | 4 | 6 | 1 |
| Viewer | 4 | 0 | 4 | 0 | 4 | 0 | 3 | 1 |
| Site machine operator | 3 | 0 | 3 | 0 | 5 | 1 | 4 | 0 |
| Fleet admin | 8 | 8 | 0 | 0 | 7 | 7 | 0 | 0 |
| Machine admin | 8 | 8 | 0 | 0 | 5 | 5 | 0 | 0 |
| **All roles** | 45 | 20 | 25 | 0 | 43 | 19 | 20 | 4 |

Counted by scenario rather than by journey, so the picture is not flattened: the critical journeys rest on 221 distinct scenarios, 131 of which (59%) have a citing test; the important journeys add 177 more, 149 of them with a citing test (recounted on 2026-10-12 for every journey). The scenarios written on 2026-10-05 for the agents-own-schedule unit (SC-451 to SC-488) mostly carry no `@SC` tag yet, although most are asserted by tests that name them in their contract entry; those written on 2026-10-07 for the conversation-first unit (SC-489 onward) are tagged. The browser suites `hq/e2e/shell.spec.ts` and `hq/e2e/mobile-responsive.spec.ts` cite the shell's scenarios (SC-010 to SC-156, SC-224, SC-225) and drive the shell as it is; they were extended for the desktop shell on 2026-10-18. SC-003 is counted as untested because its one citing test checks only that the sign-up link is hidden, not that the sign-up endpoint refuses an uninvited request.

Every critical journey has scenarios. The critical journeys fully backed by tests are ADM-12, OPR-18, OPR-22 and OPR-23, and the important ones ADM-7, ADM-13, OPR-17, OPR-19, OPR-20 and OPR-21 — those written at the close of the conversation-first unit and of the unit *every screen reviewed*; every Fleet admin and Machine admin journey is fully backed too, since the scenarios written on 2026-10-16 for host management (SC-816 to SC-939) were written from the code with their tests tagged; every journey added on 2026-10-17 for *The conversational experience* (OPR-24 to OPR-32) has a citing test for each of its scenarios, but OPR-31 (voice on a laptop's speakers, SC-1002) is a promise not yet met; for the rest, most of the promises written on 2026-09-26 describe behaviour the existing tests assert without the tag, or behaviour the product does not yet provide.

## Decisions this map takes

These settle points where the design leaves a question open, so that the scenarios could be written. Each is reversible by editing the scenarios named.

- **A viewer reads and never starts, funds, stops or deletes** (SC-387 to SC-389). Whether a viewer may also create tasks, comment or attach files inside an open project is left unspecified; the design keeps "whether a reader class is wanted" open, and only work that makes agents run or destroys other people's work is ruled out.
- **Shaping agents and the org's templates is the org admin's** (SC-390). What spends money unattended is a boundary's automation, and the organisation decides how far it may go (SC-452); a project admin, or a person in their own tasks, may only make it stricter.
- **Reading what you may not see never confirms it exists; acting on what you may see but not change says what is needed** (SC-397). This is what a chat session and a task session should answer alike.
- **Stopping everything stops the runs only** (SC-416). What would start next is stopped by turning automation off for the organisation (SC-451), which is a separate, deliberate step that keeps every queue and setting.
- **A person's own connection acts as them and never as more** (SC-479); there is no organisation-wide key, so nothing created from outside the product is done on behalf of nobody.
- **A person removed from a private project keeps read access to their own old chats there and cannot continue them** (SC-400, SC-414).
- **Stop all in a place leaves other people's conversations running** (SC-503). A conversation is its person's alone to stop (adr-0041); a project admin's Stop all ends the project's task work and their own conversations there.
- **The Runs panel is the person's own** (SC-530): it lists what they started, what is done for them and their own conversations; a project's Runs tool lists every run going in the project (SC-504).

## Not mapped

Nice-to-have journeys are not mapped: the organisation profile page, teams, voice, mobile pairing. The full audit of the finished product (its own unit) maps them.
