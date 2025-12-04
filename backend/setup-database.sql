-- JalRakshak Database Setup Script
-- Run this as PostgreSQL superuser (postgres)

-- Create database
CREATE DATABASE jalrakshak;

-- Connect to the database
\c jalrakshak

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Create user (optional - you can use postgres user)
-- CREATE USER jalrakshak WITH PASSWORD 'jalrakshak123';
-- GRANT ALL PRIVILEGES ON DATABASE jalrakshak TO jalrakshak;

-- Now run the init.sql file to create tables
-- \i backend/db/init.sql


