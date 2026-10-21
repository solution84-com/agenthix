---
title: Voice
description: Set up speech for the organisation, turn voice on for an agent, and talk to it in a conversation.
sidebar:
  order: 3
---

This page covers voice in **HQ**, your organisation's home in Agenthix: what an administrator sets up once, and how
you talk to an agent. Voice is a mode of the conversation you are already in, not a call screen of its own.

## Set up speech for the organisation

An administrator gives voice conversations their speech services under **Organisation › Settings › Voice**:

1. Under **Speech-to-Text**, **AssemblyAI** turns what you say into text. Under **Text-to-Speech**, **Inworld**
   speaks the answer.
2. Beside each, select **Add key**, paste the provider's key and select **Save Key**. Agenthix checks the key
   before it saves it. A saved key shows its start and **Active**; **Replace key** and **Remove** change it.
3. Once the AssemblyAI key is saved, adjust **Speech Model** and the other options below it, then select
   **Save Config**.

## Talk to an agent

1. An administrator turns on **Enable voice mode** in the agent's voice settings (**Organisation › Agents**,
   **Manage**), and chooses its **Voice** and **TTS model**. **Natural (inworld-tts-2)** sounds the most natural and
   is the default; with it, the agent's short spoken phrases (below) also sound relaxed and low.
2. In a conversation with that agent, leave the message box empty and select the voice button at its right end. To
   start a new conversation by talking, select the voice button of the empty box that starts one (in Chat, or the
   draft beside the page).
   The conversation stays on screen: your words appear in your own message as you speak, and the agent's reply
   fills in as it is spoken, never ahead of the voice.

The voice button is greyed when voice cannot start, and its tooltip says why: the agent has **Voice** off, the
organisation has no speech service set up, no model access reaches the conversation, or someone else is already using
voice in the conversation. Select the greyed button to see the reason written under the box.

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
**Stop** button stops it too. The conversation keeps only the sentences you heard.

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

While voice is on, **Mute** and **End** stand beside the bar and step aside when you start typing. The box stays
usable, so you can fix a misheard word by typing it. A ring around the bar and a glow behind the conversation show
who is talking: your colour for you, green for the agent, neutral while it listens, and dimmed while you are muted.

## Leave the conversation and voice carries on

Go to another page and a slim bar at the top shows the agent, who is talking, how much work is still going, **Mute**
and **End**. Select the bar to return to the conversation. Closing the browser tab ends voice; a reply that was still
being written finishes as text in the conversation.

If nobody speaks for two minutes, voice ends, with a warning fifteen seconds before. The conversation shows a quiet
line when voice starts and when it ends, with how long it ran. If speech to text stops working, voice ends with a line
saying why and the conversation carries on by typing.

## Things that must be seen

When an agent needs to show a diagram, a table, code or a long list, it does not read it aloud. It says one sentence
about it, and the thing itself appears as a card in the conversation. Select **Open** on the card to read it beside the
conversation (in a sheet from the bottom on a phone). Voice does not stop while you read. Outside voice, the same
thing appears directly in the reply.

## Settings

Voice has no settings of your own to choose. The tap, hold and trigger-word modes of earlier versions are gone, and so
is the **Voice** section of **Settings**: speech is set up by an administrator, and a pause is what ends your turn.
