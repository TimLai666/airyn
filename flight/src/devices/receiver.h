#pragma once

namespace airyn::devices {

struct ReceiverState {
  float throttle = 0.0f;
  float roll = 0.0f;
  float pitch = 0.0f;
  float yaw = 0.0f;
  bool arm = false;
  bool connected = false;
  int mode = 0;
};

class Receiver {
public:
  bool begin();
  ReceiverState update();

  const ReceiverState& state() const { return state_; }
  bool initialized() const { return initialized_; }
  bool connected() const { return state_.connected; }

private:
  ReceiverState state_;
  bool initialized_ = false;
};

}  // namespace airyn::devices
