-- The rows the migration check puts in HQ's database at the schema it starts from, before the newer migrations run:
-- an organisation, a person, a project with a task, a conversation with a message, and a stored provider. Every id
-- starts with migration-check-, which check.sql looks for afterwards. Written against the schema of the release the
-- check starts from; a column that release requires and this leaves out fails the seed, and is added here.
INSERT INTO "Org" ("id", "name", "updatedAt") VALUES ('migration-check-org', 'Migration check organisation', now());
INSERT INTO "User" ("id", "displayName") VALUES ('migration-check-person', 'Migration check person');
INSERT INTO "Project" ("id", "name", "key", "updatedAt") VALUES ('migration-check-project', 'Migration check project', 'MCHECK', now());
INSERT INTO "Task" ("id", "title", "projectId", "number", "onBehalfOfUserId", "updatedAt")
  VALUES ('migration-check-task', 'Migration check task', 'migration-check-project', 1, 'migration-check-person', now());
INSERT INTO "Conversation" ("id", "home", "projectId", "openedById", "updatedAt")
  VALUES ('migration-check-conversation', 'PROJECT', 'migration-check-project', 'migration-check-person', now());
INSERT INTO "ConversationMessage" ("id", "conversationId", "seq", "role", "kind", "body")
  VALUES ('migration-check-message', 'migration-check-conversation', 1, 'PERSON', 'TEXT', 'Migration check message');
INSERT INTO "AiProvider" ("id", "name", "vendor", "credentialKind", "baseUrl", "updatedAt")
  VALUES ('migration-check-provider', 'Migration check provider', 'openai_compatible', 'none', 'http://127.0.0.1:9/v1', now());
