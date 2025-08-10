use axum::{Json, extract::State};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::v2::state::AppState;
use crate::error::{Result as PipelineResult, PipelineError, map_clickhouse_http_error};

#[derive(Debug, Deserialize)]
pub struct SeedEntity { pub r#type: String, pub value: String }

#[derive(Debug, Deserialize)]
pub struct TimeRange { pub last_minutes: Option<u32>, pub between: Option<(u32,u32)> }

#[derive(Debug, Deserialize)]
pub struct GraphRequest {
    pub tenant_ids: Vec<String>,
    pub time: TimeRange,
    pub seed_entities: Option<Vec<SeedEntity>>,
    pub max_nodes: Option<u32>,
    pub max_edges: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GraphNode { pub id: String, pub label: String, pub r#type: String, pub count: u32 }

#[derive(Debug, Serialize, Clone)]
pub struct GraphEdge { pub src: String, pub dst: String, pub weight: u32 }

#[derive(Debug, Serialize)]
pub struct GraphResponse { pub nodes: Vec<GraphNode>, pub edges: Vec<GraphEdge> }

pub async fn graph(State(_st): State<Arc<AppState>>, Json(req): Json<GraphRequest>) -> PipelineResult<Json<GraphResponse>> {
    // Guardrails
    if req.tenant_ids.is_empty() { return Err(PipelineError::validation("tenant_ids required")); }
    let max_nodes = req.max_nodes.unwrap_or(100).min(200);
    let max_edges = req.max_edges.unwrap_or(300).min(800);
    let (ts_from, ts_to) = if let Some((a,b)) = req.time.between { (a,b) } else { let lm = req.time.last_minutes.unwrap_or(15).min(1440); let now = chrono::Utc::now().timestamp() as u32; (now - lm*60, now) };

    // Build filters
    let tenants = req.tenant_ids.iter().map(|t| format!("'{}'", t.replace("'","''"))).collect::<Vec<_>>().join(",");
    let mut seed_cond = String::new();
    if let Some(seeds) = &req.seed_entities { if !seeds.is_empty() {
        let mut parts: Vec<String> = Vec::new();
        for s in seeds {
            let v = s.value.replace("'","''");
            match s.r#type.as_str() {
                "user" => parts.push(format!("user_name='{}'", v)),
                "ip" => { parts.push(format!("source_ip='{}'", v)); parts.push(format!("destination_ip='{}'", v)); },
                "host" => parts.push(format!("host_name='{}'", v)),
                _ => {}
            }
        }
        if !parts.is_empty() { seed_cond = format!(" AND ({} )", parts.join(" OR ")); }
    }}

    // Co-occurrence edge queries
    let base_where = format!("WHERE tenant_id IN ({}) AND event_timestamp BETWEEN {} AND {}{}", tenants, ts_from, ts_to, seed_cond);
    let pairs = vec![
        ("user", "user_name", "ip", "source_ip"),
        ("user", "user_name", "ip", "destination_ip"),
        ("ip", "source_ip", "ip", "destination_ip"),
        ("ip", "source_ip", "host", "host_name"),
        ("ip", "destination_ip", "host", "host_name"),
    ];
    let mut selects: Vec<String> = Vec::new();
    for (ta, fa, tb, fb) in pairs {
        selects.push(format!(
            "SELECT '{}' AS a_type, {} AS a, '{}' AS b_type, {} AS b, count() AS w FROM dev.events {} AND {}!='' AND {}!='' GROUP BY a,b ORDER BY w DESC LIMIT {}",
            ta, fa, tb, fb, base_where, fa, fb, max_edges
        ));
    }
    let sql = format!("{} FORMAT JSON", selects.join(" UNION ALL "));

    let client = reqwest::Client::new();
    let resp = client.get("http://localhost:8123/").query(&[("query", sql.clone()), ("max_execution_time","8".into())]).send().await?;
    if !resp.status().is_success() {
        let status = resp.status(); let body = resp.text().await.unwrap_or_default();
        return Err(map_clickhouse_http_error(status, &body, Some(&sql)));
    }
    let text = resp.text().await.unwrap_or_default();
    let parsed: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({"data": []}));
    let rows = parsed.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();

    use std::collections::{HashMap, HashSet};
    let mut node_map: HashMap<String, GraphNode> = HashMap::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    let mut seen_edges: HashSet<(String,String)> = HashSet::new();
    for r in rows.iter() {
        let a_type = r.get("a_type").and_then(|x| x.as_str()).unwrap_or("");
        let b_type = r.get("b_type").and_then(|x| x.as_str()).unwrap_or("");
        let a = r.get("a").and_then(|x| x.as_str()).unwrap_or("");
        let b = r.get("b").and_then(|x| x.as_str()).unwrap_or("");
        let w = r.get("w").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
        if a.is_empty() || b.is_empty() { continue; }
        let a_id = format!("{}:{}", a_type, a);
        let b_id = format!("{}:{}", b_type, b);
        let e_key = if a_id <= b_id { (a_id.clone(), b_id.clone()) } else { (b_id.clone(), a_id.clone()) };
        if seen_edges.insert(e_key.clone()) {
            edges.push(GraphEdge { src: e_key.0.clone(), dst: e_key.1.clone(), weight: w });
        }
        node_map.entry(a_id.clone()).and_modify(|n| n.count += w).or_insert(GraphNode { id: a_id.clone(), label: a.to_string(), r#type: a_type.to_string(), count: w });
        node_map.entry(b_id.clone()).and_modify(|n| n.count += w).or_insert(GraphNode { id: b_id.clone(), label: b.to_string(), r#type: b_type.to_string(), count: w });
        if node_map.len() as u32 >= max_nodes && edges.len() as u32 >= max_edges { break; }
    }
    // Cap sizes
    let mut nodes: Vec<GraphNode> = node_map.into_values().collect();
    nodes.sort_by_key(|n| std::cmp::Reverse(n.count));
    nodes.truncate(max_nodes as usize);
    edges.sort_by_key(|e| std::cmp::Reverse(e.weight));
    edges.truncate(max_edges as usize);

    Ok(Json(GraphResponse { nodes, edges }))
}


