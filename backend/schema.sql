-- schema.sql - Supabase PostgreSQL Database Schema for Shama

-- Clean up existing tables
DROP TABLE IF EXISTS lines CASCADE;
DROP TABLE IF EXISTS works CASCADE;

-- Create works table
CREATE TABLE works (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    poet VARCHAR(255) NOT NULL,
    form VARCHAR(100) NOT NULL,
    audio_url TEXT,
    cover_url TEXT
);

-- Create lines table
CREATE TABLE lines (
    id VARCHAR(50) PRIMARY KEY,
    work_id VARCHAR(50) REFERENCES works(id) ON DELETE CASCADE,
    urdu TEXT NOT NULL,
    hindi TEXT NOT NULL,
    roman TEXT NOT NULL,
    english_text TEXT NOT NULL,
    transliteration TEXT NOT NULL,
    translation TEXT NOT NULL,
    simple TEXT NOT NULL,
    detailed TEXT NOT NULL,
    vocabulary JSONB NOT NULL
);

-- Create index on work_id foreign key for quick lookups
CREATE INDEX idx_lines_work_id ON lines(work_id);
