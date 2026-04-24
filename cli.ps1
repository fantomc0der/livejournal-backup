#!/usr/bin/env pwsh
Push-Location $PSScriptRoot
try { bun start @args } finally { Pop-Location }
