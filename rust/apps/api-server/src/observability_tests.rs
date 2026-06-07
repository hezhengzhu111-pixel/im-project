#[cfg(test)]
mod observability_tests {
    use crate::observability;

    #[tokio::test]
    async fn db_query_passes_through_value() {
        let result: Result<i32, &str> = observability::db_query("test_op", async { Ok(42) }).await;
        assert_eq!(result, Ok(42));
    }

    #[tokio::test]
    async fn db_query_passes_through_error() {
        let result: Result<i32, &str> =
            observability::db_query("test_err", async { Err("fail") }).await;
        assert_eq!(result, Err("fail"));
    }

    #[test]
    fn cache_fallback_does_not_panic() {
        observability::cache_fallback("test_op", "test_reason", Some("p_1_2"), 10, 20);
        observability::cache_fallback("test_op", "test_reason", None, 0, 50);
    }

    #[test]
    fn writer_flush_does_not_panic() {
        observability::writer_flush("test_flush", 100, 50, 0, 0);
        observability::writer_flush("test_flush", 0, 100, 10, 5);
    }

    #[test]
    fn pending_events_does_not_panic() {
        observability::pending_events("test_events", 5, Some(10));
        observability::pending_events("test_events", 0, None);
    }
}
