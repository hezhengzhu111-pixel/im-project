-- Migration: Add unified `settings` JSON column to existing user_settings table
-- Database: service_user_service_db
-- Note: user_settings table already exists with 4 separate JSON columns
--       (privacy_settings, message_settings, general_settings, push_settings).
--       This migration adds a new `settings` JSON column to consolidate them.
--       Old columns are kept for backward compatibility; they can be dropped later.

USE service_user_service_db;

-- Step 1: Add the new unified settings JSON column
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS settings JSON NOT NULL DEFAULT (JSON_OBJECT()) COMMENT '统一设置JSON' AFTER user_id;

-- Step 2: Migrate existing 4 JSON columns into the new `settings` column
-- Use JSON_OBJECT() for safe JSON construction, avoiding issues with special characters.
UPDATE user_settings
SET settings = JSON_OBJECT(
  'privacy', privacy_settings,
  'message', message_settings,
  'general', general_settings,
  'push', push_settings
)
WHERE privacy_settings IS NOT NULL
   OR message_settings IS NOT NULL
   OR general_settings IS NOT NULL
   OR push_settings IS NOT NULL;
