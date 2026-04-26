param(
    [string]$Profile = "testbench",
    [string]$Environment = "RP2350A"
)

$flightRoot = Resolve-Path "$PSScriptRoot\.."
Push-Location $flightRoot
try {
    $env:AIRYN_MODEL = $Profile
    pio run -e $Environment -t upload
}
finally {
    Pop-Location
}
