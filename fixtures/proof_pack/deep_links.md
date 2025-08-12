# Deep Link Examples

## Rules Deep Link
```
/rules?tenant=101&q=enabled:true#rule=rule_failed_logins&tab=compile
```

This URL will:
- Set tenant to 101
- Filter rules by enabled:true
- Select rule_failed_logins
- Open the compile tab

All parts rehydrate correctly after reload:
- Tenant selector shows "Tenant 101"
- Search box contains "enabled:true"
- Rule list is filtered
- Rule "Multiple Failed Login Attempts" is selected
- Compile tab is active

## Alerts Deep Link
```
/alerts?tenant=101&status=OPEN,ACK&severity=HIGH,CRITICAL&range=1h#alert=alert_123456
```

This URL will:
- Set tenant to 101
- Filter by OPEN and ACK status
- Filter by HIGH and CRITICAL severity
- Set time range to 1 hour
- Open alert drawer for alert_123456

After another filter change (e.g., adding severity=MEDIUM), the same alert remains accessible at:
```
/alerts?tenant=101&status=OPEN,ACK&severity=HIGH,CRITICAL,MEDIUM&range=1h#alert=alert_123456
```
