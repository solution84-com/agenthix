---
title: Voice
description: Set up speech for the organisation, choose an agent's voice, and talk to it in a conversation.
sidebar:
  order: 5
---

This page covers voice in **HQ**, your organisation's home in Agenthix: what an administrator sets up once, and how
you talk to an agent. Voice is a mode of the conversation you are already in, not a call screen of its own.

## Set up speech for the organisation

Voice needs a [provider](providers.md) that offers Hearing, turning what you say into text, and one that offers Speaking, giving the answer a voice. **Inworld**
does both, on one key: add it once and the organisation can talk to agents and hear them answer. **AssemblyAI** also
turns what you say into text, so it can hear people in Inworld's place or beside it, but it cannot speak. Setup's
AI step lists each provider with what it covers, so Inworld shows hearing and speaking together; add AssemblyAI too if
you want it to hear. Setup can also leave voice for later (see
[Set up your HQ](../getting-started/setup-hq.md#3-connect-ai)); an organisation admin can add or replace providers
under **Manage › AI**. Until something that hears and something that speaks are added, the voice button says
voice isn't set up.

When both Inworld and AssemblyAI are added, people are heard through Inworld unless an administrator chose AssemblyAI
under **Hearing**, because Inworld needs no second key. If the one that hears stops working, Agenthix moves to the
other and tells the organisation's admins. Dictation in the message box hears through the same two.

Under **Manage › AI**, in **What agents can do**, **Speaking** and **Hearing** choose the organisation's voice and the model that hears people,
and with it which provider hears: see [Models](models.md#the-organisations-defaults). **Hearing** says what choosing
Inworld costs: it hears about as well as AssemblyAI in our tests of clear English speech, but it can write spoken times
as digits ("ten past nine" as "10:09"). AssemblyAI is recommended for quality; Inworld is the one-key way. Voice is
always Inworld TTS 2, and the voice is chosen by ear from Inworld's own list. **Kernel**, the built-in agent, speaks in the voice setup chose for you.

Every agent has a voice. To give one agent a different voice or hearing model, an organisation admin opens its page in
**Manage › Agents** and changes **Speaking** under **Thinking, hearing and speaking**; see
[An agent's own models, hearing and speaking](models.md#an-agents-own-models-hearing-and-speaking).

## Talk to an agent

1. In a conversation with any agent, leave the message box empty and select the voice button at its right end. To
   start a new conversation by talking, select the voice button of the empty box that starts one (in Chat, or the
   draft beside the page).
   The conversation stays on screen: your words appear in your own message as you speak, and the agent's reply
   fills in as it is spoken, never ahead of the voice.

The voice button is greyed when voice cannot start, and its tooltip says why: no provider that hears or no provider
that speaks works for this agent, no model reaches the conversation, the page is not secure (see
[Install Agenthix](../getting-started/install.md)), or someone else is already using voice in the conversation. Select
the greyed button to see the reason written under the box.

There is one way of talking: hands-free.

### Taking turns

- **You finish by pausing.** Agenthix judges from how you sound whether you have finished or are only thinking, so a
  short pause to think does not end your turn. A pause of about three seconds always does.
- **While the agent works on its reply**, it says a few short words so the wait is not silent: "Mm." at once, then
  "Hmm, okay, let me think." and similar, less often the longer it takes.
- **While you talk at length**, the agent may say a quiet "mm-hm" in your pauses, to show it is following. It never
  interrupts you to do so.
- **If you trail off** mid-sentence, the agent does not answer half a thought: it encourages you to go on ("Mm? Go
  on."). What you say next joins your message, and the agent answers the whole of it.
- **If you add something** before the agent's reply has started, your words join the message you just sent, and the
  agent answers the whole of it.

### Interrupting the agent

Speak over the agent at any time. Its voice drops at once, and it stops when your words show you mean to speak: two
or more words of your own, or a stop word such as "stop", "wait" or "hold on". A short "mm-hm", "yeah" or "okay"
while it talks does not stop it. After a stop word, if you pause, the agent invites you to go on ("Yes?"). The
**Stop** button stops it too. The conversation keeps only the words you heard, up to the last one spoken.

### When an agent has news

If an agent has an update while you are talking, such as work it finished, it does not cut in. A soft chime sounds
and a raised hand shows on the voice controls. Select it, or say "go ahead" or "what is it", and the agent tells you
in a sentence. If nobody answers within a minute, the update appears in the conversation as text instead.

### If the agent hears itself

With speakers, the microphone can pick up the agent's own voice. Agenthix compares what the microphone hears with
what the agent is saying, and keeps the agent's own words out of your message. In a noisy room, or if a message
comes out with words you did not say, headphones help; you can also say it again or type it. If the connection to the
speech service falters, the voice controls show **Reconnecting…** for a moment, and nothing you said is lost.

## The message box

The message box is one rounded bar:

- The **plus** at its left holds the **model** for the conversation.
- The **microphone** dictates into the box. Your words appear as you speak them, and are corrected in place when the
  speech service tidies a sentence, so you can read, fix by typing and send. Nothing is sent by itself. Select it again,
  or **Send**, to finish.
- The button at the right is **voice** when the box is empty, **Send** when it has text, and **Stop** while the agent
  is answering and the box is empty.

While voice is on, the box keeps its two buttons and nothing sits outside it. The microphone becomes **Mute** (selected,
with a crossed-out microphone, while you are muted) and the button at the right becomes a round red **End the call**,
where the voice button was. When an agent has an update, a raised hand appears just left of **Mute**. The box stays
usable, so you can fix a misheard word by typing it; while there is text in the box the right button is **Send**, and
**End the call** comes back when the box is empty.

A line just above the box says what the agent is doing, with a small icon: **Connecting…** while voice starts,
**Kernel is listening** when it is your turn, **Kernel is thinking** while it works, **Kernel is speaking** while it
talks, and **Reconnecting…** if the speech connection drops for a moment. Being muted shows on **Mute** itself.

A call makes a few short, quiet sounds of its own: two rising notes when voice is ready to hear you, two falling notes
when it ends, a pair when you mute and unmute, and a low note if the connection drops. Nothing sounds while the agent
talks. You can turn them off: [Voice sounds](your-settings.md#voice).

## Leave the conversation and voice carries on

Go to another page and a slim bar at the top says what the agent is doing, as the line above the box does, how much
work is still going, **Mute**
and a round red **End the call**. Select the bar to return to the conversation. Ending the call, or closing the browser tab, while the agent is speaking keeps its reply only up to the last word you
heard, marked as interrupted, as when you talk over it. A reply the agent was still thinking about, with nothing written
yet, finishes as text in the conversation.

If nobody speaks for two minutes, voice ends, with a warning fifteen seconds before. The conversation shows a quiet
line when voice starts and when it ends, with how long it ran. If speech to text stops working, voice ends with a line
saying why and the conversation carries on by typing.

## Things that must be seen

When an agent needs to show a diagram, a table, code or a long list, it does not read it aloud. It says one sentence
about it, and the thing itself appears as a card in the conversation. Select **Open** on the card to read it beside the
conversation (in a sheet from the bottom on a phone). Voice does not stop while you read. Outside voice, the same
thing appears directly in the reply.

## The mobile app

The mobile app's voice still hears people through AssemblyAI only. An organisation with an Inworld key and no AssemblyAI
key can talk to agents in HQ, but not by voice in the mobile app, until AssemblyAI is added.

## Settings

Speech is set up by an administrator, and a pause is what ends your turn. Two settings are your own, in
[Settings](your-settings.md#voice): **Adaptive voice** (with **Hums** and **Expressive tone** under it) and **Voice sounds**.
