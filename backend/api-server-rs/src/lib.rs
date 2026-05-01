#![forbid(unsafe_code)]
#![deny(unused_must_use)]
#![deny(clippy::as_conversions)]
#![deny(clippy::expect_used)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::unwrap_used)]

pub mod ai;
pub mod auth;
pub mod auth_api;
pub mod background_publisher;
pub mod background_task;
pub mod background_writer;
pub mod config;
pub mod error;
pub mod file_api;
pub mod id_resolver;
pub mod local_cache;
pub mod message;
pub mod observability;
pub mod push_dispatcher;
pub mod redis_streams;
pub mod route;
pub mod social;
pub mod user;
pub mod web;
