param(
    [string]$Profile = "dev/test_model",
    [string]$Environment = "RP2350A"
)

$env:AIRYN_PROFILE = $Profile
pio run -e $Environment -t upload

