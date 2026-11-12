---
created: 2026-11-11
description: The design of generated avatars and covers — what is saved, where it is drawn, the picker, the defaults, the robots, a small copy of every picture, deleting what is replaced, and removing the presets.
---

# Generated avatars and covers — design

## Today

- **31 preset pictures** are committed in hq (`hq/assets/avatars`, 16, 1 MB; `hq/assets/covers`, 15, 4.2 MB) and
  served straight from disk by `hq/src/server/presetHandlers.ts` on `/presets/:type` and `/presets/:type/:filename`.
  The set is not good enough for a release.
- **Picking a preset copies the file** into the agent's own images (`applyAgentPreset` in `hq/src/agents/actions.ts`,
  `applyAgentPresetOp` in `hq/src/server/controlplane/agentOps.ts`, the agent tools `list_presets` and
  `apply_agent_preset`), so an agent keeps its picture whatever happens to the presets.
- **Kernel has no picture**: it shows initials, as does every new agent until someone picks one.
- **An upload is scaled down in the browser and not cropped.** Three copies of the same code
  (`ui/src/agents/AgentManageHeader.tsx`, `hq/src/org/components/resizeImage.ts`,
  `hq/src/org/pages/people/pictureUpload.ts`) fit it inside 256 × 256 for an avatar and 1200 × 400 for a cover, as a
  JPEG. A picture of another shape is cut wherever the circle or band happens to fall, and a 256 px avatar is blurred
  when shown any larger.
- **An upload is written byte for byte** (`writeImageFromDataUrl`, `hq/src/server/imageUpload.ts`) after only its
  declared type and size are checked, so a photo keeps its metadata (a phone's photo carries where it was taken), and
  every place that shows it downloads the whole file, up to 5 MB.
- **A replaced picture stays on disk**: every picture is written under a fresh file name, and nothing deletes the old
  one.
- **People have no cover**; teams and the organisation have `avatarUrl` and `coverUrl`.

## The idea in one paragraph

An agent's picture is made by hq's own code from a **recipe**: a few dozen characters naming the style and its
choices — a character or a face drawn part by part, a symbol or initials, a background colour. hq turns the recipe into an ordinary
WebP file and stores it exactly where an uploaded picture goes today, so `avatarUrl` and `coverUrl` keep pointing at a
picture file and **nothing that shows a picture has to change** — hq's 130-odd places, the shared ui library,
notifications, the mobile app, the Fleet Console. The recipe is saved beside the file, so the picture can be edited
again. Uploading a picture still works and clears the recipe. Every picture, made or uploaded, is also kept as a small
copy for lists and cards.

**Explored and set aside:** a versioned *content pack* of curated pictures published apart from hq and downloaded at
install and upgrade (sound, but a curated set is not needed once pictures are generated); and *fetching pictures from
an outside service while hq runs*, such as Gravatar, which self-hosted products avoid because offline installs cannot
reach it and it tells the service who the users are.

## How it works

```
 picker (browser)                       hq server                                     storage
 ┌──────────────────────┐  recipe   ┌──────────────────────────────────┐  WebP  ┌─────────────────────────────┐
 │1 choices, Surprise   │ ────────► │2 validate the recipe             │ ─────► │4 /agents/{id}/images/       │
 │  me, a live preview  │           │3 draw: DiceBear → SVG,           │        │   {uuid}.webp        (full) │
 │  drawn by the same   │           │  or the cover generator → SVG;   │        │   {uuid}-small.webp         │
 │  code                │           │  sharp makes                     │        │5 Agent.avatarUrl = path     │
 └──────────────────────┘           │  the full and the small WebP     │        │  Agent.avatarRecipe = {…}   │
                                    └──────────────────────────────────┘        └─────────────────────────────┘
```

1. **The picker** draws its preview in the browser with the same pinned code, loaded only when the picker opens
   (code-split, so no other screen's bundle grows), and each style's code only when that style is chosen.
2. **Validation**: the recipe is checked against what the style allows — for a DiceBear style, its own option
   schema for that style; for a robot, that it is in the set, and Kernel's only for Kernel; colours from the palette. Anything else is refused.
3. **Drawing** runs on the server, with **sharp** (libvips; prebuilt for Linux on glibc and on musl, which hq's Alpine
   image uses, and for macOS; no build tools). A DiceBear style is
   `createAvatar(style, recipe).toString()` rendered from SVG; a robot is placed on its background colour; a cover is our generator's SVG rendered the same way.
   sharp writes the **full** picture (avatar 1024 × 1024, cover 1500 × 500) and a **small** copy (avatar 256 × 256,
   cover 600 × 200), both WebP.
4. **The files** are written through one picture-writing function shared with uploads (the storage root's containment
   check, as today), under a fresh uuid, so its address is its version. The small copy is `{uuid}-small.webp` beside
   it: a name the picture access check already accepts (`[a-zA-Z0-9_-]+\.webp`).
5. **The row** gets the full file's path and the recipe.

**Why a WebP file and not the SVG itself:** every consumer already handles a picture file, the mobile app cannot show
an SVG without an extra library, hq never serves an SVG it did not check, and the robots are pictures,
not drawings.

**Why the recipe names every part, not just a seed:** a library upgrade may map a seed to different parts. The stored
file never changes on an upgrade; the recipe, holding explicit parts, reopens in the picker as the same face. The recipe names every part
and every offset and rotation the style has; it also keeps a seed, which the style uses only for what the recipe does
not name (a style's own secondary colours, such as Thumbs' eyes).

### Uploads go through sharp too

Every upload is **decoded and written again by sharp**: as WebP at most 1024 × 1024 for an avatar and 1500 × 500 for a
cover, with its small copy beside it. This checks that the file really is a picture (today only its declared type is
checked), drops its metadata (a photo's location among it), and keeps a stored picture to a known size. sharp's input
pixel limit is set to what a 5 MB picture can reasonably hold, so a file built to expand enormously when decoded is
refused before it is.

### A small copy of every picture

A list of twenty agents should not download twenty full pictures to draw twenty small circles. A picture's link comes
from hq's `GET /file-link?path=…` (`hq/src/server/files/uploadLinks.ts`), which checks access and signs a ticket for one
file, which hq's relay then serves (ADR-0153). **`size=small`** on that request makes hq sign the ticket for the small
copy, `{uuid}-small.webp`, when there is one, and for the full picture when there is none. Avatars and covers in lists,
cards, the thread and notifications ask for the small one, through the shared avatar components rather than at each
call site; the **inspect view** — clicking an avatar on an agent's or a person's page opens it full size — asks for the
full one.

**Versions** (`docs/architecture/versioning.md`): `size` on `/file-link`, the recipes on the agent's, person's, team's
and organisation's views, and a person's `coverUrl` are optional additions, so the **client protocol moves one minor
version**. An app that sends no `size` keeps getting the full picture. The relay protocol does not change: the relay
serves the path the ticket names.

### The recipe (a stored format: `docs/architecture/versioning.md`)

```json
{ "v": 1, "kind": "avatar", "style": "robots", "styleVersion": 1,
  "choices": { "robot": "planner-checklist", "background": "lavender", "flip": false } }

{ "v": 1, "kind": "avatar", "style": "thumbs", "styleVersion": 1,
  "choices": { "parts": { "face": "variant3", "eyes": "variant2w12", "mouth": "variant4" },
               "shapeColor": "teal", "background": "lavender", "flip": false } }

{ "v": 1, "kind": "avatar", "style": "notionists", "styleVersion": 1,
  "choices": { "parts": { "hair": "variant23", "eyes": "variant02", "brows": "variant07", "lips": "variant11",
                          "nose": "variant03", "body": "variant15", "glasses": null, "beard": null, "gesture": null },
               "background": "lavender", "background2": null, "flip": false } }

{ "v": 1, "kind": "cover", "style": "patterns", "styleVersion": 1,
  "choices": { "colours": ["indigo", "teal"], "look": "soft", "blend": "linear", "direction": 135,
               "pattern": "topography", "seed": 2846 } }
```

The outer fields are hq's; `choices` belongs to the style alone (see *Room to grow*).

Colours are **names from a fixed palette**: for an avatar's background, 36 (18 hues, each as a soft tint and a mid
tone), one colour or a gradient of two; for a cover, 18 hues in three looks (soft, vivid, deep). The palette lives in
one file; a hex value appears nowhere else.

## The robots: a release asset of their own

The owner's set of robot pictures, made for Agenthix: glossy orbs, many holding a prop that suggests a role (a
checklist, a shield, a laptop, a palette, a book). **Nineteen** for agents, and a twentieth with a halo and a bow tie
that is **Kernel's alone**: never offered to another agent or picked at random, so whoever sees it knows they are
talking to the built-in agent, which can do what other agents cannot.

**No picture is committed to hq** (owner, 12 Nov). A binary stays in a repository's history for good — the presets'
5.2 MB will stay in it after this unit removes them. The robots travel as a **bundle**, published once as a release
asset and fetched when hq is built:

- **The bundle**, `robots-1`: the twenty pictures (1024 px WebP, transparent backgrounds, about 2 MB), a manifest
  of their names, and their licence. It is the asset of a release tagged `robots-1` in this repository — a tag the
  image-publishing workflow does not run on, so it never starts a product release. Publishing it is a maintainer's
  step on GitHub.
- **Pinned, not stored**: hq's source records the bundle's version, address and SHA-256, and nothing else of it.
- **Fetched and checked at build time.** The hq image build downloads the bundle, checks its SHA-256 and puts the
  pictures in hq's assets (`hq/assets/robots/`), so an installed hq has them offline and the signed image carries
  them. On a development machine one script does the same into the same folder, which is gitignored. While the
  repository is private, the download needs a GitHub token (CI's own, or the developer's `gh` login).
- **Missing robots never break hq.** Where the folder is empty — a fresh clone that has not fetched them, the test
  suites — the Robots category is hidden, a new agent gets a Thumbs character, and Kernel a fixed Thumbs look.
- **Names are permanent.** Each picture's file name is its name in a recipe, so a published name is never changed or
  removed. More robots are a new bundle, `robots-2`, and a new pin; a saved picture is a copy in the owner's images,
  so a new bundle never changes it.
- **Licence**: the robots are Agenthix's robot identities, so the bundle carries a notice that they may be used only as
  part of Agenthix (owner, 12 Nov). They are not under the code's licence, and the third-party notices say so.
- **The server** reads them from hq's assets to draw a picture; **the picker** loads them as files of its own
  code-split bundle, served by hq's web server like the rest of the client. No hq route sends them.
- **Names** (to confirm before `robots-1` is published):

  | Name | Shows | Name | Shows |
  |---|---|---|---|
  | `planner-checklist` | a planner with a glowing checklist | `developer-laptop` | a developer with a laptop and coffee |
  | `security` | a blue security robot | `coder-ide` | a coder with a holographic editor |
  | `data-analyst` | a purple data analyst | `artist-palette` | an artist with a palette and brush |
  | `analyst-specs` | an analyst orb in glasses | `knowledge-book` | a robot with an open book |
  | `researcher-data` | a researcher with holographic data | `learner-quill` | a learning robot with a quill |
  | `support` | a support agent | `gardener-sprout` | a robot tending a sprout |
  | `automation` | an orange automation robot | `mechanic-wrench` | a robot with a wrench |
  | `team-panel` | a robot with a holographic group panel | `blueprint-thumbs-up` | a robot with a blueprint, thumbs up |
  | `orange-glow` | an orange glowing orb | `cyan-thumbs-up` | a cyan robot, thumbs up |
  | `sparkle-badge` | an orb with a sparkle badge | `kernel` | Kernel's own: a halo and a bow tie |

- Later, not in this unit: a new agent could get the robot that matches its role.

## The defaults

- **A new agent** gets a **random robot on a random background** and a random cover when it is made; where the
  robots are missing (below), a random Thumbs character instead, plainly not a person either. The create-agent
  dialog shows them, with *Change* to open the picker; leaving them is the default. Agents made from a template or by an
  agent tool get random ones too. The recipe is saved, so renaming an agent never changes its picture.
- **Kernel** gets **its own robot** when hq is set up (a fixed Thumbs look where the robots are missing), and a
  random cover. It can be changed like any
  agent's picture.
- **People** keep their initials until they choose a picture. A person gets a **random cover** when they join, so
  their card is never an empty band (a new `coverUrl` on a person).
- **The organisation** gets a random cover and a **generated symbol** as its avatar when hq is set up: a random icon
  on a random palette colour (the Icons style). A symbol, not a face or a character: a face reads as a person, a
  character as an agent.
- **Teams** get a random cover and an **Initials** avatar in a random colour when made.
- An agent made before this change keeps what it has (clean slate: nothing is converted).

### Where a person's cover shows

People have no cover today, so nothing draws one. A person's page (*People › a person*) takes the same header as a
team's and the organisation's — the cover band, the avatar, the name — and a person's profile card shows the cover as
an agent's does (owner, 12 Nov). Their own *Settings › Profile* opens the picker.

### The demo's sample organisation

The demo's seed writes its rows directly (`hq/src/demo/seed/organisation.ts`), so it does not pass through the paths
that give a default. **The seed data names a recipe for each picture instead**, drawn through the picture module when
the demo is seeded, so the sample looks the same after every reset: each sample agent the robot that suits its role,
Kernel its own, the organisation its symbol and cover, every team its Initials and cover, every sample person a cover. A visitor gets a random
cover when they join, as any person does.

## The picker

**Approved by the owner: [`boards/picker.html`](boards/picker.html) (11 Nov) is the dialog, and
[`boards/picker-gallery.html`](boards/picker-gallery.html) (12 Nov, proposal B) is how its Avatar tab chooses among
the styles.** It opens from the agent's page (clicking its picture or cover; today a menu of Upload or a preset grid)
and from the create-agent dialog's *Change*.

A dialog with two tabs, **Avatar** and **Cover**. Each tab starts with a switch, **Generate** or **Upload**, so an
upload always knows which picture it is for. The page behind it does not change while someone is choosing: the dialog
has its own preview — the card, cover and avatar together, marked "not saved yet", showing both tabs' choices at once.
Beside the preview: **Surprise me** (a random choice within the current style), **Mirror**, **Start again** (back to
the saved picture) and **Remove** (below). *Save* applies both tabs; *Cancel* changes nothing.

### The Avatar tab: choose a look, then fine-tune it

The tab opens on a **gallery**: every style this subject may use, each drawn large on the subject's own name, under
its category's heading, with the current one marked. Choosing a look opens its **fine-tuning**, with **← All looks**
to go back. A style added later is a new tile; nothing else moves.

| Category | Styles | Offered to |
|---|---|---|
| **Robots** | the nineteen; Kernel's own, for Kernel only; hidden where the robots are missing | agents |
| **Faces** | Notionists, Notionists face only, Lorelei, Lorelei face only, Open Peeps, Thumbs, Pixel Art, Pixel Art face only | agents and people |
| **Symbols** | Icons, Shapes, Glass, Rings, Identicon | the organisation |
| **Initials** | Initials | agents, people, teams and the organisation |

The fine-tuning of each:

- *Robots:* a grid of the nineteen (for Kernel, its own first). A robot is placed at 116%, a little low, as on the approved board, so it
  fills the circle; the glow under it may be cut a little by the circle's edge.
- *A face or a symbol:* its parts as chips, each opening a grid of every option drawn on this subject's own picture,
  *None* first where the style allows a part to be left out; hair and skin colours where the style has them.
- *Initials:* the colours only.
- For all: the background, one colour or a gradient of two.

**Initials follow the name.** The recipe of an Initials picture holds its colours, not its letters, and hq draws it
again when the name changes, so a renamed agent, person, team or organisation never shows old initials. Every other style
keeps its picture through a rename.

### The Cover tab

Our own generator, so the set can grow at any time. Thirteen patterns and none (circles, waves, dots, stripes, grid,
rings, triangles, topography, blobs, confetti, zigzag, squares, sunburst), each with endless variations from its seed
(*Another of this pattern*); a look (soft, vivid, deep); two colours; a linear or radial blend; a direction.

### Upload: crop, then a small file

In either tab, **Upload** shows a drop area for that picture (*or choose a file*), saying what works best: avatar,
square; cover, wide, about 3 : 1. Any picture the browser can open is taken (PNG, JPEG, WebP, and a phone's HEIC
photo where the browser opens it); the size limit is on what is sent, not on the file chosen.

1. **Crop.** The picture opens under a frame of the shape it will be shown in — a circle for an avatar, a 3 : 1 band
   for a cover — with the outside dimmed. Drag to move it, zoom with the slider, the mouse wheel or a pinch, and
   **Reset** to fit it again. The arrow keys move it and + and − zoom, so it works without a pointer. The preview card
   shows the result as it changes. *Choose another* starts again.
2. **Compress in the browser.** On *Save*, the browser cuts out the frame, scales it to the stored size (avatar
   1024 × 1024, cover 1500 × 500, never enlarged) and encodes it as WebP, typically well under 300 KB. Only that is
   sent: the rest of the photo never leaves the person's device.
3. **The server re-encodes it** as every upload is (*Uploads go through sharp too*): the browser's work is a
   convenience, not a check.

The original is not kept; cropping again means choosing the file again. One shared crop-and-compress function replaces
the three copies that scale pictures down today; the setup's organisation step and the onboarding's *You* step use it
too, with the same crop.

The crop frame is `react-easy-crop` (MIT, about 8 KB compressed, loaded with the picker), pinned exactly.

### Who uses the picker

The same picker serves a person, a team and the organisation as well as an agent, each with its own categories in the
Avatar tab (a team's is Initials alone) and the Cover tab. It is hq's own component (`hq/src/shared/pictures/`), not the shared ui library: the Fleet
Console does not edit pictures. A failed save is the attention dialog with *Try again*, the picker still open with its
choices (the `handling-errors` skill).

### Removing a picture

**Remove** sits with the other buttons under the preview (Surprise me, Mirror, Start again), in both tabs and in Upload,
always in the same place. Its label says what it does — **Remove picture** (back to initials) or **Remove upload** (back
to a generated one) — and it is shown disabled, with a tooltip saying why, when there is nothing to remove (a generated
cover, a generated avatar of an agent or the organisation, initials). What a picture goes back to:

| Picture | Goes back to | How |
|---|---|---|
| An agent's avatar | a generated one — an agent always has a picture | **Remove upload** (shown with an uploaded avatar), then *Save*; with no recipe left, a random robot |
| Any cover (agent, person, team, organisation) | a generated cover — never an empty band | **Remove upload** (shown with an uploaded cover), then *Save* |
| A person's avatar | their initials | **Remove picture**, then *Save* |
| The organisation's avatar | a generated symbol | **Remove upload** (shown with an uploaded avatar), then *Save* |
| A team's avatar | its generated Initials | **Remove upload** (shown with an uploaded avatar), then *Save* |

Agents and people choose among the faces, the organisation among the symbols, and everyone may choose Initials.

### Replaced and removed files are deleted (privacy)

From this unit, **when a picture is replaced or removed, hq deletes the old file and its small copy** right after the
row is updated, so a person who removes their photo knows it is gone from hq. The row is updated first, so it never
points at a missing file; a delete that fails is logged and left to the sweep.

**A picture sweep** (one of hq's started sweeps, beside the archive and package sweeps in `hq/src/server/setup.ts`)
runs at start and once a day. It deletes every file in an agent's, a person's, a team's or the organisation's images
folder that no row names, and every images folder whose owner no longer exists. That covers a failed delete and
whatever is deleted — an agent, a person, a team — without each delete path having to remember its pictures. A file
written less than an hour ago is left alone, so a picture being saved is never swept from under its row.

A link to an old picture that hq's relay already handed out stops working once the file is gone.

### Making a picture costs the server

A recipe is a few dozen bytes, but saving one draws a picture and writes four files. So:

- **Saving a picture is rate-limited per person** (hq's existing rate limit): 30 a minute, generous for someone trying
  styles, which they do in the browser's preview without saving.
- **In a demo**, the bytes a saved picture writes count towards the visitor's storage budget
  (`hq/src/demo/guard/storageBudget.ts`), not the bytes of the request; every new operation goes through the demo's
  guard like the rest.

## Room to grow: more ways to show an agent

Drawn characters and faces are the first ways of showing an agent, not the only ones. Later there may be a **3D agent**
built from parts, with **emotes**: expressions for what it is doing (idle, thinking, speaking, waiting for approval,
pleased, stuck). **A future state, not this unit** (owner, 11 Nov). This unit builds only what its styles need
anyway — the registry, the recipe's shape, the still. No live form, no emotes, no 3D, and no empty hooks for them; the
points below say why the shape will take them later without rework.

- **A style is a plug-in, described in one place** (a registry in `hq/src/shared/pictures/styles/`). Each style
  declares: its id and kind (a picture set, parts drawn in 2D, later a 3D model), the schema of its choices and how
  they are validated, how it renders a **still**, its panel in the picker, and — later — which emotes it can show. The
  picker's style row, validation and rendering all read the registry; nothing else names a style.
- **The recipe keeps a style's choices to itself**: `{ v, kind, style, styleVersion, choices }`. hq stores and passes it
  without looking inside; only the style reads `choices`. A new style is a new entry, never a new column or a change
  to the format.
- **Two outputs, one of them always there.** Every style produces a **still** (the WebP file and its small copy), which
  everything that shows a picture keeps using: lists, notifications, the mobile app, the Fleet Console. A style may also
  offer a **live** form, drawn in the browser where there is room for it — the agent's page, the voice reading room.
  Where a style has no live form, the still is shown.
- **Emotes come from the agent's state**, which hq already knows (working, speaking, waiting for approval, an error).
  A style that has emotes maps each state to one; a style without them shows its still. A picture set could gain
  emotes as further pictures of each one (thinking, pleased, stuck).
- **A style whose still is hard to make on the server** (a 3D model needs a graphics context) can make it in the
  browser when the picture is saved; hq then checks and stores it like an upload, with the recipe beside it.

## Agent tools

`list_presets` and `apply_agent_preset` go. In their place, **`generate_agent_picture`** `{ agentId, imageType:
'avatar' | 'cover', recipe? }`: with no recipe it makes a fresh random one; with one, it validates and makes that. Its
role floor and connection group are `apply_agent_preset`'s (`manage`). The coordinator's step label follows. The agent
tools are not a versioned connection, so the two tools are removed without a deprecation mark.

## What is removed

- The 31 committed preset pictures (`hq/assets/avatars`, `hq/assets/covers`).
- `hq/src/server/presetHandlers.ts`, its test, and its two routes in `hq/src/server/setup.ts` and
  `hq/src/server/__tests__/routeInventory.test.ts`.
- The `applyAgentPreset` action (`hq/src/agents/actions.ts`, `hq/src/agents/agents.wasp.ts`) and `fetchPresets` and
  its wiring in `hq/src/agents/pages/manage/AgentManagePage.tsx`; `presetSrc` in `ui/src/agents/helpers.tsx`; the
  preset grid in `ui/src/agents/AgentManageHeader.tsx`.
- The two tools: `hq/src/server/controlplane/agentOps.ts`, `operations.ts`, `connectionGroups.ts`,
  `toolSchemas.ts`, both tool lists (`hq/src/shared/mcpTools.ts`, `ui/src/agents/mcpTools.ts`), the coordinator's step
  labels (`hq/src/conversations/coordinator/replySteps.ts`).
- Their tests: `presetOps.integration.test.ts`, and the preset cases of `agentImage.integration.test.ts`,
  `agentImageStorage.integration.test.ts` and `agentActionFloors.integration.test.ts`.
- The guide's and the QA contract's lines about presets (SC-046 is rewritten for generated pictures).

The *permission* presets (`ui/src/agents/permissions/`, `permissionPresets.ts`) share the word and are untouched.

## Dependencies

All pinned exactly in `hq/package.json`:

- `sharp` (Apache-2.0; bundles libvips, LGPL-3.0, as a separate library) — rendering, resizing, re-encoding uploads,
  WebP. hq's first native module: the server bundle already leaves `node_modules` outside it, and the hq image is built
  and started in the full regression on both of its platforms.
- `@dicebear/core` (MIT) and fourteen style packages, every one public domain (CC0) or MIT, so none needs a credit
  where a picture is shown: `notionists`, `notionists-neutral`, `lorelei`, `lorelei-neutral`, `open-peeps`, `thumbs`,
  `pixel-art`, `pixel-art-neutral`, `shapes`, `glass`, `rings`, `identicon`, `initials` (CC0 artwork), `icons` (MIT).
  About 2.4 MB in the server image; the browser loads only the style someone opens, 1.3 to 117 KB compressed.
- The third-party notices list sharp and libvips with their licences, include the MIT notices of DiceBear, `icons`
  (with Bootstrap Icons') and `initials`, and credit the illustrators of the CC0 styles.
- **The robots bundle**, `robots-1` (below): fetched and checked at build time, not an npm package.
- `react-easy-crop` (MIT) — the crop frame for uploads; about 8 KB compressed, loaded with the picker.
- DiceBear's styles under CC BY 4.0 or their own terms are not offered; adding one is a question for its licence first.

## Schema

`avatarRecipe Json?` on Agent, User, Team and Org; `coverUrl String?` on User (new: a person's cover); `coverRecipe Json?` on
Agent, User, Team and Org. Pre-release, so a plain additive migration; nothing is filled for existing rows.

## The owner's decisions (11 and 12 Nov)

1. A new agent starts with a **random robot** on a random background; Thumbs where the robots are missing; the
   faces are offered in the picker too.
2. **Kernel** has its own robot (the halo and bow tie), never given to another agent; Kernel's picker offers it first.
3. **No picture is committed to hq** (owner, 12 Nov): the robots, Kernel's included, are a release asset of their
   own, fetched and checked when hq is built.
4. **People** keep their initials until they pick an avatar; they get a random cover when they join.
5. **Agents** get a random avatar and cover at creation, shown with the picker in the create-agent dialog, kept unless
   changed.
6. **Teams** get a random cover and Initials in a random colour. **The organisation** gets a random cover and a
   generated symbol as its avatar (owner, 12 Nov).
7. The picker as on `boards/picker.html` is the **approved design**: its own preview, the page changes
   only on *Save*.
8. The unit **blocks 0.1.0**.
9. Upload is inside each tab (Generate or Upload), so an upload knows whether it is the avatar or the cover.
10. **Removing**: a person's avatar goes back to their initials (*Remove picture*); an agent's, a team's and the
    organisation's avatar and every cover go back to a generated one. **Replaced and removed files are deleted from hq** — a privacy
    rule.
11. **Room to grow**: leave room for more ways to show an agent — a 3D agent with emotes — so the styles are plug-ins,
    the recipe keeps a style's choices to itself, and a still is always there.
12. **The demo's sample** has a picture everywhere: the seed names a recipe for each agent, the organisation, each
    team and each sample person, the same after every reset (owner, 12 Nov).
13. **Every public-domain and MIT style DiceBear has is offered** (owner, 12 Nov): eight faces for agents and people,
    five symbols for the organisation, and Initials for everyone, as on the styles board.
14. **The Avatar tab is a gallery of looks, then fine-tuning** (owner, 12 Nov: proposal B on
    `boards/picker-gallery.html`).
15. **Uploads are cropped and compressed in the browser** before they are sent (owner, 12 Nov): a circle or 3 : 1
    frame to drag and zoom, then WebP at the stored size.
16. **The robots are Agenthix's alone** (owner, 12 Nov): published with the bundle under a notice that they may be
    used only as part of Agenthix, since they are its robot identities.
17. **A person's cover shows** in a header on their page and on their profile card (owner, 12 Nov).

Decided on evidence when the unit opened (12 Nov): a WebP file plus the recipe; drawn on the server with sharp,
previewed in the browser; a small copy of every picture, uploads included, chosen by `size=small` on `/file-link`;
every upload cropped and compressed in the browser and re-encoded on the server; Icons as the organisation's default symbol; a fixed palette of named colours; one agent tool in place of two; a picture sweep for what is replaced or deleted; a rate limit on saving a
picture.
