#[cfg(test)]
mod api_tests {
    use crate::api::{ApiResponse, ErrorResponse};
    use serde_json;

    #[test]
    fn success_response_has_code_200() {
        let resp = ApiResponse::success("hello");
        assert_eq!(resp.code, 200);
        assert!(resp.success);
        assert_eq!(resp.data, "hello");
        assert_eq!(resp.message, "success");
        assert!(resp.timestamp > 0);
    }

    #[test]
    fn success_response_serializes_to_json() {
        let resp = ApiResponse::success(42);
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"code\":200"));
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"data\":42"));
    }

    #[test]
    fn success_response_with_string_data() {
        let resp = ApiResponse::success("test");
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"data\":\"test\""));
    }

    #[test]
    fn success_response_with_struct_data() {
        #[derive(serde::Serialize)]
        struct Foo {
            bar: i32,
        }
        let resp = ApiResponse::success(Foo { bar: 1 });
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"bar\":1"));
    }

    #[test]
    fn error_response_has_failure_fields() {
        let err = ErrorResponse::new(400, "bad request");
        assert_eq!(err.code, 400);
        assert!(!err.success);
        assert_eq!(err.message, "bad request");
        assert!(err.timestamp > 0);
    }

    #[test]
    fn error_response_serializes_to_json() {
        let err = ErrorResponse::new(500, "internal error");
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"code\":500"));
        assert!(json.contains("\"success\":false"));
        assert!(json.contains("\"message\":\"internal error\""));
    }
}
