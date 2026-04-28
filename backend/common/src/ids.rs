use std::sync::atomic::{AtomicU64, Ordering};

static LAST_MS_AND_SEQ: AtomicU64 = AtomicU64::new(0);

pub fn next_id(node_id: u16) -> i64 {
    let node = u64::from(node_id) & 0x03ff;
    loop {
        let Ok(now) = u64::try_from(crate::time::now_ms().max(0)) else {
            continue;
        };
        let current = LAST_MS_AND_SEQ.load(Ordering::Relaxed);
        let last_ms = current >> 12;
        let last_seq = current & 0x0fff;
        let (ms, seq) = if now > last_ms {
            (now, 0)
        } else if last_seq < 0x0fff {
            (last_ms, last_seq.saturating_add(1))
        } else {
            (last_ms.saturating_add(1), 0)
        };
        let next = ms.checked_shl(12).unwrap_or(u64::MAX) | seq;
        if LAST_MS_AND_SEQ
            .compare_exchange(current, next, Ordering::SeqCst, Ordering::Relaxed)
            .is_ok()
        {
            let timestamp_part = (ms & 0x1ffffffffff).checked_shl(22).unwrap_or(u64::MAX);
            let node_part = node.checked_shl(12).unwrap_or(u64::MAX);
            let id = timestamp_part | node_part | seq;
            if let Ok(id) = i64::try_from(id) {
                return id;
            }
        }
    }
}
