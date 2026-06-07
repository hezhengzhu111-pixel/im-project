-- Migration: Add profile fields (gender, birthday, signature, location) to users table
-- Database: service_user_service_db
-- Note: The actual table is `users`, not `user_profiles`.

USE service_user_service_db;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS gender TINYINT DEFAULT NULL COMMENT '0=未知, 1=男, 2=女',
  ADD COLUMN IF NOT EXISTS birthday DATE DEFAULT NULL COMMENT '生日',
  ADD COLUMN IF NOT EXISTS signature VARCHAR(200) DEFAULT NULL COMMENT '个性签名',
  ADD COLUMN IF NOT EXISTS location VARCHAR(100) DEFAULT NULL COMMENT '所在地';
