#include "flight_app.h"

#include "../madflight_config.h"
#include <Arduino.h>
#include <madflight.h>

namespace airyn::app {
namespace {

int motorOutputs[MOTOR_COUNT] = {0, 1, 2, 3};

void setupMotors() {
#if defined(ESC_PROTOCOL_DSHOT) && ESC_PROTOCOL_DSHOT
  const bool success = out.setup_dshot(MOTOR_COUNT, motorOutputs, ESC_DSHOT_RATE);
#else
  const bool success = out.setup_motors(MOTOR_COUNT, motorOutputs, 400, 950, 2000);
#endif

  out.print();
  if (!success) {
    madflight_panic("Motor init failed.");
  }
}

}

void setup() {
  madflight_setup();
  setupMotors();

  Serial.print("Airyn Flight profile: ");
  Serial.println(MODEL_NAME);
  Serial.println("CLI ready. Type 'help' or 'diff' in the serial monitor.");
}

void loop() {
  delay(1000);
}

void imuLoop() {
  if (imu.update_cnt % 1000 == 0) {
    led.toggle();
  }

  ahr.update();
}

}

