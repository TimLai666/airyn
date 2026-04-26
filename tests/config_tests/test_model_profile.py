import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools"
sys.path.insert(0, str(TOOLS))

from model_profile import generate_header, load_profile  # noqa: E402


class ModelProfileTests(unittest.TestCase):
    def run_check(self, profile: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(TOOLS / "check_config.py"), profile],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def test_dev_profile_is_valid(self) -> None:
        result = self.run_check("dev/test_model")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("OK:", result.stdout)

    def test_generated_header_contains_flight_contract(self) -> None:
        data = load_profile("dev/test_model")
        header = generate_header(data)
        self.assertIn("#define MODEL_NAME", header)
        self.assertIn("#define MOTOR1_OUTPUT_INDEX", header)
        self.assertIn("#define RECEIVER_CHANNEL_THROTTLE", header)
        self.assertIn("#define SAFETY_ARM_THROTTLE_THRESHOLD", header)
        self.assertIn("static constexpr int kMotorPins", header)

    def test_duplicate_motor_pin_fails(self) -> None:
        source = ROOT / "profiles" / "dev" / "test_model"
        with tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "bad_model"
            shutil.copytree(source, profile)
            model = profile / "model.toml"
            text = model.read_text(encoding="utf-8")
            text = text.replace("pin = 3\noutput_index = 1", "pin = 2\noutput_index = 1", 1)
            model.write_text(text, encoding="utf-8")

            result = self.run_check(str(profile))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("GPIO 2", result.stderr)


if __name__ == "__main__":
    unittest.main()

