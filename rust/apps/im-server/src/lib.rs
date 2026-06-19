#![forbid(unsafe_code)]
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
        clippy::panic,
        clippy::unwrap_used
    )
)]

pub mod clients;
pub mod config;
pub mod dto;
pub mod error;
pub mod route;
pub mod security;
pub mod service;
pub mod web;
