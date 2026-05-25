#[cfg(test)]
mod local_cache_tests {
    use crate::local_cache;

    #[test]
    fn set_and_get_bool_true() {
        let key = "test:bool:true";
        local_cache::set_bool(key, true);
        assert_eq!(local_cache::get_bool(key), Some(true));
    }

    #[test]
    fn set_and_get_bool_false() {
        let key = "test:bool:false";
        local_cache::set_bool(key, false);
        assert_eq!(local_cache::get_bool(key), Some(false));
    }

    #[test]
    fn get_missing_bool_returns_none() {
        assert_eq!(local_cache::get_bool("nonexistent_key_xyz"), None);
    }

    #[test]
    fn set_and_get_i64_some() {
        let key = "test:i64:some";
        local_cache::set_i64_option(key, Some(42));
        assert_eq!(local_cache::get_i64_option(key), Some(Some(42)));
    }

    #[test]
    fn set_and_get_i64_none() {
        let key = "test:i64:none";
        local_cache::set_i64_option(key, None);
        assert_eq!(local_cache::get_i64_option(key), Some(None));
    }

    #[test]
    fn get_missing_i64_returns_none() {
        assert_eq!(local_cache::get_i64_option("no_such_key"), None);
    }

    #[test]
    fn set_and_get_i64_vec() {
        let key = "test:vec";
        local_cache::set_i64_vec(key, vec![1, 2, 3]);
        let result = local_cache::get_i64_vec(key);
        assert_eq!(result, Some(vec![1, 2, 3]));
    }

    #[test]
    fn get_missing_vec_returns_none() {
        assert_eq!(local_cache::get_i64_vec("missing_vec"), None);
    }

    #[test]
    fn wrong_type_returns_none() {
        let key = "test:type:mismatch";
        local_cache::set_bool(key, true);
        assert_eq!(local_cache::get_i64_option(key), None);
        assert_eq!(local_cache::get_i64_vec(key), None);
    }

    #[test]
    fn overwrite_value() {
        let key = "test:overwrite";
        local_cache::set_bool(key, true);
        assert_eq!(local_cache::get_bool(key), Some(true));
        local_cache::set_bool(key, false);
        assert_eq!(local_cache::get_bool(key), Some(false));
    }

    #[test]
    fn key_lock_returns_arc() {
        let lock = local_cache::key_lock("test:lock");
        let lock2 = local_cache::key_lock("test:lock");
        // Same key should return same lock via Arc
        assert!(std::sync::Arc::ptr_eq(&lock, &lock2));
    }

    #[test]
    fn different_keys_have_different_locks() {
        let lock_a = local_cache::key_lock("test:lock:a");
        let lock_b = local_cache::key_lock("test:lock:b");
        assert!(!std::sync::Arc::ptr_eq(&lock_a, &lock_b));
    }

    #[test]
    fn many_keys_dont_panic() {
        for i in 0..100 {
            let key = format!("test:many:{i}");
            local_cache::set_bool(&key, i % 2 == 0);
        }
        for i in 0..100 {
            let key = format!("test:many:{i}");
            let val = local_cache::get_bool(&key);
            assert_eq!(val, Some(i % 2 == 0));
        }
    }
}
