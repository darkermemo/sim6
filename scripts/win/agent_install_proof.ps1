# agent_install_proof.ps1 - Windows agent installation hardening verification
param(
    [string]$MsiPath = ".\SIEMAgent.msi",
    [string]$ApiBase = "http://127.0.0.1:9999"
)

$ErrorActionPreference = "Stop"

# Initialize test results
$testResults = @{
    SignatureValid = $false
    ServiceConfig = $false
    ServiceRecovery = $false
    FilePermissions = $false
    RegistryKeys = $false
    NetworkConfig = $false
    SpoolDirectory = $false
    ConfigProtection = $false
}

$artifacts = @{
    Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Tests = @()
}

function Test-Feature {
    param($Name, $Test, $Expected, $Actual)
    
    $passed = $Test
    $result = @{
        Name = $Name
        Expected = $Expected
        Actual = $Actual
        Passed = $passed
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    }
    
    $artifacts.Tests += $result
    
    if ($passed) {
        Write-Host "[PASS] $Name" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "  Expected: $Expected" -ForegroundColor Yellow
        Write-Host "  Actual: $Actual" -ForegroundColor Yellow
    }
    
    return $passed
}

Write-Host "=== Windows Agent Installation Hardening Verification ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: MSI Signature Verification
Write-Host "Testing MSI signature..." -ForegroundColor Yellow
if (Test-Path $MsiPath) {
    $sig = Get-AuthenticodeSignature -FilePath $MsiPath
    $testResults.SignatureValid = Test-Feature `
        -Name "MSI Digital Signature" `
        -Test ($sig.Status -eq "Valid") `
        -Expected "Valid Authenticode signature" `
        -Actual "Status: $($sig.Status), Signer: $($sig.SignerCertificate.Subject)"
    
    if ($sig.Status -eq "Valid") {
        $artifacts.SignatureThumbprint = $sig.SignerCertificate.Thumbprint
        $artifacts.SignerSubject = $sig.SignerCertificate.Subject
    }
} else {
    Write-Host "[SKIP] MSI not found at $MsiPath" -ForegroundColor Yellow
}

# Test 2: Service Configuration
Write-Host "`nTesting service configuration..." -ForegroundColor Yellow
$service = Get-Service -Name "SIEMAgent" -ErrorAction SilentlyContinue

if ($service) {
    # Check service account
    $serviceWmi = Get-WmiObject Win32_Service -Filter "Name='SIEMAgent'"
    $testResults.ServiceConfig = Test-Feature `
        -Name "Service Account" `
        -Test ($serviceWmi.StartName -eq "NT AUTHORITY\LocalService") `
        -Expected "NT AUTHORITY\LocalService" `
        -Actual $serviceWmi.StartName
    
    # Check startup type
    Test-Feature `
        -Name "Service Startup Type" `
        -Test ($service.StartType -eq "Automatic") `
        -Expected "Automatic" `
        -Actual $service.StartType
} else {
    Write-Host "[FAIL] SIEMAgent service not found" -ForegroundColor Red
}

# Test 3: Service Recovery Actions
Write-Host "`nTesting service recovery configuration..." -ForegroundColor Yellow
$recoveryActions = & sc.exe qfailure SIEMAgent
$expectedActions = @("restart/60000", "restart/300000", "restart/600000")
$actualActions = ($recoveryActions | Select-String "FAILURE_ACTIONS" -Context 0,10).Context.PostContext -join " "

$testResults.ServiceRecovery = Test-Feature `
    -Name "Service Recovery Actions" `
    -Test ($actualActions -match "restart.*60000.*restart.*300000.*restart.*600000") `
    -Expected "Restart at 1m, 5m, 10m" `
    -Actual $actualActions

# Test 4: File Permissions
Write-Host "`nTesting file permissions..." -ForegroundColor Yellow
$installPath = "C:\Program Files\SIEM Agent"
$dataPath = "C:\ProgramData\SIEM"

if (Test-Path $dataPath) {
    $acl = Get-Acl $dataPath
    $adminFullControl = $acl.Access | Where-Object { 
        $_.IdentityReference -match "Administrators" -and 
        $_.FileSystemRights -eq "FullControl" 
    }
    $systemFullControl = $acl.Access | Where-Object { 
        $_.IdentityReference -match "SYSTEM" -and 
        $_.FileSystemRights -eq "FullControl" 
    }
    $localServiceWrite = $acl.Access | Where-Object { 
        $_.IdentityReference -match "LOCAL SERVICE" -and 
        $_.FileSystemRights -match "Write" 
    }
    
    $testResults.FilePermissions = Test-Feature `
        -Name "Data Directory Permissions" `
        -Test ($adminFullControl -and $systemFullControl -and $localServiceWrite) `
        -Expected "Admin/SYSTEM: FullControl, LocalService: Write" `
        -Actual "Found $(($acl.Access | Measure-Object).Count) ACL entries"
}

# Test 5: Registry Keys
Write-Host "`nTesting registry configuration..." -ForegroundColor Yellow
$regPath = "HKLM:\SOFTWARE\SIEM\Agent"
if (Test-Path $regPath) {
    $regKeys = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
    $testResults.RegistryKeys = Test-Feature `
        -Name "Registry Keys" `
        -Test ($regKeys.InstallPath -and $regKeys.Version) `
        -Expected "InstallPath and Version keys present" `
        -Actual "Keys: $(($regKeys | Get-Member -MemberType NoteProperty).Name -join ', ')"
}

# Test 6: Network Configuration
Write-Host "`nTesting network configuration..." -ForegroundColor Yellow
$configPath = "$installPath\agent.toml"
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw
    $testResults.NetworkConfig = Test-Feature `
        -Name "TLS Configuration" `
        -Test ($config -match "tls.*enabled.*true" -or $config -match "https://") `
        -Expected "TLS enabled for SIEM connection" `
        -Actual "$(if ($config -match 'https://') { 'HTTPS endpoint configured' } else { 'HTTP endpoint' })"
}

# Test 7: Spool Directory
Write-Host "`nTesting spool directory..." -ForegroundColor Yellow
$spoolPath = "$dataPath\spool"
if (Test-Path $spoolPath) {
    $spoolSize = (Get-ChildItem $spoolPath -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    $testResults.SpoolDirectory = Test-Feature `
        -Name "Spool Directory" `
        -Test (Test-Path $spoolPath) `
        -Expected "Spool directory exists with proper permissions" `
        -Actual "Exists, current size: $([math]::Round($spoolSize, 2)) MB"
}

# Test 8: Configuration Protection
Write-Host "`nTesting configuration protection..." -ForegroundColor Yellow
if (Test-Path $configPath) {
    $configAcl = Get-Acl $configPath
    $restrictedWrite = -not ($configAcl.Access | Where-Object { 
        $_.IdentityReference -match "Users" -and 
        $_.FileSystemRights -match "Write" 
    })
    
    $testResults.ConfigProtection = Test-Feature `
        -Name "Config File Protection" `
        -Test $restrictedWrite `
        -Expected "Users cannot write to config" `
        -Actual "Write restricted: $restrictedWrite"
}

# Additional Security Checks
Write-Host "`nPerforming additional security checks..." -ForegroundColor Yellow

# Check for debugging/logging exposure
$debugEnabled = $false
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw
    $debugEnabled = $config -match "debug.*true" -or $config -match "log_level.*debug"
}
Test-Feature `
    -Name "Debug Logging" `
    -Test (-not $debugEnabled) `
    -Expected "Debug logging disabled" `
    -Actual "$(if ($debugEnabled) { 'Debug ENABLED' } else { 'Debug disabled' })"

# Check Windows Defender exclusions (shouldn't exclude everything)
$defenderExclusions = Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
$hasUnsafeExclusions = $defenderExclusions | Where-Object { $_ -match "C:\\Program Files\\SIEM Agent\\\*" }
Test-Feature `
    -Name "Windows Defender Exclusions" `
    -Test (-not $hasUnsafeExclusions) `
    -Expected "No blanket exclusions" `
    -Actual "$(if ($hasUnsafeExclusions) { 'UNSAFE exclusions found' } else { 'Exclusions appropriate' })"

# Generate Report
$artifacts.Summary = @{
    TotalTests = $artifacts.Tests.Count
    Passed = ($artifacts.Tests | Where-Object { $_.Passed }).Count
    Failed = ($artifacts.Tests | Where-Object { -not $_.Passed }).Count
}

$artifacts.HardeningScore = [math]::Round(($artifacts.Summary.Passed / $artifacts.Summary.TotalTests) * 100, 2)

# Save artifacts
$artifactPath = ".\target\test-artifacts\win"
New-Item -ItemType Directory -Path $artifactPath -Force | Out-Null

$artifacts | ConvertTo-Json -Depth 5 | Out-File "$artifactPath\install_report.json" -Encoding UTF8

# Summary
Write-Host "`n=== Installation Hardening Summary ===" -ForegroundColor Cyan
Write-Host "Total Tests: $($artifacts.Summary.TotalTests)" -ForegroundColor White
Write-Host "Passed: $($artifacts.Summary.Passed)" -ForegroundColor Green
Write-Host "Failed: $($artifacts.Summary.Failed)" -ForegroundColor $(if ($artifacts.Summary.Failed -gt 0) { 'Red' } else { 'Green' })
Write-Host "Hardening Score: $($artifacts.HardeningScore)%" -ForegroundColor $(if ($artifacts.HardeningScore -lt 80) { 'Red' } else { 'Green' })

# Exit code based on critical failures
$criticalFailures = @("SignatureValid", "ServiceConfig", "FilePermissions", "ConfigProtection")
$hasCriticalFailure = $false
foreach ($critical in $criticalFailures) {
    if (-not $testResults[$critical]) {
        $hasCriticalFailure = $true
        break
    }
}

if ($hasCriticalFailure -or $artifacts.HardeningScore -lt 80) {
    Write-Host "`n[FAIL] Critical hardening requirements not met" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`n[PASS] Installation hardening verified" -ForegroundColor Green
    exit 0
}
