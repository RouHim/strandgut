//! Shared HTTP response body type.
//!
//! Handlers in every module return the same type-erased body. `UnsyncBoxBody`
//! is the concrete type produced by `.boxed()` for bodies that do not satisfy
//! the `Send` bound (for example a mapped `Full<Bytes>`).

use http_body_util::combinators::UnsyncBoxBody;
use hyper::body::Bytes;

/// Type-erased response body returned by every handler.
pub type BoxBody = UnsyncBoxBody<Bytes, hyper::Error>;
