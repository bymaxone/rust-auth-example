-- Initial database for the example app. Postgres 18 runs this only on first boot.
-- \gexec executes the generated CREATE DATABASE; WHERE NOT EXISTS makes it idempotent.
-- The entrypoint already creates POSTGRES_DB automatically; this block guards the
-- case where POSTGRES_DB is changed to a value other than 'example_app'.
-- example_app_test is created by the test compose stack via its own POSTGRES_DB env var.
SELECT 'CREATE DATABASE example_app
  ENCODING ''UTF8''
  LC_COLLATE ''C''
  LC_CTYPE ''C''
  TEMPLATE template0'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'example_app')\gexec
