# SIEM Log Generator

A Python script that generates realistic log data and sends it to your SIEM ingestor for testing and demonstration purposes.

## Features

- **Multi-tenant simulation**: Generates logs for different tenants (tenant-A and tenant-B)
- **Multiple log types**: Supports Windows Security logs, Linux Syslog, and Palo Alto firewall logs
- **Realistic data**: Uses authentic log formats with randomized but realistic data
- **Configurable batching**: Sends logs in configurable batches with adjustable delays
- **Error handling**: Includes connection error handling and retry logic

## Prerequisites

1. **Python 3.6+** installed on your system
2. **SIEM Ingestor** running on `http://127.0.0.1:8081`
3. **Log Sources configured** in your SIEM system (see Configuration section)

## Installation

1. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

### 1. SIEM Log Sources Setup

Before running the log generator, you **MUST** configure the following source IPs in your SIEM's "Log Sources" management:

| Source IP | Tenant | Parser Type | Description |
|-----------|--------|-------------|-------------|
| 10.10.10.100 | tenant-A | windows | Windows DC logs |
| 10.10.10.101 | tenant-A | palo_alto | Palo Alto firewall |
| 10.20.20.200 | tenant-B | linux | Linux server logs |
| 10.20.20.201 | tenant-B | palo_alto | Palo Alto firewall |

### 2. Script Configuration

You can modify the following variables in `log_generator.py`:

- `INGESTOR_URL`: The URL of your SIEM ingestor (default: `http://127.0.0.1:8081/ingest/raw`)
- `LOGS_PER_BATCH`: Number of logs to send in each batch (default: 10)
- `DELAY_SECONDS`: Delay between batches in seconds (default: 2)
- `TENANT_SIMULATION`: Configure tenants, their source IPs, and log types

## Usage

1. **Start your SIEM services** (ensure the ingestor is running on port 8081)

2. **Configure log sources** in your SIEM system as described above

3. **Run the log generator**:
   ```bash
   python log_generator.py
   ```

4. **Monitor the output**:
   ```
   🚀 Starting SIEM Log Generator...
      Target Ingestor: http://127.0.0.1:8081/ingest/raw
      Sending 10 logs every 2 seconds.
      Press Ctrl+C to stop.
   ------------------------------
   
   --- Generating batch of 10 logs (2024-12-24T20:45:00.123456) ---
   ✅  Sent log from 10.10.10.100 -> <13>1 Dec 24 20:45:00 DC01.corp.local MSWinEvent-Security 4624...
   ✅  Sent log from 10.20.20.200 -> Dec 24 20:45:00 server-01 sshd[12345]: Accepted password for alice...
   ```

5. **Stop the generator** by pressing `Ctrl+C`

## Log Types Generated

### Windows Security Logs
- **Event 4624**: Successful logon events
- **Event 4625**: Failed logon attempts
- Format: Syslog with Windows Event Log structure

### Linux Syslog
- **SSH Login**: Successful SSH authentication events
- **Sudo Commands**: Privilege escalation events
- Format: Standard syslog format

### Palo Alto Firewall
- **Traffic Allow**: Permitted network traffic
- **Traffic Deny**: Blocked network traffic
- Format: LEEF (Log Event Extended Format)

## Troubleshooting

### Connection Errors
If you see connection errors:
```
🔥  Connection Error: Could not connect to ingestor at http://127.0.0.1:8081/ingest/raw. Is it running?
```

1. Verify the SIEM ingestor is running: `curl http://127.0.0.1:8081/health`
2. Check if the port is correct in the `INGESTOR_URL` configuration
3. Ensure no firewall is blocking the connection

### HTTP Error Responses
If you see HTTP error responses:
```
❌  Error sending log from 10.10.10.100. Status: 400, Response: Invalid log format
```

1. Check that the source IP is configured in your SIEM's log sources
2. Verify the parser type is correctly assigned to the source IP
3. Check the SIEM ingestor logs for detailed error messages

### No Logs Appearing in SIEM
1. Verify log sources are configured with the correct source IPs
2. Check that the tenant mapping is correct
3. Ensure the parser types match the log formats being generated
4. Check the SIEM consumer and rule engine logs for processing errors

## Customization

### Adding New Log Types
To add new log types, modify the `LOG_TEMPLATES` dictionary:

```python
LOG_TEMPLATES = {
    "your_new_type": [
        "Your log template with {placeholders}",
        "Another template for variety"
    ]
}
```

### Adding New Tenants
To add new tenants, modify the `TENANT_SIMULATION` list:

```python
TENANT_SIMULATION.append({
    "tenant_id": "tenant-C",
    "source_ips": ["10.30.30.300"],
    "log_types": ["your_new_type"]
})
```

### Adjusting Data Generation
Modify the helper functions to generate different types of data:
- `get_random_ip()`: Change IP ranges
- `get_random_user()`: Add more usernames
- `generate_log()`: Add more dynamic fields

## Security Notes

- This tool is intended for **testing and development purposes only**
- Do not use in production environments without proper security review
- The generated logs contain realistic but **fake data**
- Ensure proper network isolation when testing

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the SIEM ingestor and consumer logs
3. Verify your log source configuration in the SIEM system