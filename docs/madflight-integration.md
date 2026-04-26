# MadFlight Integration

MadFlight is included as a Git submodule:

```txt
flight/vendor/madflight/
```

The firmware project depends on the submodule through PlatformIO `lib_extra_dirs = vendor` from inside `flight/`.

## Upgrade

From repo root:

```powershell
git -C flight/vendor/madflight fetch --tags
git -C flight/vendor/madflight checkout <tag-or-commit>
cd flight
pio run -e RP2350A
```

Record the MadFlight version and any required Airyn changes in this document or the implementation plan.

## Local Patches

Avoid local changes in `flight/vendor/madflight/`. If a patch is unavoidable, document:

- why upstream behavior could not be used as-is
- exact files changed
- whether it should become an upstream PR
- how to re-apply it during a MadFlight upgrade
