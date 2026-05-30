-- Add gender, birthday, signature, location fields to user_profiles table
-- Database: service_user_service_db

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS gender TINYINT DEFAULT NULL COMMENT '0=未知, 1=男, 2=女',
  ADD COLUMN IF NOT EXISTS birthday DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS signature VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT NULL;
