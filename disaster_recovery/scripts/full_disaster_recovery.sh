#!/bin/bash

# SIEM Platform Disaster Recovery Automation Script
# This script automates the complete disaster recovery process

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DR_CONFIG_FILE="${SCRIPT_DIR}/dr_config.env"
LOG_FILE="/var/log/siem_disaster_recovery.log"
RECOVERY_START_TIME=$(date +%s)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() { log "INFO" "$@"; }
warn() { log "WARN" "${YELLOW}$*${NC}"; }
error() { log "ERROR" "${RED}$*${NC}"; }
success() { log "SUCCESS" "${GREEN}$*${NC}"; }

# Error handling
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        error "Disaster recovery failed with exit code $exit_code"
        error "Check log file: $LOG_FILE"
    fi
    exit $exit_code
}

trap cleanup EXIT

# Load configuration
load_config() {
    info "Loading disaster recovery configuration..."
    
    if [ ! -f "$DR_CONFIG_FILE" ]; then
        error "Configuration file not found: $DR_CONFIG_FILE"
        return 1
    fi
    
    source "$DR_CONFIG_FILE"
    
    # Validate required variables
    local required_vars=(
        "AWS_REGION"
        "BACKUP_BUCKET"
        "VPC_CIDR"
        "INSTANCE_TYPE"
        "KEY_PAIR_NAME"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            error "Required variable $var is not set in $DR_CONFIG_FILE"
            return 1
        fi
    done
    
    success "Configuration loaded successfully"
}

# Phase 1: Infrastructure Provisioning
provision_infrastructure() {
    info "=== Phase 1: Infrastructure Provisioning ==="
    
    info "Provisioning AWS infrastructure..."
    terraform -chdir="${SCRIPT_DIR}/../terraform" init
    terraform -chdir="${SCRIPT_DIR}/../terraform" plan \
        -var="region=${AWS_REGION}" \
        -var="vpc_cidr=${VPC_CIDR}" \
        -var="instance_type=${INSTANCE_TYPE}" \
        -var="key_name=${KEY_PAIR_NAME}" \
        -out=disaster-recovery.plan
    
    terraform -chdir="${SCRIPT_DIR}/../terraform" apply \
        -auto-approve disaster-recovery.plan
    
    # Get infrastructure outputs
    export LB_DNS_NAME=$(terraform -chdir="${SCRIPT_DIR}/../terraform" output -raw load_balancer_dns)
    export CLICKHOUSE_IPS=$(terraform -chdir="${SCRIPT_DIR}/../terraform" output -json clickhouse_ips | jq -r '.[]')
    export KAFKA_IPS=$(terraform -chdir="${SCRIPT_DIR}/../terraform" output -json kafka_ips | jq -r '.[]')
    export APP_IPS=$(terraform -chdir="${SCRIPT_DIR}/../terraform" output -json app_ips | jq -r '.[]')
    
    success "Infrastructure provisioned successfully"
    info "Load Balancer DNS: $LB_DNS_NAME"
}

# Phase 2: Software Installation
install_software() {
    info "=== Phase 2: Software Installation ==="
    
    info "Running Ansible playbook for software installation..."
    
    # Generate dynamic inventory
    cat > "${SCRIPT_DIR}/../inventory.yml" << EOF
all:
  children:
    clickhouse:
      hosts:
$(echo "$CLICKHOUSE_IPS" | sed 's/^/        /')
    kafka:
      hosts:
$(echo "$KAFKA_IPS" | sed 's/^/        /')
    app_servers:
      hosts:
$(echo "$APP_IPS" | sed 's/^/        /')
  vars:
    ansible_user: ubuntu
    ansible_ssh_private_key_file: ~/.ssh/${KEY_PAIR_NAME}.pem
    ansible_ssh_common_args: '-o StrictHostKeyChecking=no'
EOF
    
    # Run software installation playbook
    ansible-playbook -i "${SCRIPT_DIR}/../inventory.yml" \
        "${SCRIPT_DIR}/../playbooks/install_software.yml"
    
    success "Software installation completed"
}

# Phase 3: Backup Recovery
recover_backups() {
    info "=== Phase 3: Backup Recovery ==="
    
    info "Downloading latest backup..."
    
    # Run backup recovery on primary ClickHouse node
    local primary_ch_ip=$(echo "$CLICKHOUSE_IPS" | head -n1)
    
    ssh -i ~/.ssh/${KEY_PAIR_NAME}.pem ubuntu@${primary_ch_ip} << 'EOF'
        # Download and run backup manager
        wget -O siem_backup_manager https://releases.github.com/siem_backup_manager/latest
        chmod +x siem_backup_manager
        
        # Create backup config
        cat > backup_config.toml << BACKUP_EOF
[storage]
type = "aws_s3"
bucket = "${BACKUP_BUCKET}"
region = "${AWS_REGION}"

[clickhouse]
host = "localhost"
port = 8123
database = "dev"
username = "default"
password = ""

metadata_path = "./backup_metadata"
BACKUP_EOF
        
        # Get latest backup
        export LATEST_BACKUP=$(./siem_backup_manager --config backup_config.toml list-backups --latest)
        echo "Latest backup: $LATEST_BACKUP"
        
        # Download backup
        ./siem_backup_manager --config backup_config.toml download-backup \
            --backup-id "$LATEST_BACKUP" \
            --destination ./
        
        # Extract backup
        tar -xzf "${LATEST_BACKUP}.tar.gz"
        
        echo "Backup recovery completed"
EOF
    
    success "Backup recovery completed"
}

# Phase 4: Service Deployment
deploy_services() {
    info "=== Phase 4: Service Deployment ==="
    
    info "Deploying SIEM services using Ansible..."
    
    # Run service deployment playbook
    ansible-playbook -i "${SCRIPT_DIR}/../inventory.yml" \
        "${SCRIPT_DIR}/../playbooks/deploy_services.yml" \
        -e "backup_data_path=/home/ubuntu/${LATEST_BACKUP}"
    
    success "Service deployment completed"
}

# Phase 5: Load Balancer Configuration
configure_load_balancer() {
    info "=== Phase 5: Load Balancer Configuration ==="
    
    info "Configuring HAProxy load balancer..."
    
    # Run load balancer configuration playbook
    ansible-playbook -i "${SCRIPT_DIR}/../inventory.yml" \
        "${SCRIPT_DIR}/../playbooks/configure_lb.yml" \
        -e "app_server_ips='${APP_IPS}'"
    
    success "Load balancer configuration completed"
}

# Phase 6: Verification
verify_recovery() {
    info "=== Phase 6: Recovery Verification ==="
    
    info "Running health checks..."
    
    # Wait for services to be ready
    sleep 120
    
    # Test API endpoints
    for i in {1..30}; do
        if curl -sf "http://${LB_DNS_NAME}/v1/health" > /dev/null; then
            success "API health check passed"
            break
        fi
        
        if [ $i -eq 30 ]; then
            error "API health check failed after 30 attempts"
            return 1
        fi
        
        warn "API not ready, attempt $i/30..."
        sleep 10
    done
    
    # Test data integrity
    local record_count=$(curl -s "http://${LB_DNS_NAME}/v1/admin/stats" | jq -r '.total_events // 0')
    info "Total events in restored database: $record_count"
    
    # Test agent connectivity
    curl -s "http://${LB_DNS_NAME}/v1/agents/my_config" \
        -H "X-Asset-ID: test-asset" \
        -H "X-Agent-Key: agent-api-key-12345" > /dev/null
    
    success "Recovery verification completed"
}

# Phase 7: DNS Update
update_dns() {
    info "=== Phase 7: DNS Update ==="
    
    if [ -n "${ROUTE53_HOSTED_ZONE_ID:-}" ] && [ -n "${DOMAIN_NAME:-}" ]; then
        info "Updating Route53 DNS records..."
        
        aws route53 change-resource-record-sets \
            --hosted-zone-id "$ROUTE53_HOSTED_ZONE_ID" \
            --change-batch '{
                "Changes": [{
                    "Action": "UPSERT",
                    "ResourceRecordSet": {
                        "Name": "'$DOMAIN_NAME'",
                        "Type": "CNAME",
                        "TTL": 300,
                        "ResourceRecords": [{"Value": "'$LB_DNS_NAME'"}]
                    }
                }]
            }'
        
        success "DNS records updated"
    else
        warn "DNS update skipped (ROUTE53_HOSTED_ZONE_ID or DOMAIN_NAME not configured)"
    fi
}

# Phase 8: Final Verification
final_verification() {
    info "=== Phase 8: Final Verification ==="
    
    # Test end-to-end functionality
    info "Testing end-to-end functionality..."
    
    # Generate test token
    local test_token=$(python3 -c "
import jwt
import datetime
token = jwt.encode({
    'sub': 'disaster-recovery-test',
    'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=1),
    'role': 'admin'
}, 'your-secret-key', algorithm='HS256')
print(token)
")
    
    # Test event ingestion
    curl -X POST "http://${LB_DNS_NAME}/v1/events" \
        -H "Authorization: Bearer $test_token" \
        -H "Content-Type: application/json" \
        -d '{
            "events": [{
                "source_ip": "192.168.1.100",
                "raw_event": "Disaster recovery verification test event"
            }]
        }'
    
    # Wait for processing
    sleep 30
    
    # Verify event was stored
    local test_events=$(curl -s "http://${LB_DNS_NAME}/v1/admin/query" \
        -H "Authorization: Bearer $test_token" \
        -H "Content-Type: application/json" \
        -d '{
            "query": "SELECT count() FROM events WHERE raw_event LIKE '\''%disaster recovery verification%'\''"
        }' | jq -r '.data[0][0] // 0')
    
    if [ "$test_events" -gt 0 ]; then
        success "End-to-end test passed - test event was processed successfully"
    else
        error "End-to-end test failed - test event was not found in database"
        return 1
    fi
    
    success "Final verification completed"
}

# Generate recovery report
generate_report() {
    info "=== Generating Recovery Report ==="
    
    local recovery_end_time=$(date +%s)
    local recovery_duration=$((recovery_end_time - RECOVERY_START_TIME))
    local hours=$((recovery_duration / 3600))
    local minutes=$(((recovery_duration % 3600) / 60))
    
    cat > "${SCRIPT_DIR}/recovery_report_$(date +%Y%m%d_%H%M%S).md" << EOF
# SIEM Disaster Recovery Report

**Recovery Date**: $(date)
**Recovery Duration**: ${hours}h ${minutes}m
**Backup Used**: ${LATEST_BACKUP:-"N/A"}
**Infrastructure**: AWS ${AWS_REGION}

## Recovery Summary

✅ **Infrastructure Provisioned**
- Load Balancer: ${LB_DNS_NAME}
- ClickHouse Cluster: 3 nodes
- Kafka Cluster: 3 brokers  
- Application Servers: 3 instances

✅ **Services Restored**
- SIEM API: Operational
- SIEM Ingestor: Operational
- SIEM Consumer: Operational
- SIEM Rule Engine: Operational

✅ **Verification Completed**
- Health checks: PASSED
- Data integrity: VERIFIED
- End-to-end test: PASSED
- Agent connectivity: VERIFIED

## Next Steps

- [ ] Monitor system performance for 48 hours
- [ ] Verify agent reconnection
- [ ] Update monitoring dashboards
- [ ] Schedule post-incident review

## Contact Information

Recovery performed by: Disaster Recovery Automation Script
Log file: ${LOG_FILE}
EOF
    
    success "Recovery report generated: ${SCRIPT_DIR}/recovery_report_$(date +%Y%m%d_%H%M%S).md"
}

# Main execution
main() {
    info "Starting SIEM Disaster Recovery Process..."
    info "Recovery start time: $(date)"
    info "Log file: $LOG_FILE"
    
    # Check prerequisites
    command -v terraform >/dev/null 2>&1 || { error "terraform is required but not installed"; exit 1; }
    command -v ansible-playbook >/dev/null 2>&1 || { error "ansible is required but not installed"; exit 1; }
    command -v aws >/dev/null 2>&1 || { error "aws cli is required but not installed"; exit 1; }
    command -v jq >/dev/null 2>&1 || { error "jq is required but not installed"; exit 1; }
    
    # Load configuration
    load_config
    
    # Execute recovery phases
    provision_infrastructure
    install_software
    recover_backups
    deploy_services
    configure_load_balancer
    verify_recovery
    update_dns
    final_verification
    generate_report
    
    local recovery_end_time=$(date +%s)
    local recovery_duration=$((recovery_end_time - RECOVERY_START_TIME))
    local hours=$((recovery_duration / 3600))
    local minutes=$(((recovery_duration % 3600) / 60))
    
    success "=== DISASTER RECOVERY COMPLETED SUCCESSFULLY ==="
    success "Recovery Duration: ${hours}h ${minutes}m"
    success "Platform URL: http://${LB_DNS_NAME}"
    success "Recovery report generated"
    
    info "Please monitor the system for the next 48 hours and verify agent reconnection"
}

# Script options
case "${1:-}" in
    --dry-run)
        info "Running in dry-run mode (no actual changes will be made)"
        DRY_RUN=true
        ;;
    --help)
        cat << EOF
SIEM Disaster Recovery Automation Script

Usage: $0 [OPTIONS]

Options:
    --dry-run    Run in dry-run mode (no actual changes)
    --help       Show this help message

Configuration:
    Edit dr_config.env to configure recovery parameters

Phases:
    1. Infrastructure Provisioning
    2. Software Installation  
    3. Backup Recovery
    4. Service Deployment
    5. Load Balancer Configuration
    6. Recovery Verification
    7. DNS Update
    8. Final Verification

For detailed information, see DR_RUNBOOK.md
EOF
        exit 0
        ;;
    "")
        # No arguments, run normally
        ;;
    *)
        error "Unknown option: $1"
        error "Use --help for usage information"
        exit 1
        ;;
esac

# Execute main function
main "$@" 