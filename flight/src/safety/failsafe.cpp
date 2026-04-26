#include "failsafe.h"

namespace airyn::safety {

namespace {

uint32_t elapsedMs(uint32_t nowMs, uint32_t thenMs) {
  return nowMs - thenMs;
}

}  // namespace

ReceiverFailsafe::ReceiverFailsafe(FailsafeConfig config) : config_(config) {}

void ReceiverFailsafe::reset(uint32_t nowMs) {
  hasReceiverSeen_ = false;
  receiverLost_ = true;
  lastReceiverSeenMs_ = nowMs;
}

bool ReceiverFailsafe::update(const FailsafeInput& input) {
  if (input.receiverConnected) {
    hasReceiverSeen_ = true;
    receiverLost_ = false;
    lastReceiverSeenMs_ = input.nowMs;
    return receiverLost_;
  }

  if (!hasReceiverSeen_) {
    receiverLost_ = true;
    return receiverLost_;
  }

  receiverLost_ = elapsedMs(input.nowMs, lastReceiverSeenMs_) >= config_.receiverLostTimeoutMs;
  return receiverLost_;
}

bool ReceiverFailsafe::receiverLost() const {
  return receiverLost_;
}

uint32_t ReceiverFailsafe::lastReceiverSeenMs() const {
  return lastReceiverSeenMs_;
}

uint32_t ReceiverFailsafe::receiverLostAgeMs(uint32_t nowMs) const {
  if (!hasReceiverSeen_) {
    return 0;
  }
  return elapsedMs(nowMs, lastReceiverSeenMs_);
}

}  // namespace airyn::safety
