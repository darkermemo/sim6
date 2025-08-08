use axum::response::sse::{Event, KeepAlive};
use axum::response::Sse;
use std::{convert::Infallible, time::Duration};
use futures_util::stream;
use tokio::time::interval;

pub async fn stream_stub() -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let s = stream::unfold((), move |_| async {
        tokio::time::sleep(Duration::from_secs(5)).await;
        Some((Ok(Event::default().event("heartbeat").data("ok")), ()))
    });
    Sse::new(s).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)).text("keep-alive"))
}


