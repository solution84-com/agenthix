# Part 1 · The platform guide

Agents learn how Agenthix works from the user guide, the same text people read, built into hq's image so it always
matches the running version. Board: *3 · Platform knowledge*.

## One source

`docs/guide/` is already written for each release, page by page, for the words people use, and reviewed; it is
published at agenthix.com/docs from each release's tag. It is the only source of platform knowledge. `docs/concepts/`
is not used: it describes the code for maintainers, which would mislead an agent talking to a person.

Two things are added to the guide:

- **The glossary**, a new page `docs/guide/glossary.md`, useful to people too. One entry per word: what it is, where it
  is (the screen, and its address in hq), and what else people call it.

  ```markdown
  ## Your space
  Your own place: Chat, My tasks, and your own Files and Knowledge.
  Only you see it. Where: the top of the left panel (/chat).
  Also said: my space, personal space, my stuff.
  ```

- **One rule** in `docs/guide/README.md`: a new word a person might say goes into the glossary, as a new screen already
  needs its page.

## The tools reference

The build writes `tools.md` from hq's tool registry (`hq/src/shared/mcpTools.ts` and the schemas beside it): each
tool's name, what it does, and which kinds of run get it. It is never written by hand, so it cannot disagree with the
tools.

## Where it is made: our repository and CI

The only thing that crosses from our repository to an organisation's hq is **hq's image**: an organisation never builds
anything, and our CI never sees an organisation.

The build step is a stage of hq's image, so whatever builds hq's image builds it: the release rehearsal
(`scripts/release/prove.sh`) and the *Release build* workflow for a release, hq's dev start in development. It writes
`hq/assets/platform-guide/` (gitignored):

```
hq/assets/platform-guide/
├── index.json        every page: name, title, description; every glossary term
├── glossary.md       from docs/guide/glossary.md
├── tools.md          from hq's tool registry
└── pages/            every docs/guide page except README.md, images replaced by their text
```

It fails when a page has no description, the glossary doesn't parse, or anything other than these files lands in the
folder. Its tests run in hq's unit suite.

Two changes to CI so this holds:

- hq's image parts in `scripts/images/parts.json` gain `docs/guide/` as an input (today `core/`, `ui/`, `hq/`), so a
  guide change makes a new content key and a new image.
- The change map behind `scripts/affected.mjs` sends a guide change to hq's checks.

hq's image also gains the `ripgrep` package. The Fleet Console already builds its Help from `docs/guide/` the same way
(`console-web/src/pages/help/topics.ts`).

## Where it is used: inside an organisation's hq

hq holds the built guide in its image and answers from it; nothing is copied to sites or into runs. The platform
package (`hq/assets/platform/skills`) is not used for this and stays as it is.

The guide has **no tools of its own**. It is the `platform:` level of knowledge: `search_knowledge` searches it with the
organisation's and the places' knowledge, marking its hits `platform:your-tools/providers.md:12: …`, and
`read_knowledge("platform:your-tools/providers.md")` reads a page (part 3). It is read-only. Every `platform:` result
starts with *"This describes Agenthix. What you may do here is what your tools allow."*

## How an agent knows to look

No prompt line is needed for it. `search_knowledge`'s description, which every agent has, carries the trigger:

```
search_knowledge — Works like Grep, over everything known here: how this place and this
organisation do things, and how Agenthix itself works (its words, screens and settings).
Each match says where it is from. Use it before asking how something is done, and whenever
a person names a place, screen or setting you don't recognise, before asking them what they
mean.
```

The name "Agenthix" in descriptions and results is written from `BRANDING.displayName` (`core/src/naming/branding.ts`),
the constant the agent's identity line already uses, so a rebrand changes one constant and the guide's text, and no
identifier.

The glossary is not preloaded. If the model checks (part 6, V1) show agents still asking back, it goes into the
instructions (about 1,500 tokens, cached).

## Staying in step

| Risk | What prevents it |
|---|---|
| The guide describes another version | Built from the same commit as hq's image, and served by that hq |
| A site on another version | Irrelevant: hq answers, not the site |
| Tool documentation drifts | Generated from the registry; the registry's existing drift test covers it |
| A new screen ships without its words | The guide's rules ask for its page and its glossary words, checked in review |
| A page goes out of date | As for people: the guide's screenshots are regenerated each release and reviewed with the text |
