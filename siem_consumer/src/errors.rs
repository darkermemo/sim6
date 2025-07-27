use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConsumerError {
    #[error("Kafka error: {0}")]
    Kafka(#[from] rdkafka::error::KafkaError),

    #[error("ClickHouse error: {0}")]
    ClickHouse(String),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Reqwest error: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Parse error: {0}")]
    Parse(#[from] siem_parser::ParseError),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

pub type Result<T> = std::result::Result<T, ConsumerError>;
