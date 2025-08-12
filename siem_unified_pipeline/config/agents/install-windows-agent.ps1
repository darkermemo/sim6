# install-windows-agent.ps1 - Windows SIEM Agent Installer
param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,
    
    [Parameter(Mandatory=$true)]
    [string]$SourceId,
    
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl,
    
    [string]$ApiKey = "",
    
    [string]$InstallPath = "C:\Program Files\SIEM Agent",
    
    [string]$SpoolPath = "C:\ProgramData\SIEM\spool",
    
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param($Message, $Level = "Info")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "$timestamp [$Level] $Message"
    
    if (-not $Quiet) {
        switch ($Level) {
            "Error" { Write-Host $logMessage -ForegroundColor Red }
            "Warning" { Write-Host $logMessage -ForegroundColor Yellow }
            "Success" { Write-Host $logMessage -ForegroundColor Green }
            default { Write-Host $logMessage }
        }
    }
    
    # Also log to Windows Event Log
    if ($script:EventLogCreated) {
        Write-EventLog -LogName Application -Source "SIEM Agent Installer" -EventID 1000 -EntryType $Level -Message $Message
    }
}

# Check for admin privileges
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Log "This script requires Administrator privileges" -Level Error
    exit 1
}

Write-Log "SIEM Agent Installer starting..."
Write-Log "Tenant ID: $TenantId"
Write-Log "Source ID: $SourceId"
Write-Log "SIEM Server: $BaseUrl"

# Create event log source
try {
    New-EventLog -LogName Application -Source "SIEM Agent Installer" -ErrorAction SilentlyContinue
    $script:EventLogCreated = $true
} catch {
    $script:EventLogCreated = $false
}

# Create directories
Write-Log "Creating directories..."
New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
New-Item -ItemType Directory -Path $SpoolPath -Force | Out-Null
New-Item -ItemType Directory -Path "$env:ProgramData\SIEM" -Force | Out-Null

# Download Vector (or use bundled)
$vectorVersion = "0.34.0"
$vectorUrl = "https://packages.timber.io/vector/$vectorVersion/vector-$vectorVersion-x86_64-pc-windows-msvc.zip"
$vectorZip = "$env:TEMP\vector.zip"

Write-Log "Downloading Vector $vectorVersion..."
try {
    Invoke-WebRequest -Uri $vectorUrl -OutFile $vectorZip -UseBasicParsing
    Write-Log "Downloaded Vector successfully"
} catch {
    Write-Log "Failed to download Vector: $_" -Level Error
    exit 1
}

# Extract Vector
Write-Log "Extracting Vector..."
Expand-Archive -Path $vectorZip -DestinationPath $env:TEMP -Force
$vectorFiles = Get-ChildItem -Path "$env:TEMP\vector-*" -Directory | Select-Object -First 1
Copy-Item -Path "$vectorFiles\*" -Destination $InstallPath -Recurse -Force

# Generate configuration
Write-Log "Generating agent configuration..."
$configTemplate = Get-Content -Path "$PSScriptRoot\windows-agent.toml" -Raw
$config = $configTemplate `
    -replace "{{TENANT_ID}}", $TenantId `
    -replace "{{SOURCE_ID}}", $SourceId `
    -replace "{{BASE_URL}}", $BaseUrl `
    -replace "{{API_KEY}}", $ApiKey

$config | Out-File -FilePath "$InstallPath\agent.toml" -Encoding UTF8

# Create Windows service wrapper config
$serviceXml = @"
<service>
  <id>SIEMAgent</id>
  <name>SIEM Agent</name>
  <description>SIEM log collection agent for Windows</description>
  <executable>$InstallPath\vector.exe</executable>
  <arguments>--config "$InstallPath\agent.toml"</arguments>
  <logpath>$env:ProgramData\SIEM\logs</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>15 sec</stoptimeout>
  <startup>automatic</startup>
  <priority>Normal</priority>
  <env name="RUST_LOG" value="info"/>
</service>
"@

$serviceXml | Out-File -FilePath "$InstallPath\SIEMAgent.xml" -Encoding UTF8

# Install as Windows service
Write-Log "Installing Windows service..."
try {
    # Stop existing service if running
    $existingService = Get-Service -Name "SIEMAgent" -ErrorAction SilentlyContinue
    if ($existingService) {
        Write-Log "Stopping existing service..."
        Stop-Service -Name "SIEMAgent" -Force
        & sc.exe delete "SIEMAgent"
        Start-Sleep -Seconds 2
    }
    
    # Create new service
    $servicePath = "$InstallPath\vector.exe"
    $serviceArgs = "--config `"$InstallPath\agent.toml`""
    
    New-Service -Name "SIEMAgent" `
                -BinaryPathName "`"$servicePath`" $serviceArgs" `
                -DisplayName "SIEM Agent" `
                -Description "SIEM log collection agent for Windows" `
                -StartupType Automatic
    
    Write-Log "Service installed successfully" -Level Success
} catch {
    Write-Log "Failed to install service: $_" -Level Error
    exit 1
}

# Configure Windows Firewall
Write-Log "Configuring Windows Firewall..."
New-NetFirewallRule -DisplayName "SIEM Agent" `
                    -Direction Outbound `
                    -Program "$InstallPath\vector.exe" `
                    -Action Allow `
                    -ErrorAction SilentlyContinue

# Start service
Write-Log "Starting SIEM Agent service..."
try {
    Start-Service -Name "SIEMAgent"
    Write-Log "Service started successfully" -Level Success
} catch {
    Write-Log "Failed to start service: $_" -Level Error
    Write-Log "Check the logs at: $env:ProgramData\SIEM\logs" -Level Warning
}

# Verify installation
Start-Sleep -Seconds 3
$service = Get-Service -Name "SIEMAgent" -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Log "SIEM Agent installed and running successfully!" -Level Success
    
    # Test connectivity
    Write-Log "Testing connection to SIEM server..."
    try {
        $testResponse = Invoke-WebRequest -Uri "$BaseUrl/api/v2/health" -Method Get -UseBasicParsing -TimeoutSec 5
        if ($testResponse.StatusCode -eq 200) {
            Write-Log "Successfully connected to SIEM server" -Level Success
        }
    } catch {
        Write-Log "Could not connect to SIEM server. Agent will retry automatically." -Level Warning
    }
    
    # Summary
    Write-Log ""
    Write-Log "Installation Summary:" -Level Success
    Write-Log "  Install Path: $InstallPath"
    Write-Log "  Spool Path: $SpoolPath"
    Write-Log "  Config File: $InstallPath\agent.toml"
    Write-Log "  Service Name: SIEMAgent"
    Write-Log "  Logs: $env:ProgramData\SIEM\logs"
    Write-Log ""
    Write-Log "To check agent status: Get-Service SIEMAgent"
    Write-Log "To view logs: Get-EventLog -LogName Application -Source 'SIEM*' -Newest 20"
} else {
    Write-Log "Installation completed but service is not running" -Level Error
    Write-Log "Check the logs and try starting manually: Start-Service SIEMAgent" -Level Warning
    exit 1
}

# Cleanup
Remove-Item -Path $vectorZip -Force -ErrorAction SilentlyContinue

Write-Log "Installation complete!"
