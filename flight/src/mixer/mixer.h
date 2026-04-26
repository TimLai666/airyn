#pragma once

#include <stdint.h>

namespace airyn::mixer {

static const uint8_t kMaxMotors = 8;

struct AxisCorrection {
  float roll;
  float pitch;
  float yaw;
};

struct MotorCommand {
  uint8_t count;
  float value[kMaxMotors];
};

class Mixer {
public:
  Mixer();

  void configureFromModel();
  void configureOutputRange(float minOutput, float maxOutput, float idleThrottle);
  void configureMotor(uint8_t index, float rollFactor, float pitchFactor, float yawFactor);
  void resetMotorFactors();

  MotorCommand mix(float throttle, const AxisCorrection& correction, bool armed) const;
  uint8_t motorCount() const { return motorCount_; }

private:
  float clampOutput(float value) const;
  float armedThrottle(float throttle) const;

  uint8_t motorCount_;
  float rollFactor_[kMaxMotors];
  float pitchFactor_[kMaxMotors];
  float yawFactor_[kMaxMotors];
  float minOutput_;
  float maxOutput_;
  float idleThrottle_;
};

}
