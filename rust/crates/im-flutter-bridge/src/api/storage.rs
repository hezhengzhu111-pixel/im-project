use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub user_id: String,
    pub nickname: String,
    pub avatar: Option<String>,
    pub status: String,
}

#[cfg(feature = "native")]
mod native_impl {
    use super::*;
    use rusqlite::{params, Connection};
    use std::sync::Mutex;

    pub struct LocalStorage {
        db: Mutex<Connection>,
    }

    impl LocalStorage {
        pub fn new(db_path: String) -> Result<Self, String> {
            let db = Connection::open(&db_path).map_err(|e| format!("{}", e))?;
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
                );",
            )
            .map_err(|e| format!("{}", e))?;
            Ok(Self { db: Mutex::new(db) })
        }

        pub fn save_message(&self, m: Message) -> Result<(), String> {
            self.db
                .lock()
                .map_err(|e| e.to_string())?
                .execute(
                    "INSERT OR REPLACE INTO messages VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![
                        m.id,
                        m.session_id,
                        m.content,
                        m.sender_id,
                        m.timestamp,
                        m.message_type,
                        m.media_url,
                        m.thumbnail_url,
                    ],
                )
                .map_err(|e| format!("{}", e))?;
            Ok(())
        }

        pub fn get_messages(
            &self,
            session_id: String,
            limit: i64,
            offset: i64,
        ) -> Result<Vec<Message>, String> {
            let db = self.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db
                .prepare(
                    "SELECT id,session_id,content,sender_id,timestamp,message_type,media_url,thumbnail_url
                     FROM messages WHERE session_id=?1 ORDER BY timestamp DESC LIMIT ?2 OFFSET ?3",
                )
                .map_err(|e| format!("{}", e))?;

            let messages = stmt
                .query_map(params![session_id, limit, offset], |row| {
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
                })
                .map_err(|e| format!("{}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("{}", e))?;

            Ok(messages)
        }

        pub fn save_session(&self, s: Session) -> Result<(), String> {
            self.db
                .lock()
                .map_err(|e| e.to_string())?
                .execute(
                    "INSERT OR REPLACE INTO sessions VALUES (?1,?2,?3,?4,?5,?6)",
                    params![
                        s.id,
                        s.target_id,
                        s.target_name,
                        s.target_avatar,
                        s.unread_count,
                        s.conversation_type,
                    ],
                )
                .map_err(|e| format!("{}", e))?;
            Ok(())
        }

        pub fn get_sessions(&self) -> Result<Vec<Session>, String> {
            let db = self.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db
                .prepare(
                    "SELECT id,target_id,target_name,target_avatar,unread_count,conversation_type
                     FROM sessions",
                )
                .map_err(|e| format!("{}", e))?;

            let sessions = stmt
                .query_map([], |row| {
                    Ok(Session {
                        id: row.get(0)?,
                        target_id: row.get(1)?,
                        target_name: row.get(2)?,
                        target_avatar: row.get(3)?,
                        last_message: None,
                        unread_count: row.get(4)?,
                        conversation_type: row.get(5)?,
                    })
                })
                .map_err(|e| format!("{}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("{}", e))?;

            Ok(sessions)
        }

        pub fn save_contact(&self, c: Contact) -> Result<(), String> {
            self.db
                .lock()
                .map_err(|e| e.to_string())?
                .execute(
                    "INSERT OR REPLACE INTO contacts VALUES (?1,?2,?3,?4,?5)",
                    params![c.id, c.user_id, c.nickname, c.avatar, c.status],
                )
                .map_err(|e| format!("{}", e))?;
            Ok(())
        }

        pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
            let db = self.db.lock().map_err(|e| e.to_string())?;
            let mut stmt = db
                .prepare("SELECT id,user_id,nickname,avatar,status FROM contacts")
                .map_err(|e| format!("{}", e))?;

            let contacts = stmt
                .query_map([], |row| {
                    Ok(Contact {
                        id: row.get(0)?,
                        user_id: row.get(1)?,
                        nickname: row.get(2)?,
                        avatar: row.get(3)?,
                        status: row.get(4)?,
                    })
                })
                .map_err(|e| format!("{}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("{}", e))?;

            Ok(contacts)
        }

        pub fn batch_save_messages(&self, messages: Vec<Message>) -> Result<(), String> {
            let mut db = self.db.lock().map_err(|e| e.to_string())?;
            let tx = db.transaction().map_err(|e| format!("{}", e))?;
            for m in messages {
                tx.execute(
                    "INSERT OR REPLACE INTO messages VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![
                        m.id,
                        m.session_id,
                        m.content,
                        m.sender_id,
                        m.timestamp,
                        m.message_type,
                        m.media_url,
                        m.thumbnail_url,
                    ],
                )
                .map_err(|e| format!("{}", e))?;
            }
            tx.commit().map_err(|e| format!("{}", e))
        }

        pub fn clear_cache(&self) -> Result<(), String> {
            let db = self.db.lock().map_err(|e| e.to_string())?;
            db.execute("DELETE FROM messages", [])
                .map_err(|e| e.to_string())?;
            db.execute("DELETE FROM sessions", [])
                .map_err(|e| e.to_string())?;
            db.execute("DELETE FROM contacts", [])
                .map_err(|e| e.to_string())?;
            Ok(())
        }
    }
}

#[cfg(not(feature = "native"))]
mod native_impl {
    use super::*;

    pub struct LocalStorage;

    impl LocalStorage {
        pub fn new(_db_path: String) -> Result<Self, String> {
            Ok(Self)
        }
        pub fn save_message(&self, _m: Message) -> Result<(), String> {
            Err("Not available in WASM".into())
        }
        pub fn get_messages(&self, _sid: String, _l: i64, _o: i64) -> Result<Vec<Message>, String> {
            Err("Not available in WASM".into())
        }
        pub fn save_session(&self, _s: Session) -> Result<(), String> {
            Err("Not available in WASM".into())
        }
        pub fn get_sessions(&self) -> Result<Vec<Session>, String> {
            Err("Not available in WASM".into())
        }
        pub fn save_contact(&self, _c: Contact) -> Result<(), String> {
            Err("Not available in WASM".into())
        }
        pub fn get_contacts(&self) -> Result<Vec<Contact>, String> {
            Err("Not available in WASM".into())
        }
        pub fn batch_save_messages(&self, _m: Vec<Message>) -> Result<(), String> {
            Err("Not available in WASM".into())
        }
        pub fn clear_cache(&self) -> Result<(), String> {
            Err("Not available in WASM".into())
        }
    }
}

pub use native_impl::LocalStorage;
