#include "motor_output.h"

#include <Arduino.h>
#include <active_model_config.h>
#include <out/out.h>

#ifndef MOTOR_COUNT
#define MOTOR_COUNT 4
#endif

#ifndef MOTOR1_OUTPUT_INDEX
#define MOTOR1_OUTPUT_INDEX 0
#endif

#ifndef MOTOR2_OUTPUT_INDEX
#define MOTOR2_OUTPUT_INDEX 1
#endif

#ifndef MOTOR3_OUTPUT_INDEX
#define MOTOR3_OUTPUT_INDEX 2
#endif

#ifndef MOTOR4_OUTPUT_INDEX
#define MOTOR4_OUTPUT_INDEX 3
#endif

#ifndef MOTOR5_OUTPUT_INDEX
#define MOTOR5_OUTPUT_INDEX 4
#endif

#ifndef MOTOR6_OUTPUT_INDEX
#define MOTOR6_OUTPUT_INDEX 5
#endif

#ifndef MOTOR7_OUTPUT_INDEX
#define MOTOR7_OUTPUT_INDEX 6
#endif

#ifndef MOTOR8_OUTPUT_INDEX
#define MOTOR8_OUTPUT_INDEX 7
#endif

#ifndef ESC_PROTOCOL_DSHOT
#define ESC_PROTOCOL_DSHOT 0
#endif

#ifndef ESC_DSHOT_RATE
#define ESC_DSHOT_RATE 300
#endif

#ifndef ESC_PWM_RATE_HZ
#define ESC_PWM_RATE_HZ 400
#endif

#ifndef ESC_MIN_US
#define ESC_MIN_US 950
#endif

#ifndef ESC_MAX_US
#define ESC_MAX_US 2000
#endif

namespace airyn::devices {
namespace {

constexpr int kGeneratedOutputIndices[] = {
    MOTOR1_OUTPUT_INDEX,
    MOTOR2_OUTPUT_INDEX,
    MOTOR3_OUTPUT_INDEX,
    MOTOR4_OUTPUT_INDEX,
    MOTOR5_OUTPUT_INDEX,
    MOTOR6_OUTPUT_INDEX,
    MOTOR7_OUTPUT_INDEX,
    MOTOR8_OUTPUT_INDEX,
};

float clampOutput(float value) {
  if (value < 0.0f) {
    return 0.0f;
  }
  if (value > 1.0f) {
    return 1.0f;
  }
  return value;
}

}  // namespace

bool MotorOutput::begin() {
  motorCount_ = MOTOR_COUNT;
  if (motorCount_ > kMaxMotors) {
    motorCount_ = kMaxMotors;
  }

  for (uint8_t i = 0; i < motorCount_; ++i) {
    if (i < sizeof(kGeneratedOutputIndices) / sizeof(kGeneratedOutputIndices[0])) {
      outputIndices_[i] = kGeneratedOutputIndices[i];
    } else {
      outputIndices_[i] = i;
    }
  }

#if ESC_PROTOCOL_DSHOT
  initialized_ = out.setup_dshot(motorCount_, outputIndices_, ESC_DSHOT_RATE);
#else
  initialized_ = out.setup_motors(motorCount_, outputIndices_, ESC_PWM_RATE_HZ, ESC_MIN_US,
                                  ESC_MAX_US);
#endif

  if (initialized_) {
    out.print();
  }
  return initialized_;
}

void MotorOutput::setArmed(bool armedValue) {
  out.set_armed(armedValue);
}

bool MotorOutput::armed() const {
  return out.armed();
}

void MotorOutput::setMotor(uint8_t index, float value) {
  if (!initialized_ || index >= motorCount_) {
    return;
  }
  out.set_output(outputIndices_[index], clampOutput(value));
}

void MotorOutput::setAll(float value) {
  for (uint8_t i = 0; i < motorCount_; ++i) {
    setMotor(i, value);
  }
}

void MotorOutput::write(const float* values, size_t count) {
  if (values == nullptr) {
    return;
  }

  const size_t limit = count < motorCount_ ? count : motorCount_;
  for (size_t i = 0; i < limit; ++i) {
    setMotor(static_cast<uint8_t>(i), values[i]);
  }
}

int MotorOutput::outputIndex(uint8_t motor) const {
  if (motor >= motorCount_) {
    return -1;
  }
  return outputIndices_[motor];
}

}  // namespace airyn::devices
