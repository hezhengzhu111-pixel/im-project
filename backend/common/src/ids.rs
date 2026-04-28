use std::sync::atomic::{AtomicU64, Ordering};

static LAST_MS_AND_SEQ: AtomicU64 = AtomicU64::new(0);

pub fn next_id(node_id: u16) -> i64 {
    let node = (node_id as u64) & 0x03ff;
    loop {
        let now = crate::time::now_ms().max(0) as u64;
        let current = LAST_MS_AND_SEQ.load(Ordering::Relaxed);
        let last_ms = current >> 12;
        let last_seq = current & 0x0fff;
        let (ms, seq) = if now > last_ms {
            (now, 0)
        } else if last_seq < 0x0fff {
            (last_ms, last_seq + 1)
        } else {
            (last_ms + 1, 0)
        };
        let next = (ms << 12) | seq;
        if LAST_MS_AND_SEQ
            .compare_exchange(current, next, Ordering::SeqCst, Ordering::Relaxed)
            .is_ok()
        {
            return (((ms & 0x1ffffffffff) << 22) | (node << 12) | seq) as i64;
        }
    }
}
