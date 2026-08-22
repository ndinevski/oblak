-- Enables query statistics on a freshly created Oblak database.
--
-- The extension also needs `shared_preload_libraries=pg_stat_statements`,
-- which each Postgres service sets via its compose `command`. Without the
-- preload this statement succeeds but the view stays empty.
--
-- Runs only on an empty data directory. For an existing database, run:
--   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
