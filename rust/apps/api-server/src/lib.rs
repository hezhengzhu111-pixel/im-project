#![forbid(unsafe_code)]
#![allow(
    clippy::empty_line_after_doc_comments,
    clippy::empty_line_after_outer_attr
)]
#![deny(unused_must_use)]
#![cfg_attr(not(test), deny(clippy::as_conversions))]
#![cfg_attr(not(test), deny(clippy::expect_used))]
#![cfg_attr(not(test), deny(clippy::indexing_slicing))]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![cfg_attr(not(test), deny(clippy::unwrap_used))]
#![cfg_attr(
    test,
    allow(
        clippy::as_conversions,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::items_after_test_module,
        clippy::manual_repeat_n,
        clippy::module_inception,
        clippy::unwrap_used
    )
)]

pub mod access_control;
pub mod ai;
pub mod auth;
pub mod auth_helpers;
pub mod auth_internal;
pub mod auth_token;
pub mod auth_types;
pub mod auth_ws;

pub(crate) use auth_helpers::*;
pub(crate) use auth_internal::*;
pub(crate) use auth_token::*;
pub(crate) use auth_types::*;

/// Compatibility: preserves `crate::auth_api::*` path.
pub mod auth_api {
    pub(crate) use super::auth_helpers::*;
    pub(crate) use super::auth_internal::*;
    pub(crate) use super::auth_token::*;
    pub(crate) use super::auth_types::*;
    pub(crate) use super::auth_ws::*;
}

#[cfg(test)]
mod auth_helpers_tests;
#[cfg(test)]
mod auth_tests;
#[cfg(test)]
mod local_cache_tests;
#[cfg(test)]
mod observability_tests;
#[cfg(test)]
mod social_helpers_tests;

pub mod background_publisher;
pub mod background_task;
pub mod background_writer;
pub mod config;
pub mod e2ee;
pub mod error;
pub mod file_handlers;
pub mod file_helpers;
pub mod file_types;
pub(crate) use file_helpers::*;
pub(crate) use file_types::*;
pub mod file_api {
    pub(crate) use super::file_handlers::*;
}

pub mod id_resolver;
pub mod local_cache;
pub mod message;
pub mod moments;
pub mod observability;
pub mod push_handlers;
pub mod push_types;
pub(crate) use push_types::*;
pub mod push {
    pub use super::push_handlers::*;
}

pub mod push_dispatcher;
pub mod redis_streams;
pub mod route;
pub mod routes;
pub mod social_friends;
pub mod social_groups;
pub mod social_helpers;
pub mod social_types;
pub(crate) use social_helpers::*;
pub(crate) use social_types::*;
pub mod social {
    pub(crate) use super::social_friends::*;
    pub(crate) use super::social_groups::*;
}

pub mod user_handlers;
pub mod user_helpers;
pub mod user_types;
pub(crate) use user_types::*;
pub mod user {
    pub(crate) use super::user_handlers::*;
}

pub mod web;
