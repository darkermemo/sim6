#!/usr/bin/env python3
import time
import random
import json
import requests
import threading
import gzip
import os
import queue
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
import uuid
import hashlib
import signal
import sys

# --- Configuration ---
INGESTOR_URL = "http://127.0.0.1:8081/ingest/raw"
LOGS_PER_BATCH = 1000  # Increased for massive generation
DELAY_SECONDS = 0.001   # Minimal delay for maximum speed
THREAD_COUNT = 50      # Increased threads for parallel processing
TARGET_LOG_COUNT = 1_000_000_000  # 1 billion logs
TARGET_SIZE_GB = 200   # 200GB target size
COMPRESSION_ENABLED = True
OUTPUT_FILE = "massive_logs.txt"
COMPRESSED_OUTPUT = "massive_logs.txt.gz"
FILE_WRITER_THREADS = 5  # Dedicated file writer threads
PROGRESS_INTERVAL = 50000  # Progress update every 50k logs
SEND_TO_SIEM = True  # Set to False for file-only generation

# Global state
logs_generated = 0
total_size_bytes = 0
lock = threading.Lock()
shutdown_flag = threading.Event()
file_queue = queue.Queue(maxsize=10000)  # Queue for file writing

# 20 Different Tenants with varied characteristics
TENANT_SIMULATION = [
    {"tenant_id": "gov-ministry-001", "source_ips": ["10.1.1.100", "10.1.1.101", "10.1.1.102"], "log_types": ["trend_micro", "f5_asm", "sophos_waf"]},
    {"tenant_id": "gov-ministry-002", "source_ips": ["10.2.2.100", "10.2.2.101", "10.2.2.102"], "log_types": ["fortigate", "trend_micro", "sophos_waf"]},
    {"tenant_id": "bank-riyadh-001", "source_ips": ["10.3.3.100", "10.3.3.101", "10.3.3.102"], "log_types": ["f5_asm", "fortigate", "trend_micro"]},
    {"tenant_id": "bank-jeddah-001", "source_ips": ["10.4.4.100", "10.4.4.101", "10.4.4.102"], "log_types": ["sophos_waf", "f5_asm", "fortigate"]},
    {"tenant_id": "telecom-stc-001", "source_ips": ["10.5.5.100", "10.5.5.101", "10.5.5.102"], "log_types": ["trend_micro", "fortigate", "f5_asm"]},
    {"tenant_id": "telecom-mobily-001", "source_ips": ["10.6.6.100", "10.6.6.101", "10.6.6.102"], "log_types": ["sophos_waf", "trend_micro", "fortigate"]},
    {"tenant_id": "oil-aramco-001", "source_ips": ["10.7.7.100", "10.7.7.101", "10.7.7.102"], "log_types": ["f5_asm", "sophos_waf", "trend_micro"]},
    {"tenant_id": "oil-sabic-001", "source_ips": ["10.8.8.100", "10.8.8.101", "10.8.8.102"], "log_types": ["fortigate", "f5_asm", "sophos_waf"]},
    {"tenant_id": "healthcare-moh-001", "source_ips": ["10.9.9.100", "10.9.9.101", "10.9.9.102"], "log_types": ["trend_micro", "sophos_waf", "fortigate"]},
    {"tenant_id": "education-ksu-001", "source_ips": ["10.10.10.100", "10.10.10.101", "10.10.10.102"], "log_types": ["f5_asm", "trend_micro", "sophos_waf"]},
    {"tenant_id": "retail-almarai-001", "source_ips": ["10.11.11.100", "10.11.11.101", "10.11.11.102"], "log_types": ["sophos_waf", "fortigate", "f5_asm"]},
    {"tenant_id": "transport-saudia-001", "source_ips": ["10.12.12.100", "10.12.12.101", "10.12.12.102"], "log_types": ["trend_micro", "f5_asm", "fortigate"]},
    {"tenant_id": "construction-binladin-001", "source_ips": ["10.13.13.100", "10.13.13.101", "10.13.13.102"], "log_types": ["fortigate", "sophos_waf", "trend_micro"]},
    {"tenant_id": "tech-stc-solutions-001", "source_ips": ["10.14.14.100", "10.14.14.101", "10.14.14.102"], "log_types": ["f5_asm", "fortigate", "sophos_waf"]},
    {"tenant_id": "finance-alinma-001", "source_ips": ["10.15.15.100", "10.15.15.101", "10.15.15.102"], "log_types": ["trend_micro", "sophos_waf", "f5_asm"]},
    {"tenant_id": "media-mbc-001", "source_ips": ["10.16.16.100", "10.16.16.101", "10.16.16.102"], "log_types": ["sophos_waf", "trend_micro", "fortigate"]},
    {"tenant_id": "logistics-aramex-001", "source_ips": ["10.17.17.100", "10.17.17.101", "10.17.17.102"], "log_types": ["f5_asm", "fortigate", "trend_micro"]},
    {"tenant_id": "insurance-tawuniya-001", "source_ips": ["10.18.18.100", "10.18.18.101", "10.18.18.102"], "log_types": ["fortigate", "f5_asm", "sophos_waf"]},
    {"tenant_id": "real-estate-dar-001", "source_ips": ["10.19.19.100", "10.19.19.101", "10.19.19.102"], "log_types": ["trend_micro", "fortigate", "f5_asm"]},
    {"tenant_id": "consulting-pwc-001", "source_ips": ["10.20.20.100", "10.20.20.101", "10.20.20.102"], "log_types": ["sophos_waf", "f5_asm", "trend_micro"]}
]

# Enhanced log templates based on provided examples
LOG_TEMPLATES = {
    "trend_micro": [
        {
            "template": '<142>LEEF:1.0|Trend Micro|Deep Discovery Inspector|6.0.1208|SECURITY_RISK_DETECTION|devTimeFormat=MMM dd yyyy HH:mm:ss z    ptype=IDS    dvc={dvc_ip}    deviceMacAddress={device_mac}    dvchost={dvc_host}    deviceGUID={device_guid}    devTime={dev_time}    sev={severity}    protoGroup={proto_group}    proto={protocol}    vLANId={vlan_id}    deviceDirection=1    dhost={dest_host}    dst={dest_ip}    dstPort={dest_port}    dstMAC={dest_mac}    shost={src_host}    src={src_ip}    srcPort={src_port}    srcMAC={src_mac}    malType={mal_type}    fileType=-65536    fsize=0    ruleId={rule_id}    msg={message}    deviceRiskConfidenceLevel={risk_level}    pComp=NCIE    riskType=1    srcGroup=Default    srcZone=1    dstGroup=Default    dstZone=1    detectionType=1    act={action}    threatType={threat_type}    interestedIp={interested_ip}    peerIp={peer_ip}    dUser1={domain_user}    suid={user_id}    cnt=1    dOSName={os_name}    aggregatedCnt=1    aptRelated={apt_related}    pAttackPhase={attack_phase}',
            "category": "Threat Detection",
            "action": "Block",
            "outcome": "Success"
        },
        {
            "template": '<142>LEEF:1.0|Trend Micro|Deep Discovery Inspector|6.0.1208|MALWARE_DETECTION|devTimeFormat=MMM dd yyyy HH:mm:ss z    ptype=IPS    dvc={dvc_ip}    deviceMacAddress={device_mac}    dvchost={dvc_host}    deviceGUID={device_guid}    devTime={dev_time}    sev={severity}    protoGroup=HTTP    proto=TCP    vLANId={vlan_id}    deviceDirection=1    dhost={dest_host}    dst={dest_ip}    dstPort={dest_port}    dstMAC={dest_mac}    shost={src_host}    src={src_ip}    srcPort={src_port}    srcMAC={src_mac}    malType=TROJAN    fileType=32768    fsize={file_size}    ruleId={rule_id}    msg={message}    deviceRiskConfidenceLevel={risk_level}    pComp=NCIE    riskType=2    srcGroup=Default    srcZone=1    dstGroup=Default    dstZone=1    detectionType=2    act={action}    threatType=1    interestedIp={interested_ip}    peerIp={peer_ip}    dUser1={domain_user}    suid={user_id}    cnt=1    dOSName={os_name}    aggregatedCnt=1    aptRelated={apt_related}    pAttackPhase={attack_phase}',
            "category": "Malware Detection",
            "action": "Quarantine",
            "outcome": "Success"
        }
    ],
    "f5_asm": [
        {
            "template": '<131>{timestamp} {hostname} ASM:unit_hostname="{hostname}",management_ip_address="{mgmt_ip}",management_ip_address_2="N/A",http_class_name="{http_class}",web_application_name="{web_app}",policy_name="{policy_name}",policy_apply_date="{policy_date}",violations="{violations}",support_id="{support_id}",request_status="{request_status}",response_code="{response_code}",ip_client="{client_ip}",route_domain="0",method="{method}",protocol="{protocol}",query_string="{query_string}",x_forwarded_for_header_value="{xff_header}",sig_ids="{sig_ids}",sig_names="{sig_names}",date_time="{date_time}",severity="{severity}",attack_type="{attack_type}",geo_location="{geo_location}",ip_address_intelligence="N/A",username="{username}",session_id="{session_id}",src_port="{src_port}",dest_port="{dest_port}",dest_ip="{dest_ip}",sub_violations="{sub_violations}",virus_name="N/A",violation_rating="{violation_rating}",websocket_direction="N/A",websocket_message_type="N/A",device_id="N/A",staged_sig_ids="N/A",staged_sig_names="N/A",threat_campaign_names="N/A",staged_threat_campaign_names="N/A",blocking_exception_reason="N/A",captcha_result="not_received",microservice="N/A",tap_event_id="N/A",tap_vid="N/A",vs_name="{vs_name}",sig_cves="N/A",staged_sig_cves="N/A",uri="{uri}",fragment="",request="{request}",response="{response}"',
            "category": "Web Application Security",
            "action": "Block Request",
            "outcome": "Success"
        }
    ],
    "sophos_waf": [
        {
            "template": '<30>device="SFW" date={date} time={time} timezone="+03" device_name="{device_name}" device_id={device_id} log_id={log_id} log_type="WAF" log_component="Web Application Firewall" priority={priority} user_name="{user_name}" server={server} sourceip={source_ip} localip={local_ip} ws_protocol="{ws_protocol}" url={url} querystring={query_string} cookie="{cookie}" referer={referer} method={method} httpstatus={http_status} reason="{reason}" extra="{extra}" contenttype="{content_type}" useragent="{user_agent}" host={host} responsetime={response_time} bytessent={bytes_sent} bytesrcv={bytes_received} fw_rule_id={fw_rule_id} fw_rule_name="{fw_rule_name}" fw_rule_section="{fw_rule_section}"',
            "category": "Web Traffic",
            "action": "Allow",
            "outcome": "Success"
        }
    ],
    "fortigate": [
        {
            "template": '<190>logver={log_ver} timestamp={timestamp_epoch} devname="{device_name}" devid="{device_id}" vd="{vdom}" date={date} time={time} eventtime={event_time} tz="{timezone}" logid="{log_id}" type="{log_type}" subtype="{subtype}" eventtype="{event_type}" level="{level}" urlfilteridx={url_filter_idx} urlfilterlist="{url_filter_list}" policyid={policy_id} sessionid={session_id} user="{user}" authserver="{auth_server}" srcip={src_ip} srcport={src_port} srcintf="{src_intf}" srcintfrole="{src_intf_role}" dstip={dest_ip} dstport={dest_port} dstintf="{dest_intf}" dstintfrole="{dest_intf_role}" proto={protocol} service="{service}" hostname="{hostname}" profile="{profile}" action="{action}" reqtype="{req_type}" url="{url}" sentbyte={sent_bytes} rcvdbyte={received_bytes} direction="{direction}" msg="{message}"',
            "category": "Network Security",
            "action": "Allow",
            "outcome": "Success"
        }
    ]
}

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print("\n🛑 Shutdown signal received. Stopping generation...")
    shutdown_flag.set()

def get_current_timestamp():
    """Get current timestamp in various formats"""
    now = datetime.now(timezone.utc)
    return {
        'timestamp': now.strftime('%b %d %H:%M:%S'),
        'timestamp_epoch': int(now.timestamp()),
        'dev_time': now.strftime('%b %d %Y %H:%M:%S GMT+03:00'),
        'date_time': now.strftime('%Y-%m-%d %H:%M:%S'),
        'date': now.strftime('%Y-%m-%d'),
        'time': now.strftime('%H:%M:%S'),
        'event_time': str(int(now.timestamp() * 1000000000)),
        'policy_date': now.strftime('%Y-%m-%d %H:%M:%S')
    }

def get_random_data():
    """Generate random data for log templates"""
    return {
        # Network data
        'src_ip': f"192.168.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'dest_ip': f"10.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'client_ip': f"78.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'src_port': random.randint(1024, 65535),
        'dest_port': random.choice([80, 443, 53, 22, 3389, 8080, 8443]),
        'protocol': random.choice(['TCP', 'UDP', 'ICMP']),
        
        # Device data
        'device_mac': ':'.join([f'{random.randint(0, 255):02x}' for _ in range(6)]),
        'src_mac': ':'.join([f'{random.randint(0, 255):02x}' for _ in range(6)]),
        'dest_mac': ':'.join([f'{random.randint(0, 255):02x}' for _ in range(6)]),
        'device_guid': str(uuid.uuid4()).upper(),
        'device_id': f"FG{random.randint(1000, 9999)}{chr(random.randint(65, 90))}{random.randint(10000, 99999)}",
        'device_name': f"FW-{random.choice(['CORE', 'EDGE', 'DMZ'])}-{random.randint(1, 10)}",
        'dvc_host': f"ddi-{random.choice(['stc', 'riyadh', 'jeddah'])}-{random.randint(1, 10):02d}",
        'hostname': f"{random.choice(['web', 'app', 'db'])}-{random.randint(1, 100)}.{random.choice(['gov.sa', 'com.sa', 'org.sa'])}",
        
        # User data
        'user': random.choice(['admin', 'user1', 'analyst', 'operator', 'guest']),
        'domain_user': f"{random.choice(['moc', 'gov', 'corp'])}\\{random.choice(['admin', 'user1', 'analyst'])}",
        'user_id': str(random.randint(100000, 999999)),
        'username': random.choice(['admin', 'user1', 'analyst', 'N/A']),
        
        # Security data
        'severity': random.randint(1, 5),
        'risk_level': random.randint(1, 5),
        'rule_id': random.randint(1000, 9999),
        'violation_rating': random.randint(1, 5),
        'threat_type': random.randint(1, 3),
        'apt_related': random.randint(0, 1),
        
        # Web data
        'method': random.choice(['GET', 'POST', 'PUT', 'DELETE']),
        'http_status': random.choice([200, 301, 302, 403, 404, 500]),
        'url': f"/{random.choice(['index.html', 'login.php', 'admin.jsp', 'api/v1/data'])}",
        'uri': f"/{random.choice(['stat.htm', 'index.php', 'admin.html', 'api/users'])}",
        'user_agent': random.choice([
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15',
            'Mozilla/5.00 (Nikto/2.1.6) (Evasions:None) (Test:001863)'
        ]),
        
        # File data
        'file_size': random.randint(1024, 1048576),
        'bytes_sent': random.randint(100, 10000),
        'bytes_received': random.randint(100, 10000),
        'response_time': random.randint(100, 5000),
        
        # Attack data
        'attack_phase': random.choice(['Reconnaissance', 'Initial Access', 'Lateral Movement', 'Exfiltration']),
        'attack_type': random.choice(['SQL Injection', 'XSS', 'CSRF', 'Directory Traversal', 'Command Injection']),
        'mal_type': random.choice(['TROJAN', 'VIRUS', 'WORM', 'OTHERS']),
        'proto_group': random.choice(['HTTP', 'HTTPS', 'CIFS', 'FTP']),
        
        # Message data
        'message': random.choice([
            'Successful log on to Network Share',
            'Malware detected and blocked',
            'Suspicious activity detected',
            'URL was exempted because it is in the URL filter list',
            'Request was blocked due to security policy'
        ]),
        
        # Network details
        'vlan_id': random.randint(1, 4095),
        'session_id': str(random.randint(100000000, 999999999)),
        'support_id': str(random.randint(10000000000000000, 99999999999999999)),
        
        # Geographic and other data
        'geo_location': random.choice(['SA', 'US', 'GB', 'DE', 'FR']),
        'timezone': '+0300',
        'os_name': random.choice(['Windows', 'Linux', 'macOS']),
        'log_id': f"{random.randint(100000000, 999999999)}",
        'log_ver': random.randint(600000000, 699999999),
        'vdom': 'root',
        'log_type': random.choice(['utm', 'traffic', 'event']),
        'subtype': random.choice(['webfilter', 'ips', 'av']),
        'event_type': random.choice(['urlfilter', 'signature', 'virus']),
        'level': random.choice(['information', 'warning', 'error']),
        'policy_id': random.randint(1, 100),
        'fw_rule_id': random.randint(1, 100),
        'fw_rule_name': f"RULE_{random.randint(1, 100)}",
        'fw_rule_section': 'Local rule',
        'action': random.choice(['allow', 'block', 'deny', 'passthrough', 'not blocked']),
        'outcome': random.choice(['Success', 'Failure']),
        'priority': random.choice(['Information', 'Warning', 'Error']),
        'content_type': random.choice(['text/html', 'application/json', 'image/jpeg']),
        'ws_protocol': random.choice(['HTTP/1.1', 'HTTP/2.0', 'HTTPS']),
        'query_string': random.choice(['', 'id=123', 'search=test']),
        'cookie': random.choice(['-', '_ga=GA1.1.557219448.1664868172']),
        'referer': random.choice(['-', 'https://www.rcmc.gov.sa/contact-us']),
        'reason': random.choice(['-', 'Blocked by policy']),
        'extra': '-',
        'host': f"{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'server': f"www.{random.choice(['rcmc', 'moh', 'moe'])}.gov.sa",
        'local_ip': f"192.168.255.{random.randint(1, 254)}",
        'source_ip': f"{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'user_name': random.choice(['-', 'admin', 'user1']),
        'mgmt_ip': f"100.65.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'http_class': f"/Common/asm_policy_{random.randint(100000000, 999999999)}_v2",
        'web_app': f"/Common/asm_policy_{random.randint(100000000, 999999999)}_v2",
        'policy_name': f"/Common/asm_policy_{random.randint(100000000, 999999999)}_v2",
        'violations': random.choice([
            'HTTP protocol compliance failed,Illegal meta character in value',
            'Attack signature detected,SQL Injection',
            'Parameter value length exceeded'
        ]),
        'request_status': random.choice(['blocked', 'allowed']),
        'response_code': random.choice(['0', '200', '403', '404']),
        'xff_header': f"{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'sig_ids': f"{random.randint(200000000, 299999999)},{random.randint(200000000, 299999999)}",
        'sig_names': random.choice([
            'Server-Side Include Injection Attempt - 3 (Parameter),Web Server Probe ( nikto )',
            'SQL Injection Attack,Cross-Site Scripting (XSS)'
        ]),
        'sub_violations': random.choice([
            'HTTP protocol compliance failed:Body in GET or HEAD requests',
            'Parameter value length exceeded:Maximum length exceeded'
        ]),
        'vs_name': f"/Common/vs-{random.randint(100000000, 999999999)}",
        'request': f"GET {random.choice(['/stat.htm', '/index.php', '/admin.html'])} HTTP/1.1\r\nUser-Agent: Mozilla/5.0\r\nHost: example.com\r\n\r\n",
        'response': random.choice(['Request was blocked', 'Request allowed']),
        'url_filter_idx': random.randint(1, 100),
        'url_filter_list': f"Auto-webfilter-urlfilter_{random.randint(100000000, 999999999)}",
        'auth_server': random.choice(['Azure-AD-SAML', 'LDAP-Server', 'Local-Auth']),
        'src_intf': random.choice(['Inside', 'Outside', 'DMZ']),
        'src_intf_role': 'lan',
        'dest_intf': random.choice(['WEB-GW-B2B-Out', 'Internet', 'DMZ']),
        'dest_intf_role': 'lan',
        'service': random.choice(['HTTPS', 'HTTP', 'SSH', 'FTP']),
        'profile': f"Proxy_{random.choice(['SANS', 'GOV', 'CORP'])}_Default_Web_Filter",
        'req_type': 'direct',
        'sent_bytes': random.randint(1000, 100000),
        'received_bytes': random.randint(1000, 100000),
        'direction': random.choice(['outgoing', 'incoming']),
        'dvc_ip': f"192.168.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'dest_host': f"lap-{random.randint(100000, 999999)}",
        'src_host': f"hqdc{random.randint(1, 10):02d}.{random.choice(['moc', 'gov', 'corp'])}.gov.sa",
        'interested_ip': f"192.168.{random.randint(1, 254)}.{random.randint(1, 254)}",
        'peer_ip': f"10.{random.randint(1, 254)}.{random.randint(1, 254)}.{random.randint(1, 254)}"
    }

def generate_log():
    """Generate a single log entry"""
    try:
        # Pick random tenant
        tenant = random.choice(TENANT_SIMULATION)
        source_ip_for_tenant = random.choice(tenant["source_ips"])
        log_type = random.choice(tenant["log_types"])
        
        # Get template
        template_obj = random.choice(LOG_TEMPLATES[log_type])
        template = template_obj["template"]
        
        # Generate data
        timestamp_data = get_current_timestamp()
        random_data = get_random_data()
        
        # Combine all data
        log_data = {**timestamp_data, **random_data}
        
        # Format log
        log_message = template.format(**log_data)
        return source_ip_for_tenant, log_message
    except Exception as e:
        # Return a simple fallback log on error
        return "127.0.0.1", f"<30>Error generating log: {str(e)}"

def send_log_to_siem(source_ip, log_message):
    """Send log to SIEM ingestor with retry logic"""
    if not SEND_TO_SIEM:
        return True
        
    max_retries = 3
    for attempt in range(max_retries):
        try:
            headers = {
                'Content-Type': 'text/plain',
                'X-Forwarded-For': source_ip
            }
            response = requests.post(INGESTOR_URL, data=log_message.encode('utf-8'), 
                                   headers=headers, timeout=2)
            if response.status_code in [200, 202]:
                return True
        except Exception:
            if attempt == max_retries - 1:
                return False
            time.sleep(0.01 * (attempt + 1))  # Exponential backoff
    return False

def file_writer_worker(output_file):
    """Dedicated file writer worker thread"""
    global total_size_bytes
    
    while not shutdown_flag.is_set():
        try:
            # Get log from queue with timeout
            log_message = file_queue.get(timeout=1.0)
            if log_message is None:  # Poison pill
                break
                
            log_line = log_message + '\n'
            output_file.write(log_line)
            
            # Update size counter
            with lock:
                total_size_bytes += len(log_line.encode('utf-8'))
                
            file_queue.task_done()
            
        except queue.Empty:
            continue
        except Exception as e:
            print(f"File writer error: {e}")
            break

def worker_thread(thread_id):
    """Worker thread for generating logs"""
    global logs_generated
    
    local_count = 0
    local_success = 0
    local_failed = 0
    
    while not shutdown_flag.is_set() and logs_generated < TARGET_LOG_COUNT and total_size_bytes < (TARGET_SIZE_GB * 1024 * 1024 * 1024):
        try:
            source_ip, log_message = generate_log()
            
            # Add to file queue if not full
            try:
                file_queue.put_nowait(log_message)
            except queue.Full:
                # Skip file writing if queue is full to avoid blocking
                pass
            
            # Send to SIEM
            if send_log_to_siem(source_ip, log_message):
                local_success += 1
            else:
                local_failed += 1
            
            local_count += 1
            
            # Update global counter periodically
            if local_count % 1000 == 0:
                with lock:
                    logs_generated += local_count
                    if logs_generated % PROGRESS_INTERVAL == 0:
                        elapsed = time.time() - start_time
                        rate = logs_generated / elapsed if elapsed > 0 else 0
                        size_gb = total_size_bytes / (1024*1024*1024)
                        print(f"📊 Progress: {logs_generated:,} logs | {size_gb:.2f} GB | {rate:.0f} logs/sec | Thread {thread_id}: {local_success}/{local_failed} success/failed")
                local_count = 0
                local_success = 0
                local_failed = 0
                
            # Small delay to prevent overwhelming
            if DELAY_SECONDS > 0:
                time.sleep(DELAY_SECONDS)
                
        except Exception as e:
            print(f"Error in thread {thread_id}: {e}")
            time.sleep(0.1)
    
    # Final update
    with lock:
        logs_generated += local_count

def main():
    """Main function to generate massive logs"""
    global start_time
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print("🚀 Starting Enhanced Massive SIEM Log Generator...")
    print(f"   Target: {TARGET_LOG_COUNT:,} logs or {TARGET_SIZE_GB} GB")
    print(f"   Generator Threads: {THREAD_COUNT}")
    print(f"   File Writer Threads: {FILE_WRITER_THREADS}")
    print(f"   Tenants: {len(TENANT_SIMULATION)}")
    print(f"   Send to SIEM: {SEND_TO_SIEM}")
    print(f"   Output: {COMPRESSED_OUTPUT if COMPRESSION_ENABLED else OUTPUT_FILE}")
    print("-" * 60)
    
    start_time = time.time()
    
    # Open output file
    try:
        if COMPRESSION_ENABLED:
            output_file = gzip.open(COMPRESSED_OUTPUT, 'wt', encoding='utf-8', compresslevel=6)
            print(f"   Writing compressed logs to: {COMPRESSED_OUTPUT}")
        else:
            output_file = open(OUTPUT_FILE, 'w', encoding='utf-8')
            print(f"   Writing logs to: {OUTPUT_FILE}")
    except Exception as e:
        print(f"❌ Failed to open output file: {e}")
        return
    
    try:
        # Start file writer threads
        file_writers = []
        for i in range(FILE_WRITER_THREADS):
            writer = threading.Thread(target=file_writer_worker, args=(output_file,))
            writer.daemon = True
            writer.start()
            file_writers.append(writer)
        
        # Start log generator threads
        with ThreadPoolExecutor(max_workers=THREAD_COUNT) as executor:
            futures = []
            for i in range(THREAD_COUNT):
                future = executor.submit(worker_thread, i)
                futures.append(future)
            
            # Wait for completion or shutdown
            try:
                for future in futures:
                    future.result()
            except KeyboardInterrupt:
                print("\n🛑 Interrupted by user")
                shutdown_flag.set()
    
    except Exception as e:
        print(f"❌ Error during generation: {e}")
        shutdown_flag.set()
    
    finally:
        # Signal file writers to stop
        for _ in range(FILE_WRITER_THREADS):
            file_queue.put(None)  # Poison pill
        
        # Wait for file writers to finish
        for writer in file_writers:
            writer.join(timeout=5)
        
        # Close output file
        try:
            output_file.close()
        except:
            pass
    
    end_time = time.time()
    duration = end_time - start_time
    
    print("\n" + "=" * 60)
    print("📊 GENERATION COMPLETE!")
    print(f"   Total logs generated: {logs_generated:,}")
    print(f"   Total size: {total_size_bytes / (1024*1024*1024):.2f} GB")
    print(f"   Duration: {duration:.2f} seconds")
    if duration > 0:
        print(f"   Rate: {logs_generated / duration:.0f} logs/second")
        print(f"   Throughput: {(total_size_bytes / (1024*1024)) / duration:.2f} MB/second")
    
    if COMPRESSION_ENABLED and os.path.exists(COMPRESSED_OUTPUT):
        try:
            compressed_size = os.path.getsize(COMPRESSED_OUTPUT)
            print(f"   Compressed file size: {compressed_size / (1024*1024*1024):.2f} GB")
            if total_size_bytes > 0:
                print(f"   Compression ratio: {(total_size_bytes / compressed_size):.2f}:1")
        except:
            pass
    
    print("=" * 60)
    
    if logs_generated >= TARGET_LOG_COUNT:
        print("✅ Successfully reached target log count!")
    elif total_size_bytes >= (TARGET_SIZE_GB * 1024 * 1024 * 1024):
        print("✅ Successfully reached target file size!")
    else:
        print("⚠️  Generation stopped before reaching targets")

if __name__ == "__main__":
    main()