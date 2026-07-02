//! A minimal Mailpit REST client for the integration tests: poll for the newest message
//! to a recipient and return its body, so a flow test can extract an emailed OTP or an
//! invitation token without a real inbox.

use std::time::Duration;

use serde::Deserialize;

/// The Mailpit REST base URL. Its HTTP API and web UI listen on `:8025` by default.
fn base_url() -> String {
    std::env::var("MAILPIT_URL").unwrap_or_else(|_| "http://localhost:8025".to_owned())
}

/// A Mailpit query failure.
#[derive(Debug, thiserror::Error)]
pub enum MailpitError {
    /// The REST request or its JSON body could not be completed/decoded.
    #[error("mailpit request failed: {0}")]
    Request(String),
    /// No message to the recipient arrived within the polling window.
    #[error("no message to {0} arrived within the timeout")]
    NotFound(String),
}

/// One page of message summaries (newest first).
#[derive(Deserialize)]
struct MessagesPage {
    messages: Vec<MessageSummary>,
}

/// A message summary carrying the id and recipient list.
#[derive(Deserialize)]
struct MessageSummary {
    #[serde(rename = "ID")]
    id: String,
    #[serde(rename = "To")]
    to: Vec<Address>,
}

/// A recipient address.
#[derive(Deserialize)]
struct Address {
    #[serde(rename = "Address")]
    address: String,
}

/// A full message body (HTML preferred, plaintext fallback).
#[derive(Deserialize)]
struct MessageBody {
    #[serde(rename = "HTML", default)]
    html: String,
    #[serde(rename = "Text", default)]
    text: String,
}

/// Poll Mailpit until a message addressed to `recipient` appears, returning its rendered
/// body (HTML when present, else plaintext). Times out after ~10 s.
///
/// # Errors
///
/// Returns [`MailpitError::Request`] on a transport/decoding failure or
/// [`MailpitError::NotFound`] when no matching message arrives in time.
pub async fn wait_for_message_to(
    client: &reqwest::Client,
    recipient: &str,
) -> Result<String, MailpitError> {
    let base = base_url();
    for _ in 0..50 {
        let page: MessagesPage = client
            .get(format!("{base}/api/v1/messages"))
            .send()
            .await
            .map_err(|error| MailpitError::Request(error.to_string()))?
            .json()
            .await
            .map_err(|error| MailpitError::Request(error.to_string()))?;
        if let Some(summary) = page.messages.iter().find(|message| {
            message
                .to
                .iter()
                .any(|address| address.address.eq_ignore_ascii_case(recipient))
        }) {
            let body: MessageBody = client
                .get(format!("{base}/api/v1/message/{}", summary.id))
                .send()
                .await
                .map_err(|error| MailpitError::Request(error.to_string()))?
                .json()
                .await
                .map_err(|error| MailpitError::Request(error.to_string()))?;
            return Ok(if body.html.is_empty() {
                body.text
            } else {
                body.html
            });
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Err(MailpitError::NotFound(recipient.to_owned()))
}

/// Return the first maximal run of exactly `len` lowercase-hex characters in `body` — the
/// 64-hex invitation token, distinct from short colour codes in the email template.
#[must_use]
pub fn extract_hex_run(body: &str, len: usize) -> Option<String> {
    maximal_runs(body, |byte| {
        byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
    })
    .into_iter()
    .find(|run| run.len() == len)
}

/// Return the first maximal run of exactly `len` ASCII digits in `body` — the numeric OTP.
#[must_use]
pub fn extract_digit_run(body: &str, len: usize) -> Option<String> {
    maximal_runs(body, |byte| byte.is_ascii_digit())
        .into_iter()
        .find(|run| run.len() == len)
}

/// Collect the maximal contiguous runs of characters that satisfy `keep`.
fn maximal_runs(body: &str, keep: impl Fn(u8) -> bool) -> Vec<String> {
    let mut runs = Vec::new();
    let mut current = String::new();
    for &byte in body.as_bytes() {
        if keep(byte) {
            current.push(char::from(byte));
        } else if !current.is_empty() {
            runs.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        runs.push(current);
    }
    runs
}
