//! rust-auth-example API library: the axum service that hosts the `bymax-auth`
//! engine and the example's own domain routes.
//!
//! The binary entry point is a thin shell over this crate: it loads the validated
//! configuration, connects the shared handles, composes the router, and serves it.
//! Every unit and integration test exercises the modules here directly, so the
//! bootable logic stays testable without binding a live port.
#![forbid(unsafe_code)]
#![deny(missing_docs)]

pub mod app;
pub mod config;
pub mod db;
pub mod email;
pub mod engine;
pub mod error;
pub mod hooks;
pub mod layers;
pub mod repository;
pub mod routes;
pub mod stores;
pub mod telemetry;
