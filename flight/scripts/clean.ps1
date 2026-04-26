$flightRoot = Resolve-Path "$PSScriptRoot\.."
Push-Location $flightRoot
try {
    pio run -t clean
    if (Test-Path build) {
        Remove-Item -LiteralPath build -Recurse -Force
    }
}
finally {
    Pop-Location
}
