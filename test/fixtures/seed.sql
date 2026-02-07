USE service_user_service_db;

INSERT INTO users (
  id, username, password, nickname, status, created_time, updated_time
) VALUES (
  1000000000000000001,
  'seed_user',
  'seed_password',
  'seed_user',
  1,
  NOW(),
  NOW()
) ON DUPLICATE KEY UPDATE updated_time = NOW();
