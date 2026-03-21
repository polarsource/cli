# Polar CLI installer for Windows
# Usage: powershell -ExecutionPolicy ByPass -c "irm https://raw.githubusercontent.com/polarsource/cli/main/install.ps1 | iex"

$ErrorActionPreference = "Stop"

$Repo = "polarsource/cli"
$BinaryName = "polar.exe"
$InstallDir = Join-Path $HOME ".polar\bin"

function Write-Info { param($Message) Write-Host "==> $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "warning: $Message" -ForegroundColor Yellow }
function Write-Err { param($Message) Write-Host "error: $Message" -ForegroundColor Red; exit 1 }

# Detect architecture
$Arch = $env:PROCESSOR_ARCHITECTURE
if ($Arch -ne "AMD64") {
    Write-Err "Unsupported architecture: $Arch. Only x64 (AMD64) is supported."
}

$Platform = "windows-x64"

# Fetch latest version
Write-Info "Fetching latest version..."
try {
    $Release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "polar-installer" }
    $Version = $Release.tag_name
} catch {
    Write-Err "Failed to fetch latest version. Check your network connection."
}
if (-not $Version) {
    Write-Err "Failed to determine latest version from GitHub API response."
}
Write-Info "Version: $Version"

# Set up temp directory
$TempDir = Join-Path $env:TEMP "polar-install-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

try {
    # Download archive
    $Archive = "polar-$Platform.zip"
    $ArchiveUrl = "https://github.com/$Repo/releases/download/$Version/$Archive"
    $ArchivePath = Join-Path $TempDir $Archive

    Write-Info "Downloading $BinaryName $Version..."
    try {
        Invoke-WebRequest -Uri $ArchiveUrl -OutFile $ArchivePath -UseBasicParsing
    } catch {
        Write-Err "Download failed. Check if a release exists for your platform: $Platform"
    }

    # Download checksums
    $ChecksumsUrl = "https://github.com/$Repo/releases/download/$Version/checksums.txt"
    $ChecksumsPath = Join-Path $TempDir "checksums.txt"
    try {
        Invoke-WebRequest -Uri $ChecksumsUrl -OutFile $ChecksumsPath -UseBasicParsing
    } catch {
        Write-Err "Failed to download checksums."
    }

    # Verify checksum
    Write-Info "Verifying checksum..."
    $ActualHash = (Get-FileHash -Path $ArchivePath -Algorithm SHA256).Hash.ToLower()
    $ExpectedLine = Get-Content $ChecksumsPath | Where-Object { $_ -match $Archive }
    if (-not $ExpectedLine) {
        Write-Err "No checksum found for $Archive"
    }
    $ExpectedHash = ($ExpectedLine -split '\s+')[0].ToLower()
    if ($ActualHash -ne $ExpectedHash) {
        Write-Err "Checksum mismatch!`n  Expected: $ExpectedHash`n  Got:      $ActualHash"
    }
    Write-Info "Checksum verified."

    # Extract
    Write-Info "Extracting..."
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $TempDir -Force

    # Install
    Write-Info "Installing to $InstallDir..."
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    $SourcePath = Join-Path $TempDir $BinaryName
    $DestPath = Join-Path $InstallDir $BinaryName

    try {
        Copy-Item -Path $SourcePath -Destination $DestPath -Force
    } catch {
        Write-Err "Failed to install. If polar is running, close it and try again."
    }

    # Update PATH
    $CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($CurrentPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("PATH", "$InstallDir;$CurrentPath", "User")
        $env:PATH = "$InstallDir;$env:PATH"
    }

    Write-Info "Polar CLI $Version installed successfully!"
    Write-Host ""
    Write-Host "  Run 'polar --help' to get started."
    Write-Host ""
    if ($CurrentPath -notlike "*$InstallDir*") {
        Write-Warn "Restart other open terminals for PATH changes to take effect."
    }
} finally {
    # Cleanup
    Remove-Item -Path $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}
