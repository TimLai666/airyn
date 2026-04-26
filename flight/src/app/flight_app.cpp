#include "flight_app.h"

#include "../madflight_config.h"
#include "../core/control_loop.h"
#include "../devices/imu_adapter.h"
#include "../devices/motor_output.h"
#include "../devices/receiver.h"
#include "../mixer/mixer.h"
#include "../safety/arming.h"
#include "../telemetry/serial_debug.h"
#include <Arduino.h>
#include <madflight.h>

namespace airyn::app {
namespace {

devices::Receiver receiver;
devices::MotorOutput motorOutput;
devices::ImuAdapter imuAdapter;
core::ControlLoop controlLoop;
mixer::Mixer mixer;
safety::ArmingController arming;
telemetry::SerialDebug serialDebug;
bool flightRuntimeReady = false;
uint32_t imuTickCount = 0;

void blinkStatus() {
  if ((imuTickCount % 1000) == 0) {
    led.toggle();
  }
}

void setupMotorOutput() {
  if (!motorOutput.begin()) {
    madflight_panic("Motor init failed.");
  }
}

core::ControlInput makeControlInput(const devices::ReceiverState& receiverState,
                                    bool armed) {
  core::ControlInput input = {};
  input.throttle = receiverState.throttle;
  input.roll = receiverState.roll;
  input.pitch = receiverState.pitch;
  input.yaw = receiverState.yaw;
  input.armed = armed;
  input.connected = receiverState.connected;
  return input;
}

telemetry::RuntimeDebug makeRuntimeDebug(const devices::ReceiverState& receiverState,
                                         const safety::ArmingStatus& armingStatus,
                                         bool imuHealthy,
                                         const core::ControlOutput& control,
                                         const mixer::MotorCommand& command) {
  telemetry::RuntimeDebug debug = {};
  debug.receiver.connected = receiverState.connected;
  debug.receiver.throttle = receiverState.throttle;
  debug.receiver.roll = receiverState.roll;
  debug.receiver.pitch = receiverState.pitch;
  debug.receiver.yaw = receiverState.yaw;
  debug.receiver.armSwitch = receiverState.arm;
  debug.receiver.mode = receiverState.mode;
  debug.safety = armingStatus;
  debug.imuHealthy = imuHealthy;
  debug.pid.roll = control.roll;
  debug.pid.pitch = control.pitch;
  debug.pid.yaw = control.yaw;
  debug.motors.outputs = command.value;
  debug.motors.count = command.count;
  return debug;
}

}

void setup() {
  madflight_setup();
  receiver.begin();
  setupMotorOutput();
  controlLoop.configureFromModel();
  mixer.configureFromModel();
  arming.reset(millis());

  serialDebug.printStartup();
  Serial.println("CLI ready. Type 'help' or 'diff' in the serial monitor.");
  flightRuntimeReady = true;
}

void loop() {
  delay(1000);
}

void imuLoop() {
  ++imuTickCount;
  blinkStatus();

  imuAdapter.update();
  if (!flightRuntimeReady) {
    return;
  }

  const uint32_t nowMs = millis();
  const devices::ReceiverState receiverState = receiver.update();
  const devices::ImuSample imuSample = imuAdapter.sample();

  safety::ArmingInput armingInput = {};
  armingInput.receiverConnected = receiverState.connected;
  armingInput.armSwitch = receiverState.arm;
  armingInput.throttle = receiverState.throttle;
  armingInput.imuHealthy = imuSample.healthy;
  armingInput.motorOutputInitialized = motorOutput.initialized();
  armingInput.nowMs = nowMs;

  const safety::ArmingStatus armingStatus = arming.update(armingInput);
  motorOutput.setArmed(armingStatus.armed);

  if (armingStatus.resetPidIntegrators) {
    controlLoop.reset();
  }

  const core::ControlOutput control = controlLoop.update(
      makeControlInput(receiverState, armingStatus.armed),
      imuSample.rates,
      imuSample.dt);

  const mixer::AxisCorrection correction = {control.roll, control.pitch, control.yaw};
  const mixer::MotorCommand command = mixer.mix(receiverState.throttle, correction, armingStatus.armed);
  motorOutput.write(command.value, command.count);

  serialDebug.printRuntime(
      makeRuntimeDebug(receiverState, armingStatus, imuSample.healthy, control, command),
      nowMs);
}

}
