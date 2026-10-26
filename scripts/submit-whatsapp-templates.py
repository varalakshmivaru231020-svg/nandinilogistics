"""
Submits every template in `docs/whatsapp-templates.json` to Meta for approval.

    export WABA_ID=<WhatsApp Business Account id>
    export TOKEN=<system user token with whatsapp_business_management>
    python3 scripts/submit-whatsapp-templates.py [--dry-run]

Safe to run twice: a name that already exists comes back as an error naming it,
and nothing else in the file is affected. Neither value is read from or written
to the repository — they are environment only, and a token does not belong in
git.
"""

import json
import os
import sys
import urllib.error
import urllib.request

GRAPH = "https://graph.facebook.com/v21.0"
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(HERE, "docs", "whatsapp-templates.json")


def main() -> int:
    dry = "--dry-run" in sys.argv
    templates = json.load(open(FILE, encoding="utf-8"))

    waba = os.environ.get("WABA_ID", "")
    token = os.environ.get("TOKEN", "")
    if not dry and not (waba and token):
        print("Set WABA_ID and TOKEN, or pass --dry-run.")
        return 2

    print(f"{len(templates)} templates from docs/whatsapp-templates.json")
    failed = 0

    for t in templates:
        if dry:
            print(f"  would submit {t['name']} ({t['category']}, {t['language']})")
            continue

        request = urllib.request.Request(
            f"{GRAPH}/{waba}/message_templates",
            data=json.dumps(t).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = json.load(response)
            print(f"  {t['name']}: {body.get('status', 'submitted')} ({body.get('id', '')})")
        except urllib.error.HTTPError as err:
            # Meta's own words, which name the rule that was broken.
            detail = err.read().decode("utf-8", "replace")
            print(f"  {t['name']}: REFUSED {err.code} {detail}")
            failed += 1
        except Exception as err:  # noqa: BLE001 - the reason is printed and counted
            print(f"  {t['name']}: FAILED {err}")
            failed += 1

    if failed:
        print(f"\n{failed} of {len(templates)} were not accepted.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
