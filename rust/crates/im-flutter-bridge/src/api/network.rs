use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

#[cfg(feature = "native")]
mod native_impl {
    use super::*;
    use std::sync::Arc;
    use tokio::sync::RwLock;

    pub struct NetworkService {
        base_url: String,
        auth_token: Arc<RwLock<Option<String>>>,
        http_client: reqwest::Client,
    }

    impl NetworkService {
        pub fn new(base_url: String) -> Self {
            let http_client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("Failed to create HTTP client");
            Self {
                base_url,
                auth_token: Arc::new(RwLock::new(None)),
                http_client,
            }
        }
        pub async fn set_auth_token(&self, token: Option<String>) {
            *self.auth_token.write().await = token;
        }
        pub async fn get(
            &self,
            path: String,
            query_params: Option<HashMap<String, String>>,
        ) -> Result<HttpResponse, String> {
            let url = format!("{}{}", self.base_url, path);
            let mut req = self.http_client.get(&url);
            if let Some(t) = self.auth_token.read().await.clone() {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            if let Some(p) = query_params {
                req = req.query(&p);
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            let status = resp.status().as_u16();
            let mut headers = HashMap::new();
            for (k, v) in resp.headers() {
                if let Ok(v) = v.to_str() {
                    headers.insert(k.to_string(), v.to_string());
                }
            }
            let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
            Ok(HttpResponse {
                status,
                headers,
                body,
            })
        }
        pub async fn post(
            &self,
            path: String,
            body: Option<Vec<u8>>,
        ) -> Result<HttpResponse, String> {
            let url = format!("{}{}", self.base_url, path);
            let mut req = self.http_client.post(&url);
            if let Some(t) = self.auth_token.read().await.clone() {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            if let Some(b) = body {
                req = req.header("Content-Type", "application/json").body(b);
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            let status = resp.status().as_u16();
            let mut headers = HashMap::new();
            for (k, v) in resp.headers() {
                if let Ok(v) = v.to_str() {
                    headers.insert(k.to_string(), v.to_string());
                }
            }
            let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
            Ok(HttpResponse {
                status,
                headers,
                body,
            })
        }
        pub async fn put(
            &self,
            path: String,
            body: Option<Vec<u8>>,
        ) -> Result<HttpResponse, String> {
            let url = format!("{}{}", self.base_url, path);
            let mut req = self.http_client.put(&url);
            if let Some(t) = self.auth_token.read().await.clone() {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            if let Some(b) = body {
                req = req.header("Content-Type", "application/json").body(b);
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            let status = resp.status().as_u16();
            let mut headers = HashMap::new();
            for (k, v) in resp.headers() {
                if let Ok(v) = v.to_str() {
                    headers.insert(k.to_string(), v.to_string());
                }
            }
            let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
            Ok(HttpResponse {
                status,
                headers,
                body,
            })
        }
        pub async fn delete(&self, path: String) -> Result<HttpResponse, String> {
            let url = format!("{}{}", self.base_url, path);
            let mut req = self.http_client.delete(&url);
            if let Some(t) = self.auth_token.read().await.clone() {
                req = req.header("Authorization", format!("Bearer {}", t));
            }
            let resp = req.send().await.map_err(|e| e.to_string())?;
            let status = resp.status().as_u16();
            let mut headers = HashMap::new();
            for (k, v) in resp.headers() {
                if let Ok(v) = v.to_str() {
                    headers.insert(k.to_string(), v.to_string());
                }
            }
            let body = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
            Ok(HttpResponse {
                status,
                headers,
                body,
            })
        }
    }
}

#[cfg(not(feature = "native"))]
mod native_impl {
    use super::*;
    pub struct NetworkService;
    impl NetworkService {
        pub fn new(_base_url: String) -> Self {
            Self
        }
        pub async fn set_auth_token(&self, _token: Option<String>) {}
        pub async fn get(
            &self,
            _path: String,
            _query_params: Option<HashMap<String, String>>,
        ) -> Result<HttpResponse, String> {
            Err("Not available in WASM".into())
        }
        pub async fn post(
            &self,
            _path: String,
            _body: Option<Vec<u8>>,
        ) -> Result<HttpResponse, String> {
            Err("Not available in WASM".into())
        }
        pub async fn put(
            &self,
            _path: String,
            _body: Option<Vec<u8>>,
        ) -> Result<HttpResponse, String> {
            Err("Not available in WASM".into())
        }
        pub async fn delete(&self, _path: String) -> Result<HttpResponse, String> {
            Err("Not available in WASM".into())
        }
    }
}

pub use native_impl::NetworkService;
