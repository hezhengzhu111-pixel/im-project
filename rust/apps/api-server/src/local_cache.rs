use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

const POSITIVE_TTL: Duration = Duration::from_secs(60);
const NEGATIVE_TTL: Duration = Duration::from_secs(10);
const MAX_ENTRIES: usize = 100_000;
const MAX_LOCKS: usize = 10_000;

#[derive(Clone)]
enum CacheValue {
    Bool(bool),
    I64Option(Option<i64>),
    I64Vec(Vec<i64>),
}

struct CacheEntry {
    expires_at: Instant,
    value: CacheValue,
}

static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
static LOCKS: OnceLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> = OnceLock::new();

pub fn key_lock(key: &str) -> Arc<tokio::sync::Mutex<()>> {
    let locks = LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut guard) = locks.lock() else {
        return Arc::new(tokio::sync::Mutex::new(()));
    };
    if let Some(lock) = guard.get(key) {
        return lock.clone();
    }
    if guard.len() >= MAX_LOCKS {
        guard.clear();
    }
    let lock = Arc::new(tokio::sync::Mutex::new(()));
    guard.insert(key.to_string(), lock.clone());
    lock
}

pub fn get_bool(key: &str) -> Option<bool> {
    match get_value(key)? {
        CacheValue::Bool(value) => Some(value),
        _ => None,
    }
}

pub fn set_bool(key: &str, value: bool) {
    let ttl = if value { POSITIVE_TTL } else { NEGATIVE_TTL };
    set_value(key, CacheValue::Bool(value), ttl);
}

pub fn get_i64_option(key: &str) -> Option<Option<i64>> {
    match get_value(key)? {
        CacheValue::I64Option(value) => Some(value),
        _ => None,
    }
}

pub fn set_i64_option(key: &str, value: Option<i64>) {
    let ttl = if value.is_some() {
        POSITIVE_TTL
    } else {
        NEGATIVE_TTL
    };
    set_value(key, CacheValue::I64Option(value), ttl);
}

pub fn get_i64_vec(key: &str) -> Option<Vec<i64>> {
    match get_value(key)? {
        CacheValue::I64Vec(value) => Some(value),
        _ => None,
    }
}

pub fn set_i64_vec(key: &str, value: Vec<i64>) {
    set_value(key, CacheValue::I64Vec(value), POSITIVE_TTL);
}

fn get_value(key: &str) -> Option<CacheValue> {
    let now = Instant::now();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = cache.lock().ok()?;
    let entry = guard.get(key)?;
    if entry.expires_at <= now {
        guard.remove(key);
        return None;
    }
    Some(entry.value.clone())
}

fn set_value(key: &str, value: CacheValue, ttl: Duration) {
    let now = Instant::now();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut guard) = cache.lock() else {
        return;
    };
    if guard.len() >= MAX_ENTRIES {
        guard.retain(|_, entry| entry.expires_at > now);
        if guard.len() >= MAX_ENTRIES {
            guard.clear();
        }
    }
    guard.insert(
        key.to_string(),
        CacheEntry {
            expires_at: now + ttl,
            value,
        },
    );
}
