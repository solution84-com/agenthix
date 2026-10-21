import { api, query, type Spec } from "@wasp.sh/spec";
import { getFleetActivity } from "./activity" with { type: "ref" };
import { getHqReadOnly } from "../server/readOnlyQuery" with { type: "ref" };
import { moveCheckHandler as moveCheckApi, moveProofHandler as moveProofApi } from "./moveCheckApi" with { type: "ref" };
import { siteRestoreRenewHandler as siteRestoreRenewApi } from "./siteRestoreApi" with { type: "ref" };

// Host management's HTTP side. The host link and the console link are WebSockets on the same server, started in
// server/setup.ts (fleet/index.ts), as the site channel is.
export const fleetSpec: Spec = [
  query(getHqReadOnly, { entities: [] }),
  query(getFleetActivity, { entities: ["FleetActivity", "User"] }),
  // The move check (core's MOVE_CHECK_PATH and MOVE_PROOF_PATH): a site, host service or Fleet Console checks hq's new address.
  api("POST", "/api/v1/move-check", moveCheckApi, { auth: false }),
  api("POST", "/api/v1/move-check/proof", moveProofApi, { auth: false }),
  // core's SITE_RESTORE_RENEW_PATH: a site restored onto a new machine renews its credential once (adr-0119).
  api("POST", "/api/v1/sites/restore-renew", siteRestoreRenewApi, { auth: false, entities: ["ExecutionSite", "RelayHost", "RelayJoin"] }),
];
