import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dataLosses, unmarkedLosses } from '../migration-check/narrowing.mjs'

const whats = (sql) => dataLosses(sql).map((l) => `${l.what} ${l.table}${l.column ? `.${l.column}` : ''}`)

test('a migration that only adds loses nothing @SC-2192', () => {
  assert.deepEqual(whats(`
    -- AlterTable
    ALTER TABLE "Run" ADD COLUMN "note" TEXT;
    CREATE TABLE "Board" ("id" TEXT NOT NULL, CONSTRAINT "Board_pkey" PRIMARY KEY ("id"));
    CREATE INDEX "Run_note_idx" ON "Run"("note");
    DROP INDEX "Run_old_idx";`), [])
})

test('a dropped table and a dropped column are found @SC-2192', () => {
  assert.deepEqual(whats(`
    DROP TABLE "Old";
    ALTER TABLE "Run" DROP COLUMN "legacy",
    ADD COLUMN "fresh" TEXT,
    DROP COLUMN "other";`), ['drops the table Old', 'drops the column Run.legacy', 'drops the column Run.other'])
})

test("a column's type changed is found, however it is written @SC-2192", () => {
  assert.deepEqual(whats(`
    ALTER TABLE "Run" ALTER COLUMN "size" SET DATA TYPE INTEGER;
    ALTER TABLE public."Run" ALTER COLUMN "kind" TYPE "RunKind" USING ("kind"::text::"RunKind");`),
  ["changes the column's type Run.size", "changes the column's type Run.kind"])
})

test('dropping a constraint, a default or NOT NULL loses no data @SC-2192', () => {
  assert.deepEqual(whats(`
    ALTER TABLE "Run" DROP CONSTRAINT "Run_fkey";
    ALTER TABLE "Run" ALTER COLUMN "note" DROP DEFAULT, ALTER COLUMN "note" DROP NOT NULL;`), [])
})

test('a column made required needs a default or a backfill @SC-2192', () => {
  assert.deepEqual(whats('ALTER TABLE "Run" ALTER COLUMN "note" SET NOT NULL;'), ['makes the column required with no default or backfill Run.note'])
  assert.deepEqual(whats(`ALTER TABLE "Run" ALTER COLUMN "note" SET DEFAULT '', ALTER COLUMN "note" SET NOT NULL;`), [])
  assert.deepEqual(whats(`UPDATE "Run" SET "note" = '' WHERE "note" IS NULL; ALTER TABLE "Run" ALTER COLUMN "note" SET NOT NULL;`), [])
})

test('comments and quoted text are not read as statements @SC-2192', () => {
  assert.deepEqual(whats(`/* DROP TABLE "A"; */ -- DROP TABLE "B";
    INSERT INTO "Note" ("text") VALUES ('DROP TABLE "C"; and, more');`), [])
})

test('the check refuses a loss only when no commit that made the migration is marked breaking @SC-2192', () => {
  const sql = { 'hq/migrations/2_drop/migration.sql': 'ALTER TABLE "Run" DROP COLUMN "legacy";' }
  const read = (file) => sql[file]
  const file = 'hq/migrations/2_drop/migration.sql'
  assert.deepEqual(unmarkedLosses([{ file, messages: ['feat(hq): runs lose their legacy field'] }], read),
    ['hq/migrations/2_drop/migration.sql drops the column "Run"."legacy"'])
  assert.deepEqual(unmarkedLosses([{ file, messages: [] }], read).length, 1)
  assert.deepEqual(unmarkedLosses([{ file, messages: ['feat(hq)!: runs lose their legacy field\n\nBREAKING CHANGE: export it first.'] }], read), [])
})
