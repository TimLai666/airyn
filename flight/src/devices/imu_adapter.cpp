#include "imu_adapter.h"

#include <ahr/ahr.h>
#include <imu/imu.h>

namespace airyn::devices {

void ImuAdapter::update() {
  ahr.update();
  sample_.rates.roll = ahr.gx;
  sample_.rates.pitch = ahr.gy;
  sample_.rates.yaw = ahr.gz;
  sample_.dt = imu.dt;
  sample_.healthy = imu.installed();
}

}  // namespace airyn::devices
