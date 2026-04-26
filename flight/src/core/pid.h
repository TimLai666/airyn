#pragma once

namespace airyn::core {

class PID {
public:
  PID();
  PID(float kp, float ki, float kd, float integratorLimit = 0.0f);

  void setGains(float kp, float ki, float kd);
  void setIntegratorLimit(float limit);
  void setOutputLimit(float minOutput, float maxOutput);
  void clearOutputLimit();
  void reset();

  float update(float error, float dt);
  float update(float setpoint, float measured, float dt);

  float kp() const { return kp_; }
  float ki() const { return ki_; }
  float kd() const { return kd_; }
  float integrator() const { return integrator_; }
  float previousError() const { return previousError_; }
  float output() const { return output_; }

private:
  float kp_;
  float ki_;
  float kd_;
  float integratorLimit_;
  float integrator_;
  float previousError_;
  float output_;
  float minOutput_;
  float maxOutput_;
  bool hasPreviousError_;
  bool hasOutputLimit_;
};

}
