#pragma once

#include <stddef.h>
#include <stdint.h>

namespace airyn::devices {

class MotorOutput {
public:
  bool begin();

  void setArmed(bool armed);
  bool armed() const;

  void setMotor(uint8_t index, float value);
  void setAll(float value);
  void write(const float* values, size_t count);

  template <size_t N>
  void write(const float (&values)[N]) {
    write(values, N);
  }

  bool initialized() const { return initialized_; }
  uint8_t motorCount() const { return motorCount_; }
  int outputIndex(uint8_t motor) const;

private:
  static constexpr uint8_t kMaxMotors = 16;

  int outputIndices_[kMaxMotors] = {};
  uint8_t motorCount_ = 0;
  bool initialized_ = false;
};

}  // namespace airyn::devices
