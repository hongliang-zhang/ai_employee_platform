#!/usr/bin/env python3
"""
File sync daemon for sandbox persistent storage.

Usage:
  file_sync.py init    — download existing files from S3 to /persistent/
  file_sync.py watch   — poll for changes every 10s and upload to S3
"""

import os
import sys
import time
import hashlib
import logging
import requests
from pathlib import Path
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger('file_sync')

PERSISTENT_ROOT = Path('/persistent')
POLL_INTERVAL = 10  # seconds

GATEWAY_URL = os.environ.get('GATEWAY_URL', '').rstrip('/')
SESSION_TOKEN = os.environ.get('SESSION_TOKEN', '')


def create_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    return session


def headers() -> dict:
    return {'Authorization': f'Bearer {SESSION_TOKEN}', 'Content-Type': 'application/json'}


def list_remote_files(session: requests.Session, prefix: str) -> list:
    """List files on S3 under a given prefix ('shared' or 'conversation')."""
    resp = session.post(
        f'{GATEWAY_URL}/gateway/storage/list',
        json={'prefix': prefix},
        headers=headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get('files', [])


def get_presigned_urls(session: requests.Session, operations: list) -> list:
    """Get presigned URLs for upload/download operations."""
    if not operations:
        return []
    resp = session.post(
        f'{GATEWAY_URL}/gateway/storage/presign',
        json={'operations': operations},
        headers=headers(),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get('urls', [])


def download_file(session: requests.Session, url: str, local_path: Path):
    """Download a file from a presigned URL."""
    local_path.parent.mkdir(parents=True, exist_ok=True)
    resp = session.get(url, timeout=60)
    resp.raise_for_status()
    local_path.write_bytes(resp.content)
    logger.info(f'Downloaded: {local_path} ({len(resp.content)} bytes)')


def upload_file(session: requests.Session, url: str, local_path: Path):
    """Upload a file to a presigned URL."""
    data = local_path.read_bytes()
    resp = session.put(url, data=data, timeout=60)
    resp.raise_for_status()
    logger.info(f'Uploaded: {local_path} ({len(data)} bytes)')


def init():
    """Download all existing files from S3 to /persistent/."""
    logger.info('Starting file sync init...')
    session = create_session()

    PERSISTENT_ROOT.mkdir(parents=True, exist_ok=True)
    (PERSISTENT_ROOT / 'shared').mkdir(exist_ok=True)
    (PERSISTENT_ROOT / 'conversation').mkdir(exist_ok=True)

    total = 0
    for prefix in ('shared', 'conversation'):
        files = list_remote_files(session, prefix)
        if not files:
            logger.info(f'No existing files under {prefix}/')
            continue

        # Batch get download URLs
        operations = [{'action': 'download', 'path': f['path']} for f in files]
        urls = get_presigned_urls(session, operations)

        for url_entry in urls:
            local_path = PERSISTENT_ROOT / url_entry['path']
            download_file(session, url_entry['url'], local_path)
            total += 1

    logger.info(f'Init complete. Downloaded {total} files.')


def scan_files() -> dict:
    """Scan /persistent/ and return {relative_path: mtime} for all files."""
    result = {}
    for file_path in PERSISTENT_ROOT.rglob('*'):
        if file_path.is_file():
            rel = str(file_path.relative_to(PERSISTENT_ROOT))
            result[rel] = file_path.stat().st_mtime
    return result


def watch():
    """Poll for file changes and upload to S3."""
    logger.info(f'Starting file sync watch (poll every {POLL_INTERVAL}s)...')
    session = create_session()

    # Establish baseline
    baseline = scan_files()
    logger.info(f'Baseline: {len(baseline)} files')

    while True:
        time.sleep(POLL_INTERVAL)
        try:
            current = scan_files()

            # Find new or modified files
            changed = []
            for path, mtime in current.items():
                if path not in baseline or mtime > baseline[path]:
                    changed.append(path)

            if not changed:
                continue

            # Batch get upload URLs
            operations = [{'action': 'upload', 'path': p} for p in changed]

            # Upload in batches of 100
            for i in range(0, len(operations), 100):
                batch = operations[i:i+100]
                urls = get_presigned_urls(session, batch)
                for url_entry in urls:
                    local_path = PERSISTENT_ROOT / url_entry['path']
                    if local_path.exists():
                        try:
                            upload_file(session, url_entry['url'], local_path)
                        except Exception as e:
                            logger.warning(f'Failed to upload {url_entry["path"]}: {e}')

                            size = local_path.stat().st_size
                            if size > 10 * 1024 * 1024:
                                logger.warning(f'Large file warning: {url_entry["path"]} is {size} bytes')

            # Update baseline with successfully synced files
            baseline = scan_files()
            logger.info(f'Synced {len(changed)} changed files')

        except Exception as e:
            logger.warning(f'Sync cycle failed: {e}')


def main():
    if len(sys.argv) < 2:
        print('Usage: file_sync.py [init|watch]', file=sys.stderr)
        sys.exit(1)

    if not GATEWAY_URL or not SESSION_TOKEN:
        logger.error('GATEWAY_URL and SESSION_TOKEN must be set')
        sys.exit(1)

    command = sys.argv[1]
    if command == 'init':
        init()
    elif command == 'watch':
        watch()
    else:
        print(f'Unknown command: {command}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
