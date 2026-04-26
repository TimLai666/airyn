#pragma once

#include <stdint.h>

#include "../safety/arming.h"

namespace airyn::telemetry {

struct ReceiverDebug {
  bool connected = false;
  float throttle = 0.0f;
  float roll = 0.0f;
  float pitch = 0.0f;
  float yaw = 0.0f;
  bool armSwitch = false;
  int mode = 0;
};

struct PidDebug {
  float roll = 0.0f;
  float pitch = 0.0f;
  float yaw = 0.0f;
};

struct MotorDebug {
  const float* outputs = nullptr;
  uint8_t count = 0;
};

struct RuntimeDebug {
  ReceiverDebug receiver;
  airyn::safety::ArmingStatus safety;
  bool imuHealthy = false;
  PidDebug pid;
  MotorDebug motors;
};

class SerialDebug {
public:
  explicit SerialDebug(uint32_t runtimeIntervalMs = 500);

  void setRuntimeIntervalMs(uint32_t intervalMs);
  void printStartup();
  void printRuntime(const RuntimeDebug& debug, uint32_t nowMs);

private:
  bool runtimeDue(uint32_t nowMs) const;

  uint32_t runtimeIntervalMs_;
  uint32_t lastRuntimePrintMs_ = 0;
  bool hasRuntimePrint_ = false;
};

void printStartup();
void printRuntime(const RuntimeDebug& debug, uint32_t nowMs);

}  // namespace airyn::telemetry
