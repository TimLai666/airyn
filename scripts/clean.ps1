pio run -t clean
if (Test-Path build) {
    Remove-Item -LiteralPath build -Recurse -Force
}

