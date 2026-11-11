/** What the harness's conversation says: a few exchanges before, and the long reply it streams. */
export const HISTORY: [string, string][] = [
  ['What does the thread do while a reply is written?', 'It follows the reply as it is written, so the newest words stay in view just above the message box.'],
  ['And if I scroll up to read something older?', 'Then it stops following at once and leaves the view exactly where you put it. The round arrow brings you back.'],
  ['Does voice change any of that?', 'Only where the line being read sits: a spoken reply keeps a few lines of room under it, so the words being said sit higher up, away from the box.'],
  ['What happens when the reply ends?', 'Its buttons appear under it, in room the thread already kept for them, so nothing on the screen moves.'],
]

export const REPLY = [
  'Here is how the follow should behave, from the moment you send to the moment the reply ends.',
  '',
  'While the reply is being written, the thread keeps its newest line just above the message box, with one line of room under it. That line of room is where the reply\'s buttons will appear, so when they do, nothing has to move. The view glides down as each line is written instead of stepping a line at a time, which is what made the earlier version feel jittery.',
  '',
  'A few things the follow never does:',
  '',
  '- It never moves the view while you are scrolling, and never pulls you back once you have scrolled up.',
  '- It never leaves a large empty space under the last line: scrolling to the end shows the reply, one line of room, and the usual gap above the box.',
  '- It never jumps when the reply ends, when its buttons appear, or when you switch between typed chat and voice.',
  '',
  'When the reply is spoken, the words being said are held three lines above the box instead, so you can read a little ahead of the voice. The view still glides, a little at a time, rather than lurching once per line. That room also leaves space for things that may later sit beside the words being spoken.',
  '',
  'Once the reply has ended and its buttons are in place, the thread rests with the usual gap above the box, the same gap as between two messages. Send again and the same thing happens: the follow picks up from where the view is and glides with the new reply. Scroll up at any point and it lets go; scroll back down to the newest line, or press the arrow, and it follows again from there.',
].join('\n')
