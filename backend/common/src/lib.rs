#![forbid(unsafe_code)]
#![deny(unused_must_use)]
#![deny(clippy::as_conversions)]
#![deny(clippy::expect_used)]
#![deny(clippy::indexing_slicing)]
#![deny(clippy::panic)]
#![deny(clippy::todo)]
#![deny(clippy::unimplemented)]
#![deny(clippy::unwrap_used)]

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
