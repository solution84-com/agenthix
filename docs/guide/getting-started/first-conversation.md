---
title: Your first conversation
description: Talk to an agent from Home or Chat, keep the conversation beside your work, and answer it when it asks to do something.
sidebar:
  order: 4
---

The quickest way to see an agent at work is to talk to one. Every new HQ — your organisation's home in Agenthix —
comes with a built-in agent, **Kernel**, which knows how Agenthix works and can help you set up the rest.

## Start from Home

![Home, with the greeting, what needs you, what is running and three ways to begin](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.6/home.png)

**Home** is the first thing you see after signing in. It shows how your HQ is doing: what needs you, what's running,
what's coming up today and the projects you pinned. It has no message box of its own, because you write in the
conversation beside the page. While that conversation is folded away to its bar, a box floats at the foot of Home so
you can start one straight away:

1. Choose an agent in the box — **Kernel**, to begin with.
2. Type your message where it says **Ask any agent…**, then press Enter or select **Send**. The conversation opens beside
   Home, which stays where it is.

Home also offers three ways to begin with Kernel: **What can you do?**, **Set up my first project** and **Invite my
team**. Select one to start that conversation in the conversation beside the page; Home stays where it is.

If Home says **Agents can't answer you yet: no model is working**, an organisation admin needs to add or fix a
provider. For an admin it links to **Manage organisation › AI**: see [the AI page](../your-tools/providers.md).

## The conversation

![A conversation with Kernel in Chat](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.6/chat-conversation.png)

Your conversation opens beside the page, on the right of the screen, where it stays as you move around HQ. It belongs
to **Your space**, your own private place, outside any project. The bar at the top shows the agent's picture and name, with the conversation's title under the name: the agent names the conversation in a few words after its first reply, and until then it is **New conversation**. A long title is cut with **…**; rest the pointer on it to read it all, and rename it from **⋯**. On the right of the same bar, where the conversation lives and what else it reads are small stacked tiles (see [Places in a conversation](#places-in-a-conversation)), with **⋯** beside them. The thread runs under the message box, which floats over its foot; the last lines fade out above it, and a round **↓** appears just above the box when you have scrolled up. The agent answers as soon as it can; keep writing in the message box to reply, and select **Stop** (the button
at the right of the box while it answers) to stop it: the answer ends where it had reached and says **You stopped it
here**. A message you send while the agent is still answering waits behind
its reply, marked as waiting, with **Send now**, which stops the reply to answer you first, and **Cancel**; your
[Settings](../your-tools/your-settings.md#conversations) choose whether a message waits or interrupts.

- **See what it is doing:** while the agent works, a line just above the message box says what it is doing now, with
  three moving dots and how long the turn has taken: **Kernel is thinking · 4 s**, **Kernel is searching Knowledge and 2
  more**. Once the answer is being written the words themselves show it, and the line goes.
- **See what it did:** when an agent looks something up to answer, its name has a quiet **Thinking ›** beside it while
  it works and **Thought for 6 s ›** after. Select it to see the turn's steps in plain words, each marked done or that
  it didn't work. A task the agent made is a card at the end of its answer; select the card to open the task.
- **Under an answer:** **Copy** copies it; the speaker reads it aloud in the agent's voice (it is there only when voice
  is set up for your organisation; select it again to stop); **⋯** holds **Show the run**, which opens the steps, and
  what the answer used: the model, how long it took and the tokens it read and wrote. Each is an icon named when you
  point at it.
- **When something goes wrong:** a reply that did not finish says what happened in plain words and names the provider,
  in the reply itself. If only an administrator can fix it, an administrator sees **Open AI** and anyone else is
  told an administrator has been told. Words the agent had already written stay, marked **The answer stopped here.**
  **Try again** under the newest failed or stopped reply sends your message again. Where a conversation cannot be
  answered at all, one line in place of the message box says why, and, when there is one, offers **Switch to** the other
  access.
- **Reading a long conversation:** when you send a message it moves to the top, with room under it for the answer, even
  if you had scrolled away. The answer is written there and the conversation stays still, so you read at your own pace;
  scroll whenever you like. When more is being written below what you can see, a round button above the box shows three
  moving dots: select it to go to the end and keep up with the writing. Once the answer is done, the button is an arrow
  while there is more below, and a dot on it means a new answer has arrived. In a voice conversation your words move to
  the top as you speak, and the answer is followed a line at a time, a few lines above the box. The very top of a
  conversation is marked **Start of the conversation**.
- **The message box** has two rows: what you type, then the **model** as a button of its own (at the left, after the
  plus when there is one) and, at the right, dictation and the send button. Rest the pointer on the send button to read
  *Send (Enter) · Shift+Enter for a new line*.
- **Change the model:** select the model button in the message box. Type to search, or narrow the list by **Maker**,
  **Provider** and **Price**. It starts with **Default**, the model the conversation talks on unless you pick one,
  then the models grouped by maker, each with its price from **$** (low) to **$$$** (high). The model you pick is the
  one the agent answers on and the one the work it starts for you runs on. A change applies to the next answer and the
  next piece of work, not to work already running.
- **Before the first message,** the box also lets you choose the agent. After it, a conversation keeps its agent; to
  talk to another, start a new conversation.
- **The menu** (⋯) at the top holds **Rename**, **Summarise now**, **Show its runs**, **Keep it**, **Archive** and
  **Delete…**, each with an icon. **Rename** is for anyone who can write in the conversation; it gives the conversation a
  name of your own in place of the agent's. **Keep it** keeps the conversation out of archiving when it is idle.
  **Archive** and **Delete…** are for the person who started the conversation. A long conversation is summarised for you as it grows: see
  [Long conversations](#long-conversations).

**Chat** is the list for working through your conversations, newest first: those in **Your space** and in your
projects. Search the titles and latest messages, filter by **Needs you**, **Unread**, project, agent or **Archived**, or
select **Select to mark read or archive several at once** and tick the ones you want. Your search and filters are in the
address. Select a conversation to open it beside the page; the list never opens, folds or moves the conversation beside
the page. While that conversation is folded away, a box floats at the foot of Chat, as on Home. A conversation nobody
has written in for 90 days is archived, not deleted, unless you keep it out of archiving.

## The conversation beside your work

One conversation is open at a time, and it stays open wherever you go: another project, **Tasks**, **Settings**,
**Home**. Only you close or change it; moving to another page never does. The page and the conversation are both in the
address (the conversation as `?c=` followed by its number), so a reload, a link you share with yourself or Back brings
back both.

There is always a conversation beside the page. When none is open, such as when you have just signed in, HQ opens the
one you last wrote in, on this or any other device; if you have not written in one yet, it opens a new conversation in
**Your space**, ready for your first message. On a medium or narrow window it opens folded away, so the page shows first.

![A conversation docked on the right while the Tasks page is open](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.6/docked-conversation.png)

A reply keeps arriving, and a voice call keeps going, while you move between pages. At the top of the conversation, a
small label says where it lives: **Your space**, a project or a task. Select it to open that place on the page.

To give the conversation the page's width, read in a centred column with the side bar still there, open the **⋯** menu
at the top of the conversation and choose **Over the page**; there the same entry reads **Back beside the page**.
Moving to another page puts it back beside the page, so it never hides where you went. On a phone the conversation is
already the whole screen, so the entry is not shown, and while a file is open it is greyed, because the conversation
stays beside the file.

On the conversation's right is the chat's bar. From the top:

- **The chat button**: one button that folds the conversation away, leaving only the bar, and opens it again where you
  left it, beside the page or over it. It is highlighted while the conversation is open, and its name says what it will
  do (**Minimise the chat** or **Open the chat**). ⌘J (Ctrl+J on Windows and Linux) does the same. Nothing is lost while
  it is minimised: the reply keeps arriving, and your unsent text is kept.
- **New conversation** (＋): see [Start a new conversation](#start-a-new-conversation).
- **Conversations**: every conversation you can open, newest first by the time each row shows, under headings for
  **Today**, **Yesterday** and then the date, over the whole app. Its badge counts everything waiting for you, and is
  amber when something needs your okay. Each row has two lines: the title and the time, then the last message. The
  agent's face carries a small tile for the project it is in (point at it for the name; your space has its own), and a
  small dot while the agent is working. At the right of a row, a number counts the replies you have not read (the
  title is then in bold and the time in the accent colour), and **!** means a request waits for your okay. The
  conversation open in the panel has a bar at its left. Search at the top, or choose **All**, **Unread** or, only while
  something needs you, **Needs you**; the filters stay as you left them. **Open in Chat** shows the same list on the
  Chat page. Select a conversation to open it; select outside the list, or press Esc, to close it with nothing changed.
  On the Chat page, **Filter** holds the project, the agent and **Archived** and shows how many are set, and the
  checklist icon selects several rows to mark read or archive at once.
- **Pinned**: **Your space**, then the projects you have pinned, each showing what is going on in it: **!** when a
  conversation there needs you, the number of unread conversations, a small dot while an agent is working. Point at
  one to read it in words. The button whose list is open has a shaded background. Select one to see its conversations,
  most recent first, with **Open project** and **New conversation here**.

A conversation you open is marked read, so its count and the badge clear.

To make the conversation wider or narrower, drag the thin handle on its left edge; double-click the handle to return to
the usual width. With the handle selected, the left and right arrow keys change the width in steps. HQ remembers the
width on that browser. It is never narrower than the usual width, and never wider than half the window.

### On a smaller window

- **Wide windows** (1280 px and more) show the conversation beside the page.
- **Medium windows** (768 to 1279 px) slide the conversation over the page, and from 1024 px a place's menu shows
  its sections as icons, with their names when you point at them; below that the side bar is behind the **☰** button.
  When you go to another page, the conversation is minimised to its bar, so you see where you went; select the chat
  button at the top of the bar to bring it back. While a file is open in the file viewer, the conversation sits beside the file rather
  than over it.
- **Narrow windows** (under 768 px, a phone) show the chat as one icon in the bar at the top, beside notifications,
  with the badge for everything waiting. Select it to show the conversation full screen; **⌄** at its top folds it
  away again. **⋮** at its top right opens the chat's menu from the bottom of the screen: **Conversations**, **New
  conversation** and your pinned places, each with its badge. Each choice opens in place of the menu, and **‹** goes
  back to it.

Resizing the window never loses the conversation, its place in the thread or what you have typed.

## Start a new conversation

Select **＋** in the chat's bar, or **Talk about** a project (or **Talk in your space**) in the bar at the top of a
page. A new conversation opens over the one you were in, with the rest of the app dimmed. If no conversation was open,
it fills the conversation's place instead, headed **New conversation**, with **Cancel** at its right.

![A new conversation in the dock, with the places to choose from and the project already chosen](https://github.com/solution84-com/agenthix/releases/download/v0.1.0-alpha.6/new-conversation-draft.png)

The draft lists the places you can start in, under **You're here**, **Your space**, **Pinned** and **All projects**, with
a search box at the top (**Find a place…**). The place you are on is already chosen, and the message box is ready, so
usually you type and send. Only the chosen place shows a line about it: what it is and who can see what is said there.
Above the box, a line says which agent leads the conversation and what it can use. To start somewhere else, select
another place; searching narrows the list without moving your choice. The agent picker in the box lists the agents of the
place you chose.

Anything inside a project, such as a task, a board or a file, counts as that project: a conversation there is about the
whole project.

Selecting outside it, **✕**, or Esc puts back exactly what was open before and throws away any text you had not sent.
If nothing was open, **Cancel** minimises the draft to the chat's bar, keeping what you typed. Sending turns the draft
into the conversation, and the place becomes the label at its top.

To talk instead of typing, select the voice button at the right of the empty box: the conversation starts in the
chosen place with the chosen agent, opens, and voice starts at once, so what you say is its first message. The button
is greyed when that agent cannot talk; select it to see why. See [Voice](../your-tools/phone-and-voice.md).

## Places in a conversation

A **place** is a project, **Your space** included. A conversation starts in one place, the one you started it in, and
agents in it can read that place's knowledge, the organisation's knowledge and this guide. They cannot see any other
place, even one you can open yourself, until you add it to the conversation. **Your space** is your default personal
project; any other personal project is a place of its own, like any project.

On the right of the bar at the top of the conversation, the places are small stacked tiles: where the conversation
lives first, then what else it reads, two shown and **+1**, **+2** and so on for the rest. Rest the pointer on a tile to
read the place's name. Select the tiles, or the **▾** beside them, to open the places by name; select a place's name to open that place in the page. On a phone the same list
opens from the bottom of the screen. The conversation's own place comes first and cannot be removed.

1. Open the places and select **Add a place**, then choose a place. Only places you can open are listed.
2. Read the notice. It says that the agent will be able to read that place's knowledge and start work there, and that what
   it finds can reach the other places in the conversation.
3. Select **Add** and the place's name.

To take a place out, select **✕** beside it. It takes effect from the next message; work already started there carries on.
If you lose access to a place, it drops out of the conversation.

An agent cannot add a place itself. When it needs one, a card appears in the conversation: **Add a place to this
conversation**, with the place's name and the agent's reason. Select **Add** and the place's name to add it, or **Not now** to
leave it. Only the person in the conversation sees these buttons. If a question is about a place that is not in the
conversation, the agent says so and offers the card, rather than answering as if the place were empty.

Anything an agent finds can go into what it writes or hands on in the same conversation, so add only places you are happy to
have worked on together. See [Knowledge](../projects/knowledge.md#four-levels) for what each place's knowledge holds.

## Your space

**Your space** is in the side bar, under **Chat**. It is your own private place, the first of your
[personal projects](../projects/projects.md#personal-projects), and is drawn like a project, with the same menu less
what concerns a team:

- **Overview** and **Conversations**
- **Tasks**, **Boards**, **Runs**, **Routines** and **Automation**
- **Workflows** and **Skills**
- **Files**, **Artefacts** and **Knowledge**
- **Workspaces**, **Agents**, **Vault** and **Settings**

Its **Overview** shows your work and the agents on its list, with no lead and no people, and a **Personal projects**
card that lists your other personal projects. Its **Settings** has **General** (only its description), **Task types**,
**Custom fields**, and **Runs and finished tasks**; it has no **Delete**.

Its **Conversations** section is a list only; **New conversation here** starts one in the conversation beside the page. See
[Projects](../projects/projects.md#inside-a-project) for how a place's sections work.

Its **Agents** page is the list of agents that tasks and routines in your space can be given to. **Kernel** is on it from
the day your account is made. Select **Add** to put any agent in the organisation on the list, or **Remove** beside one to
take it off; only you change it. You can talk to any agent in the organisation in your space, on the list or not.

## When the agent has more to do

The agent does not make you wait for longer work. It tells you it has started, in a line, and you can carry on talking.
Above the message box a bar shows what is going on: **4 working**, or **4 working · 2 need you**. Select it to open the
list. Each row says what the work is and where it is happening, how it is going, and has **Stop**. When the work is
done, a card appears in the conversation, **View results** opens what it did, and the agent tells you what it found.

If you ask for a task to start at a time, such as tomorrow at 9, the agent sets it and says so; nothing more comes back to
the conversation about it.

## Long conversations

When a conversation grows too long for the agent to read in full, the older part is folded into a summary. A line
marks where, with what the summary covers; select it to read the summary and then the messages it covers. **Summarise now**
does it at once. The agent keeps what mattered, such as decisions and anything you asked it to remember, and can look back
at the full summary or the exact words when it needs to.

## When an agent asks to do something

When the agent wants to do something its permissions leave to a person, such as running a command, it asks. The request
appears in the conversation where it was asked, as a card that says in plain words what the agent asks to do, for which
place and why, such as *Writer asks to create team*. While it waits, a line above the message box says *Writer is waiting
for you*; **Show** brings the card into view.

- Select **Approve** to let it go on with what it asked for. *Only this, once* beside the buttons means that approving
  allows this one request and nothing more.
- Select **Deny** to refuse. You can say why (the box says *Say why, if you like*), and the agent reads it.

Once it is answered, the buttons go and the card says what happened, such as *You approved it · 06:31 PM*, or names who
answered. The request is also in **Notifications** under **Needs you** until someone answers it. Only the person having
the conversation can answer in a personal or project conversation. In a task's conversation, anyone who works in the
project can; anyone else sees the card without its buttons.

You decide what needs approval for each agent: see [Permissions and approvals](../agents/permissions.md).

## Next

[Your first task](first-task.md): give an agent work in a project, and see the result.
