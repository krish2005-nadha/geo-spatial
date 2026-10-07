"""Tiny file-backed store (JSON per upload) behind a minimal interface.

Swap this class for Postgres/Redis/S3 in production; nothing else depends on it.
NOTE: on Vercel the filesystem is ephemeral (/tmp, per instance).
"""
import json
import os
import threading
from typing import Optional

from .config import settings


class FileStore:
    def __init__(self, directory: str):
        self._dir = directory
        os.makedirs(self._dir, exist_ok=True)
        self._cache: dict[str, dict] = {}
        self._lock = threading.Lock()

    def _path(self, file_id: str) -> str:
        return os.path.join(self._dir, f"{file_id}.json")

    def save(self, record: dict) -> None:
        with self._lock:
            self._cache[record["id"]] = record
            try:
                with open(self._path(record["id"]), "w") as fh:
                    json.dump(record, fh)
            except OSError:
                pass  # cache still serves this instance

    def get(self, file_id: str) -> Optional[dict]:
        if not file_id.isalnum():  # blocks path tricks
            return None
        with self._lock:
            if file_id in self._cache:
                return self._cache[file_id]
        try:
            with open(self._path(file_id)) as fh:
                record = json.load(fh)
        except (OSError, ValueError):
            return None
        with self._lock:
            self._cache[file_id] = record
        return record


store = FileStore(settings.storage_dir)
