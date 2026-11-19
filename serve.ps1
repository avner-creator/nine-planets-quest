# Minimal static file server for Nine Planets Quest (no node/python required).
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 5173] [-Open]
#   -Open  opens the game in the default browser once the server is listening.
# Exit codes: 0 = server stopped, 1 = could not start (port taken by another program, etc.), 2 = Nine Planets Quest was already running.
param([int]$Port = 5174, [switch]$Open)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:$Port/"

function Fail-PortBusy($why) {
  # Port taken. If it is another Nine Planets Quest server, just use it; otherwise explain.
  $isUs = $false
  try { $isUs = (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).Content -match '<title>Nine Planets Quest</title>' } catch { }
  if ($isUs) {
    Write-Host "Nine Planets Quest is already running at $url"
    if ($Open) { Start-Process $url }
    exit 2
  }
  $owner = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
  $who = ($owner | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p) { "$($p.ProcessName) (PID $_)" } else { "PID $_" } }) -join ', '
  Write-Host ""
  Write-Host "Port $Port is already in use by another program$(if ($who) { ": $who" })." -ForegroundColor Red
  if ($why) { Write-Host "  ($why)" }
  Write-Host "Close that program and try again, or start Nine Planets Quest on another port:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port 5181 -Open"
  exit 1
}
if (@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0) { Fail-PortBusy $null }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.bin' = 'application/octet-stream'; '.md' = 'text/plain; charset=utf-8'; '.txt' = 'text/plain; charset=utf-8'; '.wasm' = 'application/wasm'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() } catch {
  $msg = $_.Exception.InnerException; if (-not $msg) { $msg = $_.Exception }; $msg = $msg.Message
  if ($msg -match 'conflicts|in use|being used') { Fail-PortBusy $msg }
  Write-Host "Could not start server on port $Port : $msg" -ForegroundColor Red; exit 1
}
Write-Host "Nine Planets Quest server running at $url  (root: $root)"
Write-Host "Keep this window open while you play. Close it (or press Ctrl+C) to stop the server."
if ($Open) { Start-Process $url }
$rootPrefix = $root.TrimEnd('\') + '\'

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $res.Headers.Add('Cache-Control', 'no-store')
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/__api/models') {
      $dir = Join-Path $root 'assets\models'
      $names = @()
      if (Test-Path $dir) { $names = @(Get-ChildItem -Path $dir -Filter *.glb -File | Where-Object { $_.Length -gt 0 } | ForEach-Object { $_.Name }) }
      $json = '[' + (($names | ForEach-Object { '"' + $_ + '"' }) -join ',') + ']'
      $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = 'application/json'
    } else {
      if ($path.EndsWith('/')) { $path += 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
      if (-not $file.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $res.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $res.ContentType = 'text/plain'
      } else {
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
        $bytes = [System.IO.File]::ReadAllBytes($file)
      }
    }
    $res.ContentLength64 = $bytes.Length
    if ($req.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    $res.OutputStream.Close()
  } catch {
    try { $ctx.Response.Abort() } catch { }
  }
}

