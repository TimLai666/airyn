#pragma once

#include "failsafe.h"

#ifndef SAFETY_ARM_THROTTLE_THRESHOLD
#define SAFETY_ARM_THROTTLE_THRESHOLD 0.05f
#endif

namespace airyn::safety {

enum class ArmingState {
  Boot,
  Disarmed,
  ArmingRequested,
  Armed,
  Failsafe,
  Error,
};

enum class ArmingReason {
  Boot,
  Ready,
  ArmingRequested,
  Armed,
  ArmSwitchOff,
  ReceiverDisconnected,
  ReceiverFailsafe,
  ThrottleHigh,
  ImuUnhealthy,
  MotorOutputNotInitialized,
  Panic,
};

struct ArmingConfig {
  float armThrottleThreshold = SAFETY_ARM_THROTTLE_THRESHOLD;
  FailsafeConfig failsafe;
};

struct ArmingInput {
  bool receiverConnected = false;
  bool armSwitch = false;
  float throttle = 0.0f;
  bool imuHealthy = false;
  bool motorOutputInitialized = false;
  uint32_t nowMs = 0;
  bool panic = false;
};

struct ArmingStatus {
  ArmingState state = ArmingState::Boot;
  ArmingReason reason = ArmingReason::Boot;
  bool armed = false;
  bool failsafe = false;
  bool resetPidIntegrators = true;
};

class ArmingController {
public:
  explicit ArmingController(ArmingConfig config = {});

  void reset(uint32_t nowMs = 0);
  ArmingStatus update(const ArmingInput& input);

  ArmingStatus status() const;
  ArmingState state() const;
  ArmingReason reason() const;
  bool armed() const;
  bool failsafe() const;

private:
  bool throttleLow(float throttle) const;
  ArmingReason firstArmBlocker(const ArmingInput& input, bool receiverTimedOut) const;
  void setStatus(ArmingState state, ArmingReason reason, bool resetPidIntegrators);

  ArmingConfig config_;
  ReceiverFailsafe failsafe_;
  ArmingStatus status_;
};

const char* toString(ArmingState state);
const char* toString(ArmingReason reason);

}  // namespace airyn::safety
