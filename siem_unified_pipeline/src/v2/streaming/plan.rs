use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag="pattern")]
pub enum StreamPlan {
    #[serde(rename="threshold")]
    Threshold {
        key_selector: Vec<String>,
        window_sec: u64,
        filters: serde_json::Value,
        group_by: Vec<String>,
        count_gte: u64,
        throttle_seconds: u64,
        dedup_key: Vec<String>,
    },
    #[serde(rename="sequence2")]
    Sequence2 {
        key_selector: Vec<String>,
        window_sec: u64,
        step_a: serde_json::Value,
        step_b: serde_json::Value,
        throttle_seconds: u64,
        dedup_key: Vec<String>,
    }
}


