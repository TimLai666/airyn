#include "pid.h"

namespace airyn::core {
namespace {

float absoluteValue(float value) {
  return value < 0.0f ? -value : value;
}

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

}

PID::PID()
    : PID(0.0f, 0.0f, 0.0f, 0.0f) {}

PID::PID(float kp, float ki, float kd, float integratorLimit)
    : kp_(kp),
      ki_(ki),
      kd_(kd),
      integratorLimit_(absoluteValue(integratorLimit)),
      integrator_(0.0f),
      previousError_(0.0f),
      output_(0.0f),
      minOutput_(0.0f),
      maxOutput_(0.0f),
      hasPreviousError_(false),
      hasOutputLimit_(false) {}

void PID::setGains(float kp, float ki, float kd) {
  kp_ = kp;
  ki_ = ki;
  kd_ = kd;
}

void PID::setIntegratorLimit(float limit) {
  integratorLimit_ = absoluteValue(limit);
  if (integratorLimit_ > 0.0f) {
    integrator_ = clampFloat(integrator_, -integratorLimit_, integratorLimit_);
  }
}

void PID::setOutputLimit(float minOutput, float maxOutput) {
  if (minOutput > maxOutput) {
    const float tmp = minOutput;
    minOutput = maxOutput;
    maxOutput = tmp;
  }

  minOutput_ = minOutput;
  maxOutput_ = maxOutput;
  hasOutputLimit_ = true;
  output_ = clampFloat(output_, minOutput_, maxOutput_);
}

void PID::clearOutputLimit() {
  hasOutputLimit_ = false;
}

void PID::reset() {
  integrator_ = 0.0f;
  previousError_ = 0.0f;
  output_ = 0.0f;
  hasPreviousError_ = false;
}

float PID::update(float error, float dt) {
  if (dt <= 0.0f) {
    return output_;
  }

  integrator_ += error * dt;
  if (integratorLimit_ > 0.0f) {
    integrator_ = clampFloat(integrator_, -integratorLimit_, integratorLimit_);
  }

  const float derivative = hasPreviousError_ ? ((error - previousError_) / dt) : 0.0f;
  previousError_ = error;
  hasPreviousError_ = true;

  output_ = (kp_ * error) + (ki_ * integrator_) + (kd_ * derivative);
  if (hasOutputLimit_) {
    output_ = clampFloat(output_, minOutput_, maxOutput_);
  }

  return output_;
}

float PID::update(float setpoint, float measured, float dt) {
  return update(setpoint - measured, dt);
}

}
