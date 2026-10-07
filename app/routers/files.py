from typing import Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse

from ..config import settings
from ..schemas import FileInfo, MeasurementsPage, to_info
from ..services.processor import process_upload
from ..storage import store

router = APIRouter(prefix="/api/files", tags=["files"])


def _get(file_id: str) -> dict:
    rec = store.get(file_id)
    if rec is None:
        raise HTTPException(404, "File not found.")
    return rec


def _completed(file_id: str) -> dict:
    rec = _get(file_id)
    if rec["status"] != "COMPLETED":
        raise HTTPException(409, f"File status is {rec['status']}: {rec.get('error')}")
    return rec


@router.post("/", response_model=FileInfo, status_code=201, summary="Upload a .zip (Shapefile) or .kml")
def upload_file(file: UploadFile = File(...)):
    name = file.filename or ""
    if not name.lower().endswith((".zip", ".kml")):
        raise HTTPException(415, "Only .zip (Shapefile) and .kml files are accepted.")
    content = file.file.read(settings.max_upload_bytes + 1)
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(413, f"File exceeds {settings.max_upload_bytes // (1024 * 1024)} MB limit.")
    if not content:
        raise HTTPException(400, "Empty file.")

    record = process_upload(name, content)
    store.save(record)
    if record["status"] == "FAILED":
        return JSONResponse(
            status_code=422,
            content={"detail": record["error"], "id": record["id"], "status": "FAILED"},
        )
    return to_info(record)


@router.get("/{file_id}/", response_model=FileInfo, summary="File information")
def file_info(file_id: str):
    return to_info(_get(file_id))


@router.get("/{file_id}/summary/", summary="Spatial analysis & validation summary")
def file_summary(file_id: str):
    rec = _completed(file_id)
    return {"id": rec["id"], "filename": rec["filename"], "layers": rec["layers"],
            "warnings": rec["warnings"], **rec["summary"]}


@router.get("/{file_id}/measurements/", response_model=MeasurementsPage, summary="Per-feature measurements")
def file_measurements(
    file_id: str,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    geometry_type: Optional[str] = Query(None, description="e.g. Polygon, LineString, Point"),
    include_geometry: bool = Query(True),
):
    rec = _completed(file_id)
    feats = rec["features"]
    if geometry_type:
        feats = [f for f in feats if (f["geometry_type"] or "").lower() == geometry_type.lower()]
    page = feats[offset: offset + limit]
    if not include_geometry:
        page = [{**f, "geometry": None} for f in page]
    return MeasurementsPage(file_id=file_id, total=len(feats), limit=limit, offset=offset,
                            count=len(page), features=page)
