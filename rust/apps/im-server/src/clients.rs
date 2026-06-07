use crate::config::AppConfig;
use crate::dto::{ApiResponse, ConsumeWsTicketRequest, WsTicketConsumeResult};
use crate::error::AppError;
use crate::security::internal_signature_headers;
use reqwest::Client;
use serde::de::DeserializeOwned;
use std::sync::Arc;

#[derive(Clone)]
pub struct InternalClients {
    config: Arc<AppConfig>,
    http: Client,
}

impl InternalClients {
    pub fn new(config: Arc<AppConfig>) -> Self {
        Self {
            config,
            http: Client::new(),
        }
    }

    pub async fn consume_ws_ticket(
        &self,
        ticket: &str,
        user_id: i64,
    ) -> Result<WsTicketConsumeResult, AppError> {
        let path = "/api/auth/internal/ws-ticket/consume";
        let body = serde_json::to_vec(&ConsumeWsTicketRequest {
            ticket: Some(ticket.to_string()),
            user_id: Some(user_id),
        })?;
        let response: ApiResponse<WsTicketConsumeResult> = self
            .post_json(&self.config.auth_service_url, path, body)
            .await?;
        response
            .data
            .ok_or_else(|| AppError::BadRequest("empty ws ticket consume response".to_string()))
    }

    async fn post_json<T: DeserializeOwned>(
        &self,
        base_url: &str,
        path: &str,
        body: Vec<u8>,
    ) -> Result<T, AppError> {
        let url = format!("{}{}", base_url.trim_end_matches('/'), path);
        let mut request = self
            .http
            .post(url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .body(body.clone());
        for (name, value) in internal_signature_headers("POST", path, &body, &self.config)? {
            request = request.header(name, value);
        }
        let response = request.send().await?;
        if !response.status().is_success() {
            return Err(AppError::BadRequest(format!(
                "upstream returned {}",
                response.status()
            )));
        }
        Ok(response.json::<T>().await?)
    }
}
