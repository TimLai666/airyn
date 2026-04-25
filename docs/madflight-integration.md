# MadFlight Integration

MadFlight is included at:

```text
vendor/madflight/
```

It is managed as a Git submodule pinned to tag `v2.3.0`.

## Why Submodule

Direct clone is technically possible, but it creates an embedded Git repository inside this repo. A submodule records the exact MadFlight commit in the parent repo and keeps upgrades explicit.

## Upgrade Flow

```bash
git -C vendor/madflight fetch --tags
git -C vendor/madflight checkout <tag-or-commit>
python tools/check_config.py dev/test_model
python tools/build_model.py dev/test_model
```

Then build the firmware target before committing the submodule pointer update.

## Local Changes

Avoid local changes in `vendor/madflight/`. If a change is unavoidable:

- Record the touched file.
- Record why the wrapper/profile layer could not solve it.
- Record whether the change should be proposed upstream.
- Retest after every MadFlight upgrade.

