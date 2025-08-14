#!/usr/bin/env python3
import argparse, json, random, uuid
from datetime import datetime, timedelta, timezone

UTC = timezone.utc
NOW = datetime.now(UTC)

CATEGORIES = [
  ("firewall", [("connection", [("allow","allowed"), ("deny","blocked"), ("reset","blocked")])]),
  ("remote_access", [("auth", [("login","success"), ("login","failure")])]),
  ("domain_controller", [("auth", [("login","success"), ("login","failure")])]),
  ("web_security", [("web_request", [("web_request","success"), ("web_request","blocked")])]),
]

SEVERITIES = ["informational","low","medium","high","critical"]
VENDORS = ["Palo Alto","Fortinet","Cisco","Microsoft","Trend Micro","Kaspersky","Bitdefender","F5"]
PRODUCTS = {
  "Palo Alto":"PAN-OS",
  "Fortinet":"FortiGate",
  "Cisco":"Firepower",
  "Microsoft":"Windows",
  "Trend Micro":"DDI",
  "Kaspersky":"SecurityCenter",
  "Bitdefender":"GravityZone",
  "F5":"ASM",
}

def rnd_ip_priv():
  choice = random.choice([10, 172, 192])
  if choice == 10:
    return f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
  if choice == 172:
    return f"172.{random.randint(16,31)}.{random.randint(0,255)}.{random.randint(1,254)}"
  return f"192.168.{random.randint(0,255)}.{random.randint(1,254)}"

def rnd_ts(hours=36):
  delta = timedelta(seconds=random.randint(0, hours*3600))
  return NOW - delta

def ts_str(dt: datetime) -> str:
  # ClickHouse DateTime64(3) friendly: 'YYYY-MM-DD HH:MM:SS.mmm'
  return dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]

def pick_cat():
  cat, classes = random.choice(CATEGORIES)
  event_class, actions = random.choice(classes)
  action, outcome = random.choice(actions)
  return cat, event_class, action, outcome

def gen_row(tenant: str) -> dict:
  ts = rnd_ts()
  vendor = random.choice(VENDORS)
  product = PRODUCTS[vendor]
  cat, event_class, action, outcome = pick_cat()
  return {
    "tenant_id": tenant,
    "event_timestamp": ts_str(ts),
    "event_id": str(uuid.uuid4()),
    "source_ip": rnd_ip_priv(),
    "destination_ip": rnd_ip_priv(),
    "source_port": random.randint(1,65535),
    "destination_port": random.randint(1,65535),
    "protocol": random.choice(["tcp","udp","icmp","http","https"]),
    "event_type": event_class,
    "severity": random.choice(SEVERITIES),
    "message": f"{vendor} {product} {event_class} {action} {outcome}",
    "raw_log": f"synth {vendor} {product} cat={cat} class={event_class} action={action} outcome={outcome}",
    "parsed_fields": {},
    "source_type": product,
    "event_category": cat,
    "event_outcome": outcome,
    "event_action": action,
    "user": random.choice(["","alice","bob","charlie","svc-app"]) or "",
    "host": random.choice(["fw-01","fw-02","dc-01","waf-01"]) or "",
    "vendor": vendor,
    "product": product,
  }

def main():
  ap = argparse.ArgumentParser()
  ap.add_argument('--generate', type=int, default=50000)
  ap.add_argument('--file', default='/Users/yasseralmohammed/sim6/seed_small.jsonl')
  ap.add_argument('--tenant', default='default')
  args = ap.parse_args()
  with open(args.file, 'w', encoding='utf-8') as f:
    for i in range(args.generate):
      f.write(json.dumps(gen_row(args.tenant), ensure_ascii=False) + '\n')
      if (i+1) % 10000 == 0:
        print(f'written {i+1}/{args.generate}')

if __name__ == '__main__':
  main()
