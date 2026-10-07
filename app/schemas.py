from typing import Any, Optional

from pydantic import BaseModel


class FileInfo(BaseModel):
    id: str
    filename: str
    feature_count: int
    crs: Optional[str]
    status: str
    created_at: str
    layers: list[str] = []
    warnings: list[str] = []
    error: Optional[str] = None


class MeasurementsPage(BaseModel):
    file_id: str
    total: int
    limit: int
    offset: int
    count: int
    features: list[dict[str, Any]]


def to_info(r: dict) -> FileInfo:
    return FileInfo(**{k: r.get(k) for k in FileInfo.model_fields if k in r})
