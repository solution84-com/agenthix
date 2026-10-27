---
title: Glossary
description: The words Agenthix shows, what each one is, where to find it and what else people call it.
sidebar:
  order: 9
---

Every word the screens show, in alphabetical order. Each entry says what the word is, where it is (the screen, and
its address in HQ, written after your HQ's own web address), and the other words people use for it. A place's
sections open from its side bar and are part of the address, for example `?tool=files`.

## Admin

An organisation's administrator: a person who can look after the organisation's people, agents, providers and
settings. A person is an **Admin** or a **Member** of the organisation. Where: the person's page under **Manage › People** (`/admin/people`).
Also said: administrator, org admin, organisation admin.

## Agent

A worker defined once for the organisation, with its own instructions, permissions and memory. You give it work in
conversations and tasks. Where: **Agents** in the main navigation (`/agents`); organisation admins also manage them under **Manage › Agents** (`/admin/agents`).
Also said: bot, assistant, worker, AI.

## Approval

A question a run asks a person when it wants to do something its permissions do not allow on their own. The run waits until someone answers **Approve** or **Deny**. Where: **Notifications** under **Needs you**, and the **Runs** screen (`/runs`).
Also said: permission request, sign-off, ask, "needs you".

## Artefacts

The throwaway things agents made for you in conversations, such as a draft or a chart. Keep one by asking an agent to move it into **Files**. Where: **Artefacts** in a project or in **Your space** (`/space?tool=artefacts`).
Also said: artifacts, outputs, generated files, things the agent made.

## Attachment

A file that belongs to a task, attached by a person or by an agent as a deliverable, up to 10 MB. It opens beside the task and downloads. Where: **Attachments** on a task's page (`/projects/<key>?task=<number>`). See [A task's files](projects/task-files.md).
Also said: task file, upload, deliverable, attached file.

## Automation

Agents picking up work on their own, within limits an administrator sets. Where: **Automation** in a project (`/projects/<key>?tool=automation`) or in **Your space**; the organisation's switch and limits are under **Manage › Settings › Automation** (`/admin/settings/automation`).
Also said: auto-run, autopilot, scheduling, background work.

## Billing profile

A name that says who the cost of using models belongs to, such as the organisation or a client. Where: **Manage › Models and billing › Billing profiles** (`/admin/billing-profiles`).
Also said: cost centre, billing account, who pays.

## Board

A project's tasks laid out in columns that you move them along. A project can have several. Where: **Boards** in a project (`/projects/<key>/boards`), or all boards together at `/boards`.
Also said: kanban, task board, backlog.

## Chat

The list of your conversations in **Your space**, newest first. Where: **Chat** in the side bar (`/chat`).
Also said: messages, talk to the agent, my conversations.

## Chip

A file, folder, task or attachment named in a message, shown as a small piece with an icon, a name and what kind it is. Select it to open what it names. Where: in conversations, and in the message box after **Mention** or `@`. See [Files in conversations](projects/files-in-conversations.md).
Also said: file link, mention, reference, tag, pill.

## Connection

A way for a tool outside Agenthix, such as your own Claude Code, to work in HQ as you, with only the permissions you turn on. Where: **Settings › Devices and connections › Connections** (`/settings/connections`).
Also said: MCP, API access, token, connect Claude Code.

## Conversation

A talk with an agent, in your space, a project or on a task. It opens beside the page and stays there as you move around HQ. Where: beside every page, and listed in **Chat** (`/chat`) or in a project's **Conversations**.
Also said: chat, thread, session (for a task's transcript), message.

## Execution Site

The machine that runs agents, in containers, and keeps the files of the places it serves. It connects out to HQ and has no web page of its own. Where: **Manage › Where work runs › Sites** (`/admin/where-work-runs`).
Also said: site, server, runner, worker machine, where work runs.

## Files

The documents of a project, or of your space, that agents write and people read, opened in place and downloadable. See [Open and download files](projects/open-and-download-files.md). Where: **Files** in a project (`/projects/<key>?tool=files`) or in **Your space** (`/space?tool=files`).
Also said: documents, folder, attachments, project files.

## Fleet Console

The separate screen where fleet admins add sites, plan upgrades and watch backups. It opens only on the machine HQ runs on. Where: on that machine's own address, not in HQ.
Also said: console, fleet admin portal, host management.

## Home

The first screen after you sign in, with what needs you and ways to begin with the built-in agent. Where: **Home** (`/`).
Also said: dashboard, start page, landing page.

## HQ

Your organisation's home in Agenthix: its people, projects, agents, boards and tasks, and who may do what. It is the only part people open in a browser. Where: your organisation's own web address.
Also said: headquarters, the platform, the app, the web app, the control plane.

## Kernel

The agent every new HQ comes with, which helps you use Agenthix. Where: **Agents** (`/agents`); it answers in **Home**'s starting suggestions and in a new conversation.
Also said: the built-in agent, the default agent, the helper, the assistant.

## Knowledge

What a place shares, as pages in sections: its processes, decisions, reference and anything else people and agents there need to look up, with properties such as a decision's status or date. There is the organisation's, each project's and Your space's, and agents also search this guide. Agents search it when they need it and change a page only when asked; nothing in it is read on every run. Where: **Knowledge** in a project (`/projects/<key>?tool=knowledge`), in **Your space** (`/space?tool=knowledge`) and in the organisation (**Knowledge** under **The workplace** on the **Organisation** page, `/org/knowledge`). See [Knowledge](projects/knowledge.md).
Also said: wiki, notes, docs, know-how, how we do things.

## Library

A shelf of ready-made agents, boards, skills and teams to start from. Using one makes the organisation's own copy. Where: the **Library** card on your organisation's **Overview** (`/library`).
Also said: templates, starter kit, marketplace, gallery.

## Manage

The admin area, where organisation admins look after the organisation. Where: **Manage**, in the menu behind your name at the foot of the side bar (`/admin`).
Also said: admin, admin area, organisation settings, administration.

## Members

The people, agents and teams that belong to a project, each with a role there: admin, member or viewer. Where: **Members** in a project (`/projects/<key>?tool=people`).
Also said: team members, collaborators, who is in this project, access.

## Memory

What agents remember about you, or about a place, so that you do not repeat yourself. Where: **Settings › Memory** for your own (`/settings/memory`); a project's **Memory** for administrators; the organisation's under **Manage › Settings › Memory** (`/admin/settings/memory`).
Also said: remember this, what the agent knows about me, preferences, forget.

## Mention

Putting a file into the message you are writing. Select **Mention** on an open file, or type `@` in the message box and choose a file. It becomes a chip, and the agent receives the file's path. Where: **Mention** on an open file, and the message box of a conversation. See [Files in conversations](projects/files-in-conversations.md).
Also said: @, attach, reference a file, tag a file, link a file.

## Models

The AI models agents think with, and which ones may run. Where: **Manage › Models and billing › Models** (`/admin/models`), and your own list under **Settings**.
Also said: LLM, AI model, which model, Claude, GPT.

## Notifications

The bell beside the logo, listing what waits on you under **Needs you** and what has passed under **Earlier**. Where: the top of the side bar, on every page.
Also said: alerts, inbox, bell, what needs me.

## Organisation

Everyone who can sign in to your HQ, and what they share: projects, agents, products and settings. Where: your organisation's **Overview** (`/org`).
Also said: org, company, everyone.

## Page

One entry in Knowledge: a title, a one-sentence description, tags and text, and any properties of the team's own. Where: a place's **Knowledge**, in a section (`/projects/<key>?tool=knowledge&page=<name>`).
Also said: article, note, doc.

## Permissions

What an agent may do on its own and what needs a person's approval, set for the organisation, per project and per person. Where: **Permissions** on an agent's page, and in **Manage › Settings › Tool risk rules** (`/admin/settings/risk-rules`).
Also said: allowed actions, access, guardrails, what the agent can do, risk rules.

## Personal project

A project only you see, for work of your own. It is a place of its own, like any project: its own files, tasks and knowledge, separate from Your space and from your other personal projects. Where: **Projects**, made with **New project** › **Just for you** (see [Personal projects](projects/projects.md#personal-projects)).
Also said: my project, private project, side project.

## Pinned

Places you have pinned for quick return, listed at the foot of the side bar. Where: **Pinned** in the side bar, on every page.
Also said: favourites, bookmarks, shortcuts.

## Place

A project, **Your space** included. A conversation starts in one place and reaches only the places you add to it; agents search the knowledge of each place a conversation reaches. Where: **Places** under a conversation's title, with **Add place…** (see [Places in a conversation](getting-started/first-conversation.md#places-in-a-conversation)).
Also said: area, project, where we are.

## Preview

A running copy of an app an agent is building, opened in a new tab. Where: **Open preview** on a workspace's card, in **Workspaces** (`/workspaces`).
Also said: live preview, demo, test site, running app.

## Product

Something your organisation makes or runs; projects can be filed under it. It groups projects and gives nobody access. Where: the **Products** card on your organisation's **Overview** (`/products`).
Also said: offering, line of business.

## Programme

A goal several projects work towards; projects can be filed under it. The card spells it **Programs**. Where: the **Programs** card on your organisation's **Overview** (`/programs`).
Also said: program, initiative, campaign.

## Project

A shared place for one piece of work, with its boards, tasks, files and members. Where: **Projects** (`/projects`) and each project's page (`/projects/<key>`).
Also said: job, team space, piece of work.

## Provider

A company or service that supplies models or voices to the organisation, such as Anthropic or OpenAI, with its key. Where: **Manage › Models and billing › Providers** (`/admin/providers`).
Also said: API key, vendor, LLM provider, model account, STT, TTS.

## Recently deleted

The pages deleted from a place's Knowledge in the last 30 days, each with who deleted it and when it will be removed. **Restore** brings a page back; **Delete permanently** removes it at once. Where: **Recently deleted** at the foot of the sections in **Knowledge** (`?tool=knowledge&view=deleted`).
Also said: trash, bin, deleted pages, recycle bin.

## Relay

The part of HQ that carries files to your browser, so that no file passes through HQ's own server. It runs with HQ. If it stops, files can't be opened until it answers, and a file says so by name, for example "hq-box · HQ's relay isn't answering". Where: named in the message on a file that can't be opened, and on the Fleet Console's **HQ** page (fleet admins). See [Open and download files](projects/open-and-download-files.md#when-a-file-cant-be-opened).
Also said: file server, files host, file relay.

## Routine

Work that comes round again on a schedule, such as a weekly summary. Each time it makes a task, called a round. Where: **Automation** in a project (`/projects/<key>/routines`).
Also said: recurring task, schedule, cron, repeating job.

## Run

One go an agent has at a task or conversation. Where: the **Runs** button beside the logo, and the **Runs** screen (`/runs`).
Also said: job, execution, session, what the agent is doing, process.

## Secret

A key, password or token a project or person keeps for workflows, stored encrypted and never shown again once saved. Agents see its name, never the value. Where: **Secrets** in a project (`/projects/<key>?tool=secrets`) or **Your space** (`/space?tool=secrets`).
Also said: API key, password, credential, token, environment variable (for a variable, see **Variable**).

## Section

A folder of pages in Knowledge, which can hold other sections, such as `processes` or `decisions`. It is not one of a project's sections in the side bar, such as **Tasks** or **Files**. Where: the tree beside the pages in **Knowledge**.
Also said: folder, category, topic, chapter.

## Settings

Your own settings: profile, appearance, conversations, your Claude subscription, memory, devices and sign-in. Where: **Your settings** in the menu behind your name (`/settings`).
Also said: preferences, my account, profile, options.

## Skill

A written procedure an agent can follow when a task calls for it. Where: **Skills** (`/skills`) and the **Library** (`/library`).
Also said: playbook, instructions, how-to, recipe.

## Task

A piece of work on a board, given to an agent or a person, with its own conversation and runs. Where: **Tasks** in a project (`/projects/<key>?tool=tasks`), and every task of yours at `/tasks`.
Also said: ticket, card, to-do, issue, job.

## Team

A group of people who can be added to a project together. Where: **Teams** (`/org/teams`); admins also at `/admin/teams`.
Also said: group, department.

## Usage

What models and voices have cost, month by month, by billing profile. Where: **Manage › Models and billing › Usage** (`/admin/usage`).
Also said: spend, cost, bill, tokens used.

## Variable

A plain named setting, such as a host name, that a project or person keeps for workflows. Its value is shown to everyone in the place and to agents. Never put a secret in one. Where: next to **Secrets** (`/projects/<key>?tool=secrets`).
Also said: environment variable, setting, config.

## Voice

Speaking with an agent aloud, and agents speaking back. Where: the call button in a conversation; its providers under **Manage › Models and billing › Providers** (`/admin/providers`).
Also said: voice call, talk, speech, dictation, text to speech, speech to text.

## Workflow

A named set of steps, each running in a container of its own with only the secrets that step names. An agent proposes it and a person approves each version before it can run. Where: **Workflows** in a project or **Your space** (`/projects/<key>?tool=workflows`); one workflow at `/workflows/<id>`.
Also said: pipeline, script, automation (loosely), job, GitHub action.

## Working files

What a task's runs wrote in the task's own folder: notes, outputs and drafts. They open beside the task. Where: **Working files** on a task's page. See [A task's files](projects/task-files.md).
Also said: task folder, outputs, run files, files the agent wrote.

## Workspace

A project's working copy of its code, kept on its Execution Site, where agents build and run things. Where: **Workspaces** in a project (`/projects/<key>/workspaces`), and all of yours at `/workspaces`.
Also said: repo, checkout, code, working folder, sandbox.

## Your space

Your own place, your default personal project: Chat, your own tasks, Files and Knowledge. Only you see it. Any other personal project of yours is a place of its own, with its own files and knowledge, reached by a conversation only when you add it. Where: **Your space**, under **Chat** in the side bar (`/space`; its conversations at `/chat`).
Also said: my space, personal space, my stuff, private space, my files, my area.
