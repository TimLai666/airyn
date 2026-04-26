#pragma once

#include "../core/control_loop.h"

namespace airyn::devices {

struct ImuSample {
  core::GyroRates rates = {0.0f, 0.0f, 0.0f};
  float dt = 0.0f;
  bool healthy = false;
};

class ImuAdapter {
public:
  void update();

  ImuSample sample() const { return sample_; }
  const core::GyroRates& rates() const { return sample_.rates; }
  float dt() const { return sample_.dt; }
  bool healthy() const { return sample_.healthy; }

private:
  ImuSample sample_;
};

}  // namespace airyn::devices
