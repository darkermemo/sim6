#!/usr/bin/env python3
import json, random, time, uuid, ipaddress
from datetime import datetime

TENANT = "default"
NOW = int(time.time() * 1000)

def ts_ms(delta_min=0, delta_max=600):
    return NOW - random.randint(delta_min*60*1000, delta_max*60*1000)

def ip4():
    return str(ipaddress.IPv4Address(random.randint(0x0A000001, 0x0AFFFFFF)))

def pick(a):
    return random.choice(a)

def row(base):
    base.setdefault("tenant_id", TENANT)
    base.setdefault("event_id", str(uuid.uuid4()))
    base.setdefault("event_timestamp", int(base.pop("_ts_ms")))
    return base

def win_sec_4625():
    user = f"ACME\\user{random.randint(1,20)}"
    host = f"WIN{random.randint(10,50)}"
    msg = f"An account failed to log on: user={user} from={ip4()}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"windows.security","event_type":"auth_failed","event_outcome":"failure",
        "severity":"low","host":host,"user":user,"vendor":"microsoft","product":"windows",
        "parsed_fields":{"event_id":"4625","logon_type": str(pick([2,3,10]))}
    })

def win_sysmon_proc():
    user = f"ACME\\svc{random.randint(1,5)}"; host = f"WIN{random.randint(10,50)}"
    proc = pick(["powershell.exe","cmd.exe","rundll32.exe","mshta.exe"])
    msg = f"Sysmon Process Create: {proc} by {user}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"windows.sysmon","event_type":"process_start","event_outcome":"success",
        "severity":"medium","host":host,"user":user,"vendor":"microsoft","product":"sysmon",
        "parsed_fields":{"image":proc,"parent":"explorer.exe"}
    })

def linux_auth_ssh():
    user = pick(["root","admin","ubuntu","ec2-user"])
    host = f"ip-10-0-0-{random.randint(1,254)}"
    src = ip4(); ok = random.random()>0.7
    msg = f"sshd[{random.randint(1000,9999)}]: {'Accepted' if ok else 'Failed'} password for {user} from {src} port {random.randint(2000,65000)}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"linux.auth","event_type":"ssh_login",
        "event_outcome":"success" if ok else "failure","severity":"low","host":host,"user":user,
        "vendor":"openssh","product":"sshd","parsed_fields":{"source_ip":src}
    })

def iis_access():
    verb = pick(["GET","POST"])
    path = pick(["/","/login","/api/v1/items","/admin"])
    code = pick([200,200,200,404,500,302])
    src = ip4(); host="web-iis-1"
    msg = f'{src} - - [{datetime.utcnow().isoformat()}] "{verb} {path} HTTP/1.1" {code} {random.randint(100,5000)}'
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"iis.access","event_type":"http_access","event_action":verb,
        "event_outcome":"success" if code<400 else "failure","severity":"low",
        "host":host,"vendor":"microsoft","product":"iis",
        "parsed_fields":{"path":path,"status":str(code),"source_ip":src}
    })

def nginx_access():
    verb = pick(["GET","POST"]); path = pick(["/","/search?q=foo","/wp-login.php","/admin"])
    code = pick([200,200,404,403,500,301]); src = ip4(); host="web-nginx-1"
    msg = f'{src} - - "{verb} {path} HTTP/1.1" {code} {random.randint(100,5000)} "-" "Mozilla/5.0"'
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"nginx.access","event_type":"http_access","event_action":verb,
        "event_outcome":"success" if code<400 else "failure","severity":"low",
        "host":host,"vendor":"nginx","product":"nginx",
        "parsed_fields":{"path":path,"status":str(code),"source_ip":src}
    })

def vpc_flow():
    src = ip4(); dst = ip4(); act = pick(["ACCEPT","REJECT"])
    msg = f"VPCFlow {src} -> {dst} {act}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"aws.vpcflow","event_type":"network_flow","event_outcome":"allowed" if act=="ACCEPT" else "blocked",
        "severity":"low","vendor":"amazon","product":"vpc",
        "source_ip":src,"destination_ip":dst,"parsed_fields":{"action":act}
    })

def waf():
    src = ip4(); act = pick(["ALLOW","BLOCK","COUNT"])
    uri = pick(["/","/login","/wp-admin","/wp-login.php","/api"])
    msg = f"WAF {act} {src} {uri}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"aws.waf","event_type":"waf","event_outcome":"blocked" if act=="BLOCK" else "observed",
        "severity":"medium","vendor":"amazon","product":"waf",
        "parsed_fields":{"action":act,"uri":uri,"source_ip":src}
    })

def suricata_alert():
    src=ip4(); dst=ip4(); sig=pick(["ET SCAN Nmap","ET POLICY Suspicious UA","GPL SSH brute force"])
    sev=pick(["low","medium","high"])
    msg=f"Suricata alert: {sig} {src}->{dst}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"suricata.alert","event_type":"ids_alert","severity":sev,
        "vendor":"oisf","product":"suricata","source_ip":src,"destination_ip":dst,
        "parsed_fields":{"signature":sig}
    })

def zeek_conn():
    src=ip4(); dst=ip4(); proto=pick(["tcp","udp"])
    msg=f"Zeek conn {src}->{dst} {proto}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"zeek.conn","event_type":"network_conn","severity":"low",
        "vendor":"zeek","product":"zeek","source_ip":src,"destination_ip":dst,
        "parsed_fields":{"proto":proto}
    })

def cisco_asa():
    src=ip4(); dst=ip4(); act=pick(["Built","Teardown","Deny"])
    msg=f"%ASA-6-302013: {act} TCP connection {src} to {dst}"
    return row({
        "_ts_ms": ts_ms(), "message": msg, "raw_log": msg,
        "source_type":"cisco.asa","event_type":"firewall","severity":"low",
        "vendor":"cisco","product":"asa","source_ip":src,"destination_ip":dst,
        "parsed_fields":{"action":act}
    })

GENS = [win_sec_4625, win_sysmon_proc, linux_auth_ssh, iis_access, nginx_access, vpc_flow, waf, suricata_alert, zeek_conn, cisco_asa]

def main():
    n_per = 100
    for g in GENS:
        for _ in range(n_per):
            print(json.dumps(g()))

if __name__ == "__main__":
    main()
