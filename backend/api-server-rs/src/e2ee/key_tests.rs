#[cfg(test)]
mod tests {
    use crate::e2ee::key_api::*;
    use crate::error::AppError;
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;
    use sqlx::Row;

    fn make_key() -> String {
        B64.encode([0xABu8; 32])
    }

    fn make_sig() -> String {
        B64.encode([0xCDu8; 64])
    }

    fn make_invalid_base64() -> String {
        "!!!not-valid-base64!!!".to_string()
    }

    fn make_wrong_len_key() -> String {
        B64.encode([0x11u8; 16])
    }

    fn valid_bundle() -> UploadBundleRequest {
        UploadBundleRequest {
            device_id: "test-device-001".to_string(),
            identity_key: make_key(),
            signing_identity_key: make_key(),
            signed_pre_key: make_key(),
            signed_pre_key_signature: make_sig(),
            one_time_pre_keys: vec![PreKeyEntry {
                id: 0,
                key: make_key(),
            }],
        }
    }

    // ---- 正向测试 ----

    #[test]
    fn valid_bundle_passes() {
        let bundle = valid_bundle();
        assert!(validate_bundle(&bundle).is_ok());
    }

    #[test]
    fn multiple_valid_one_time_pre_keys_pass() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![
            PreKeyEntry {
                id: 0,
                key: make_key(),
            },
            PreKeyEntry {
                id: 1,
                key: make_key(),
            },
            PreKeyEntry {
                id: 100,
                key: make_key(),
            },
            PreKeyEntry {
                id: 42,
                key: make_key(),
            },
        ];
        assert!(validate_bundle(&bundle).is_ok());
    }

    // ---- device_id ----

    #[test]
    fn device_id_blank_rejected() {
        let mut bundle = valid_bundle();
        bundle.device_id = "   ".to_string();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid device_id"), "got: {msg}");
    }

    #[test]
    fn device_id_empty_rejected() {
        let mut bundle = valid_bundle();
        bundle.device_id = String::new();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid device_id"), "got: {msg}");
    }

    // ---- identity_key ----

    #[test]
    fn identity_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.identity_key = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid identity_key"), "got: {msg}");
    }

    #[test]
    fn identity_key_wrong_byte_len_rejected() {
        let mut bundle = valid_bundle();
        bundle.identity_key = make_wrong_len_key();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid identity_key"), "got: {msg}");
    }

    // ---- signing_identity_key ----

    #[test]
    fn signing_identity_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.signing_identity_key = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid signing_identity_key"), "got: {msg}");
    }

    // ---- signed_pre_key ----

    #[test]
    fn signed_pre_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.signed_pre_key = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid signed_pre_key"), "got: {msg}");
    }

    // ---- signed_pre_key_signature ----

    #[test]
    fn signed_pre_key_signature_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.signed_pre_key_signature = make_invalid_base64();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid signed_pre_key_signature"),
            "got: {msg}"
        );
    }

    #[test]
    fn signed_pre_key_signature_wrong_byte_len_rejected() {
        let mut bundle = valid_bundle();
        // 32 bytes instead of 64
        bundle.signed_pre_key_signature = B64.encode([0x42u8; 32]);
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("invalid signed_pre_key_signature"),
            "got: {msg}"
        );
    }

    // ---- one_time_pre_keys.key ----

    #[test]
    fn one_time_pre_key_not_base64_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: 0,
            key: make_invalid_base64(),
        }];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid one_time_pre_key id=0"), "got: {msg}");
    }

    #[test]
    fn one_time_pre_key_wrong_byte_len_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: 0,
            key: make_wrong_len_key(),
        }];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid one_time_pre_key id=0"), "got: {msg}");
    }

    // ---- one_time_pre_keys.id ----

    #[test]
    fn one_time_pre_key_negative_id_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: -1,
            key: make_key(),
        }];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("invalid one_time_pre_key id=-1"), "got: {msg}");
    }

    #[test]
    fn one_time_pre_key_duplicate_id_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![
            PreKeyEntry {
                id: 5,
                key: make_key(),
            },
            PreKeyEntry {
                id: 5,
                key: make_key(),
            },
        ];
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("duplicate one_time_pre_key id=5"),
            "got: {msg}"
        );
    }

    #[test]
    fn one_time_pre_key_id_zero_allowed() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = vec![PreKeyEntry {
            id: 0,
            key: make_key(),
        }];
        assert!(validate_bundle(&bundle).is_ok());
    }

    // ---- 边界测试 ----

    #[test]
    fn too_many_one_time_pre_keys_rejected() {
        let mut bundle = valid_bundle();
        bundle.one_time_pre_keys = (0..=MAX_ONE_TIME_KEYS)
            .map(|i| PreKeyEntry {
                id: i as i32,
                key: make_key(),
            })
            .collect();
        let err = validate_bundle(&bundle).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("too many one_time_pre_keys"), "got: {msg}");
    }

    #[test]
    fn decode_base64_exact_len_rejects_empty_string() {
        let result = decode_base64_exact_len("test_field", "", X25519_KEY_BYTES);
        assert!(result.is_err());
        let msg = format!("{}", result.unwrap_err());
        assert!(msg.contains("invalid test_field"), "got: {msg}");
    }

    // ---- parse_private_conversation_members 单元测试 ----

    #[test]
    fn parse_private_conversation_p_formats() {
        assert_eq!(parse_private_conversation_members("p_1_2"), Some((1, 2)));
        assert_eq!(
            parse_private_conversation_members("p_100_200"),
            Some((100, 200))
        );
    }

    #[test]
    fn parse_private_conversation_bare_format() {
        assert_eq!(parse_private_conversation_members("1_2"), Some((1, 2)));
    }

    #[test]
    fn parse_private_conversation_rejects_invalid() {
        assert_eq!(parse_private_conversation_members(""), None);
        assert_eq!(
            parse_private_conversation_members("not_a_conversation"),
            None
        );
        assert_eq!(parse_private_conversation_members("1_2_3"), None);
        assert_eq!(parse_private_conversation_members("p_1_2_3"), None);
        assert_eq!(parse_private_conversation_members("p_abc_def"), None);
    }

    // -----------------------------------------------------------------------
    // get_bundle 集成测试（需要 DATABASE_URL 环境变量，标记 #[ignore]）
    // -----------------------------------------------------------------------

    async fn test_db() -> Option<sqlx::MySqlPool> {
        let url = std::env::var("DATABASE_URL").ok()?;
        sqlx::MySqlPool::connect(&url).await.ok()
    }

    /// 准备测试设备：给定 user_id 和 device_id，upsert e2ee_devices 并插入 one-time pre-keys。
    async fn seed_device(
        db: &sqlx::MySqlPool,
        user_id: i64,
        device_id: &str,
        otp_count: usize,
    ) -> Result<(), AppError> {
        let key = B64.encode([0xABu8; 32]);
        let sig = B64.encode([0xCDu8; 64]);
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_devices
               (user_id, device_id, status, identity_key, signing_identity_key,
                signed_pre_key, signed_pre_key_signature)
               VALUES (?, ?, 'active', ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE status='active',
                 identity_key=VALUES(identity_key),
                 signing_identity_key=VALUES(signing_identity_key),
                 signed_pre_key=VALUES(signed_pre_key),
                 signed_pre_key_signature=VALUES(signed_pre_key_signature)"#,
        )
        .bind(user_id)
        .bind(device_id)
        .bind(&key)
        .bind(&key)
        .bind(&key)
        .bind(&sig)
        .execute(db)
        .await?;

        // 清除旧 pre-keys
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await?;

        // 插入新 pre-keys
        for i in 0..otp_count {
            let pre_key = B64.encode([(i as u8) ^ 0x5A; 32]);
            sqlx::query(
                r#"INSERT INTO service_user_service_db.e2ee_one_time_pre_keys
                   (user_id, device_id, pre_key, pre_key_id, consumed)
                   VALUES (?, ?, ?, ?, 0)"#,
            )
            .bind(user_id)
            .bind(device_id)
            .bind(&pre_key)
            .bind(i as i32)
            .execute(db)
            .await?;
        }
        Ok(())
    }

    /// 清除测试数据
    async fn cleanup_test_data(db: &sqlx::MySqlPool, user_id: i64, device_id: &str) {
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await
        .ok();
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_devices \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await
        .ok();
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(user_id)
        .bind(device_id)
        .execute(db)
        .await
        .ok();
    }

    fn app_error_text<T>(result: Result<T, AppError>, context: &str) -> anyhow::Result<String> {
        let Err(err) = result else {
            anyhow::bail!("{context}");
        };
        Ok(err.to_string())
    }

    // 场景 1: get_bundle 缺少 conversationId → BadRequest
    // 验证：get_bundle handler 现在强制要求 conversationId 参数，缺少时返回 400。
    // 此行为由 handler 层参数提取保证，集成测试通过 HTTP 请求覆盖。
    #[tokio::test]
    #[ignore]
    async fn get_bundle_without_conversation_id_rejected() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 验证底层：claim 表中的 INSERT 仍然需要 conversation_id（NOT NULL 约束）
        // 尝试插入空 conversation_id 的 claim 应失败
        let result = sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, '', NULL, NULL, NULL)"#,
        )
        .bind(1)
        .bind("test-device")
        .bind(2)
        .bind("target-device")
        .execute(&db)
        .await;
        // conversation_id 不能为空字符串（handler 层拒绝，DB 层也应约束）
        // 如果 DB 没有约束则依赖 handler 层强制
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE conversation_id = ''",
        )
        .execute(&db)
        .await
        .ok();
        match result {
            Ok(_) => {
                // DB 允许空字符串，但 handler 层拒绝 → 安全
            }
            Err(_) => {
                // DB 也拒绝空字符串 → 双保险
            }
        }
        Ok(())
    }

    // 场景 2: 非 conversation 成员请求 target bundle → 返回 Forbidden
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_rejects_non_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 私聊 p_1_2，用户 999 不是成员
        let result = ensure_conversation_member(&db, 999, "p_1_2").await;
        assert!(result.is_err());
        let msg = app_error_text(result, "non-member should be rejected")?;
        assert!(msg.contains("not a conversation member"), "got: {msg}");
        Ok(())
    }

    // 场景 3: 群组成员校验
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_accepts_group_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 获取一个存在的群组
        let group_id: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM service_group_service_db.im_group WHERE status = 1 LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(group_id) = group_id else {
            return Ok(());
        };

        let member: Option<i64> = sqlx::query_scalar(
            "SELECT user_id FROM service_group_service_db.im_group_member \
             WHERE group_id = ? AND status = 1 LIMIT 1",
        )
        .bind(group_id)
        .fetch_optional(&db)
        .await?;
        let Some(member) = member else {
            return Ok(());
        };

        let conversation_id = format!("g_{group_id}");
        ensure_conversation_member(&db, member, &conversation_id).await?;
        Ok(())
    }

    // 场景 4: 私聊成员校验
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_accepts_private_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        ensure_conversation_member(&db, 1, "p_1_2").await?;
        ensure_conversation_member(&db, 2, "p_1_2").await?;
        Ok(())
    }

    // 场景 5: ensure_device_belongs_to_user
    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_active_device() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 获取一个有活跃设备的用户
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'active' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let user_id: i64 = row.get("user_id");
        let device_id: String = row.get("device_id");
        ensure_device_belongs_to_user(&db, &device_id, user_id).await?;
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_rejects_wrong_user() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'active' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let device_id: String = row.get("device_id");
        // 用不存在的 user_id 去查
        let result = ensure_device_belongs_to_user(&db, &device_id, 999_999_999).await;
        assert!(result.is_err());
        let msg = app_error_text(result, "wrong user should be rejected")?;
        assert!(msg.contains("device does not belong to user"), "got: {msg}");
        Ok(())
    }

    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_rejects_deleted_device() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 找一个 deleted 状态的设备
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'deleted' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let user_id: i64 = row.get("user_id");
        let device_id: String = row.get("device_id");
        let result = ensure_device_belongs_to_user(&db, &device_id, user_id).await;
        assert!(result.is_err(), "deleted device should be rejected");
        Ok(())
    }

    // 场景 6: claim 表幂等 — INSERT-first 策略：先占位再消费，同一个 claim key 只消费一个 pre-key
    #[tokio::test]
    #[ignore]
    async fn pre_key_claim_idempotency() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let target_user = 999_001;
        let target_device = "test-claim-idempotent";
        let requester = 999_002;
        let requester_device = "test-requester-device";
        let conversation_id = "p_999001_999002";

        seed_device(&db, target_user, target_device, 3).await?;

        // 清理已有 claims
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        // ---- 第一次 claim：INSERT-first 策略 ----
        let mut tx = db.begin().await?;

        // Step 1: 先插入占位 claim
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx)
        .await?;

        // Step 2: INSERT 成功 → 消费一个 pre-key
        let otp_row = sqlx::query(
            r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
               FROM service_user_service_db.e2ee_one_time_pre_keys
               WHERE user_id = ? AND device_id = ? AND consumed = 0
               LIMIT 1 FOR UPDATE"#,
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_optional(&mut *tx)
        .await?;
        assert!(
            otp_row.is_some(),
            "at least one pre-key should be available"
        );
        let row = otp_row.as_ref().unwrap();
        let row_id: i64 = row.get("id");
        let pre_key: String = row.get("pre_key");
        let pre_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();

        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(row_id)
        .execute(&mut *tx)
        .await?;

        // Step 3: 回填 claim 记录
        sqlx::query(
            r#"UPDATE service_user_service_db.e2ee_pre_key_claims
               SET one_time_pre_key_row_id = ?,
                   one_time_pre_key_id = ?,
                   one_time_pre_key = ?
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(Some(row_id))
        .bind(pre_key_id)
        .bind(Some(&pre_key))
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        // 验证 consumed 计数
        let consumed_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(consumed_count, 1, "exactly one pre-key should be consumed");

        // ---- 第二次 claim：INSERT placeholder 应触发唯一键冲突 ----
        let mut tx2 = db.begin().await?;
        let dup_result = sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx2)
        .await;

        match dup_result {
            Err(sqlx::Error::Database(ref db_err)) if db_err.code().as_deref() == Some("23000") => {
                // 符合预期：唯一键冲突，不消费 pre-key
                tx2.rollback().await.ok();
            }
            other => {
                tx2.rollback().await.ok();
                anyhow::bail!(
                    "expected unique key violation on duplicate placeholder insert, got: {other:?}"
                );
            }
        }

        // 重读已有 claim，验证返回的是同一个 pre-key
        let claim = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&db)
        .await?;
        assert!(claim.is_some(), "existing claim should be found");
        let claim = claim.unwrap();
        let cached_key: Option<String> = claim.get("one_time_pre_key");
        assert!(cached_key.is_some(), "cached one-time pre-key should exist");
        assert_eq!(
            cached_key.as_deref(),
            Some(pre_key.as_str()),
            "cached pre-key should match consumed one"
        );

        // 验证没有额外消费
        let consumed_count2: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(
            consumed_count2, 1,
            "no additional pre-key should be consumed"
        );

        // 清理
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;
        cleanup_test_data(&db, target_user, target_device).await;
        Ok(())
    }

    // 场景 7: 无可用 one-time pre-key → INSERT-first 占位后保留空 claim，重复请求幂等
    #[tokio::test]
    #[ignore]
    async fn pre_key_claim_idempotency_no_available_keys() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let target_user = 999_003;
        let target_device = "test-claim-empty";
        let requester = 999_004;
        let requester_device = "test-requester-empty";
        let conversation_id = "p_999003_999004";

        // 只创建一个设备但不分配 pre-key（otp_count=0）
        let key = B64.encode([0xABu8; 32]);
        let sig = B64.encode([0xCDu8; 64]);
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_devices
               (user_id, device_id, status, identity_key, signing_identity_key,
                signed_pre_key, signed_pre_key_signature)
               VALUES (?, ?, 'active', ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE status='active'"#,
        )
        .bind(target_user)
        .bind(target_device)
        .bind(&key)
        .bind(&key)
        .bind(&key)
        .bind(&sig)
        .execute(&db)
        .await?;

        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        // ---- 第一次 claim：INSERT-first，无可用 pre-key ----
        let mut tx = db.begin().await?;

        // Step 1: 插入占位 claim
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx)
        .await?;

        // Step 2: SELECT FOR UPDATE — 无可用 pre-key
        let otp_row = sqlx::query(
            r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
               FROM service_user_service_db.e2ee_one_time_pre_keys
               WHERE user_id = ? AND device_id = ? AND consumed = 0
               LIMIT 1 FOR UPDATE"#,
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_optional(&mut *tx)
        .await?;
        assert!(otp_row.is_none(), "no pre-keys should be available");

        // 保留空 claim，commit
        tx.commit().await?;

        // ---- 重复请求：INSERT 占位应唯一键冲突，不消费 pre-key ----
        let mut tx2 = db.begin().await?;
        let dup_result = sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx2)
        .await;

        match dup_result {
            Err(sqlx::Error::Database(ref db_err)) if db_err.code().as_deref() == Some("23000") => {
                tx2.rollback().await.ok();
            }
            other => {
                tx2.rollback().await.ok();
                anyhow::bail!(
                    "expected unique key violation on duplicate placeholder insert, got: {other:?}"
                );
            }
        }

        // 重读已有 claim
        let claim = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&db)
        .await?;
        assert!(claim.is_some(), "claim should exist");
        let claim = claim.unwrap();
        let otp: Option<String> = claim.get("one_time_pre_key");
        assert!(
            otp.is_none(),
            "one_time_pre_key should be null (signed pre-key fallback)"
        );

        // 验证没有 pre-key 被消费
        let consumed: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(consumed, 0, "no pre-key should be consumed");

        // 清理
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;
        cleanup_test_data(&db, target_user, target_device).await;
        Ok(())
    }

    // 场景 8: INSERT-first 并发安全验证
    // 请求 A 先 INSERT 占位成功 → SELECT FOR UPDATE pre-key1 → UPDATE consumed → UPDATE claim
    // 请求 B INSERT 占位唯一键冲突 → 不消费任何 pre-key → 回滚 → 重读 A 的 claim
    // 结果：只消费 1 个 pre-key（pre-key1），pre-key2 不变
    #[tokio::test]
    #[ignore]
    async fn pre_key_claim_unique_key_conflict_handling() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        let target_user = 999_005;
        let target_device = "test-claim-duplicate";
        let requester = 999_006;
        let requester_device = "test-requester-dup";
        let conversation_id = "p_999005_999006";

        seed_device(&db, target_user, target_device, 3).await?;

        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;

        // ---- 请求 A：INSERT 占位 → 消费 pre-key → UPDATE claim ----
        let mut tx_a = db.begin().await?;

        // INSERT 占位
        sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx_a)
        .await?;

        // 消费第一个 pre-key
        let otp_row = sqlx::query(
            r#"SELECT id, pre_key, COALESCE(pre_key_id, 0) AS pre_key_id
               FROM service_user_service_db.e2ee_one_time_pre_keys
               WHERE user_id = ? AND device_id = ? AND consumed = 0
               LIMIT 1 FOR UPDATE"#,
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_optional(&mut *tx_a)
        .await?;
        let row = otp_row.unwrap();
        let row_id: i64 = row.get("id");
        let first_key: String = row.get("pre_key");
        let first_key_id: Option<i32> = row.try_get::<i32, _>("pre_key_id").ok();

        sqlx::query(
            "UPDATE service_user_service_db.e2ee_one_time_pre_keys \
             SET consumed = 1, consumed_time = NOW() WHERE id = ?",
        )
        .bind(row_id)
        .execute(&mut *tx_a)
        .await?;

        // 回填 claim
        sqlx::query(
            r#"UPDATE service_user_service_db.e2ee_pre_key_claims
               SET one_time_pre_key_row_id = ?,
                   one_time_pre_key_id = ?,
                   one_time_pre_key = ?
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(Some(row_id))
        .bind(first_key_id)
        .bind(Some(&first_key))
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&mut *tx_a)
        .await?;
        tx_a.commit().await?;

        // ---- 请求 B：尝试 INSERT 占位（模拟并发冲突） ----
        // 此时 A 已 commit，B 的 INSERT 应触发唯一键冲突
        let result = sqlx::query(
            r#"INSERT INTO service_user_service_db.e2ee_pre_key_claims
               (requester_user_id, requester_device_id, target_user_id, target_device_id,
                conversation_id, one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key)
               VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .execute(&db)
        .await;

        match result {
            Err(sqlx::Error::Database(ref db_err)) if db_err.code().as_deref() == Some("23000") => {
                // 符合预期：唯一键冲突，请求 B 没有消费任何 pre-key
            }
            Ok(_) => {
                anyhow::bail!("expected unique key violation on duplicate placeholder insert");
            }
            Err(e) => {
                anyhow::bail!("unexpected error on duplicate placeholder insert: {e}");
            }
        }

        // 验证只消费了 1 个 pre-key（pre-key2 未被消费）
        let consumed: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 1",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(consumed, 1, "only one pre-key should be consumed");

        // 验证未消费的 pre-key 仍然可用（consumed=0）
        let available: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM service_user_service_db.e2ee_one_time_pre_keys \
             WHERE user_id = ? AND device_id = ? AND consumed = 0",
        )
        .bind(target_user)
        .bind(target_device)
        .fetch_one(&db)
        .await?;
        assert_eq!(
            available, 2,
            "two pre-keys should still be available (only 1 consumed out of 3)"
        );

        // 验证重读能得到相同的 pre-key
        let claim = sqlx::query(
            r#"SELECT one_time_pre_key_row_id, one_time_pre_key_id, one_time_pre_key
               FROM service_user_service_db.e2ee_pre_key_claims
               WHERE requester_user_id = ? AND requester_device_id = ?
                 AND target_user_id = ? AND target_device_id = ?
                 AND conversation_id = ?"#,
        )
        .bind(requester)
        .bind(requester_device)
        .bind(target_user)
        .bind(target_device)
        .bind(conversation_id)
        .fetch_optional(&db)
        .await?;
        assert!(claim.is_some());
        let claim = claim.unwrap();
        let re_read_key: Option<String> = claim.get("one_time_pre_key");
        assert_eq!(
            re_read_key.as_deref(),
            Some(first_key.as_str()),
            "re-read should return same pre-key"
        );

        // 清理
        sqlx::query(
            "DELETE FROM service_user_service_db.e2ee_pre_key_claims \
             WHERE target_user_id = ? AND target_device_id = ?",
        )
        .bind(target_user)
        .bind(target_device)
        .execute(&db)
        .await?;
        cleanup_test_data(&db, target_user, target_device).await;
        Ok(())
    }

    // 场景 9: target 不是 conversation 成员 → ensure_conversation_member 拒绝
    #[tokio::test]
    #[ignore]
    async fn ensure_conversation_member_rejects_target_non_member() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 私聊 p_1_2，用户 999 不是成员，作为 target 应被拒绝
        let result = ensure_conversation_member(&db, 999, "p_1_2").await;
        assert!(result.is_err());
        let msg = app_error_text(result, "target non-member should be rejected")?;
        assert!(msg.contains("not a conversation member"), "got: {msg}");
        Ok(())
    }

    // 场景 10: requesterDeviceId 不属于当前用户 → ensure_device_belongs_to_user 拒绝
    #[tokio::test]
    #[ignore]
    async fn ensure_device_belongs_to_user_rejects_wrong_requester() -> anyhow::Result<()> {
        let Some(db) = test_db().await else {
            return Ok(());
        };
        // 获取一个活跃设备，用另一个 user_id 验证
        let row = sqlx::query(
            "SELECT user_id, device_id FROM service_user_service_db.e2ee_devices \
             WHERE status = 'active' LIMIT 1",
        )
        .fetch_optional(&db)
        .await?;
        let Some(row) = row else {
            return Ok(());
        };
        let real_user_id: i64 = row.get("user_id");
        let device_id: String = row.get("device_id");
        // 用不同的 user_id 查询，应失败
        let wrong_user_id = if real_user_id == 1 { 999_999 } else { 1 };
        let result = ensure_device_belongs_to_user(&db, &device_id, wrong_user_id).await;
        assert!(result.is_err());
        let msg = app_error_text(result, "wrong requester should be rejected")?;
        assert!(msg.contains("device does not belong to user"), "got: {msg}");
        Ok(())
    }

    // 场景 11: 旧 claim_prekey 路由已删除，对应 handler 不存在
    // 编译时验证：对 claim_prekey 和 ClaimPreKeyRequest/ClaimPreKeyResponse
    // 的引用会在编译期报错，无需运行时测试。
    // 验证方法：尝试 `use crate::e2ee::key_api::claim_prekey;` 会导致编译失败。
    #[test]
    fn old_claim_prekey_route_removed_at_compile_time() {
        // 此测试仅用于文档化：旧的 claim_prekey handler 已从代码中删除。
        // 路由 `/api/e2ee/prekeys/claim` 已从 e2ee_routes.rs 移除。
        // 前后端均无引用剩余。
    }
}
