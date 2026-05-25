pub mod cleanup;
pub mod group_api;
pub mod key_backup;
pub mod key_bundle;
pub mod key_device;
pub mod key_helpers;
pub mod key_types;

pub(crate) use key_helpers::*;
pub(crate) use key_types::*;

/// Compatibility re-exports for `e2ee::key_api::*` path used in routes.
pub mod key_api {
    pub(crate) use super::key_backup::*;
    pub(crate) use super::key_bundle::*;
    pub(crate) use super::key_device::*;
    pub(crate) use super::key_helpers::*;
    pub(crate) use super::key_types::*;
}

pub mod session_crud;
pub mod session_helpers;
pub mod session_negotiation;
pub mod session_types;

pub(crate) use session_crud::*;
pub(crate) use session_helpers::*;
pub(crate) use session_negotiation::*;
pub(crate) use session_types::*;

/// Compatibility for `e2ee::session_api::*`
pub mod session_api {
    pub(crate) use super::session_crud::*;
    pub(crate) use super::session_helpers::*;
    pub(crate) use super::session_negotiation::*;
    pub(crate) use super::session_types::*;
}

#[cfg(test)]
mod key_tests;
