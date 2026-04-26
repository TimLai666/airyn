#pragma once

#include "pid.h"

namespace airyn::core {

struct ControlInput {
  float throttle;
  float roll;
  float pitch;
  float yaw;
  bool armed;
  bool connected;
};

struct GyroRates {
  float roll;
  float pitch;
  float yaw;
};

struct RateSetpoint {
  float roll;
  float pitch;
  float yaw;
};

struct ControlOutput {
  float roll;
  float pitch;
  float yaw;
  RateSetpoint setpoint;
};

class ControlLoop {
public:
  ControlLoop();

  void configureFromModel();
  void configureRates(float rollMaxDps, float pitchMaxDps, float yawMaxDps);
  void configurePid(float rollKp, float rollKi, float rollKd,
                    float pitchKp, float pitchKi, float pitchKd,
                    float yawKp, float yawKi, float yawKd);
  void setIntegratorLimit(float limit);
  void setOutputLimit(float limit);
  void reset();

  ControlOutput update(const ControlInput& input, const GyroRates& gyroRates, float dt);
  RateSetpoint makeRateSetpoint(const ControlInput& input) const;

  PID& rollPid() { return rollPid_; }
  PID& pitchPid() { return pitchPid_; }
  PID& yawPid() { return yawPid_; }

private:
  PID rollPid_;
  PID pitchPid_;
  PID yawPid_;
  float rollMaxRateDps_;
  float pitchMaxRateDps_;
  float yawMaxRateDps_;
};

}
