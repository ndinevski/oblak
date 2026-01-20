-- Impuls Functions Database Schema

-- Create functions table
CREATE TABLE IF NOT EXISTS functions (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    runtime TEXT NOT NULL,
    handler TEXT NOT NULL,
    code TEXT NOT NULL,
    code_path TEXT,
    memory_mb INTEGER NOT NULL,
    timeout_sec INTEGER NOT NULL,
    environment JSONB,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(name);
CREATE INDEX IF NOT EXISTS idx_functions_created_at ON functions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_functions_runtime ON functions(runtime);

-- Optional: Add a trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_functions_updated_at BEFORE UPDATE
    ON functions FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
