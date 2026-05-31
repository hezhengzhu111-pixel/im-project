use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// 消息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub content: String,
    pub sender_id: String,
    pub timestamp: i64,
    pub message_type: String,
    pub media_url: Option<String>,
    pub thumbnail_url: Option<String>,
}

/// 会话结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub target_id: String,
    pub target_name: String,
    pub target_avatar: Option<String>,
    pub last_message: Option<Message>,
    pub unread_count: i32,
    pub conversation_type: String,
}

/// 联系人结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub avatar: Option<String>,
    pub status: String,
}

/// 本地存储服务
pub struct LocalStorage {
    db: Mutex<Connection>,
}

impl LocalStorage {
    /// 创建新的本地存储实例
    pub fn new(db_path: String) -> Result<Self, String> {
        let db = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // 创建表
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                content TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                message_type TEXT NOT NULL,
                media_url TEXT,
                thumbnail_url TEXT
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                target_id TEXT NOT NULL,
                target_name TEXT NOT NULL,
                target_avatar TEXT,
                unread_count INTEGER DEFAULT 0,
                conversation_type TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS contacts (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                nickname TEXT NOT NULL,
                avatar TEXT,
                status TEXT NOT NULL
            );"
        ).map_err(|e| format!("Failed to create tables: {}", e))?;

        Ok(Self {
            db: Mutex::new(db),
        })
    }

    /// 保存消息
    pub fn save_message(&self, message: Message) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        db.execute(
            "INSERT OR REPLACE INTO messages (id, session_id, content, sender_id, timestamp, message_type, media_url, thumbnail_url)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                message.id,
                message.session_id,
                message.content,
                message.sender_id,
                message.timestamp,
                message.message_type,
                message.media_url,
                message.thumbnail_url,
            ],
        ).map_err(|e| format!("Failed to save message: {}", e))?;

        Ok(())
    }

    /// 获取消息
    pub fn get_messages(
        &self,
        session_id: String,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Message>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        let mut stmt = db.prepare(
            "SELECT id, session_id, content, sender_id, timestamp, message_type, media_url, thumbnail_url
             FROM messages WHERE session_id = ?1 ORDER BY timestamp DESC LIMIT ?2 OFFSET ?3"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let messages = stmt.query_map(params![session_id, limit, offset], |row| {
            Ok(Message {
                id: row.get(0)?,
                session_id: row.get(1)?,
                content: row.get(2)?,
                sender_id: row.get(3)?,
                timestamp: row.get(4)?,
                message_type: row.get(5)?,
                media_url: row.get(6)?,
                thumbnail_url: row.get(7)?,
            })
        }).map_err(|e| format!("Failed to query messages: {}", e))?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| format!("Failed to collect messages: {}", e))?;

        Ok(messages)
    }

    /// 保存会话
    pub fn save_session(&self, session: Session) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        db.execute(
            "INSERT OR REPLACE INTO sessions (id, target_id, target_name, target_avatar, unread_count, conversation_type)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                session.id,
                session.target_id,
                session.target_name,
                session.target_avatar,
                session.unread_count,
                session.conversation_type,
            ],
        ).map_err(|e| format!("Failed to save session: {}", e))?;

        Ok(())
    }

    /// 获取会话
    pub fn get_sessions(&self) -> Result<Vec<Session>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        let mut stmt = db.prepare(
            "SELECT id, target_id, target_name, target_avatar, unread_count, conversation_type
             FROM sessions"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let sessions = stmt.query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                target_id: row.get(1)?,
                target_name: row.get(2)?,
                target_avatar: row.get(3)?,
                last_message: None,
                unread_count: row.get(4)?,
                conversation_type: row.get(5)?,
            })
        }).map_err(|e| format!("Failed to query sessions: {}", e))?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| format!("Failed to collect sessions: {}", e))?;

        Ok(sessions)
    }

    /// 保存联系人
    pub fn save_contact(&self, contact: Contact) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        db.execute(
            "INSERT OR REPLACE INTO contacts (id, user_id, nickname, avatar, status)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                contact.id,
                contact.user_id,
                contact.nickname,
                contact.avatar,
                contact.status,
            ],
        ).map_err(|e| format!("Failed to save contact: {}", e))?;

        Ok(())
    }

    /// 获取联系人
    pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        let mut stmt = db.prepare(
            "SELECT id, user_id, nickname, avatar, status FROM contacts"
        ).map_err(|e| format!("Failed to prepare statement: {}", e))?;

        let contacts = stmt.query_map([], |row| {
            Ok(Contact {
                id: row.get(0)?,
                user_id: row.get(1)?,
                nickname: row.get(2)?,
                avatar: row.get(3)?,
                status: row.get(4)?,
            })
        }).map_err(|e| format!("Failed to query contacts: {}", e))?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| format!("Failed to collect contacts: {}", e))?;

        Ok(contacts)
    }

    /// 批量保存消息
    pub fn batch_save_messages(&self, messages: Vec<Message>) -> Result<(), String> {
        let mut db = self.db.lock().map_err(|e| e.to_string())?;

        let transaction = db.transaction().map_err(|e| format!("Failed to start transaction: {}", e))?;

        for message in messages {
            transaction.execute(
                "INSERT OR REPLACE INTO messages (id, session_id, content, sender_id, timestamp, message_type, media_url, thumbnail_url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    message.id,
                    message.session_id,
                    message.content,
                    message.sender_id,
                    message.timestamp,
                    message.message_type,
                    message.media_url,
                    message.thumbnail_url,
                ],
            ).map_err(|e| format!("Failed to insert message: {}", e))?;
        }

        transaction.commit().map_err(|e| format!("Failed to commit transaction: {}", e))?;

        Ok(())
    }

    /// 清空缓存
    pub fn clear_cache(&self) -> Result<(), String> {
        let db = self.db.lock().map_err(|e| e.to_string())?;

        db.execute("DELETE FROM messages", []).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM sessions", []).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM contacts", []).map_err(|e| e.to_string())?;

        Ok(())
    }
}
