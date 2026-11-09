/**
 * Every threshold, duration and mark voice decides by, in one versioned object (adaptive voice spec, How it is
 * built and tested). The live harness tunes it, tests pin it, and the event log records which version ran. The
 * values are the spec's starting values, with those the recordings measured; measurement replaces them.
 */

export type VoiceSettings = {
  version: number
  /**
   * The person's Adaptive voice (voice that stays in the conversation, spec §1), given as voice starts: what the
   * agent adds beyond speaking its reply. Off: no listening sounds and no standard acknowledgement; a turn hq
   * says was held is still held. It is only what the agent adds: how the turn is ended (the turn model) and
   * telling the person's voice from the agent's (the echo handling) do not depend on it.
   */
  adaptiveVoice: boolean
  /** Acoustic: silence detection's settings in a quiet room, and while the agent speaks. */
  detector: { onThreshold: number; offThreshold: number; minVoiceMs: number; minSilenceMs: number }
  detectorWhileAgentSpeaks: { onThreshold: number; minVoiceMs: number }
  /**
   * Acoustic: the level gates silence detection applies on top of the confidence (`acoustic/voiceGate.ts`). While
   * the agent plays, a frame is voice only at `echoRatio` times the echo expected; with other voices in the room,
   * only at `roomRatio` times the room's median loudness.
   */
  gate: {
    echoRatio: number
    roomRatio: number
    /** What playback sent this long ago can still be arriving at the microphone. */
    echoDelayMs: number
    /** The echo path's gain is learned from this much of the agent's audio, once there are this many frames. */
    gainWindowMs: number
    minGainFrames: number
    roomWindowMs: number
    /** How long after the agent's last audio the microphone may still hear it. */
    agentTailMs: number
    /** Playback quieter than this (a gap between sentences) teaches nothing about the echo path. */
    minPlayedAmp: number
  }
  /** Acoustic: the room monitor's window, and the levels it labels the room by (dB relative to full scale). */
  room: {
    windowMs: number
    levels: {
      /** Below this confidence a frame holds no voice, and is the room's own sound. */
      noVoiceBelow: number
      /** At or above this confidence a frame holds a voice. */
      voiceFrom: number
      /** A floor (the quietest fifth of the frames) at or above this is steady noise. */
      steadyFloorDb: number
      /** The loudest tenth this loud, and this far above the floor, is intermittent noise. */
      burstDb: number
      burstSpreadDb: number
      /** Wind: a floor this loud, the sound this dark, and swelling as much as a burst. */
      windFloorDb: number
      windBrightness: number
      /** Other voices: less than this share of frames without voice over three windows, the voice quieter than this. */
      otherVoicesNoVoiceShare: number
      otherVoicesBelowDb: number
    }
  }
  /**
   * Acoustic: the echo check reads every `readingMs` over the last `windowMs`, and hears no echo below `silentDb`;
   * the Adapter is strict above `strictAbove`, and suggests headphones above `headphonesAbove`.
   */
  echo: { strictAbove: number; headphonesAbove: number; windowMs: number; readingMs: number; silentDb: number }
  /** Acoustic: the Adapter's changes for the room, and how long each is tried. */
  adapter: {
    trialMs: number
    /** Voice shorter than this, while the agent is silent, counts as a burst. */
    burstMs: number
    /** Added to the minimum voice for intermittent noise and wind. */
    longerMinVoiceMs: number
    /** The minimum silence with other voices in the room. */
    otherVoicesMinSilenceMs: number
  }
  /** Acoustic: the headphones advice is given after `afterMs` of its reason, and withdrawn after `clearAfterMs` without. */
  advice: { afterMs: number; clearAfterMs: number }
  /** STT and the inbound loop. */
  inbound: {
    queueLimitMs: number
    /**
     * A connection whose words run this far behind is replaced at the next pause, at once at twice it. Well above the
     * service's usual 1 to 1.5 s: each replacement costs a second to open and sends again what was not yet heard.
     */
    replaceAboveLagMs: number
    /** A send queue holding more than this goes out `catchUpRate` times the pace of speech until it is caught up. */
    catchUpAboveMs: number
    catchUpRate: number
    prerollMs: number
    /**
     * After an idle connection, how much audio before silence detection says voice goes to the fresh one: detection
     * can confirm a voice only from its second word, when the first is short or quiet.
     */
    wakePrerollMs: number
    /**
     * After this much silence is sent, once the connection has heard what came before, it is closed; the next
     * speech opens a fresh one. Never a gap in the audio mid-connection: a gap made the service go quiet for
     * 20–40 s with no error.
     */
    idleAfterSilenceMs: number
    /** A connection has heard what was said before a pause once its words reach this close to the last speech sent. */
    caughtUpMs: number
    /**
     * READY sends once STT's words reach this close to the end of the voice. Tighter than `caughtUpMs`: the last word
     * often follows the one before with no gap, so a looser margin sends without it.
     */
    readyHeardMs: number
    /** How much longer than its lag a connection is given, in a pause, to hear what came before it. */
    catchUpGraceMs: number
    /**
     * Audio handed to the connection that it has not taken beyond this: the rest waits in the queue. Room for a
     * message being gathered (`MESSAGE_MS`) and one on its way.
     */
    slackMs: number
    connectTimeoutMs: number
    /** A failed attempt is retried after this, times the failures in a row. */
    retryMs: number
    /** Failures in a row, with no words heard between them, before speech to text gives up. */
    failuresBeforeFailed: number
    /** Audio kept for a replacement, at most; also the send queue's backstop. */
    keepMs: number
  }
  /** Semantics: when the pause timer asks the turn model, how long it waits, and the decision rule. */
  pause: {
    /** The turn model is asked once, at this much silence, with the speech and this much silence after it. */
    scoreAtMs: number
    marksMs: number[]
    capMs: number
    /** No score this long after asking: the fallback decides. */
    modelTimeoutMs: number
    /** At each mark: READY at or above `ready`; KEEP_LISTENING at or below `keep` (null: never); otherwise UNCERTAIN. */
    rule: { atMs: number; ready: number; keep: number | null }[]
  }
  /** Orchestration: the floor goes back to open after the pause cap and this, with no message sent. */
  floor: { pauseGraceMs: number }
  /** Orchestration: barge-in. */
  bargeIn: {
    duckDb: number
    duckRampMs: number
    confirmWindowMs: number
    unclearExtraMs: number
    resumeRampMs: number
    ownWordsToStop: number
    stopWords: string[]
    acknowledgements: string[]
  }
  /**
   * Orchestration: the hand-raise. At most `maxWaiting` updates wait; a hand nobody invites within `unansweredMs`
   * is let go, in the browser and in hq, and its update takes its turn as text.
   */
  handRaise: { openingMs: number; invitations: string[]; maxWaiting: number; unansweredMs: number }
  /** The outbound loop. */
  outbound: { sentencesAhead: number }
  /**
   * The stored wait phrases, in the agent's voice, which hq makes once per voice and sends as voice starts: tiers,
   * the shortest first. A tier with no phrases of its own says a mix: one of `mix.openings` and one of `mix.endings`,
   * `mix.perSession` of them made as voice starts, each opening and ending in only one. They are kept for the standard
   * acknowledgement.
   */
  filler: {
    steps: { phrases: string[] }[]
    mix: { openings: string[]; endings: string[]; perSession: number }
  }
  /**
   * Orchestration: the standard acknowledgement (voice that stays in the conversation, spec §1 "Slow or failed
   * calls"): once, when a message was sent and by `ceilingMs` no reply has started and hq has not said the turn was
   * held, one stored phrase of `tier` (or the nearest tier that has any) covers the wait. None of the last `recent`
   * said is said again while another can be.
   */
  standardAcknowledgement: { ceilingMs: number; tier: number; recent: number }
  /**
   * Orchestration: the listening family (voice that stays in the conversation, spec §3), stored clips in the agent's
   * voice in three tiers: `hums` anywhere, `acknowledging` words only while the person is telling or explaining, and
   * `invitations` to go on. A hum or an acknowledging word plays in a pause of `humAfterPauseMs` where what was
   * heard ends in punctuation (any pause once `longestWaitMs` has passed since the last sound), once they have spoken
   * `afterSpeechMs` (counted across messages hq held); at least a random gap of `minGapMs` to `maxGapMs` after the last
   * sound of the family. It does not wait for a model's ruling on the pause, and a hum is
   * left to finish if they go on. Where their last words end mid-clause, or are a question or request, only a hum plays. An invitation plays once the
   * person has been silent `invitationAfterStopMs` after a stop word, or `invitationAfterHoldMs` after hq held their
   * turn, never closer than `minGapMs` to the last. None of the last `recent` played is played again; every clip is
   * `gainDb` to the reply.
   */
  listening: {
    afterSpeechMs: number
    /** How long a pause lasts before a hum or word may play in it: a breath, not a stop. */
    humAfterPauseMs: number
    minGapMs: number
    maxGapMs: number
    longestWaitMs: number
    gainDb: number
    recent: number
    invitationAfterStopMs: number
    invitationAfterHoldMs: number
    hums: string[]
    acknowledging: string[]
    invitations: string[]
    /**
     * How each tier's clips are spoken, on the speech models that take a direction. Text `i` of a tier is made in
     * `tonesPerText` directions, starting at direction `i` and stepping by three round the list, so neighbours differ and
     * the same words come in different tones.
     */
    directions: { hums: string[]; acknowledging: string[]; invitations: string[] }
    /** How many of those directions each text is made in: a text and a direction are one clip, so the same words come in different tones. */
    tonesPerText: number
  }
}

export const VOICE_SETTINGS: VoiceSettings = {
  version: 1,
  adaptiveVoice: true,
  detector: { onThreshold: 0.5, offThreshold: 0.35, minVoiceMs: 250, minSilenceMs: 150 },
  detectorWhileAgentSpeaks: { onThreshold: 0.7, minVoiceMs: 250 },
  gate: {
    echoRatio: 2.5, roomRatio: 3, echoDelayMs: 500, gainWindowMs: 3_000, minGainFrames: 6, roomWindowMs: 6_000,
    agentTailMs: 300, minPlayedAmp: 0.003,
  },
  room: {
    windowMs: 2_000,
    levels: {
      noVoiceBelow: 0.15, voiceFrom: 0.5, steadyFloorDb: -38, burstDb: -36, burstSpreadDb: 6, windFloorDb: -38,
      windBrightness: 0.002, otherVoicesNoVoiceShare: 0.1, otherVoicesBelowDb: -38,
    },
  },
  echo: { strictAbove: 0.2, headphonesAbove: 0.5, windowMs: 1_500, readingMs: 256, silentDb: -60 },
  adapter: { trialMs: 20_000, burstMs: 600, longerMinVoiceMs: 150, otherVoicesMinSilenceMs: 300 },
  advice: { afterMs: 3_000, clearAfterMs: 30_000 },
  inbound: {
    queueLimitMs: 1_000, replaceAboveLagMs: 4_000, catchUpAboveMs: 200, catchUpRate: 2, prerollMs: 300, wakePrerollMs: 800, idleAfterSilenceMs: 3_000, caughtUpMs: 200, readyHeardMs: 50,
    catchUpGraceMs: 1_000, slackMs: 200, connectTimeoutMs: 5_000, retryMs: 500, failuresBeforeFailed: 3, keepMs: 10_000,
  },
  pause: {
    scoreAtMs: 200,
    marksMs: [500, 1_000, 2_000],
    capMs: 3_000,
    modelTimeoutMs: 300,
    rule: [
      { atMs: 500, ready: 0.85, keep: null },
      { atMs: 1_000, ready: 0.8, keep: 0.3 },
      { atMs: 2_000, ready: 0.5, keep: 0.2 },
    ],
  },
  floor: { pauseGraceMs: 1_000 },
  bargeIn: {
    duckDb: 15,
    duckRampMs: 50,
    confirmWindowMs: 1_500,
    unclearExtraMs: 1_000,
    resumeRampMs: 300,
    ownWordsToStop: 2,
    stopWords: ['stop', 'wait', 'hold on', 'hang on', 'no'],
    acknowledgements: ['mm-hm', 'mhm', 'uh-huh', 'yeah', 'yes', 'okay', 'ok', 'right', 'got it', 'sure'],
  },
  handRaise: { openingMs: 2_000, invitations: ['go ahead', 'what is it', 'yes'], maxWaiting: 8, unansweredMs: 60_000 },
  outbound: { sentencesAhead: 2 },
  filler: {
    steps: [
      { phrases: ['Mm.', 'Hmm.', 'Mm-hm.', 'Okay.', 'Right.'] },
      { phrases: [] },
      { phrases: [] },
      { phrases: ['Still working on it.', 'Thanks for waiting, nearly there.', "Sorry, this one's taking a little longer.", 'Still with you, almost done.'] },
    ],
    mix: {
      // Calm ones only: "Alright," and "Sure," came out loud and bright, which breaks the person's train of thought.
      openings: ['Okay,', 'Mm, okay,', 'Right,', 'Ah, okay,', 'Understood,', 'Hmm, okay,'],
      endings: [
        'one moment.', 'give me a second.', 'let me think.', 'just a sec.', 'bear with me.', 'on it.', 'let me work that out.',
        'thinking it through.', "won't be long.", 'let me pull that together.',
      ],
      perSession: 6,
    },
  },
  // The mixes ("Okay, bear with me."): a short word says too little for a wait this long.
  standardAcknowledgement: { ceilingMs: 4_000, tier: 1, recent: 5 },
  listening: {
    afterSpeechMs: 8_000,
    humAfterPauseMs: 300,
    tonesPerText: 1,
    minGapMs: 10_000,
    maxGapMs: 25_000,
    longestWaitMs: 30_000,
    gainDb: -6,
    recent: 6,
    invitationAfterStopMs: 2_000,
    invitationAfterHoldMs: 4_000,
    // Short sounds, each written several ways and at a rising or falling note, so the speech service makes different takes:
    // a hum is half a second to a second, said under the person. Nothing long: it is said over them.
    // What people say to encourage someone to go on, spoken plain: under half a second to a bit over, nothing that answers or
    // judges what was said, no question marks and no "Um" (they came out wrong). Chosen by ear.
    hums: ['Mm-hm.', 'Mm-hmm.', 'Mhm.', 'Uh-huh.', 'Uh huh.', 'Ah-huh.', 'Hmm.', 'Hm.', 'Mm.', 'Aha.'],
    acknowledging: ['I see.', 'Right.', 'Okay.', 'Got it.', 'Yep.'],
    // Spoken plain, like the rest: no question marks (they came out wrong).
    invitations: [
      'Go on.', "I'm listening.", 'Take your time.', "Whenever you're ready.", 'Go ahead.', 'Carry on.', "I'm here.", 'Keep going.',
      'No rush.', 'Please, go on.', 'Tell me more.', 'Say more.', 'Mm, go on.',
    ],
    // Everything is spoken plain, with no direction: steering gave the hums sudden ups and downs and made "Say more." breathy.
    // An empty direction is no direction.
    directions: {
      hums: [''],
      acknowledging: [''],
      invitations: [''],
    },
  },
}
