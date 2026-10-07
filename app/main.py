from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .routers import files

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
PUBLIC_DIR = ROOT_DIR / "public"
SAMPLE_FILE = ROOT_DIR / "samples" / "sample.kml"

DEFAULT_SAMPLE_KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Folder>
      <name>survey</name>
      <Placemark><name>Plot A</name>
        <ExtendedData><Data name="owner"><value>Ravi</value></Data></ExtendedData>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>
          80.20,13.00,0 80.21,13.00,0 80.21,13.01,0 80.20,13.01,0 80.20,13.00,0
        </coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
      <Placemark><name>Road 1</name>
        <LineString><coordinates>80.20,13.00,0 80.21,13.00,0</coordinates></LineString>
      </Placemark>
      <Placemark><name>Well</name>
        <Point><coordinates>80.205,13.005,0</coordinates></Point>
      </Placemark>
    </Folder>
  </Document>
</kml>
""".strip()

app = FastAPI(
    title="Geospatial File Measurement API",
    version="1.0.0",
    description="Upload a zipped Shapefile or KML; get per-feature area/length, "
                "CRS info, and an automated spatial validation summary.",
)
app.include_router(files.router)

# Mount static files directory
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
elif (PUBLIC_DIR / "static").exists():
    app.mount("/static", StaticFiles(directory=str(PUBLIC_DIR / "static")), name="static")


@app.get("/", include_in_schema=False)
def root():
    for candidate in [STATIC_DIR / "index.html", PUBLIC_DIR / "index.html"]:
        if candidate.exists():
            return FileResponse(str(candidate))
    return RedirectResponse("/docs")


@app.get("/api/sample", tags=["meta"], summary="Get sample KML dataset")
def get_sample():
    for candidate in [SAMPLE_FILE, ROOT_DIR / "public" / "samples" / "sample.kml", STATIC_DIR / "samples" / "sample.kml"]:
        if candidate.exists():
            return Response(
                content=candidate.read_bytes(),
                media_type="application/vnd.google-earth.kml+xml",
                headers={"Content-Disposition": "inline; filename=sample.kml"},
            )
    return Response(
        content=DEFAULT_SAMPLE_KML.encode("utf-8"),
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": "inline; filename=sample.kml"},
    )


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}
