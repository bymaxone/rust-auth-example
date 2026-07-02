//! The outbound transactional-email seam.
//!
//! One shared [`templates`] module renders every message so the transports can never
//! drift; [`lettre::LettreEmailProvider`] delivers over SMTP to the local Mailpit
//! relay. The hosted Resend transport and the provider selector are introduced
//! alongside their configuration.

pub mod lettre;
pub(crate) mod templates;
