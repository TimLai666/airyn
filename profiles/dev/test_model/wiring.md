# dev_test_model Wiring

## Board

- Board: Raspberry Pi Pico 2
- Target: `RP2350A`
- Power: USB for development; external 2S battery for ESC power
- Status: placeholder wiring, verify before connecting props

## IMU

| IMU Pin | Board Pin |
|---|---|
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO 4 |
| SCL | GPIO 5 |
| INT | GPIO 9 |

## Receiver

| Receiver Pin | Board Pin |
|---|---|
| Signal | GPIO 8 |
| VCC | Receiver-rated supply |
| GND | GND |

## Motors

| Motor | GPIO | ESC | Position |
|---|---:|---|---|
| M1 | GPIO 2 | ESC 1 | Front Right |
| M2 | GPIO 3 | ESC 2 | Rear Right |
| M3 | GPIO 6 | ESC 3 | Rear Left |
| M4 | GPIO 7 | ESC 4 | Front Left |

