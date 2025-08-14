#!/usr/bin/env python3
# Generate synthetic logs, normalize to CIM-like schema, ingest to ClickHouse via JSONEachRow

import argparse, json, os, random, re
from datetime import datetime, timedelta, timezone
from urllib import request, parse

UTC = timezone.utc
NOW = datetime.now(UTC)

USERS = [
    "administrator","system","svc-exchange","svc-ise","m.ahmed","j.doe","s.aldawsari","pvictor",
    "ARIS","angus.hargreaves","martin.vanwunnik","con-fadel","hwlee","sakedi","a.mobarki","m.awaji",
    "PIF-8480$","spa-hr","spanews","Administrator","awarda.contractor"
]
DOMAINS = ["PIF","SITCO.SA","MISKAD","CMA","SRA.SA","ADREALM_2022","mopm.gov.sa","spa.gov.sa","sans.com.sa","ZATCA"]

KV_RE = re.compile(r'(\w+)=(".*?"|\'.*?\'|\S+)')
CEF_HEADER_RE = re.compile(r'CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\s*(.*)$')
LEEF_HEADER_RE = re.compile(r'LEEF:(\d+(?:\.\d+)?)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\s*(.*)$')

SEED_RAW = {
"paloalto_allow": r'''<14>Sep 28 13:31:15 T161-CORE-FW LEEF:1.0|Palo Alto Networks|PAN-OS Syslog Integration|10.1.5-h2|allow|cat=TRAFFIC|ReceiveTime=2022/09/28 13:31:15|Type=TRAFFIC|Subtype=end|src=10.252.161.1|dst=10.18.190.104|Application=dns-base|SourceZone=SIC-Tenant|DestinationZone=Customer-LAN|proto=udp|action=allow|srcPort=38849|dstPort=53|RuleName=DNS Updates''',
"fortigate_allow": r'''<189>date=2022-09-28 time=13:36:58 devname="RY01-FW01" devid="F6KF31T019900250" type="traffic" subtype="forward" level="notice" vd="MGMT" srcip=10.255.17.125 srcport=49639 dstip=8.8.8.8 dstport=53 proto=17 action="accept" policyid=710 service="Google-DNS" app="DNS"''',
"win_4624": r'''<13>Oct 02 09:22:54 DC1 AgentDevice=WindowsLog AgentLogFile=Security Source=Microsoft-Windows-Security-Auditing EventID=4624 Message=An account was successfully logged on. Account Name: PIF-8480$ Source Network Address: 10.10.187.23''',
"o365_login_ok": r'''{"CreationTime":"2024-03-06T17:23:15","Operation":"UserLoggedIn","RecordType":15,"ResultStatus":"Success","UserId":"h.hamdy.az@sra.sa","ClientIP":"51.252.179.194","Workload":"AzureActiveDirectory"}''',
"f5_asm_block": r'''<131>Oct  3 14:14:59 F5 ASM:policy_name="/Common/asm" request_status="blocked" ip_client="78.95.188.61" method="GET" uri="/stat.htm"''',
}
SEED_KEYS = list(SEED_RAW.keys())

DIST = {"firewall":0.5, "domain_controller":0.15, "web_security":0.1, "remote_access":0.1, "mail_server":0.05, "mail_security":0.05, "endpoint_security":0.03, "network_security":0.02}

def rnd_ip(priv=False):
    if priv:
        blocks = [(10, random.randint(0,255), random.randint(0,255), random.randint(1,254)),
                  (172, random.randint(16,31), random.randint(0,255), random.randint(1,254)),
                  (192,168, random.randint(0,255), random.randint(1,254))]
        a,b,c,d = random.choice(blocks)
    else:
        a,b,c,d = random.randint(1,223), random.randint(0,255), random.randint(0,255), random.randint(1,254)
    return f"{a}.{b}.{c}.{d}"

def rnd_user():
    u = random.choice(USERS); d = random.choice(DOMAINS)
    if random.random() < 0.5:
        return f"{d}\\{u}", d
    return f"{u}@{d.lower()}", d

def rnd_port():
    return random.randint(1,65535)

def rnd_ts():
    delta = timedelta(seconds=random.randint(0, 36*3600))
    return (NOW - delta)

def fmt_sys_ts(dt):
    return dt.strftime("%b %e %H:%M:%S")

def parse_kv(s):
    d = {}
    for k, v in KV_RE.findall(s):
        if v and len(v) >=2 and v[0] in "\"'" and v[-1]==v[0]:
            v = v[1:-1]
        d[k] = v
    return d

def parse_cef(line):
    m = CEF_HEADER_RE.search(line)
    if not m: return None
    ver, ven, prod, prodver, sig, name, sev, ext = m.groups()
    ext_kv = parse_kv(ext) if ext else {}
    return {
        "tenant_id": tenant,
        "ts": ts.isoformat(),
        "time": ts.isoformat(),
        "event_timestamp": ts.isoformat(),
        "event_dt": ts.isoformat(),
        "created_at": ts.isoformat(),
        "vendor": vendor, "product": product, "source_type": source_type,
        "category": category,
        "event_category": category,
        "event_class": ("auth" if "login" in action else ("firewall_action" if category=="firewall" else ("web_request" if category=="web_security" else "connection"))),
        "action": action, "outcome": outcome,
        "event_action": action, "event_outcome": outcome,
        "severity": str(sev_lbl), "severity_label": sev_lbl,
        "src_ip": s_ip, "src_port": int(s_pt or 0), "dst_ip": d_ip, "dst_port": int(d_pt or 0), "protocol": proto or "",
        "source_ip": s_ip, "destination_ip": d_ip, "source_port": int(s_pt or 0), "destination_port": int(d_pt or 0),
        "user_name": user_name, "user_domain": user_domain,
        "user": user_name, "host": device_name,
        "device_name": device_name, "device_ip": "",
        "rule_name": rule_name, "event_id": event_id,
        "http_method": http_m, "http_status": int(http_s or 0), "url": url,
        "message": msg, "raw": raw, "raw_log": raw
    }

    def ch_insert_rows(rows, ch_url, table="dev.events"):
    data = "\n".join(json.dumps(r, ensure_ascii=False) for r in rows).encode("utf-8")
    q = f"{ch_url}/?query=INSERT%20INTO%20{table}%20FORMAT%20JSONEachRow"
    req = request.Request(q, data=data, method="POST", headers={"Content-Type":"application/json; charset=utf-8"})
    with request.urlopen(req, timeout=180) as resp:
        resp.read()

def run_generate(n, out_file):
    random.seed(42)
    seeds = list(SEED_RAW.values())
    with open(out_file, "w", encoding="utf-8") as f:
        for i in range(n):
            s = random.choice(seeds)
            dt = rnd_ts()
            line = s
            line = re.sub(r'\b\d{4}-\d{2}-\d{2}\b', dt.strftime("%Y-%m-%d"), line)
            line = re.sub(r'\b\d{2}:\d{2}:\d{2}\b', dt.strftime("%H:%M:%S"), line)
            line = re.sub(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}', fmt_sys_ts(dt), line)
            for _ in range(3):
                line = re.sub(r'(?<=\D)(\d{1,3}(?:\.\d{1,3}){3})(?=\D)', rnd_ip(priv=random.random()<0.6), line, count=1)
            line = re.sub(r'(?<=[:/ ,])(\d{2,5})(?=\D)', str(rnd_port()), line, count=1)
            u, _ = rnd_user()
            line = re.sub(r'user="?[\w\.\-\\@]+"?\b', lambda m, uu=u: f'user="{uu}"', line)
            f.write(line.strip()+"\n")
            if (i+1) % 100000 == 0:
                print(f"generated {i+1}/{n}")

def run_ingest(in_file, ch_url, tenant, chunk=10000):
    buf = []; i = 0
    with open(in_file, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if not line.strip(): continue
            ev = normalize(line, tenant=tenant)
            buf.append(ev); i += 1
            if len(buf) >= chunk:
                ch_insert_rows(buf, ch_url); buf.clear()
                if i % 100000 == 0: print(f"ingested {i}")
        if buf: ch_insert_rows(buf, ch_url)
    print(f"done. total ingested={i}")

def run_upsert_ddl(ch_url):
    ddl = """
    CREATE DATABASE IF NOT EXISTS dev;

    CREATE TABLE IF NOT EXISTS dev.events
    (
      tenant_id String,
      ts DateTime64(3, 'UTC'),
      time DateTime64(3, 'UTC'),
      vendor LowCardinality(String),
      product LowCardinality(String),
      source_type LowCardinality(String),
      category LowCardinality(String),
      event_class LowCardinality(String),
      action LowCardinality(String),
      outcome LowCardinality(String),
      severity UInt8,
      severity_label LowCardinality(String),
      src_ip String,
      src_port UInt16,
      dst_ip String,
      dst_port UInt16,
      protocol LowCardinality(String),
      user_name String,
      user_domain String,
      device_name String,
      device_ip String,
      rule_name String,
      event_id String,
      http_method LowCardinality(String),
      http_status UInt16,
      url String,
      message String,
      raw String
    )
    ENGINE = MergeTree
    PARTITION BY toDate(ts)
    ORDER BY (tenant_id, ts, category, product);
    """
    q = f"{ch_url}/?query={parse.quote(ddl)}"
    req = request.Request(q, method="POST")
    with request.urlopen(req, timeout=60) as resp:
        resp.read()
    print("DDL applied.")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generate", type=int)
    ap.add_argument("--ingest", action="store_true")
    ap.add_argument("--upsert-ddl", action="store_true")
    ap.add_argument("--raw-file", default="raw.log")
    ap.add_argument("--tenant", default="default")
    ap.add_argument("--ch-url", default="http://127.0.0.1:8123")
    args = ap.parse_args()

    if args.upsert_ddl:
        run_upsert_ddl(args.ch_url)
    if args.generate:
        run_generate(args.generate, args.raw_file)
    if args.ingest:
        run_ingest(args.raw_file, args.ch_url, args.tenant)

if __name__ == "__main__":
    main()
