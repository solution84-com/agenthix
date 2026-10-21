---
created: 2026-08-19
description: Bringing every Accepted decision record back into agreement with the code, and deciding what to do when one has drifted.
---

# ADR State Integrity — Design

**Related:** `adr-0053` (Proposed, unaffected), and the maintainers' decision-record rules.

---

## 1. The problem

The decision-record migration of 2026-08-19 normalised every record onto the maintainers' five record states. It verified that records marked `Accepted` had **shipped**. It did not verify that they are **still true**.

Those are different questions, and one record proved it. `adr-0011` was marked superseded by `adr-0009` and was not: its decision — stream to a session room over Socket.io — is exactly what the code does today. Only the emitter moved. The wrong state had stood since before the migration, and the migration preserved it, because a sweep can normalise vocabulary but cannot test whether the old claim was true.

A spot check of 12 of the 29 Accepted records then found three more that the code contradicts. **The `Accepted` state currently means "shipped at some point", not "describes the system".** A reader cannot tell the two apart, which is the property that makes a decision log worth keeping.

## 2. What the audit found

Confirmed against code:

| Record | Says | Code |
|---|---|---|
| `adr-0022` | *"MCP is removed from the Site. The Site no longer runs an MCP server."* | `site/src/server/mcp/mcpServer.ts`; `site/main.wasp` declares `api mcpApi` on `POST /mcp` |
| `adr-0027` | Author fields identify **the agent**, written once into `.git/config` **by the Site**, plus a trailer block linking to the run | `hq/src/storage/repoOps.ts` passes `-c user.name=Agenthix` per command. Generic identity, wrong side, no trailers |
| `adr-0026` | *"two HTTP endpoints on the Site backend"* for artifact serving and config editing | The Site declares three endpoints, none of them file serving; `hq/src/server/fileServingHandlers.ts` does it |

`adr-0022` is the most serious, because `adr-0020` is still Accepted and routes task delegation through a `create_task` **MCP tool** — one live record depends on a capability another live record says was deleted.

Verified as holding: `adr-0001` (call site moved to `runLaunch.ts`, substance intact), `adr-0005`, `adr-0009`, `adr-0011`, `adr-0017`, `adr-0019`, `adr-0020`, `adr-0035`.

**Not yet checked: 17 records** — `adr-0004`, `0025`, `0030`, `0031`, `0032`, `0036`, `0037`, `0039`, and the `0040`–`0051` block. The recent block was verified as shipped during the migration, which `adr-0011` shows is not the same test.

## 3. The decision this needs — what to do with a drifted record

**An Accepted record may not be revised.** That is the maintainers' freeze rule, and it is not negotiable here: a record that may have been built against cannot be quietly rewritten to match what the code became, or the log stops being evidence of anything.

So a drifted record cannot simply be corrected. Each one needs a disposition, and the choice of disposition is what this spec exists to settle:

| Disposition | Fits when | Cost |
|---|---|---|
| **Supersede** — write a new record stating what is actually true, point the old one at it | The decision genuinely changed and the new position is worth recording | A new ADR per drift. Possibly 5–10 records |
| **Deprecate** | The decision stopped applying and nothing replaced it | Cheap, but wrong wherever something *did* replace it — which is most of these |
| **Annotate in place** | The decision holds and only a detail moved, as with `adr-0011` | Cheapest and honest, but only for partial drift |

The three found so far are not the same shape. `adr-0022` was genuinely reversed and needs a superseding record. `adr-0026` and `adr-0027` look closer to relocation and degradation — the intent survives, the implementation moved or fell short.

**The open question is whether degradation counts as drift in the record or as a defect in the code.** `adr-0027` specifies per-agent commit authorship and trailers; the code attributes every commit to a generic "Agenthix" identity. Either the record is stale, or the code is wrong and the record is a live requirement nobody met. The disposition differs completely, and it cannot be decided from the record alone.

## 4. The state being aimed at

Once §3 is settled:

- Every Accepted record has been read against the code within this unit, and the reading is recorded.
- Every drift has a disposition applied — superseded, deprecated, or annotated — and no Accepted record contradicts the system.
- Where drift turned out to be a code defect rather than a stale record, it is filed as work rather than papered over by editing the record.
- The index reflects all of it.

**What is deliberately not in scope:** re-auditing the *Proposed*, *Rejected*, *Superseded* and *Deprecated* records. Only `Accepted` claims to describe the present.

## 5. Why this will not simply recur

Closing a unit now requires it to name the records it implements and revisits, and to write the implementation note at close. That closes the loop **going forward** — `adr-0022` drifted because the split brought MCP back and no unit was obliged to notice.

It does nothing for records that drifted before the instrument existed, which is what this unit is for. This is a backfill, and it should not need doing twice.
