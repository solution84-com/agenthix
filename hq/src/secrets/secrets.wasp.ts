import { action, page, query, route, type Spec } from "@wasp.sh/spec";
import {
    getPlaceSecrets, getPlaceVariables, getPlaceSecretHistory, getPlaceVariableHistory,
    addPlaceSecret, replacePlaceSecret, describePlaceSecret, deletePlaceSecret,
    addPlaceVariable, editPlaceVariable, deletePlaceVariable, turnOffWhatUsesIt,
} from "./operations" with { type: "ref" };
import { SecretsAddressPage } from "./pages/SecretsAddressPage" with { type: "ref" };

// A place's secrets and variables (workflows spec part 3). Every write goes through secrets/store.ts or
// secrets/variables.ts; no read returns a secret's value.
export const secretsSpec: Spec = [
    route("ProjectSecretsRoute", "/projects/:key/secrets", page(SecretsAddressPage, { authRequired: true })),
    route("SpaceSecretsRoute", "/space/secrets", page(SecretsAddressPage, { authRequired: true })),
    query(getPlaceSecrets, { entities: ["PlaceSecret", "WorkflowVersion"] }),
    query(getPlaceVariables, { entities: ["PlaceVariable", "WorkflowVersion"] }),
    query(getPlaceSecretHistory, { entities: ["SecretRecord"] }),
    query(getPlaceVariableHistory, { entities: ["PlaceVariableChange"] }),
    action(addPlaceSecret, { entities: ["PlaceSecret", "SecretRecord"] }),
    action(replacePlaceSecret, { entities: ["PlaceSecret", "SecretRecord"] }),
    action(describePlaceSecret, { entities: ["PlaceSecret"] }),
    action(deletePlaceSecret, { entities: ["PlaceSecret", "SecretRecord"] }),
    action(addPlaceVariable, { entities: ["PlaceVariable", "PlaceVariableChange"] }),
    action(editPlaceVariable, { entities: ["PlaceVariable", "PlaceVariableChange"] }),
    action(deletePlaceVariable, { entities: ["PlaceVariable", "PlaceVariableChange"] }),
    action(turnOffWhatUsesIt, { entities: ["Workflow", "WorkflowRun", "SecretRecord"] }),
];
