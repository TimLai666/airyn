# 自製飛控軟體專案結構設計文件

> Implementation note: the current repo is now a monorepo. `flight/` is the independent firmware project, aircraft settings live in root `models/<model>/model.toml`, and generated firmware artifacts go under `flight/build/generated/`. Older examples in this design note that mention root `profiles/`, root `vendor/madflight/`, or hand-written `model_config.h` should be read as historical planning notes.

## 1. 專案定位

本專案不是單一機型的飛控程式，而是一個可長期擴充的飛控軟體平台。

MadFlight 作為底層飛控能力來源，負責提供既有的飛控模組、感測器支援、控制迴圈與馬達輸出能力。本專案則負責管理多機型、多板型、多設定與後續自訂功能。

核心原則：

- 不直接把機型差異寫死在 MadFlight 核心內。
- 每一台機型都應該是一組明確的設定或描述。
- 開發中使用專門的測試機型設定；已固化機型也可以修改，但應透過 dev 工作副本測試後再寫回 stable，並記錄原因。
- MadFlight 視為外部依賴，除非必要，不修改其原始碼。
- 專案應能支援未來新增四軸、六軸、固定翼或其他實驗機型。

---

## 2. 建議目錄結構

```text
my-flight-controller/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── model-config.md
│   ├── wiring-guide.md
│   └── madflight-integration.md
│
├── vendor/
│   └── madflight/
│
├── src/
│   ├── main.cpp
│   ├── app/
│   ├── core/
│   ├── config/
│   ├── models/
│   ├── targets/
│   ├── boards/
│   ├── devices/
│   ├── mixer/
│   ├── safety/
│   ├── telemetry/
│   └── utils/
│
├── profiles/
│   ├── dev/
│   │   └── test_model/
│   │       ├── model_config.h
│   │       ├── wiring.md
│   │       └── notes.md
│   │
│   ├── stable/
│   │   ├── quad_x_basic/
│   │   │   ├── model_config.h
│   │   │   ├── wiring.md
│   │   │   └── notes.md
│   │   │
│   │   └── tiny_quad_75mm/
│   │       ├── model_config.h
│   │       ├── wiring.md
│   │       └── notes.md
│   │
│   └── experimental/
│       └── hex_proto/
│           ├── model_config.h
│           ├── wiring.md
│           └── notes.md
│
├── targets/
│   ├── pico/
│   ├── pico2/
│   └── esp32/
│
├── tools/
│   ├── build_model.py
│   ├── freeze_model.py
│   └── check_config.py
│
├── scripts/
│   ├── build.sh
│   ├── flash.sh
│   └── clean.sh
│
└── tests/
    ├── config_tests/
    ├── mixer_tests/
    └── safety_tests/
```

---

## 3. 各目錄用途

### `vendor/`

放外部依賴。

目前主要放 MadFlight：

```text
vendor/madflight/
```

這裡的程式碼原則上不要直接修改。若真的需要修改，應先確認是否能透過外層 wrapper、adapter 或 config 解決。

建議管理方式：

- 初期可以直接 clone 或複製 MadFlight。
- 中期建議改用 Git submodule 固定版本。
- 若需要修改 MadFlight，建議 fork 一份，並清楚記錄改了什麼。

---

### `src/main.cpp`

主入口。

這個檔案只做啟動流程，不放機型細節。

應負責：

- 載入目前選定的 profile。
- 初始化板型。
- 初始化 IMU、接收機、馬達與安全機制。
- 啟動飛控主迴圈。

不應該放：

- 具體 GPIO 腳位。
- 某台機型專屬 PID。
- 某台機型專屬 mixer。
- 臨時測試邏輯。

---

### `src/app/`

放應用層流程。

例如：

- 系統啟動流程。
- 飛控初始化流程。
- 狀態切換。
- 開機檢查。
- 校正流程。

這層可以呼叫 MadFlight，也可以呼叫本專案自己的 core，但不應該直接寫死特定機型腳位。

---

### `src/core/`

放本專案自己的飛控核心邏輯。

例如：

- FlightController 類別。
- 初始化流程。
- 飛行模式管理。
- 控制流程包裝。
- 對 MadFlight 的統一介面。

如果未來要逐步替換 MadFlight 的部分功能，也應該從這層開始包裝，而不是讓全專案到處直接呼叫 MadFlight。

---

### `src/config/`

放設定讀取、設定驗證與設定轉換。

例如：

- 讀取目前選定的 model config。
- 檢查 GPIO 是否重複。
- 檢查馬達數量是否符合 frame 類型。
- 檢查 IMU bus 是否存在。
- 把外部設定轉成程式可用的結構。

初期若使用 C/C++ header 設定，這層可以先很薄。之後若改成 JSON、YAML 或 TOML，再逐步加強。

---

### `src/models/`

放機型描述的程式端結構與共同邏輯。

注意：這裡不是放每台機型的設定檔，而是放「機型系統」的程式碼。

例如：

- ModelConfig 結構。
- MotorConfig 結構。
- IMUConfig 結構。
- ReceiverConfig 結構。
- FrameType enum。
- Config validation function。

每台機型的實際設定放在 `profiles/`。

---

### `src/targets/`

放不同 MCU 或編譯目標的適配邏輯。

例如：

- Raspberry Pi Pico
- Raspberry Pi Pico 2
- ESP32
- STM32

這裡處理的是「晶片／平台差異」，不是「機型差異」。

例如 Pico 和 Pico 2 使用不同 SDK 或 GPIO 能力時，放在這裡。

---

### `src/boards/`

放自製飛控板或開發板的板級定義。

例如：

- `pico_breadboard_dev`
- `pico2_custom_fc_v1`
- `esp32_devkit_test`

這層描述的是實體板子，例如：

- 哪些 GPIO 可用。
- 哪些腳位已被保留。
- I2C 預設腳位。
- UART 預設腳位。
- LED 腳位。
- 電壓偵測腳位。

機型 profile 會引用 board。

---

### `src/devices/`

放硬體裝置的包裝層。

例如：

- IMU adapter。
- ESC adapter。
- Receiver adapter。
- Battery sensor adapter。
- Barometer adapter。

這層可以把 MadFlight 的 device module 包起來，避免上層直接依賴 MadFlight 的細節。

---

### `src/mixer/`

放馬達混控邏輯。

例如：

- Quad X
- Quad Plus
- Hex X
- Fixed Wing
- Tricopter

如果 MadFlight 已經提供可用 mixer，可以先包裝 MadFlight 的 mixer。若未來要做自己的 mixer，可以在這裡替換。

---

### `src/safety/`

放安全相關邏輯。

例如：

- Arm / disarm 檢查。
- Throttle failsafe。
- IMU 初始化失敗保護。
- 接收機斷訊保護。
- 電壓過低保護。
- 馬達測試模式限制。

這層很重要，不要散落在主程式或機型設定裡。

---

### `src/telemetry/`

放遙測與除錯輸出。

例如：

- Serial debug。
- Blackbox log。
- 狀態輸出。
- IMU 原始值輸出。
- PID debug。

開發初期可以很簡單，只先做 Serial log。

---

### `src/utils/`

放通用工具。

例如：

- 數值限制。
- 單位轉換。
- 小型資料結構。
- 編譯期輔助 macro。

不要把飛控邏輯塞到 utils。

---

## 4. `profiles/`：機型設定管理

`profiles/` 是本專案最重要的設計之一。

它負責管理不同機型的設定，而不是讓每台機型散落在主程式中。

建議分成三區：

```text
profiles/
├── dev/
├── stable/
└── experimental/
```

---

### `profiles/dev/test_model/`

開發測試用機型。

這是日常開發時主要修改的地方。

用途：

- 測試新腳位配置。
- 測試新 IMU。
- 測試新 ESC。
- 測試新 mixer。
- 測試 PID。
- 測試新功能。

這個 profile 可以經常改，不代表任何正式機型。

建議固定命名為：

```text
profiles/dev/test_model/
```

或：

```text
profiles/dev/current_test/
```

但建議用 `test_model`，語意較明確。

內容：

```text
profiles/dev/test_model/
├── model_config.h
├── wiring.md
└── notes.md
```

---

### `profiles/stable/`

放已固化的機型。

固化代表：

- 腳位已確認。
- IMU 已確認。
- 馬達順序已確認。
- 基礎 PID 可用。
- 接收機設定可用。
- wiring 文件已補齊。

這裡的機型不應該隨便改。

若要修改舊機型，流程應該是：

1. 複製到 `profiles/dev/<model>_edit/` 或 `profiles/dev/test_model/` 測試。
2. 確認能穩定運作。
3. 再合併回 stable 機型。
4. 在 notes.md 記錄改動。

---

### `profiles/experimental/`

放實驗性機型。

例如：

- 六軸原型。
- 固定翼原型。
- 新型 frame。
- 不確定會不會保留的配置。

這裡比 `dev/test_model` 穩定一點，但還沒正式固化。

---

## 5. 單一機型 profile 應包含什麼

每個機型 profile 建議包含三個檔案：

```text
model_config.h
wiring.md
notes.md
```

---

### `model_config.h`

放機型實際設定。

初期建議使用 header，因為 MCU 韌體開發比較直接，也比較容易讓編譯器最佳化。

範例：

```cpp
#pragma once

#define MODEL_NAME "dev_test_model"
#define TARGET_BOARD "pico2_breadboard_dev"
#define FRAME_TYPE_QUAD_X 1

#define IMU_TYPE_MPU6050 1
#define IMU_I2C_BUS 0
#define IMU_SDA_PIN 4
#define IMU_SCL_PIN 5
#define IMU_ADDRESS 0x68

#define MOTOR_COUNT 4
#define MOTOR1_PIN 2
#define MOTOR2_PIN 3
#define MOTOR3_PIN 6
#define MOTOR4_PIN 7

#define ESC_PROTOCOL_DSHOT 1
#define ESC_DSHOT_RATE 300

#define RECEIVER_TYPE_PWM 1
#define RECEIVER_PIN 8

#define PID_ROLL_P 40.0f
#define PID_ROLL_I 0.0f
#define PID_ROLL_D 15.0f

#define PID_PITCH_P 40.0f
#define PID_PITCH_I 0.0f
#define PID_PITCH_D 15.0f

#define PID_YAW_P 30.0f
#define PID_YAW_I 0.0f
#define PID_YAW_D 0.0f
```

原則：

- 只放設定，不放邏輯。
- 不直接 include MadFlight 的細節，除非必要。
- 命名要一致，方便工具檢查。

---

### `wiring.md`

放接線紀錄。

範例：

```markdown
# dev_test_model Wiring

## Board

- Board: Raspberry Pi Pico 2
- Power: USB for development, external 2S battery for ESC

## IMU

| IMU Pin | Board Pin |
|---|---|
| VCC | 3.3V |
| GND | GND |
| SDA | GPIO 4 |
| SCL | GPIO 5 |

## Motors

| Motor | GPIO | ESC | Position |
|---|---:|---|---|
| M1 | GPIO 2 | ESC 1 | Front Right |
| M2 | GPIO 3 | ESC 2 | Rear Right |
| M3 | GPIO 6 | ESC 3 | Rear Left |
| M4 | GPIO 7 | ESC 4 | Front Left |
```

這個檔案很重要，因為實體接線常常比程式更容易亂。

---

### `notes.md`

放測試紀錄與改動理由。

範例：

```markdown
# dev_test_model Notes

## 2026-04-25

- Changed motor pins from 2/3/4/5 to 2/3/6/7.
- Reason: GPIO 4/5 reserved for I2C IMU.
- Status: motor output not yet tested.

## Known Issues

- PID values are placeholders.
- Motor order needs verification.
```

---

## 6. 開發用測試機型流程

你提出的想法是正確的：日常開發應該有一個專門的測試 profile，避免一直改正式機型。

建議流程如下：

### Step 1：日常修改只改 `profiles/dev/test_model/`

例如你要換腳位、換 IMU、測 DShot，都先改：

```text
profiles/dev/test_model/model_config.h
```

日常測試不要直接改：

```text
profiles/stable/quad_x_basic/model_config.h
```

---

### Step 2：測試穩定後，整理設定

確認：

- 可以正常開機。
- IMU 可讀取。
- 馬達方向正確。
- 馬達順序正確。
- 接收機輸入正常。
- failsafe 有效。
- PID 不會明顯失控。

---

### Step 3：固化成正式機型

使用工具或手動複製：

```bash
python tools/freeze_model.py profiles/dev/test_model profiles/stable/quad_x_basic
```

固化時應該同時複製：

- `model_config.h`
- `wiring.md`
- `notes.md`

並且把 `MODEL_NAME` 改成正式名稱。

---

### Step 4：正式機型可以改，但不要無紀錄亂改

之後若要改正式機型，應該：

1. 從 stable 複製回 dev 工作副本。
2. 在 dev 測。
3. 測好後再更新 stable。
4. 在 `notes.md` 記錄修改原因與驗證狀態。

這樣可以避免正式機型被開發過程污染。

---

## 7. build 選擇機型的方式

建議讓建置流程可以指定 profile。

例如：

```bash
./scripts/build.sh dev/test_model
```

或：

```bash
./scripts/build.sh stable/quad_x_basic
```

內部可以做的事：

1. 找到指定 profile。
2. 檢查 `model_config.h` 是否存在。
3. 把 profile path 傳給編譯器。
4. 編譯時 include 對應設定。

例如編譯參數：

```bash
-DMODEL_CONFIG_PATH=\"profiles/dev/test_model/model_config.h\"
```

或產生一個暫時檔案：

```text
build/generated/active_model_config.h
```

內容：

```cpp
#pragma once
#include "../../profiles/dev/test_model/model_config.h"
```

主程式只 include：

```cpp
#include "generated/active_model_config.h"
```

這樣主程式永遠不用改。

---

## 8. `tools/` 工具規劃

### `tools/check_config.py`

檢查機型設定是否合理。

應檢查：

- 馬達腳位是否重複。
- I2C 腳位是否與馬達腳位衝突。
- UART 腳位是否與其他裝置衝突。
- 馬達數量是否符合 frame 類型。
- IMU type 是否支援。
- board 是否存在。

---

### `tools/build_model.py`

負責根據指定 profile 產生 active config。

例如：

```bash
python tools/build_model.py dev/test_model
```

產生：

```text
build/generated/active_model_config.h
```

---

### `tools/freeze_model.py`

把開發中的測試機型固化成正式機型。

例如：

```bash
python tools/freeze_model.py dev/test_model stable/quad_x_basic
```

應做：

- 複製 profile。
- 改 MODEL_NAME。
- 檢查 stable 目標是否已存在。
- 要求填寫固化原因。
- 在 notes.md 加上 freeze 紀錄。

---

## 9. 建議的開發規則

### 規則 1：MadFlight 核心不要直接改

除非是 bug fix 或必要適配，否則不要改 `vendor/madflight/`。

若需要改，應在 `docs/madflight-integration.md` 記錄：

- 改了哪個檔案。
- 為什麼改。
- 是否能 upstream。
- 未來更新 MadFlight 時要注意什麼。

---

### 規則 2：日常開發與舊機型修改先改 dev profile

開發測試時優先改：

```text
profiles/dev/test_model/
```

舊機型可以修改，但先複製到 dev 工作副本測試；測好後再帶紀錄更新 stable。

---

### 規則 3：stable 機型必須有 wiring 文件

每個 stable 機型至少要有：

- `model_config.h`
- `wiring.md`
- `notes.md`

沒有 wiring 文件的機型不應該進 stable。

---

### 規則 4：所有腳位都要經過 config 管理

不要在主程式或 core 裡直接寫：

```cpp
#define MOTOR1_PIN 2
```

應該放在 profile。

---

### 規則 5：板型差異與機型差異分開

板型差異放 `boards/` 或 `targets/`。

機型差異放 `profiles/`。

不要把 Pico 2 的腳位能力和某台四軸的馬達配置混在一起。

---

## 10. 建議的第一版實作順序

### Phase 1：最小可用架構

先做：

```text
vendor/madflight/
src/main.cpp
profiles/dev/test_model/model_config.h
profiles/dev/test_model/wiring.md
profiles/dev/test_model/notes.md
scripts/build.sh
```

目標：

- 可以用 `dev/test_model` 編譯。
- 可以燒進 Pico 或 Pico 2。
- 可以讀 IMU。
- 可以輸出馬達訊號。

---

### Phase 2：加入 stable profile

新增：

```text
profiles/stable/quad_x_basic/
```

目標：

- 把第一台能跑的四軸固化。
- 日後可以修改它，但要透過 dev 工作副本、測試與 notes 紀錄。

---

### Phase 3：加入檢查工具

新增：

```text
tools/check_config.py
```

目標：

- 編譯前自動檢查腳位衝突。
- 避免硬體燒掉或接錯。

---

### Phase 4：加入 freeze 工具

新增：

```text
tools/freeze_model.py
```

目標：

- 把 dev 測試設定整理成正式機型。
- 保留紀錄。

---

## 11. 最重要的設計結論

本專案應採用：

```text
自有飛控平台
    ↓
機型設定層 profiles
    ↓
板型／硬體抽象層
    ↓
MadFlight 底層依賴
```

MadFlight 是底層工具，不是整個專案本體。

所有機型差異都應集中在 `profiles/`。

日常開發只修改 `profiles/dev/test_model/`。

等測試穩定後，再固化到 `profiles/stable/` 成為正式機型。
