-- The rows the migration check puts in the site's database at the schema it starts from: a workspace, an agent
-- session with a transcript entry, and a run. Every id starts with migration-check-, as in seed-hq.sql.
INSERT INTO "Workspace" ("id", "name", "ownerType", "ownerId", "siteId", "updatedAt")
  VALUES ('migration-check-workspace', 'Migration check workspace', 'project', 'migration-check-project', 'migration-check-site', now());
INSERT INTO "AgentSession" ("id", "sessionKey", "agentId", "userId", "createdAt", "updatedAt")
  VALUES ('migration-check-session', 'migration-check-session-key', 'migration-check-agent', 'migration-check-person', now(), now());
INSERT INTO "TranscriptEntry" ("id", "sessionId", "role", "content")
  VALUES ('migration-check-entry', 'migration-check-session', 'USER', 'Migration check entry');
INSERT INTO "AgentRun" ("id", "agentId", "sessionId", "inputText", "model")
  VALUES ('migration-check-run', 'migration-check-agent', 'migration-check-session', 'Migration check input', 'migration-check-model');
