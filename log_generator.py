import time
import random
import json
import requests
from datetime import datetime

# --- Configuration ---
# The URL of your siem_ingestor's raw HTTP endpoint
INGESTOR_URL = "http://127.0.0.1:8081/ingest/raw"

# The number of logs to send in each batch
LOGS_PER_BATCH = 10

# The delay in seconds between each batch
DELAY_SECONDS = 0.1

# Define the tenants and the source IPs that will represent them.
# IMPORTANT: You must configure these source IPs in your SIEM's "Log Sources"
# to map them to the correct tenant and parser type.
TENANT_SIMULATION = [
    {
        "tenant_id": "tenant-A",
        "source_ips": ["10.10.10.100", "10.10.10.101"],
        "log_types": ["windows", "palo_alto"]
    },
    {
        "tenant_id": "tenant-B",
        "source_ips": ["10.20.20.200", "10.20.20.201"],
        "log_types": ["linux", "palo_alto"]
    }
]

# --- Log Templates with Category, Action, Outcome ---
# Enhanced log templates with structured security event fields
LOG_TEMPLATES = {
    "windows": [
        # Windows Security Event Log: Successful Logon
        {
            "template": '<13>1 {timestamp} DC01.corp.local MSWinEvent-Security 4624 - [User@corp.local accountName="{user}" sourceIP="{src_ip}" logonType="3" category="{category}" action="{action}" outcome="{outcome}"] An account was successfully logged on.',
            "category": "Authentication",
            "action": "Login",
            "outcome": "Success"
        },
        # Windows Security Event Log: Failed Logon
        {
            "template": '<13>1 {timestamp} DC01.corp.local MSWinEvent-Security 4625 - [User@corp.local accountName="{user}" sourceIP="{src_ip}" logonType="3" category="{category}" action="{action}" outcome="{outcome}"] An account failed to log on. Reason: Unknown user name or bad password.',
            "category": "Authentication",
            "action": "Login",
            "outcome": "Failure"
        },
        # Windows Security Event Log: Account Lockout
        {
            "template": '<13>1 {timestamp} DC01.corp.local MSWinEvent-Security 4740 - [User@corp.local accountName="{user}" sourceIP="{src_ip}" category="{category}" action="{action}" outcome="{outcome}"] A user account was locked out.',
            "category": "Account Management",
            "action": "Account Lockout",
            "outcome": "Success"
        }
    ],
    "linux": [
        # Linux Syslog: SSH Login Success
        {
            "template": '{timestamp} server-01 sshd[12345]: Accepted password for {user} from {src_ip} port 51234 ssh2 category="{category}" action="{action}" outcome="{outcome}"',
            "category": "Authentication",
            "action": "SSH Login",
            "outcome": "Success"
        },
        # Linux Syslog: SSH Login Failure
        {
            "template": '{timestamp} server-01 sshd[12345]: Failed password for {user} from {src_ip} port 51234 ssh2 category="{category}" action="{action}" outcome="{outcome}"',
            "category": "Authentication",
            "action": "SSH Login",
            "outcome": "Failure"
        },
        # Linux Syslog: Sudo command
        {
            "template": '{timestamp} server-01 sudo: {user} : TTY=pts/0 ; PWD=/home/{user} ; USER=root ; COMMAND=/usr/bin/apt update category="{category}" action="{action}" outcome="{outcome}"',
            "category": "Privilege Escalation",
            "action": "Sudo Command",
            "outcome": "Success"
        }
    ],
    "palo_alto": [
        # Palo Alto Firewall: Traffic Allowed
        {
            "template": '<14>{timestamp} T161-CORE-FW LEEF:1.0|Palo Alto Networks|PAN-OS|10.1|allow|cat=TRAFFIC|src={src_ip}|dst={dest_ip}|srcPort={src_port}|dstPort={dest_port}|proto=tcp|category={category}|action={action}|outcome={outcome}',
            "category": "Network Traffic",
            "action": "Allow Connection",
            "outcome": "Success"
        },
        # Palo Alto Firewall: Traffic Denied
        {
            "template": '<14>{timestamp} T161-CORE-FW LEEF:1.0|Palo Alto Networks|PAN-OS|10.1|deny|cat=TRAFFIC|src={src_ip}|dst={dest_ip}|srcPort={src_port}|dstPort={dest_port}|proto=udp|category={category}|action={action}|outcome={outcome}',
            "category": "Network Traffic",
            "action": "Block Connection",
            "outcome": "Success"
        },
        # Palo Alto Firewall: Threat Detection
        {
            "template": '<14>{timestamp} T161-CORE-FW LEEF:1.0|Palo Alto Networks|PAN-OS|10.1|threat|cat=THREAT|src={src_ip}|dst={dest_ip}|srcPort={src_port}|dstPort={dest_port}|proto=tcp|category={category}|action={action}|outcome={outcome}|threat_name=Malware.Generic',
            "category": "Threat Detection",
            "action": "Malware Block",
            "outcome": "Success"
        }
    ]
}

# --- Helper Functions ---
def get_random_ip():
    """Generates a random internal IP address."""
    return f"192.168.{random.randint(1, 254)}.{random.randint(1, 100)}"

def get_random_user():
    """Returns a random username."""
    return random.choice(["alice", "bob", "charlie", "admin", "guest"])

def generate_log():
    """Creates a single, randomized log event."""
    
    # 1. Pick a random tenant and one of its IPs
    tenant = random.choice(TENANT_SIMULATION)
    source_ip_for_tenant = random.choice(tenant["source_ips"])

    # 2. Pick a random log type assigned to that tenant
    log_type = random.choice(tenant["log_types"])
    
    # 3. Get a random template for that log type
    template_obj = random.choice(LOG_TEMPLATES[log_type])
    template = template_obj["template"]
    category = template_obj["category"]
    action = template_obj["action"]
    outcome = template_obj["outcome"]

    # 4. Generate dynamic data
    now = datetime.now()
    log_data = {
        "timestamp": now.strftime("%b %d %H:%M:%S"),
        "src_ip": get_random_ip(),
        "dest_ip": get_random_ip(),
        "src_port": random.randint(1024, 65535),
        "dest_port": random.choice([80, 443, 53, 22, 3389]),
        "user": get_random_user(),
        "category": category,
        "action": action,
        "outcome": outcome
    }

    # 5. Format the log string
    log_message = template.format(**log_data)
    
    return source_ip_for_tenant, log_message

def send_log(source_ip, log_message):
    """Sends a single log to the SIEM ingestor via HTTP."""
    try:
        # The siem_ingestor's HTTP endpoint expects the source IP in a header
        # and the raw log in the body.
        headers = {
            'Content-Type': 'text/plain',
            'X-Forwarded-For': source_ip
        }
        response = requests.post(INGESTOR_URL, data=log_message.encode('utf-8'), headers=headers, timeout=5)
        
        if response.status_code in [200, 202]:
            print(f"✅  Sent log from {source_ip} -> {log_message[:80]}...")
        else:
            print(f"❌  Error sending log from {source_ip}. Status: {response.status_code}, Response: {response.text}")

    except requests.exceptions.RequestException as e:
        print(f"🔥  Connection Error: Could not connect to ingestor at {INGESTOR_URL}. Is it running?")
        print(f"   Details: {e}")
        time.sleep(10)  # Wait before retrying if the connection fails

# --- Main Execution ---
if __name__ == "__main__":
    print("🚀 Starting SIEM Log Generator...")
    print(f"   Target Ingestor: {INGESTOR_URL}")
    print(f"   Sending {LOGS_PER_BATCH} logs every {DELAY_SECONDS} seconds.")
    print("   Press Ctrl+C to stop.")
    print("-" * 30)

    try:
        while True:
            print(f"\n--- Generating batch of {LOGS_PER_BATCH} logs ({datetime.now().isoformat()}) ---")
            for _ in range(LOGS_PER_BATCH):
                source_ip, log_message = generate_log()
                send_log(source_ip, log_message)
            
            time.sleep(DELAY_SECONDS)

    except KeyboardInterrupt:
        print("\n🛑 Log generator stopped by user.")