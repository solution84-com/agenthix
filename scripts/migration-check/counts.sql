-- Every table's rows, `<table>|<rows>`, and how many of them the check seeded (`<table>|seeded|<rows>`).
SELECT table_name || '|' || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', table_name), false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
  ORDER BY table_name;
SELECT c.table_name || '|seeded|' || (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I WHERE "id" LIKE %L', c.table_name, 'migration-check-%'), false, true, '')))[1]::text
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.column_name = 'id' AND c.table_name <> '_prisma_migrations'
  ORDER BY c.table_name;
