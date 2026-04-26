#pragma once

#include <stdint.h>

#if __has_include(<active_model_config.h>)
#include <active_model_config.h>
#endif

#ifndef RECEIVER_FAILSAFE_TIMEOUT_MS
#define RECEIVER_FAILSAFE_TIMEOUT_MS 500
#endif

namespace airyn::safety {

struct FailsafeConfig {
  uint32_t receiverLostTimeoutMs = RECEIVER_FAILSAFE_TIMEOUT_MS;
};

struct FailsafeInput {
  bool receiverConnected = false;
  uint32_t nowMs = 0;
};

class ReceiverFailsafe {
public:
  explicit ReceiverFailsafe(FailsafeConfig config = {});

  void reset(uint32_t nowMs = 0);
  bool update(const FailsafeInput& input);

  bool receiverLost() const;
  uint32_t lastReceiverSeenMs() const;
  uint32_t receiverLostAgeMs(uint32_t nowMs) const;

private:
  FailsafeConfig config_;
  bool hasReceiverSeen_ = false;
  bool receiverLost_ = true;
  uint32_t lastReceiverSeenMs_ = 0;
};

}  // namespace airyn::safety
