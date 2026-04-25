#pragma once

#define MODEL_NAME "dev_test_model"
#define TARGET_BOARD "pico2_breadboard_dev"
#define FRAME_TYPE_QUAD_X 1

#define IMU_TYPE_MPU6050 1
#define IMU_I2C_BUS 0
#define IMU_SDA_PIN 4
#define IMU_SCL_PIN 5
#define IMU_INT_PIN 9
#define IMU_ADDRESS 0x68

#define MOTOR_COUNT 4
#define MOTOR1_PIN 2
#define MOTOR2_PIN 3
#define MOTOR3_PIN 6
#define MOTOR4_PIN 7

#define ESC_PROTOCOL_DSHOT 1
#define ESC_DSHOT_RATE 300

#define RECEIVER_TYPE_PPM 1
#define RECEIVER_PIN 8

#define LED_PIN 25

#define PID_ROLL_P 40.0f
#define PID_ROLL_I 0.0f
#define PID_ROLL_D 15.0f

#define PID_PITCH_P 40.0f
#define PID_PITCH_I 0.0f
#define PID_PITCH_D 15.0f

#define PID_YAW_P 30.0f
#define PID_YAW_I 0.0f
#define PID_YAW_D 0.0f

#define AIRYN_MADFLIGHT_BOARD "brd/default.h"

#define AIRYN_MADFLIGHT_CONFIG \
  "imu_gizmo     MPU6050\n" \
  "imu_bus_type  I2C\n" \
  "imu_i2c_bus   0\n" \
  "imu_i2c_adr   104\n" \
  "pin_imu_int   9\n" \
  "\n" \
  "rcl_gizmo     PPM\n" \
  "pin_rcl_ppm   8\n" \
  "rcl_num_ch    8\n" \
  "\n" \
  "pin_i2c0_sda  4\n" \
  "pin_i2c0_scl  5\n" \
  "\n" \
  "pin_out0      2\n" \
  "pin_out1      3\n" \
  "pin_out2      6\n" \
  "pin_out3      7\n" \
  "\n" \
  "led_gizmo     HIGH_IS_ON\n" \
  "pin_led       25\n" \
  "\n" \
  "ahr_gizmo     MAHONY\n"
