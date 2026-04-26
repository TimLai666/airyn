#include "control_loop.h"

#include <active_model_config.h>

#ifndef PID_INTEGRATOR_LIMIT
#define PID_INTEGRATOR_LIMIT 100.0f
#endif

#ifndef PID_OUTPUT_LIMIT
#define PID_OUTPUT_LIMIT 1.0f
#endif

#ifndef RATE_ROLL_MAX_DPS
#ifdef RATE_LIMIT_ROLL_DPS
#define RATE_ROLL_MAX_DPS RATE_LIMIT_ROLL_DPS
#elif defined(MAX_RATE_ROLL_DPS)
#define RATE_ROLL_MAX_DPS MAX_RATE_ROLL_DPS
#else
#define RATE_ROLL_MAX_DPS 180.0f
#endif
#endif

#ifndef RATE_PITCH_MAX_DPS
#ifdef RATE_LIMIT_PITCH_DPS
#define RATE_PITCH_MAX_DPS RATE_LIMIT_PITCH_DPS
#elif defined(MAX_RATE_PITCH_DPS)
#define RATE_PITCH_MAX_DPS MAX_RATE_PITCH_DPS
#else
#define RATE_PITCH_MAX_DPS 180.0f
#endif
#endif

#ifndef RATE_YAW_MAX_DPS
#ifdef RATE_LIMIT_YAW_DPS
#define RATE_YAW_MAX_DPS RATE_LIMIT_YAW_DPS
#elif defined(MAX_RATE_YAW_DPS)
#define RATE_YAW_MAX_DPS MAX_RATE_YAW_DPS
#else
#define RATE_YAW_MAX_DPS 120.0f
#endif
#endif

namespace airyn::core {
namespace {

float clampStick(float value) {
  if (value < -1.0f) {
    return -1.0f;
  }
  if (value > 1.0f) {
    return 1.0f;
  }
  return value;
}

}

ControlLoop::ControlLoop()
    : rollPid_(),
      pitchPid_(),
      yawPid_(),
      rollMaxRateDps_(0.0f),
      pitchMaxRateDps_(0.0f),
      yawMaxRateDps_(0.0f) {
  configureFromModel();
}

void ControlLoop::configureFromModel() {
  configureRates(RATE_ROLL_MAX_DPS, RATE_PITCH_MAX_DPS, RATE_YAW_MAX_DPS);
  configurePid(PID_ROLL_P, PID_ROLL_I, PID_ROLL_D,
               PID_PITCH_P, PID_PITCH_I, PID_PITCH_D,
               PID_YAW_P, PID_YAW_I, PID_YAW_D);
  setIntegratorLimit(PID_INTEGRATOR_LIMIT);
  setOutputLimit(PID_OUTPUT_LIMIT);
  reset();
}

void ControlLoop::configureRates(float rollMaxDps, float pitchMaxDps, float yawMaxDps) {
  rollMaxRateDps_ = rollMaxDps;
  pitchMaxRateDps_ = pitchMaxDps;
  yawMaxRateDps_ = yawMaxDps;
}

void ControlLoop::configurePid(float rollKp, float rollKi, float rollKd,
                               float pitchKp, float pitchKi, float pitchKd,
                               float yawKp, float yawKi, float yawKd) {
  rollPid_.setGains(rollKp, rollKi, rollKd);
  pitchPid_.setGains(pitchKp, pitchKi, pitchKd);
  yawPid_.setGains(yawKp, yawKi, yawKd);
}

void ControlLoop::setIntegratorLimit(float limit) {
  rollPid_.setIntegratorLimit(limit);
  pitchPid_.setIntegratorLimit(limit);
  yawPid_.setIntegratorLimit(limit);
}

void ControlLoop::setOutputLimit(float limit) {
  if (limit <= 0.0f) {
    rollPid_.clearOutputLimit();
    pitchPid_.clearOutputLimit();
    yawPid_.clearOutputLimit();
    return;
  }

  rollPid_.setOutputLimit(-limit, limit);
  pitchPid_.setOutputLimit(-limit, limit);
  yawPid_.setOutputLimit(-limit, limit);
}

void ControlLoop::reset() {
  rollPid_.reset();
  pitchPid_.reset();
  yawPid_.reset();
}

ControlOutput ControlLoop::update(const ControlInput& input, const GyroRates& gyroRates, float dt) {
  ControlOutput output = {};
  output.setpoint = makeRateSetpoint(input);

  if (!input.armed || !input.connected || input.throttle <= 0.0f) {
    reset();
    return output;
  }

  output.roll = rollPid_.update(output.setpoint.roll, gyroRates.roll, dt);
  output.pitch = pitchPid_.update(output.setpoint.pitch, gyroRates.pitch, dt);
  output.yaw = yawPid_.update(output.setpoint.yaw, gyroRates.yaw, dt);
  return output;
}

RateSetpoint ControlLoop::makeRateSetpoint(const ControlInput& input) const {
  RateSetpoint setpoint = {};
  setpoint.roll = clampStick(input.roll) * rollMaxRateDps_;
  setpoint.pitch = clampStick(input.pitch) * pitchMaxRateDps_;
  setpoint.yaw = clampStick(input.yaw) * yawMaxRateDps_;
  return setpoint;
}

}
