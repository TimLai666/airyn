### 1. 把 `models/` 加入 dev / stable / experimental 分層

現在只有：

```text id="g1n7pk"
models/
  testbench/
```

建議改：

```text id="j4m2vx"
models/
├── dev/
│   └── testbench/
├── stable/
└── experimental/
```

理由：

* testbench 明確變開發沙盒
* 避免未來正式機型被拿來亂改
* 為 freeze 流程鋪路

這是最值得先做的。

---

### 2. 補「機型固化（freeze）」流程

做個簡單工具：

```text id="t8p3dw"
tools/freeze_model.py
```

例如：

```bash id="v5k1sq"
airyn freeze testbench quad_x_basic
```

做：

* 複製 dev/testbench → stable/quad_x_basic
* 改 name
* 留 notes
* 可加版本號

這會讓架構開始成形。

---

### 3. 補 config validator

你現在 TOML 很適合做：

```text id="n6c4yh"
tools/check_config.py
```

先檢查：

* pin 重複
* motor pin 和 I2C 衝突
* frame=quad_x 時 motors 必須 4 顆
* DShot rate 合法
* receiver channel map 完整

這個很有價值。

---

## 第二階段

### 4. 把 board 從 model 拆出去

等你真的有：

* 第二塊板
* custom FC PCB
* 不同 flash 方法

再新增：

```text id="e7q2rz"
boards/
  pico2_breadboard_dev.toml
```

現在還不用急。

---

### 5. 定義 Target 層

之後如果有：

* STM32
* ESP32

再加：

```text id="m9s5fu"
targets/
  pico2.toml
```

目前 Pico-only 可以晚點。

---

## flight 子系統內建議

### 6. 把 generated config 視為唯一入口

主程式只 include：

```cpp id="p2r8kw"
active_model_config.h
```

不要 anywhere else 直接讀 model 資訊。

避免雙來源。

---

### 7. 定義 Airyn 對 MadFlight 的 adapter boundary

在 `flight/core/` 補一層 wrapper：

```text id="r3d7la"
IMUAdapter
MotorAdapter
ReceiverAdapter
```

讓上層不要直接到處碰 MadFlight API。

這很重要。

---

## mission / ground

### 8. 先把 direct mode 和 mission mode 文件化

你現在其實有兩種：

```text id="c5y9nh"
Ground → Flight

Ground → Mission → Flight
```

把這變正式模式寫進 docs。

這很重要。
