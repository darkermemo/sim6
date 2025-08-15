#!/usr/bin/env python3
import argparse, os, sys, json, random, time, uuid, datetime
import ipaddress
import requests

CH_URL = os.getenv("CH_URL","http://127.0.0.1:8123")
CH_DB = os.getenv("CH_DB","siem_v3")
CH_TABLE = os.getenv("CH_TABLE","events_norm")
CH_AUTH = (os.getenv("CH_USER","default"), os.getenv("CH_PASSWORD",""))

def ch(sql:str, fmt="JSON"):
    r = requests.post(f"{CH_URL}/?database={CH_DB}&default_format={fmt}", data=sql, auth=CH_AUTH, timeout=60)
    r.raise_for_status()
    return r.json() if fmt=="JSON" else r.text

def insert_json(rows:list):
    if not rows: return 0
    payload = "\n".join(json.dumps(r, separators=(",",":")) for r in rows)
    r = requests.post(f"{CH_URL}/?database={CH_DB}&query=INSERT%20INTO%20{CH_TABLE}%20FORMAT%20JSONEachRow",
                      data=payload, auth=CH_AUTH, timeout=120, headers={"Content-Type":"application/x-ndjson"})
    r.raise_for_status()
    return len(rows)

def describe_table():
    js = ch(f"DESCRIBE TABLE {CH_TABLE} FORMAT JSON")
    cols = {row["name"]: row["type"] for row in js["data"]}
    return cols

def has_col(cols,name): return name in cols
def now_ms(): return int(time.time()*1000)
def dt_ms(ms): return datetime.datetime.utcfromtimestamp(ms/1000.0).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]

def mk_base(tenant_id, scenario, cols, ts_ms, user=None, src_ip=None, dest_ip=None, host=None):
    row = {}
    if has_col(cols,"tenant_id"): row["tenant_id"] = tenant_id
    if has_col(cols,"ts"): row["ts"] = dt_ms(ts_ms)
    if has_col(cols,"user") and user: row["user"] = user
    if has_col(cols,"src_ip") and src_ip: row["src_ip"] = src_ip
    if has_col(cols,"dest_ip") and dest_ip: row["dest_ip"] = dest_ip
    if has_col(cols,"host") and host: row["host"] = host
    if has_col(cols,"scenario"): row["scenario"] = scenario
    elif has_col(cols,"extra"): row["extra"] = json.dumps({"scenario":scenario})
    elif has_col(cols,"ext"): row["ext"] = json.dumps({"scenario":scenario})
    return row

def ipn(n): return str(ipaddress.IPv4Address(0x0A000000 + n))

# ---------- Scenarios ----------
def s_seq_fail50_then_success(tenant, cols, scale=1):
    rows=[]; base_t=now_ms()-60_000
    user="alice"; src=ipn(42)
    for _ in range(50*scale):
        r=mk_base(tenant,"seq_fail50_then_success",cols,base_t+random.randint(0,150000),user=user,src_ip=src,host="ad1")
        r["event_type"]="auth"; r["outcome"]=0; rows.append(r)
    r=mk_base(tenant,"seq_fail50_then_success",cols,base_t+160000,user=user,src_ip=src,host="ad1")
    r["event_type"]="auth"; r["outcome"]=1; rows.append(r)
    return rows

def s_absence_reset_no_mfa(tenant, cols, scale=1):
    rows=[]; t=now_ms()-1_200_000; u="bob"
    r=mk_base(tenant,"absence_reset_no_mfa",cols,t,user=u,src_ip=ipn(77))
    r["event_type"]="password_reset"; rows.append(r)
    return rows

def s_chain_login_consent_rule(tenant, cols, scale=1):
    rows=[]; t=now_ms()-300_000; u="carol"
    e1=mk_base(tenant,"chain_login_consent_rule",cols,t,user=u,src_ip=ipn(88)); e1["event_type"]="login"; e1["outcome"]=1; rows.append(e1)
    e2=mk_base(tenant,"chain_login_consent_rule",cols,t+30_000,user=u); e2["event_type"]="oauth_consent"; rows.append(e2)
    e3=mk_base(tenant,"chain_login_consent_rule",cols,t+45_000,user=u); e3["event_type"]="mailbox_rule"; rows.append(e3)
    return rows

def s_rolling_fails_5m(tenant, cols, scale=1):
    rows=[]; base=now_ms()-240_000; ip=ipn(123)
    for i in range(120*scale):
        r=mk_base(tenant,"rolling_fails_5m", cols, base+ (i*2000), user=f"user{i%5}", src_ip=ip)
        r["event_type"]="auth"; r["outcome"]=0; rows.append(r)
    return rows

def s_ratio_fail_success(tenant, cols, scale=1):
    rows=[]; base=now_ms()-500_000; ip=ipn(200)
    for i in range(200*scale):
        r=mk_base(tenant,"ratio_fail_success", cols, base+i*2000, user="eve", src_ip=ip)
        r["event_type"]="auth"; r["outcome"]=0; rows.append(r)
    for i in range(5*scale):
        r=mk_base(tenant,"ratio_fail_success", cols, base+30_000+i*30_000, user="eve", src_ip=ip)
        r["event_type"]="auth"; r["outcome"]=1; rows.append(r)
    return rows

def s_first_seen_country(tenant, cols, scale=1):
    rows=[]; t=now_ms()-120_000; u="frank"
    r=mk_base(tenant,"first_seen_country", cols, t, user=u, src_ip="198.18.0.23"); r["event_type"]="auth"; r["outcome"]=1; rows.append(r)
    return rows

def s_beaconing(tenant, cols, scale=1):
    rows=[]; start=now_ms()-3_600_000; src=ipn(55); dest="203.0.113.50"
    for i in range(25*scale):
        r=mk_base(tenant,"beaconing", cols, start + i* (60_000), src_ip=src, dest_ip=dest, host="gw1")
        r["event_type"]="net"; r["bytes_out"]=random.randint(400,900); rows.append(r)
    return rows

def s_diversity_spread(tenant, cols, scale=1):
    rows=[]; base=now_ms()-420_000; src=ipn(90)
    for i in range(25*scale):
        r=mk_base(tenant,"diversity_spread", cols, base+i*10_000, user=f"user{i}", src_ip=src, host=f"h{i%3}")
        r["event_type"]="auth"; r["outcome"]=1; rows.append(r)
    return rows

SCENARIOS = {
  "seq_fail50_then_success": s_seq_fail50_then_success,
  "absence_reset_no_mfa":    s_absence_reset_no_mfa,
  "chain_login_consent_rule":s_chain_login_consent_rule,
  "rolling_fails_5m":        s_rolling_fails_5m,
  "ratio_fail_success":      s_ratio_fail_success,
  "first_seen_country":      s_first_seen_country,
  "beaconing":               s_beaconing,
  "diversity_spread":        s_diversity_spread,
}

def ensure_runs_table():
    sql = """
CREATE TABLE IF NOT EXISTS attack_sim_runs
(
  run_id UUID,
  ts DateTime64(3),
  tenant_id String,
  scenario String,
  inserted UInt32
) ENGINE=MergeTree ORDER BY (tenant_id, ts)
"""
    requests.post(f"{CH_URL}/?database={CH_DB}", data=sql, auth=CH_AUTH, timeout=30).raise_for_status()

def record_run(tenant, scenario, inserted):
    run = {
      "run_id": str(uuid.uuid4()),
      "ts": dt_ms(now_ms()),
      "tenant_id": tenant,
      "scenario": scenario,
      "inserted": inserted
    }
    r = requests.post(f"{CH_URL}/?database={CH_DB}&query=INSERT%20INTO%20attack_sim_runs%20FORMAT%20JSONEachRow",
                      data=json.dumps(run), auth=CH_AUTH, timeout=30,
                      headers={"Content-Type":"application/x-ndjson"})
    r.raise_for_status()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant", default="t_fixture")
    ap.add_argument("--scenarios", default="all")
    ap.add_argument("--scale", type=int, default=1)
    args = ap.parse_args()

    cols = describe_table()
    ensure_runs_table()

    wanted = list(SCENARIOS.keys()) if args.scenarios=="all" else [s.strip() for s in args.scenarios.split(",") if s.strip() in SCENARIOS]
    total=0; results=[]
    for s in wanted:
        rows = SCENARIOS[s](args.tenant, cols, args.scale)
        inserted = insert_json(rows)
        record_run(args.tenant, s, inserted)
        results.append({"scenario":s,"inserted":inserted})
        total += inserted

    print(json.dumps({"ok": True, "tenant": args.tenant, "total_inserted": total, "details": results}, separators=(",",":")))
    return 0

if __name__=="__main__":
    try: sys.exit(main())
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


