# Backlog

Items noticed during development that are out of scope for the current branch.

## Rules
- Add when you notice something out of scope — `[P1|P2|P3] **YYYY-MM-DD** description — why it matters`
- Remove when done — no archive, git log is the history
- Order by priority — P1 at the top, P3 at the bottom
- One entry per concern — if it needs more than 2 lines, write a design doc instead

Priority guide:
- **P1** — causes bugs or confusion in active development
- **P2** — worth doing soon, mild ongoing cost if ignored
- **P3** — nice to have, low urgency

---

- [ ] [P2] **2026-04-24** STT presets — acoustic params (`vad_threshold`, `u3_rt_pro_vad_threshold`, `end_of_turn_confidence_threshold`, `min_end_of_turn_silence_when_confident`, `max_turn_silence`) are speaker/environment-specific, not platform config; introduce a `Preset` model so users can save named STT configs (e.g. "Noisy room", "Fast speaker") and select one at session start; hardcoded defaults in `DEFAULT_STT_CONFIG` are the baseline until this lands
- [ ] [P2] **2026-04-22** Extract `sitePaths.ts` from `workspaceService.ts` — file has drifted into a catch-all paths module used across `server/`, `wiki/`, `library/`, and `settings/`; split pure path helpers from the workspace sandbox class and `provisionAgentWorkspace`
