#!/usr/bin/env python3
import argparse
import json
import time
import uuid
from pathlib import Path

QUEUE_DIR = Path("/sandbox/.openclaw-data/create-draft-requests")


def main() -> int:
    parser = argparse.ArgumentParser(description="Queue a Gmail draft request for the host bridge.")
    parser.add_argument("--to", required=True, help="Recipient email(s), comma-separated")
    parser.add_argument("--subject", required=True, help="Email subject")
    parser.add_argument("--body", help="Plain text body")
    parser.add_argument("--html", help="HTML body (optional)")
    parser.add_argument("--cc", help="Cc recipients, comma-separated")
    parser.add_argument("--bcc", help="Bcc recipients, comma-separated")
    parser.add_argument("--from", dest="from_addr", help="From address override")
    parser.add_argument("--list-mailboxes", action="store_true", help="Report bridge mode and exit")
    parser.add_argument("--secrets-path", help="Accepted for compatibility; ignored in bridge mode")
    parser.add_argument("--user", help="Accepted for compatibility; ignored in bridge mode")
    parser.add_argument("--pass", dest="password", help="Accepted for compatibility; ignored in bridge mode")
    parser.add_argument("--imap-host", help="Accepted for compatibility; ignored in bridge mode")
    parser.add_argument("--imap-port", help="Accepted for compatibility; ignored in bridge mode")
    parser.add_argument("--drafts-mailbox", help="Accepted for compatibility; ignored in bridge mode")
    args = parser.parse_args()

    if args.list_mailboxes:
        print("Bridge mode: host will create drafts in [Gmail]/Drafts")
        return 0

    QUEUE_DIR.mkdir(parents=True, exist_ok=True)
    request_id = f"draft-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    payload = {
        "id": request_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "to": args.to,
        "subject": args.subject,
        "body": args.body or "",
        "html": args.html,
        "cc": args.cc,
        "bcc": args.bcc,
        "from": args.from_addr,
    }
    out = QUEUE_DIR / f"{request_id}.json"
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Queued Gmail draft request for host bridge: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
