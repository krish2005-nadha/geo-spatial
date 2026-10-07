from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .routers import files

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
SAMPLE_FILE = BASE_DIR.parent / "samples" / "sample.kml"

app = FastAPI(
    title="Geospatial File Measurement API",
    version="1.0.0",
    description="Upload a zipped Shapefile or KML; get per-feature area/length, "
                "CRS info, and an automated spatial validation summary.",
)
app.include_router(files.router)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", include_in_schema=False)
def root():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return RedirectResponse("/docs")


@app.get("/api/sample", tags=["meta"], summary="Get sample KML dataset")
def get_sample():
    if SAMPLE_FILE.exists():
        return Response(
            content=SAMPLE_FILE.read_bytes(),
            media_type="application/vnd.google-earth.kml+xml",
            headers={"Content-Disposition": "inline; filename=sample.kml"},
        )
    return Response(content=b"", status_code=404)


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}

