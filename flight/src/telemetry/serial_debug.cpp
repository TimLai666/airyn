#include "serial_debug.h"

#include <Arduino.h>
#include <active_model_config.h>

namespace airyn::telemetry {

#ifndef MODEL_NAME
#define MODEL_NAME "unknown_model"
#endif

#ifndef TARGET_BOARD
#define TARGET_BOARD "unknown_board"
#endif

#ifndef MOTOR_COUNT
#define MOTOR_COUNT 0
#endif

#ifndef RECEIVER_PIN
#define RECEIVER_PIN -1
#endif

#ifndef ESC_DSHOT_RATE
#define ESC_DSHOT_RATE 0
#endif

namespace {

const char* frameName() {
#if defined(FRAME_TYPE_QUAD_X) && FRAME_TYPE_QUAD_X
  return "quad_x";
#elif defined(FRAME_TYPE_QUAD_PLUS) && FRAME_TYPE_QUAD_PLUS
  return "quad_plus";
#elif defined(FRAME_TYPE_HEX_X) && FRAME_TYPE_HEX_X
  return "hex_x";
#else
  return "unknown";
#endif
}

const char* receiverName() {
#if defined(RECEIVER_TYPE_PPM) && RECEIVER_TYPE_PPM
  return "PPM";
#elif defined(RECEIVER_TYPE_SBUS) && RECEIVER_TYPE_SBUS
  return "SBUS";
#elif defined(RECEIVER_TYPE_CRSF) && RECEIVER_TYPE_CRSF
  return "CRSF";
#elif defined(RECEIVER_TYPE_ELRS) && RECEIVER_TYPE_ELRS
  return "ELRS";
#elif defined(RECEIVER_TYPE_PWM) && RECEIVER_TYPE_PWM
  return "PWM";
#else
  return "unknown";
#endif
}

const char* escName() {
#if defined(ESC_PROTOCOL_DSHOT) && ESC_PROTOCOL_DSHOT
  return "DSHOT";
#elif defined(ESC_PROTOCOL_PWM) && ESC_PROTOCOL_PWM
  return "PWM";
#elif defined(ESC_PROTOCOL_ONESHOT125) && ESC_PROTOCOL_ONESHOT125
  return "ONESHOT125";
#else
  return "unknown";
#endif
}

int motorPin(uint8_t index) {
  switch (index) {
#if defined(MOTOR1_PIN)
    case 0:
      return MOTOR1_PIN;
#endif
#if defined(MOTOR2_PIN)
    case 1:
      return MOTOR2_PIN;
#endif
#if defined(MOTOR3_PIN)
    case 2:
      return MOTOR3_PIN;
#endif
#if defined(MOTOR4_PIN)
    case 3:
      return MOTOR4_PIN;
#endif
#if defined(MOTOR5_PIN)
    case 4:
      return MOTOR5_PIN;
#endif
#if defined(MOTOR6_PIN)
    case 5:
      return MOTOR6_PIN;
#endif
#if defined(MOTOR7_PIN)
    case 6:
      return MOTOR7_PIN;
#endif
#if defined(MOTOR8_PIN)
    case 7:
      return MOTOR8_PIN;
#endif
    default:
      return -1;
  }
}

void printFloat(float value) {
  Serial.print(value, 3);
}

}  // namespace

SerialDebug::SerialDebug(uint32_t runtimeIntervalMs) : runtimeIntervalMs_(runtimeIntervalMs) {}

void SerialDebug::setRuntimeIntervalMs(uint32_t intervalMs) {
  runtimeIntervalMs_ = intervalMs;
}

void SerialDebug::printStartup() {
  Serial.println();
  Serial.println("Airyn Flight startup");
  Serial.print("  model: ");
  Serial.println(MODEL_NAME);
  Serial.print("  board: ");
  Serial.println(TARGET_BOARD);
  Serial.print("  frame: ");
  Serial.println(frameName());
  Serial.print("  receiver: ");
  Serial.print(receiverName());
  Serial.print(" pin=");
  Serial.println(RECEIVER_PIN);
  Serial.print("  esc: ");
  Serial.print(escName());
#if defined(ESC_PROTOCOL_DSHOT) && ESC_PROTOCOL_DSHOT
  Serial.print(" dshot_rate=");
  Serial.print(ESC_DSHOT_RATE);
#endif
  Serial.println();
  Serial.print("  motors: count=");
  Serial.println(MOTOR_COUNT);
  for (uint8_t index = 0; index < MOTOR_COUNT; ++index) {
    Serial.print("    M");
    Serial.print(index + 1);
    Serial.print(" pin=");
    Serial.println(motorPin(index));
  }
}

void SerialDebug::printRuntime(const RuntimeDebug& debug, uint32_t nowMs) {
  if (!runtimeDue(nowMs)) {
    return;
  }

  hasRuntimePrint_ = true;
  lastRuntimePrintMs_ = nowMs;

  Serial.print("DBG t=");
  Serial.print(nowMs);
  Serial.print(" rx=");
  Serial.print(debug.receiver.connected ? "ok" : "lost");
  Serial.print(" thr=");
  printFloat(debug.receiver.throttle);
  Serial.print(" rpy=");
  printFloat(debug.receiver.roll);
  Serial.print(",");
  printFloat(debug.receiver.pitch);
  Serial.print(",");
  printFloat(debug.receiver.yaw);
  Serial.print(" arm_sw=");
  Serial.print(debug.receiver.armSwitch ? "on" : "off");
  Serial.print(" mode=");
  Serial.print(debug.receiver.mode);
  Serial.print(" safety=");
  Serial.print(airyn::safety::toString(debug.safety.state));
  Serial.print(" reason=");
  Serial.print(airyn::safety::toString(debug.safety.reason));
  Serial.print(" imu=");
  Serial.print(debug.imuHealthy ? "ok" : "bad");
  Serial.print(" pid=");
  printFloat(debug.pid.roll);
  Serial.print(",");
  printFloat(debug.pid.pitch);
  Serial.print(",");
  printFloat(debug.pid.yaw);
  Serial.print(" motors=");
  for (uint8_t index = 0; index < debug.motors.count; ++index) {
    if (index > 0) {
      Serial.print(",");
    }
    if (debug.motors.outputs == nullptr) {
      Serial.print("nan");
    } else {
      printFloat(debug.motors.outputs[index]);
    }
  }
  Serial.println();
}

bool SerialDebug::runtimeDue(uint32_t nowMs) const {
  if (!hasRuntimePrint_) {
    return true;
  }
  return nowMs - lastRuntimePrintMs_ >= runtimeIntervalMs_;
}

void printStartup() {
  SerialDebug debug;
  debug.printStartup();
}

void printRuntime(const RuntimeDebug& debug, uint32_t nowMs) {
  static SerialDebug serialDebug;
  serialDebug.printRuntime(debug, nowMs);
}

}  // namespace airyn::telemetry
