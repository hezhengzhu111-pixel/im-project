#[cfg(test)]
mod message_cache_tests {
    use crate::message::message_cache;

    #[test]
    fn validate_mentioned_user_ids_deduplicates() {
        let input = vec!["100".to_string(), "200".to_string(), "100".to_string()];
        let result = message_cache::validate_mentioned_user_ids(&input, 1);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![100, 200]);
    }

    #[test]
    fn validate_mentioned_user_ids_excludes_sender() {
        let input = vec!["100".to_string(), "200".to_string()];
        let result = message_cache::validate_mentioned_user_ids(&input, 100);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![200]);
    }

    #[test]
    fn validate_mentioned_user_ids_rejects_invalid_string() {
        let input = vec!["abc".to_string()];
        assert!(message_cache::validate_mentioned_user_ids(&input, 1).is_err());
    }

    #[test]
    fn validate_mentioned_user_ids_trims_whitespace() {
        let input = vec![" 100 ".to_string(), "\t200\t".to_string()];
        let result = message_cache::validate_mentioned_user_ids(&input, 1);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![100, 200]);
    }

    #[test]
    fn validate_mentioned_user_ids_empty_input() {
        let input: Vec<String> = vec![];
        let result = message_cache::validate_mentioned_user_ids(&input, 1);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn validate_mentioned_user_ids_all_sender_excluded() {
        let input = vec!["50".to_string(), "50".to_string()];
        let result = message_cache::validate_mentioned_user_ids(&input, 50);
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn validate_mentioned_user_ids_mixed_content() {
        let input = vec!["100".to_string(), "200".to_string(), "300".to_string()];
        let result = message_cache::validate_mentioned_user_ids(&input, 1);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), vec![100, 200, 300]);
    }
}
