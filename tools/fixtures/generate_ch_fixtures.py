#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, sys, json, time, argparse, random, string
from datetime import datetime, timedelta, timezone
import requests

CH_URL   = os.getenv("CH_URL",   "http://127.0.0.1:8123")
CH_DB    = os.getenv("CH_DB",    "siem_v3")
CH_TABLE = os.getenv("CH_TABLE", "events_norm")
CH_USER  = os.getenv("CH_USER",  "default")
CH_PASS  = os.getenv("CH_PASS",  "")
TENANT   = os.getenv("TENANT_ID","t_fixture")

SESSION_RUN_ID = datetime.utcnow().strftime("%Y%m%d%H%M%S")

# ---------- ClickHouse helpers ----------
def ch_sql(sql:str, params=None, settings=None):
    qp = []
    if settings:
        for k,v in settings.items():
            qp.append(f"{k}={v}")
    url = f"{CH_URL}/?database={CH_DB}"
    if qp:
        url += "&" + "&".join(qp)
    auth = (CH_USER, CH_PASS) if CH_USER or CH_PASS else None
    r = requests.post(url, data=sql.encode("utf-8"), auth=auth, timeout=60)
    r.raise_for_status()
    return r.text

def get_table_columns(db, table):
    sql = f"SELECT name, type FROM system.columns WHERE database='{db}' AND table='{table}' ORDER BY position FORMAT TabSeparated"
    rows = ch_sql(sql)
    out = []
    for line in rows.strip().splitlines():
        if not line: continue
        parts = line.split("\t")
        if len(parts)>=2:
            out.append((parts[0], parts[1]))
    return out

def insert_json_each_row(rows):
    if not rows: return
    settings = {
        "query": f"INSERT INTO {CH_DB}.{CH_TABLE} FORMAT JSONEachRow",
        "input_format_skip_unknown_fields": "1",
        "date_time_input_format": "best_effort",
    }
    url = f"{CH_URL}/?database={CH_DB}&" + "&".join([f"{k}={v}" for k,v in settings.items()])
    auth = (CH_USER, CH_PASS) if CH_USER or CH_PASS else None
    def gen():
        for r in rows:
            yield (json.dumps(r, separators=(",",":")) + "\n").encode("utf-8")
    resp = requests.post(url, data=gen(), auth=auth, timeout=300)
    resp.raise_for_status()

# ---------- Schema adaptation ----------
COLS = dict(get_table_columns(CH_DB, CH_TABLE))
HAS_EXTRA = "extra" in COLS or "ext" in COLS
EXTRA_COL = "extra" if "extra" in COLS else ("ext" if "ext" in COLS else None)

def adapt(row:dict) -> dict:
    known = {}
    extra = {}
    for k,v in row.items():
        if k in COLS:
            known[k] = v
        else:
            extra[k] = v
    if EXTRA_COL and extra:
        known[EXTRA_COL] = extra
    return known

# ---------- time helpers ----------
def utc_iso(dt): return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00","Z")
def now(): return datetime.utcnow().replace(tzinfo=timezone.utc)
def sec(n): return timedelta(seconds=n)
def min_(n): return timedelta(minutes=n)
def hr(n): return timedelta(hours=n)
def randstr(n):
    chars = string.ascii_letters + string.digits
    return "".join(random.choice(chars) for _ in range(n))

# ---------- base event ----------
BASE = {
  "tenant_id": TENANT,
  "event_type": "misc",
  "outcome": 1,
  "user": "user",
  "src_ip": "10.0.0.10",
  "dest_ip": "10.0.0.20",
  "host": "host-1",
  "bytes_in": 0,
  "bytes_out": 0,
  "scenario": "unset",
  "src": "fixture",
  "run_id": SESSION_RUN_ID
}

def ev(ts_dt, **over):
    r = BASE.copy()
    r["ts"] = utc_iso(ts_dt)
    r.update(over)
    return adapt(r)

# ---------- scenario generators ----------
def s_seq_fail50_then_success():
    rows=[]
    start = now()-min_(4)
    user="alice"; ip="198.51.100.50"
    for i in range(50):
        rows.append(ev(start + sec(i*2), scenario="seq_fail50_then_success",
                       event_type="auth", outcome=0, user=user, src_ip=ip))
    rows.append(ev(now()-min_(1), scenario="seq_fail50_then_success",
                   event_type="auth", outcome=1, user=user, src_ip=ip))
    return rows

def s_absence_reset_no_mfa():
    t = now()-min_(10)
    return [ev(t, scenario="absence_reset_no_mfa", event_type="password_reset", outcome=1, user="bob")]

def s_chain_login_consent_rule():
    base = now()-min_(15)
    u="carol"
    return [
        ev(base+sec(0),  scenario="chain_login_consent_rule", event_type="login", outcome=1, user=u),
        ev(base+sec(60), scenario="chain_login_consent_rule", event_type="oauth_consent", outcome=1, user=u),
        ev(base+sec(120),scenario="chain_login_consent_rule", event_type="mailbox_rule", outcome=1, user=u),
    ]

def s_rolling_fails_5m():
    rows=[]; ip="192.0.2.10"
    start = now()-min_(5)
    for i in range(120):
        rows.append(ev(start+sec(i*2), scenario="rolling_fails_5m",
                       event_type="auth", outcome=0, src_ip=ip, user=f"u{i%4}"))
    return rows

def s_ratio_fail_success_20to1():
    rows=[]; ip="198.51.100.5"; start=now()-min_(10)
    for i in range(210):
        rows.append(ev(start+sec(i), scenario="ratio_fail_success", event_type="auth", outcome=0, src_ip=ip, user=f"ratio_u{i%3}"))
    for i in range(5):
        rows.append(ev(now()-sec(60 - i*5), scenario="ratio_fail_success", event_type="auth", outcome=1, src_ip=ip, user=f"ratio_u{i%3}"))
    return rows

def s_first_seen_country():
    rows=[]
    u="dora"
    rows.append(ev(now()-timedelta(days=90), scenario="first_seen_country", event_type="auth", outcome=1, user=u, src_ip="8.8.8.8"))
    rows.append(ev(now()-sec(120),           scenario="first_seen_country", event_type="auth", outcome=1, user=u, src_ip="49.12.0.1"))
    return rows

def s_beaconing():
    rows=[]; src="10.20.30.40"; dest="203.0.113.7"; base=now()-hr(1)
    for i in range(30):
        rows.append(ev(base+sec(i*120), scenario="beaconing", event_type="net", user="svc-c2",
                       src_ip=src, dest_ip=dest, bytes_out=1500))
    return rows

def s_burstiness():
    rows=[]; host="host-burst-1"; base=now()
    for i in range(20):
        rows.append(ev(base-min_(20)+sec(i*30), scenario="burstiness", event_type="proc", host=host))
    for i in range(500):
        rows.append(ev(base-min_(2)+sec(i//4),   scenario="burstiness", event_type="proc", host=host))
    return rows

def s_time_of_day_anom():
    rows=[]
    today = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    two_am = today.replace(hour=2)
    u="owl"
    for i in range(300):
        rows.append(ev(two_am+sec(i*24), scenario="time_of_day_anom", event_type="auth", outcome=1, user=u))
    return rows

def s_travel_flip():
    u="eve"
    return [
        ev(now()-sec(3600), scenario="travel_flip", event_type="auth", outcome=1, user=u, src_ip="8.8.8.8"),
        ev(now()-sec(1800), scenario="travel_flip", event_type="auth", outcome=1, user=u, src_ip="49.12.0.1"),
    ]

def s_lex_dga():
    rows=[]
    def rnd(n): return "".join(random.choice(string.ascii_letters+string.digits) for _ in range(n))
    for i in range(100):
        rows.append(ev(now()-sec(i*10), scenario="lex_dga", event_type="dns", dest_ip="203.0.113.99",
                       dns_qname=f"{rnd(48)}.example.com"))
    return rows

def s_diversity_spread_users_by_ip():
    rows=[]; ip="203.0.113.50"; base=now()-min_(10)
    for i in range(25):
        rows.append(ev(base+sec(i*20), scenario="diversity_spread", event_type="auth", outcome=1, src_ip=ip, user=f"user{i}"))
    return rows

# Additional scenarios omitted for brevity in this script (can be extended)

SCENARIOS = {
  "seq":            s_seq_fail50_then_success,
  "absence":        s_absence_reset_no_mfa,
  "chain":          s_chain_login_consent_rule,
  "rolling":        s_rolling_fails_5m,
  "ratio":          s_ratio_fail_success_20to1,
  "first_seen":     s_first_seen_country,
  "beacon":         s_beaconing,
  "burst":          s_burstiness,
  "tod":            s_time_of_day_anom,
  "travel":         s_travel_flip,
  "lex":            s_lex_dga,
  "spread":         s_diversity_spread_users_by_ip,
}

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description="Generate attack-like logs into ClickHouse (non-destructive).")
    ap.add_argument("--all", action="store_true", help="generate all scenarios")
    ap.add_argument("--scenarios", type=str, help="comma list (keys): " + ",".join(SCENARIOS.keys()))
    args = ap.parse_args()

    chosen = list(SCENARIOS.keys()) if args.all else []
    if args.scenarios:
        chosen = [s.strip() for s in args.scenarios.split(",") if s.strip() in SCENARIOS]
    if not chosen:
        print("Nothing to do. Use --all or --scenarios=seq,ratio,beacon ...")
        sys.exit(1)

    print(f"Target: {CH_DB}.{CH_TABLE}  tenant_id={TENANT}")
    print(f"Columns detected ({len(COLS)}): {', '.join(COLS.keys())}")
    if EXTRA_COL:
        print(f"Using EXTRA column: {EXTRA_COL} (to stash additional fields)")

    total=0
    for key in chosen:
        gen = SCENARIOS[key]
        rows = gen()
        insert_json_each_row(rows)
        print(f"Inserted {len(rows):5d} rows for scenario: {key}")
        total += len(rows)

    print(f"Done. Inserted total rows: {total}")

if __name__ == "__main__":
    main()


