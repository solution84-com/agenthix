import { action, type Spec } from "@wasp.sh/spec";
import { savePictures } from "./saveActions" with { type: "ref" };

export const picturesSpec: Spec = [
    // No entities: the picker reads the views again itself, only after a save lands (`useSavePictures.ts`).
    action(savePictures, { entities: [] }),
];
