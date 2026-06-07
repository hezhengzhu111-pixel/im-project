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
        clippy::module_inception,
        clippy::single_component_path_imports,
        clippy::unwrap_used
    )
)]

pub mod api;
pub mod auth;
pub mod event;
pub mod ids;
pub mod keys;
pub mod moments;
pub mod time;

#[cfg(test)]
mod api_tests;
#[cfg(test)]
mod ids_tests;
#[cfg(test)]
mod keys_tests;
#[cfg(test)]
mod time_tests;
