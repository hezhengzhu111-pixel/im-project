use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use std::sync::Arc;

/// HTTP 响应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

/// 网络服务
pub struct NetworkService {
    base_url: String,
    auth_token: Arc<RwLock<Option<String>>>,
    http_client: reqwest::Client,
}

impl NetworkService {
    /// 创建新的网络服务实例
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

    /// 设置认证令牌
    pub async fn set_auth_token(&self, token: Option<String>) {
        let mut auth_token = self.auth_token.write().await;
        *auth_token = token;
    }

    /// 获取认证令牌
    async fn get_auth_header(&self) -> Option<String> {
        let token = self.auth_token.read().await;
        token.clone().map(|t| format!("Bearer {}", t))
    }

    /// 发送 GET 请求
    pub async fn get(
        &self,
        path: String,
        query_params: Option<HashMap<String, String>>,
    ) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);

        let mut request = self.http_client.get(&url);

        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }

        if let Some(params) = query_params {
            request = request.query(&params);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 发送 POST 请求
    pub async fn post(
        &self,
        path: String,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);

        let mut request = self.http_client.post(&url);

        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }

        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 发送 PUT 请求
    pub async fn put(
        &self,
        path: String,
        body: Option<Vec<u8>>,
    ) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);

        let mut request = self.http_client.put(&url);

        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }

        if let Some(body) = body {
            request = request
                .header("Content-Type", "application/json")
                .body(body);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 发送 DELETE 请求
    pub async fn delete(&self, path: String) -> Result<HttpResponse, String> {
        let url = format!("{}{}", self.base_url, path);

        let mut request = self.http_client.delete(&url);

        if let Some(auth) = self.get_auth_header().await {
            request = request.header("Authorization", auth);
        }

        let response = request.send().await.map_err(|e| e.to_string())?;
        self.parse_response(response).await
    }

    /// 解析 HTTP 响应
    async fn parse_response(&self, response: reqwest::Response) -> Result<HttpResponse, String> {
        let status = response.status().as_u16();

        let mut headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(v) = value.to_str() {
                headers.insert(key.to_string(), v.to_string());
            }
        }

        let body = response.bytes().await.map_err(|e| e.to_string())?.to_vec();

        Ok(HttpResponse {
            status,
            headers,
            body,
        })
    }
}
