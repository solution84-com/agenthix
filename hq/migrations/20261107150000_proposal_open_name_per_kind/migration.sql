-- One open proposal per kind, aim, place and name: a skill and a task template of one name may wait side by side.
DROP INDEX "Proposal_open_name_key";
CREATE UNIQUE INDEX "Proposal_open_name_key" ON "Proposal"("kind", "aim", COALESCE("placeId", ''), "name") WHERE "state" = 'OPEN';
