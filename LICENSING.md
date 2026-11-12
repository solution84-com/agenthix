# Licensing

Agenthix is **source-available**: its code is public, and you may use it under the
[Elastic License 2.0](LICENSE), with the additional permission below. It is not open source in the sense of the Open
Source Definition, because the licence restricts one kind of use. The licensor is Solution84.

This page is a plain summary. The licence text in [`LICENSE`](LICENSE) is what applies.

## What you may do

- **Run Agenthix for your own organisation**, free, whatever its size or business — a person, a team, a company.
- **Read, change and build on the code**, and keep your changes for yourself or share them.
- **Copy and share it**, as long as the licence and its notices go with every copy.
- **Help others with it** — consulting, integration, training, support — and charge for that work.
- **Run a client's own Agenthix for them**, under the additional permission below.

## What you may not do

- **Offer Agenthix to others as a hosted or managed service** — running it so that people outside your
  organisation use it, free or paid.
- **Get around the licence-key checks** for features that need a key, or remove them.
- **Remove or hide** the licensing, copyright or other notices.

The licence gives no right to the Agenthix name or logo: a changed version must not be presented as Agenthix.

## Additional permission

In addition to the rights granted by the Elastic License 2.0, you may install, operate, administer and support the
software on behalf of a person or organisation that holds its own licence to it and uses it for its own purposes, and
you may charge for that work, provided the software is not provided to anyone else as a hosted or managed service.

## Examples

| Situation | Allowed? |
|---|---|
| A company runs Agenthix on its own servers for its own staff | Yes |
| A freelancer installs Agenthix on a client's server and looks after it for a monthly fee | Yes — the client uses it for itself |
| A consultancy builds an integration between a client's Agenthix and the client's other tools | Yes |
| A firm runs Agenthix instances on its own infrastructure and sells access to its customers | No — that is a hosted service for others |
| A provider runs Execution Sites for other organisations' HQs | No — that provides a substantial part of the software as a service |

For anything else — a commercial licence, or a use you are unsure about — ask Solution84.

## Other people's code inside Agenthix

- **Four files in `site/opencode-plugin/src/files/`** (`editMatch.ts`, `editReplace.ts`, `patchApply.ts`,
  `patchParse.ts`) are adapted from [OpenCode](https://github.com/sst/opencode) and stay under its MIT licence, whose
  notice is at the top of each.
- **The agent image** installs, when it is built, Claude Code, under
  [Anthropic's terms](https://code.claude.com/docs/en/legal-and-compliance), and OpenCode, under the MIT licence.
  Neither is part of this repository.
- **The Fleet Console's screens bundle two fonts** into their build, and so into the image `agenthix-console`:
  [Inter](https://github.com/rsms/inter) and [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), both under
  the SIL Open Font License 1.1, from the `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono`
  packages; the build copies their licence beside them (`licences/` in the built files).
- **HQ's image carries an embedding model**, which memory uses to recall by meaning:
  [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) by the sentence-transformers
  project, under the Apache License 2.0, fetched when the image is built (or by HQ on first use, when it runs from
  source). It is not part of this repository. HQ runs it with
  [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (`onnxruntime-web`, MIT licence) and reads its text
  with [Tokenizers.js](https://github.com/huggingface/tokenizers.js) (`@huggingface/tokenizers`, Apache License 2.0).
- **HQ serves two voice models** to the browser, from `hq/public/models/` (its README records each file's source,
  version and SHA-256), which run on the person's device:
  [Silero VAD](https://github.com/snakers4/silero-vad) by the Silero Team, under the MIT licence, and
  [Smart Turn](https://github.com/pipecat-ai/smart-turn) by Daily, under the BSD 2-Clause licence. Each licence is
  beside its file. The browser runs them with ONNX Runtime Web (`onnxruntime-web`, MIT licence), whose WebAssembly
  file goes into HQ's client build.
- **HQ's image carries Sigstore's public trust root** (`hq/assets/sigstore/trusted_root.json`), which it checks
  package signatures against, fetched from [Sigstore](https://www.sigstore.dev/)'s public TUF repository; the signing
  tests use bundles copied unchanged from
  [sigstore/sigstore-conformance](https://github.com/sigstore/sigstore-conformance) (Apache License 2.0), whose
  source and commit are recorded beside them (`hq/src/assets/signing/__tests__/fixtures/README.md`).
- **HQ draws pictures with [sharp](https://github.com/lovell/sharp)** (Apache License 2.0), which carries
  [libvips](https://github.com/libvips/libvips) (LGPL-3.0-or-later) as a separate, replaceable library. HQ uses them
  to render avatars and covers, and to re-encode every uploaded picture.
- **HQ's generated avatars use [DiceBear](https://github.com/dicebear/dicebear)**: `@dicebear/core` and fourteen of its
  style packages, whose code is under the MIT licence. Each style's artwork is public domain (CC0 1.0) or MIT, and
  HQ offers no style that needs a credit where a picture is shown. The illustrators are credited here:
  `notionists` and `notionists-neutral` by Zoish; `lorelei` and `lorelei-neutral` by Lisa Wischofsky; `open-peeps` by
  Pablo Stanley; `thumbs`, `pixel-art`, `pixel-art-neutral`, `shapes`, `glass`, `rings`, `identicon` and `initials` by
  DiceBear; and `icons`, which is based on [Bootstrap Icons](https://github.com/twbs/icons) by The Bootstrap
  Authors, under the MIT licence (the copyright notice of Bootstrap Icons is in its package and goes with it).
  The MIT notice of every DiceBear package is in the package, and goes with each copy.
- **The picture picker uses [react-easy-crop](https://github.com/ValentinH/react-easy-crop)** (MIT licence) for the
  frame an uploaded picture is cropped in.
- **The robot pictures are not under this repository's licence.** They are Agenthix's own robot identities, are not
  part of this repository, and are fetched from the release tagged `robots-1` when HQ's image is built. They may be
  used only as part of Agenthix, and may not be copied out, reused or redistributed on their own. The bundle carries
  its own notice saying so.
- **Every other dependency** keeps its own licence, listed in its package.

Anything else copied or adapted into this repository — code, fonts, icons, images — keeps its own licence and is
listed here with it when it arrives. Images made with an image-generation tool carry no credit: no one holds a
copyright in them to name.

## Credit for contributions

A contribution is credited by its authorship: each commit keeps its author's name, and a pull request merged as one
commit keeps its author. When the maintainers carry a contribution on — a larger change a contributor started — every
commit built on it names the contributor in a `Co-authored-by:` line.
