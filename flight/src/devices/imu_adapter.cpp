#include "imu_adapter.h"

#include <madflight.h>

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
