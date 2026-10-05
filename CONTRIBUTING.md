# Contributing

Thank you for your interest in EASY. Issues and pull requests are welcome.

## Before you start

- Open an issue to discuss larger changes first.
- By contributing you agree that your contribution is released under the project's
  BSD 3-Clause License and that the copyright header of each file is kept.

## Development setup

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
(cd frontend && npm ci --include=dev)
./scripts/validate_local_release.sh        # builds, tests, compiles and checks everything
```

No Raspberry hardware is needed: the tests use replay sources and fakes. Hardware
validation (`scripts/check_raspberry_runtime.py`, `scripts/validate_raspberry_runtime.sh`)
is run by hand on the device.

## Conventions

- **Read the module docstring first**; it explains the role of the file. Keep it true
  when you change the behaviour.
- Python: a module docstring and a docstring for every function, type hints, no new
  dependency unless it is needed. TypeScript: a header comment per file and a doc
  comment on every exported component, hook and helper.
- Keep every file's SPDX copyright header.
- Public Flask routes and required JSON fields are compatibility boundaries: add fields,
  do not rename or remove them.
- Hardware state must go through the `runtime_state` contract
  (`easy_dashboard/runtime_status.py`); never invent a new status word in one place.
- The frontend polls once (`DashboardStateProvider`). Do not add per-page pollers.
- Never present stale or placeholder data as live.
- Write tests for behaviour you change (`tests/` for Python, `*.test.tsx` for the UI).
- Commit messages: imperative mood, describe what changed and why.

## Models and data

Model files and datasets are governed by their own terms (see `THIRD_PARTY_NOTICES.md`).
A new model goes into `runtime/models/`, is described in the model repository's
`MODEL_CARD.md` with its SHA-256, and is selected in `runtime/config/inference_config.json`.
