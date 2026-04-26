#include "receiver.h"

#include <Arduino.h>
#include <active_model_config.h>
#include <rcl/rcl.h>

#ifndef RECEIVER_CHANNEL_THROTTLE
#define RECEIVER_CHANNEL_THROTTLE 3
#endif

#ifndef RECEIVER_CHANNEL_ROLL
#define RECEIVER_CHANNEL_ROLL 1
#endif

#ifndef RECEIVER_CHANNEL_PITCH
#define RECEIVER_CHANNEL_PITCH 2
#endif

#ifndef RECEIVER_CHANNEL_YAW
#define RECEIVER_CHANNEL_YAW 4
#endif

#ifndef RECEIVER_CHANNEL_ARM
#define RECEIVER_CHANNEL_ARM 5
#endif

#ifndef RECEIVER_CHANNEL_MODE
#define RECEIVER_CHANNEL_MODE 6
#endif

#ifndef RECEIVER_DEADBAND
#define RECEIVER_DEADBAND 0.0f
#endif

#ifndef AIRYN_RECEIVER_PWM_MIN
#define AIRYN_RECEIVER_PWM_MIN 1100
#endif

#ifndef AIRYN_RECEIVER_PWM_CENTER
#define AIRYN_RECEIVER_PWM_CENTER 1500
#endif

#ifndef AIRYN_RECEIVER_PWM_MAX
#define AIRYN_RECEIVER_PWM_MAX 1900
#endif

#ifndef AIRYN_RECEIVER_ARM_PWM_MIN
#define AIRYN_RECEIVER_ARM_PWM_MIN 1600
#endif

#ifndef AIRYN_RECEIVER_ARM_PWM_MAX
#define AIRYN_RECEIVER_ARM_PWM_MAX 2500
#endif

#ifndef AIRYN_RECEIVER_MODE_PWM_MIN
#define AIRYN_RECEIVER_MODE_PWM_MIN 1165
#endif

#ifndef AIRYN_RECEIVER_MODE_PWM_MAX
#define AIRYN_RECEIVER_MODE_PWM_MAX 1815
#endif

namespace airyn::devices {
namespace {

constexpr int kInvalidChannelIndex = RCL_MAX_CH;

int channelIndex(int channel) {
  return (channel >= 1 && channel <= RCL_MAX_CH) ? channel - 1 : kInvalidChannelIndex;
}

uint16_t channelPwm(int channel) {
  return rcl.pwm[channelIndex(channel)];
}

float clampUnit(float value) {
  if (value < 0.0f) {
    return 0.0f;
  }
  if (value > 1.0f) {
    return 1.0f;
  }
  return value;
}

float clampSignedUnit(float value) {
  if (value < -1.0f) {
    return -1.0f;
  }
  if (value > 1.0f) {
    return 1.0f;
  }
  return value;
}

float normalizeAxis(uint16_t pwm) {
  constexpr int minPwm = AIRYN_RECEIVER_PWM_MIN;
  constexpr int centerPwm = AIRYN_RECEIVER_PWM_CENTER;
  constexpr int maxPwm = AIRYN_RECEIVER_PWM_MAX;
  constexpr int deadband = static_cast<int>(RECEIVER_DEADBAND * 1000.0f);

  if (pwm < centerPwm - deadband) {
    return clampSignedUnit(static_cast<float>(pwm - (centerPwm - deadband)) /
                           static_cast<float>((centerPwm - deadband) - minPwm));
  }
  if (pwm <= centerPwm + deadband) {
    return 0.0f;
  }
  return clampSignedUnit(static_cast<float>(pwm - (centerPwm + deadband)) /
                         static_cast<float>(maxPwm - (centerPwm + deadband)));
}

float normalizeThrottle(uint16_t pwm) {
  constexpr int minPwm = AIRYN_RECEIVER_PWM_MIN;
  constexpr int maxPwm = AIRYN_RECEIVER_PWM_MAX;
  constexpr int deadband = static_cast<int>(RECEIVER_DEADBAND * 1000.0f);
  constexpr int lowPwm = minPwm + deadband;

  return clampUnit(static_cast<float>(pwm - lowPwm) / static_cast<float>(maxPwm - lowPwm));
}

int normalizeMode(uint16_t pwm) {
  constexpr int modeMin = AIRYN_RECEIVER_MODE_PWM_MIN;
  constexpr int modeMax = AIRYN_RECEIVER_MODE_PWM_MAX;
  constexpr int spacing = (modeMax - modeMin) / 5;

  if (spacing < 5) {
    return 0;
  }

  const int mode = (static_cast<int>(pwm) - modeMin + spacing / 2) / spacing;
  if (mode < 0) {
    return 0;
  }
  if (mode > 5) {
    return 5;
  }
  return mode;
}

bool armSwitchActive(uint16_t pwm) {
  return pwm >= AIRYN_RECEIVER_ARM_PWM_MIN && pwm < AIRYN_RECEIVER_ARM_PWM_MAX;
}

}  // namespace

bool Receiver::begin() {
  initialized_ = rcl.installed();
  update();
  return initialized_;
}

ReceiverState Receiver::update() {
  state_.connected = initialized_ && rcl.update_count() > 0 && rcl.connected();

  if (!state_.connected) {
    state_.throttle = 0.0f;
    state_.roll = 0.0f;
    state_.pitch = 0.0f;
    state_.yaw = 0.0f;
    state_.arm = false;
    state_.mode = 0;
    return state_;
  }

  state_.throttle = normalizeThrottle(channelPwm(RECEIVER_CHANNEL_THROTTLE));
  state_.roll = normalizeAxis(channelPwm(RECEIVER_CHANNEL_ROLL));
  state_.pitch = normalizeAxis(channelPwm(RECEIVER_CHANNEL_PITCH));
  state_.yaw = normalizeAxis(channelPwm(RECEIVER_CHANNEL_YAW));
  state_.arm = armSwitchActive(channelPwm(RECEIVER_CHANNEL_ARM));
  state_.mode = normalizeMode(channelPwm(RECEIVER_CHANNEL_MODE));

  return state_;
}

}  // namespace airyn::devices
