import os
import tempfile
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # Vercel serverless request bodies are capped at ~4.5 MB, so default below that.
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_MB", "4")) * 1024 * 1024
    # Zip-bomb protection
    max_uncompressed_bytes: int = int(os.getenv("MAX_UNCOMPRESSED_MB", "50")) * 1024 * 1024
    max_features: int = int(os.getenv("MAX_FEATURES", "50000"))
    # Measurement validation: max allowed |projected - geodesic| / geodesic, in percent
    accuracy_tolerance_pct: float = float(os.getenv("ACCURACY_TOLERANCE_PCT", "1.0"))
    # /tmp is the only writable location on Vercel
    storage_dir: str = os.getenv("STORAGE_DIR", os.path.join(tempfile.gettempdir(), "geo_api_store"))


settings = Settings()
