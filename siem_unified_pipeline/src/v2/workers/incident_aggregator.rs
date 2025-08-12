use blake3::Hasher;
use serde_json::Value;
use crate::v2::state::AppState;

#[derive(Clone, Debug)]
pub struct IncidentConfig {
    pub group_window_sec: u64,
    pub entity_fields: Vec<String>,
    pub auto_owner: String,
}

impl Default for IncidentConfig {
    fn default() -> Self {
        Self {
            group_window_sec: 1800,
            entity_fields: vec![
                "user_name".into(),
                "source_ip".into(),
                "destination_ip".into(),
                "host_name".into(),
            ],
            auto_owner: "unassigned".into(),
        }
    }
}

fn hash_incident_key(tenant_id: &str, rule_id: &str, entities: &str) -> String {
    let mut h = Hasher::new();
    h.update(tenant_id.as_bytes()); h.update(b"|");
    h.update(rule_id.as_bytes()); h.update(b"|");
    h.update(entities.as_bytes());
    h.finalize().to_hex().to_string()
}

type AlertRow = (String, String, String, String, String, String, String, u32);

pub async fn run_once(state: &AppState, cfg: &IncidentConfig) -> anyhow::Result<()> {
    // Watermark from rule_state (key aggregator_incidents)
    let wm_sql = "SELECT toUInt64(max(last_run_ts)) FROM dev.rule_state WHERE rule_id='aggregator_incidents'";
    let last_wm: u64 = state.ch.query(wm_sql).fetch_one().await.unwrap_or(0u64);
    let since = if last_wm > 0 { last_wm } else { (chrono::Utc::now().timestamp() as u64).saturating_sub(cfg.group_window_sec) };

    // Pull new OPEN alerts since watermark
    let q = format!(
        "SELECT alert_id, tenant_id, rule_id, alert_title, alert_description, severity, event_refs, alert_timestamp \
         FROM dev.alerts WHERE status='OPEN' AND alert_timestamp >= {} ORDER BY alert_timestamp ASC",
        since
    );
    let rows: Vec<AlertRow> = state.ch.query(&q).fetch_all().await.unwrap_or_default();
    if rows.is_empty() {
        // advance watermark
        let now_u = chrono::Utc::now().timestamp() as u32;
        let up = format!("INSERT INTO dev.rule_state (rule_id, tenant_id, last_run_ts, last_success_ts, last_error, last_sql, dedup_hash, last_alert_ts, updated_at) VALUES ('aggregator_incidents','all',{},{},'','','',{},toUInt32(now()))", now_u, now_u, now_u);
        let _ = state.ch.query(&up).execute().await;
        return Ok(());
    }

    // group alerts by (tenant_id, rule_id) and aggregate
    use std::collections::HashMap;
    let mut groups: HashMap<(String, String), Vec<AlertRow>> = HashMap::new();
    for row in rows.into_iter() { groups.entry((row.1.clone(), row.2.clone())).or_default().push(row); }

    for ((tenant_id, rule_id), items) in groups.into_iter() {
        let now = chrono::Utc::now().timestamp() as u32;
        let first_ts = items.iter().map(|r| r.7).min().unwrap_or(now);
        let last_ts = items.iter().map(|r| r.7).max().unwrap_or(now);
        let alert_count = items.len() as u32;

        // Build entities by scanning first event_refs payloads
        let mut entity_map = serde_json::Map::new();
        for (_alert_id, _tenant, _rule, _t, _d, _sev, event_refs, _ts) in &items {
            if let Ok(v) = serde_json::from_str::<Value>(event_refs) {
                if let Some(a) = v.as_array().and_then(|a| a.first()) {
                    for f in &cfg.entity_fields {
                        if entity_map.get(f).is_none() {
                            if let Some(val) = a.get(f) { entity_map.insert(f.clone(), val.clone()); }
                        }
                    }
                }
            }
        }
        let entities_val = Value::Object(entity_map.clone());
        let entities = entities_val.to_string();
        let entity_keys = serde_json::to_string(&cfg.entity_fields).unwrap_or("[]".to_string());

        // Severity roll-up (max)
        fn sev_rank(s: &str) -> u8 { match s { "CRITICAL" => 4, "HIGH" => 3, "MEDIUM" => 2, "LOW" => 1, _ => 0 } }
        let max_sev = items.iter().map(|r| r.5.as_str()).max_by_key(|s| sev_rank(s)).unwrap_or("");
        let sev_str = if max_sev.is_empty() { "HIGH" } else { max_sev };

        // Title template using best-available entity
        let title = {
            let keys = ["user_name", "source_ip", "destination_ip", "host_name"];
            let mut v = None;
            for k in keys { if let Some(s) = entities_val.get(k).and_then(|x| x.as_str()) { v = Some(s.to_string()); break; } }
            match v { Some(x) => format!("{} alerts for {}", alert_count, x), None => format!("{} alerts for rule {}", alert_count, rule_id) }
        };

        let incident_id = hash_incident_key(&tenant_id, &rule_id, &entities);
        let rule_id_sql = format!("'{}'", rule_id.replace("'","''"));
        let upsert = format!(
            "INSERT INTO dev.incidents (incident_id,tenant_id,title,description,severity,status,owner,entity_keys,entities,rule_ids,alert_count,first_alert_ts,last_alert_ts,created_at,updated_at) \
             VALUES ('{incident_id}','{tenant_id}','{title}','{desc}','{sev}','OPEN','{owner}','{entity_keys}','{entities}',[{rule_ids}],{count},toUInt32({first_ts}),toUInt32({last_ts}),toUInt32({now}),toUInt32({now}))",
            incident_id = incident_id.replace("'","''"),
            tenant_id = tenant_id.replace("'","''"),
            title = title.replace("'","''"),
            desc = "Auto-aggregated incident".replace("'","''"),
            sev = sev_str.replace("'","''"),
            owner = cfg.auto_owner.replace("'","''"),
            entity_keys = entity_keys.replace("'","''"),
            entities = entities.replace("'","''"),
            rule_ids = rule_id_sql,
            count = alert_count,
            first_ts = first_ts,
            last_ts = last_ts,
            now = now
        );
        let _ = state.ch.query(&upsert).execute().await;

        // Link alerts
        for (alert_id, _tenant, _rule, _t, _d, _sev, _event_refs, _ts) in &items {
            let link = format!(
                "INSERT INTO dev.incident_alerts (tenant_id, incident_id, alert_id, created_at) VALUES ('{}','{}','{}', toUInt32({}))",
                tenant_id.replace("'","''"), incident_id.replace("'","''"), alert_id.replace("'","''"), now
            );
            let _ = state.ch.query(&link).execute().await;
        }
    }

    // advance watermark
    let now_u = chrono::Utc::now().timestamp() as u32;
    let up = format!("INSERT INTO dev.rule_state (rule_id, tenant_id, last_run_ts, last_success_ts, last_error, last_sql, dedup_hash, last_alert_ts, updated_at) VALUES ('aggregator_incidents','all',{},{},'','','',{},toUInt32(now()))", now_u, now_u, now_u);
    let _ = state.ch.query(&up).execute().await;
    Ok(())
}

pub async fn start_worker(state: AppState, cfg: IncidentConfig) {
    tokio::spawn(async move {
        loop {
            let _ = run_once(&state, &cfg).await;
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        }
    });
}


