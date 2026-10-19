#!/usr/bin/env python3
"""Populate the optional Reader browser test cache using pinned public assets.

Python 3 standard library only. No app configuration, credentials, browser
profiles or private files are read. --verify-only performs no network requests.

    python3 scripts/reliability-reader/setup-assets.py --output /tmp/road-ready-reader-assets
    python3 scripts/reliability-reader/setup-assets.py --output /tmp/road-ready-reader-assets --verify-only

Set READER_UI_ASSETS to the output directory when running browser-app.test.mjs.
An existing file with unexpected bytes is rejected, never silently replaced.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from urllib.request import Request, urlopen


def verify(path, asset):
    size = path.stat().st_size
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if size != asset["bytes"] or digest != asset["sha256"]:
        raise ValueError(f"{path}: size/SHA-256 differs from browser-assets.json; use a new cache directory")


def download(destination, asset):
    if not asset["url"].startswith("https://cdn.jsdelivr.net/npm/"):
        raise ValueError("Only the manifest's HTTPS npm CDN assets are supported")
    temporary = None
    try:
        request = Request(asset["url"], headers={"User-Agent": "Road-Ready-synthetic-test-setup/1"})
        with urlopen(request, timeout=45) as response, tempfile.NamedTemporaryFile(
            prefix=".reader-asset-", suffix=".part", dir=destination.parent, delete=False
        ) as handle:
            temporary = Path(handle.name)
            length = 0
            while chunk := response.read(256 * 1024):
                length += len(chunk)
                if length > asset["bytes"]:
                    raise ValueError(f"{asset['file']}: download exceeds pinned size")
                handle.write(chunk)
        verify(temporary, asset)
        # No incomplete or unverified response becomes an executable cached asset.
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--output", type=Path, default=Path(os.environ.get("READER_UI_ASSETS", "/tmp/road-ready-reader-assets")))
    parser.add_argument("--verify-only", action="store_true", help="Check all cached hashes without downloading anything")
    args = parser.parse_args()
    manifest = json.loads(Path(__file__).with_name("browser-assets.json").read_text())
    if not args.verify_only:
        args.output.mkdir(parents=True, exist_ok=True)
    failed = []
    for asset in manifest["assets"]:
        name = asset["file"]
        if Path(name).name != name or name in (".", ".."):
            raise ValueError("Asset filename must be a single file name")
        destination = args.output / name
        try:
            if not destination.exists():
                if args.verify_only:
                    raise FileNotFoundError(f"{destination}: missing cached asset")
                download(destination, asset)
            verify(destination, asset)
            print(f"Verified {name}")
        except (OSError, ValueError) as error:
            failed.append(str(error))
    if failed:
        for error in failed:
            print(error, file=sys.stderr)
        return 1
    print(f"All {len(manifest['assets'])} Reader browser assets match the pinned manifest.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
