-- Migration: add authenticated one-time pre-key signature column.
--
-- Defect #2: OTK returned by server is unauthenticated.
-- The api-server now stores a per-OTK Ed25519 signature uploaded by the client
-- and returns it alongside the claimed one-time pre-key public key.
--
-- New deployments already include this column via init_all.sql; this migration
-- is for existing databases.

USE service_user_service_db;

ALTER TABLE e2ee_one_time_pre_keys
  ADD COLUMN IF NOT EXISTS pre_key_signature TEXT NULL COMMENT '一次性预公钥签名(Base64)';
