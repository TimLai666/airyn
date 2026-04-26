#include "mixer.h"

#include <active_model_config.h>

#ifndef MOTOR_COUNT
#define MOTOR_COUNT 4
#endif

#ifndef SAFETY_MIN_OUTPUT
#ifdef MIN_OUTPUT
#define SAFETY_MIN_OUTPUT MIN_OUTPUT
#else
#define SAFETY_MIN_OUTPUT 0.0f
#endif
#endif

#ifndef SAFETY_MAX_OUTPUT
#ifdef MAX_OUTPUT
#define SAFETY_MAX_OUTPUT MAX_OUTPUT
#else
#define SAFETY_MAX_OUTPUT 1.0f
#endif
#endif

#ifndef SAFETY_ARMED_IDLE_THROTTLE
#ifdef ARMED_IDLE_THROTTLE
#define SAFETY_ARMED_IDLE_THROTTLE ARMED_IDLE_THROTTLE
#else
#define SAFETY_ARMED_IDLE_THROTTLE 0.0f
#endif
#endif

namespace airyn::mixer {
namespace {

float clampUnit(float value) {
  if (value < 0.0f) {
    return 0.0f;
  }
  if (value > 1.0f) {
    return 1.0f;
  }
  return value;
}

float yawSignForMotor(uint8_t index) {
  switch (index) {
#if defined(MOTOR1_DIRECTION_SIGN)
    case 0: return MOTOR1_DIRECTION_SIGN;
#elif defined(MOTOR1_YAW_SIGN)
    case 0: return MOTOR1_YAW_SIGN;
#elif defined(MOTOR1_DIRECTION_CCW)
    case 0: return 1.0f;
#else
    case 0: return -1.0f;
#endif
#if defined(MOTOR2_DIRECTION_SIGN)
    case 1: return MOTOR2_DIRECTION_SIGN;
#elif defined(MOTOR2_YAW_SIGN)
    case 1: return MOTOR2_YAW_SIGN;
#elif defined(MOTOR2_DIRECTION_CCW)
    case 1: return 1.0f;
#else
    case 1: return -1.0f;
#endif
#if defined(MOTOR3_DIRECTION_SIGN)
    case 2: return MOTOR3_DIRECTION_SIGN;
#elif defined(MOTOR3_YAW_SIGN)
    case 2: return MOTOR3_YAW_SIGN;
#elif defined(MOTOR3_DIRECTION_CCW)
    case 2: return 1.0f;
#else
    case 2: return -1.0f;
#endif
#if defined(MOTOR4_DIRECTION_SIGN)
    case 3: return MOTOR4_DIRECTION_SIGN;
#elif defined(MOTOR4_YAW_SIGN)
    case 3: return MOTOR4_YAW_SIGN;
#elif defined(MOTOR4_DIRECTION_CCW)
    case 3: return 1.0f;
#else
    case 3: return -1.0f;
#endif
    default:
      return 0.0f;
  }
}

float rollFactorForMotor(uint8_t index) {
  switch (index) {
#if defined(MOTOR1_ROLL_FACTOR)
    case 0: return MOTOR1_ROLL_FACTOR;
#elif defined(MOTOR1_POSITION_REAR_LEFT) || defined(MOTOR1_POSITION_FRONT_LEFT)
    case 0: return 1.0f;
#elif defined(MOTOR1_POSITION_REAR_RIGHT) || defined(MOTOR1_POSITION_FRONT_RIGHT)
    case 0: return -1.0f;
#else
    case 0: return -1.0f;
#endif
#if defined(MOTOR2_ROLL_FACTOR)
    case 1: return MOTOR2_ROLL_FACTOR;
#elif defined(MOTOR2_POSITION_REAR_LEFT) || defined(MOTOR2_POSITION_FRONT_LEFT)
    case 1: return 1.0f;
#elif defined(MOTOR2_POSITION_REAR_RIGHT) || defined(MOTOR2_POSITION_FRONT_RIGHT)
    case 1: return -1.0f;
#else
    case 1: return -1.0f;
#endif
#if defined(MOTOR3_ROLL_FACTOR)
    case 2: return MOTOR3_ROLL_FACTOR;
#elif defined(MOTOR3_POSITION_REAR_LEFT) || defined(MOTOR3_POSITION_FRONT_LEFT)
    case 2: return 1.0f;
#elif defined(MOTOR3_POSITION_REAR_RIGHT) || defined(MOTOR3_POSITION_FRONT_RIGHT)
    case 2: return -1.0f;
#else
    case 2: return 1.0f;
#endif
#if defined(MOTOR4_ROLL_FACTOR)
    case 3: return MOTOR4_ROLL_FACTOR;
#elif defined(MOTOR4_POSITION_REAR_LEFT) || defined(MOTOR4_POSITION_FRONT_LEFT)
    case 3: return 1.0f;
#elif defined(MOTOR4_POSITION_REAR_RIGHT) || defined(MOTOR4_POSITION_FRONT_RIGHT)
    case 3: return -1.0f;
#else
    case 3: return 1.0f;
#endif
    default:
      return 0.0f;
  }
}

float pitchFactorForMotor(uint8_t index) {
  switch (index) {
#if defined(MOTOR1_PITCH_FACTOR)
    case 0: return MOTOR1_PITCH_FACTOR;
#elif defined(MOTOR1_POSITION_REAR_LEFT) || defined(MOTOR1_POSITION_REAR_RIGHT)
    case 0: return 1.0f;
#elif defined(MOTOR1_POSITION_FRONT_LEFT) || defined(MOTOR1_POSITION_FRONT_RIGHT)
    case 0: return -1.0f;
#else
    case 0: return -1.0f;
#endif
#if defined(MOTOR2_PITCH_FACTOR)
    case 1: return MOTOR2_PITCH_FACTOR;
#elif defined(MOTOR2_POSITION_REAR_LEFT) || defined(MOTOR2_POSITION_REAR_RIGHT)
    case 1: return 1.0f;
#elif defined(MOTOR2_POSITION_FRONT_LEFT) || defined(MOTOR2_POSITION_FRONT_RIGHT)
    case 1: return -1.0f;
#else
    case 1: return 1.0f;
#endif
#if defined(MOTOR3_PITCH_FACTOR)
    case 2: return MOTOR3_PITCH_FACTOR;
#elif defined(MOTOR3_POSITION_REAR_LEFT) || defined(MOTOR3_POSITION_REAR_RIGHT)
    case 2: return 1.0f;
#elif defined(MOTOR3_POSITION_FRONT_LEFT) || defined(MOTOR3_POSITION_FRONT_RIGHT)
    case 2: return -1.0f;
#else
    case 2: return 1.0f;
#endif
#if defined(MOTOR4_PITCH_FACTOR)
    case 3: return MOTOR4_PITCH_FACTOR;
#elif defined(MOTOR4_POSITION_REAR_LEFT) || defined(MOTOR4_POSITION_REAR_RIGHT)
    case 3: return 1.0f;
#elif defined(MOTOR4_POSITION_FRONT_LEFT) || defined(MOTOR4_POSITION_FRONT_RIGHT)
    case 3: return -1.0f;
#else
    case 3: return -1.0f;
#endif
    default:
      return 0.0f;
  }
}

}

Mixer::Mixer()
    : motorCount_(0),
      rollFactor_{},
      pitchFactor_{},
      yawFactor_{},
      minOutput_(0.0f),
      maxOutput_(1.0f),
      idleThrottle_(0.0f) {
  configureFromModel();
}

void Mixer::configureFromModel() {
  motorCount_ = MOTOR_COUNT > kMaxMotors ? kMaxMotors : MOTOR_COUNT;
  configureOutputRange(SAFETY_MIN_OUTPUT, SAFETY_MAX_OUTPUT, SAFETY_ARMED_IDLE_THROTTLE);
  resetMotorFactors();
}

void Mixer::configureOutputRange(float minOutput, float maxOutput, float idleThrottle) {
  if (minOutput > maxOutput) {
    const float tmp = minOutput;
    minOutput = maxOutput;
    maxOutput = tmp;
  }

  minOutput_ = clampUnit(minOutput);
  maxOutput_ = clampUnit(maxOutput);
  idleThrottle_ = clampUnit(idleThrottle);
}

void Mixer::configureMotor(uint8_t index, float rollFactor, float pitchFactor, float yawFactor) {
  if (index >= motorCount_) {
    return;
  }

  rollFactor_[index] = rollFactor;
  pitchFactor_[index] = pitchFactor;
  yawFactor_[index] = yawFactor;
}

void Mixer::resetMotorFactors() {
  for (uint8_t i = 0; i < kMaxMotors; ++i) {
    rollFactor_[i] = 0.0f;
    pitchFactor_[i] = 0.0f;
    yawFactor_[i] = 0.0f;
  }

#if defined(FRAME_TYPE_QUAD_X)
  if (motorCount_ >= 4) {
    for (uint8_t i = 0; i < 4; ++i) {
      configureMotor(i, rollFactorForMotor(i), pitchFactorForMotor(i), yawSignForMotor(i));
    }
  }
#endif
}

MotorCommand Mixer::mix(float throttle, const AxisCorrection& correction, bool armed) const {
  MotorCommand command = {};
  command.count = motorCount_;

  if (!armed) {
    for (uint8_t i = 0; i < command.count; ++i) {
      command.value[i] = minOutput_;
    }
    return command;
  }

  const float baseThrottle = armedThrottle(throttle);
  for (uint8_t i = 0; i < command.count; ++i) {
    const float mixed = baseThrottle
        + (correction.roll * rollFactor_[i])
        + (correction.pitch * pitchFactor_[i])
        + (correction.yaw * yawFactor_[i]);
    command.value[i] = clampOutput(mixed);
  }

  return command;
}

float Mixer::clampOutput(float value) const {
  if (value < minOutput_) {
    return minOutput_;
  }
  if (value > maxOutput_) {
    return maxOutput_;
  }
  return value;
}

float Mixer::armedThrottle(float throttle) const {
  float value = clampUnit(throttle);
  if (value < idleThrottle_) {
    value = idleThrottle_;
  }
  return clampOutput(value);
}

}
