#!/usr/bin/env python3
import base64
import json
import subprocess
import sys
import time
from pathlib import Path

SANDBOX = "nemoclaw-base"
REMOTE_QUEUE = "/sandbox/.openclaw-data/create-draft-requests"
REMOTE_DONE = "/sandbox/.openclaw-data/create-draft-requests/processed"
REMOTE_FAILED = "/sandbox/.openclaw-data/create-draft-requests/failed"
CREATE_DRAFT = Path("/Users/openclaw/.nemoclaw/openclaw-state/skills/create_draft/scripts/create_draft_host.py")
OPENSHELL = "/Users/openclaw/.local/bin/openshell"


def run_openshell(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run([OPENSHELL, *args], text=True, capture_output=True, check=False)


def list_remote_requests() -> list[tuple[str, dict]]:
    cmd = (
        f"mkdir -p {REMOTE_QUEUE} {REMOTE_DONE} {REMOTE_FAILED}; "
        f"for f in {REMOTE_QUEUE}/*.json; do "
        "[ -f \"$f\" ] || continue; "
        "printf '%s\\t' \"$f\"; base64 -w0 \"$f\"; printf '\\n'; "
        "done"
    )
    result = run_openshell(["sandbox", "exec", "-n", SANDBOX, "--", "bash", "-lc", cmd])
    if result.returncode != 0:
        print(result.stderr.strip(), file=sys.stderr)
        return []

    requests: list[tuple[str, dict]] = []
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        remote_path, encoded = line.split("\t", 1)
        try:
            payload = json.loads(base64.b64decode(encoded).decode("utf-8"))
        except Exception as exc:
            print(f"Skipping malformed request {remote_path}: {exc}", file=sys.stderr)
            continue
        requests.append((remote_path, payload))
    return requests


def create_host_draft(payload: dict) -> subprocess.CompletedProcess[str]:
    args = [
        "python3",
        str(CREATE_DRAFT),
        "--to",
        str(payload["to"]),
        "--subject",
        str(payload["subject"]),
        "--body",
        str(payload.get("body") or ""),
    ]
    for key, flag in [("html", "--html"), ("cc", "--cc"), ("bcc", "--bcc"), ("from", "--from")]:
        value = payload.get(key)
        if value:
            args.extend([flag, str(value)])
    return subprocess.run(args, text=True, capture_output=True, check=False)


def move_remote(remote_path: str, target_dir: str) -> None:
    target = f"{target_dir}/{Path(remote_path).name}"
    quoted = json.dumps(remote_path)
    quoted_target = json.dumps(target)
    run_openshell(["sandbox", "exec", "-n", SANDBOX, "--", "bash", "-lc", f"mv {quoted} {quoted_target}"])


def process_once() -> int:
    count = 0
    for remote_path, payload in list_remote_requests():
      missing = [key for key in ("to", "subject") if not payload.get(key)]
      if missing:
          print(f"Invalid draft request {remote_path}: missing {', '.join(missing)}", file=sys.stderr)
          move_remote(remote_path, REMOTE_FAILED)
          continue

      result = create_host_draft(payload)
      if result.returncode == 0:
          print(f"Created Gmail draft for {payload.get('to')}: {payload.get('subject')}")
          move_remote(remote_path, REMOTE_DONE)
          count += 1
      else:
          print(f"Failed Gmail draft request {remote_path}: {result.stderr or result.stdout}", file=sys.stderr)
          move_remote(remote_path, REMOTE_FAILED)
    return count


def main() -> int:
    interval = 5
    print(f"Gmail draft bridge watching {SANDBOX}:{REMOTE_QUEUE}")
    while True:
        process_once()
        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main())
