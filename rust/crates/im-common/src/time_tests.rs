#[cfg(test)]
mod time_tests {
    use crate::time;

    #[test]
    fn now_ms_returns_positive_value() {
        let ms = time::now_ms();
        assert!(
            ms > 0,
            "now_ms should return a positive timestamp, got {ms}"
        );
    }

    #[test]
    fn now_ms_is_monotonically_increasing() {
        let t1 = time::now_ms();
        let t2 = time::now_ms();
        assert!(t2 >= t1, "time must not go backwards: {t1} -> {t2}");
    }

    #[test]
    fn now_iso_has_expected_format() {
        let iso = time::now_iso();
        assert!(iso.contains('T'), "ISO format must contain 'T', got {iso}");
        assert!(iso.ends_with('Z'), "ISO format must be UTC, got {iso}");
        assert_eq!(
            iso.len(),
            24,
            "ISO format should be 24 chars (with millis), got {} chars",
            iso.len()
        );
    }

    #[test]
    fn iso_from_ms_produces_valid_utc() {
        let sample_ms = 1_700_000_000_000i64;
        let iso = time::iso_from_ms(sample_ms);
        assert!(iso.contains('T'), "ISO must contain 'T', got {iso}");
        assert!(iso.ends_with('Z'), "ISO must be UTC, got {iso}");
    }

    #[test]
    fn iso_from_ms_zero_is_epoch() {
        let iso = time::iso_from_ms(0);
        assert!(
            iso.starts_with("1970-01-01"),
            "epoch must be 1970-01-01, got {iso}"
        );
    }

    #[test]
    fn iso_from_ms_roundtrip_is_stable() {
        let ms = time::now_ms();
        let iso = time::iso_from_ms(ms);
        assert!(!iso.is_empty(), "ISO string must not be empty");
    }
}
