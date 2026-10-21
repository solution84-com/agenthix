import { action, query, type Spec } from "@wasp.sh/spec";
import { getPins } from "./queries" with { type: "ref" };
import { pinItem, unpinItem, reorderPins } from "./actions" with { type: "ref" };

export const pinsSpec: Spec = [
    query(getPins, { entities: ["Pin", "Project", "Board", "Agent"] }),
    action(pinItem, { entities: ["Pin", "Project", "Board", "Agent"] }),
    action(unpinItem, { entities: ["Pin"] }),
    action(reorderPins, { entities: ["Pin"] }),
];
