#include "arming.h"

namespace airyn::safety {

ArmingController::ArmingController(ArmingConfig config)
    : config_(config), failsafe_(config.failsafe) {
  if (config_.armThrottleThreshold <= 0.0f) {
    config_.armThrottleThreshold = SAFETY_ARM_THROTTLE_THRESHOLD;
  }
  if (config_.failsafe.receiverLostTimeoutMs == 0) {
    config_.failsafe.receiverLostTimeoutMs = RECEIVER_FAILSAFE_TIMEOUT_MS;
  }
  failsafe_ = ReceiverFailsafe(config_.failsafe);
}

void ArmingController::reset(uint32_t nowMs) {
  failsafe_.reset(nowMs);
  setStatus(ArmingState::Boot, ArmingReason::Boot, true);
}

ArmingStatus ArmingController::update(const ArmingInput& input) {
  if (input.panic) {
    setStatus(ArmingState::Error, ArmingReason::Panic, true);
    return status_;
  }

  const bool receiverTimedOut = failsafe_.update({input.receiverConnected, input.nowMs});

  if (receiverTimedOut) {
    setStatus(ArmingState::Failsafe, ArmingReason::ReceiverFailsafe, true);
    return status_;
  }

  if (!input.armSwitch) {
    setStatus(ArmingState::Disarmed, ArmingReason::ArmSwitchOff, true);
    return status_;
  }

  const ArmingReason blocker = firstArmBlocker(input, receiverTimedOut);
  if (blocker != ArmingReason::Ready) {
    setStatus(ArmingState::Disarmed, blocker, true);
    return status_;
  }

  if (status_.state == ArmingState::Armed) {
    setStatus(ArmingState::Armed, ArmingReason::Armed, false);
    return status_;
  }

  if (status_.state == ArmingState::ArmingRequested) {
    setStatus(ArmingState::Armed, ArmingReason::Armed, false);
    return status_;
  }

  setStatus(ArmingState::ArmingRequested, ArmingReason::ArmingRequested, true);
  return status_;
}

ArmingStatus ArmingController::status() const {
  return status_;
}

ArmingState ArmingController::state() const {
  return status_.state;
}

ArmingReason ArmingController::reason() const {
  return status_.reason;
}

bool ArmingController::armed() const {
  return status_.armed;
}

bool ArmingController::failsafe() const {
  return status_.failsafe;
}

bool ArmingController::throttleLow(float throttle) const {
  return throttle <= config_.armThrottleThreshold;
}

ArmingReason ArmingController::firstArmBlocker(const ArmingInput& input, bool receiverTimedOut) const {
  if (!input.receiverConnected) {
    return ArmingReason::ReceiverDisconnected;
  }
  if (receiverTimedOut) {
    return ArmingReason::ReceiverFailsafe;
  }
  if (!throttleLow(input.throttle)) {
    return ArmingReason::ThrottleHigh;
  }
  if (!input.imuHealthy) {
    return ArmingReason::ImuUnhealthy;
  }
  if (!input.motorOutputInitialized) {
    return ArmingReason::MotorOutputNotInitialized;
  }
  return ArmingReason::Ready;
}

void ArmingController::setStatus(ArmingState state, ArmingReason reason, bool resetPidIntegrators) {
  status_.state = state;
  status_.reason = reason;
  status_.armed = state == ArmingState::Armed;
  status_.failsafe = state == ArmingState::Failsafe || reason == ArmingReason::ReceiverFailsafe;
  status_.resetPidIntegrators = resetPidIntegrators || !status_.armed || status_.failsafe;
}

const char* toString(ArmingState state) {
  switch (state) {
    case ArmingState::Boot:
      return "boot";
    case ArmingState::Disarmed:
      return "disarmed";
    case ArmingState::ArmingRequested:
      return "arming_requested";
    case ArmingState::Armed:
      return "armed";
    case ArmingState::Failsafe:
      return "failsafe";
    case ArmingState::Error:
      return "error";
  }
  return "unknown";
}

const char* toString(ArmingReason reason) {
  switch (reason) {
    case ArmingReason::Boot:
      return "boot";
    case ArmingReason::Ready:
      return "ready";
    case ArmingReason::ArmingRequested:
      return "arming_requested";
    case ArmingReason::Armed:
      return "armed";
    case ArmingReason::ArmSwitchOff:
      return "arm_switch_off";
    case ArmingReason::ReceiverDisconnected:
      return "receiver_disconnected";
    case ArmingReason::ReceiverFailsafe:
      return "receiver_failsafe";
    case ArmingReason::ThrottleHigh:
      return "throttle_high";
    case ArmingReason::ImuUnhealthy:
      return "imu_unhealthy";
    case ArmingReason::MotorOutputNotInitialized:
      return "motor_output_not_initialized";
    case ArmingReason::Panic:
      return "panic";
  }
  return "unknown";
}

}  // namespace airyn::safety
