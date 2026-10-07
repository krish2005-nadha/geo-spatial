# Geospatial File Measurement API & Studio

A FastAPI + GeoPandas service with an interactive Web Dashboard. Upload a zipped **Shapefile** or a **KML**, and get:

- an **interactive Leaflet Map & Spatial Dashboard** with real-time GeoJSON rendering
- per-feature geometry, CRS, properties, **area** (polygons) and **length** (lines)
- an **automated spatial analysis & validation summary**: feature distribution, total area, total length, CRS info, geometry validity, and geodesic cross-check accuracy
- Interactive Web Studio is served at `/` and OpenAPI Swagger docs at `/docs`.

---

## Setup

Requires Python 3.10+ (3.12 recommended).

```bash
git clone <your-repo-url> && cd geo-api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000/** to view the Studio UI, or **http://127.0.0.1:8000/docs** for API docs. Run tests with `pytest`.


Try it:

```bash
curl -F "file=@samples/sample.kml" http://127.0.0.1:8000/api/files/
```

### Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `MAX_UPLOAD_MB` | `4` | Max upload size (Vercel caps request bodies at ~4.5 MB) |
| `MAX_UNCOMPRESSED_MB` | `50` | Zip-bomb protection |
| `MAX_FEATURES` | `50000` | Reject huge datasets |
| `ACCURACY_TOLERANCE_PCT` | `1.0` | Allowed projected-vs-geodesic deviation |
| `STORAGE_DIR` | `<tmp>/geo_api_store` | Where results are persisted |

### Deploy to Vercel

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

`api/index.py` exposes the ASGI app and `vercel.json` rewrites all routes to it. Or push to GitHub and import the repo at vercel.com.

**Vercel caveats (read before relying on it):**

1. **Ephemeral storage.** Serverless functions only write to `/tmp`, and it is per-instance. A `GET` may land on a different instance than the `POST` and return 404. Fine for a demo; for production replace `app/storage.py` with Postgres/Redis/Vercel Blob (the interface is two methods: `save`, `get`).
2. **Bundle size.** GeoPandas + pyogrio + pyproj + shapely + pandas/numpy are heavy; Vercel's Python limit is 250 MB unzipped. This stack is usually close to but under it. If deploy fails on size, host the API on Render/Railway/Fly (Docker) instead, no code changes needed.
3. **Request size** is limited to ~4.5 MB, so large shapefiles need direct-to-storage uploads.

---

## API

### `POST /api/files/` — upload and process
Multipart field `file`: `.zip` (containing `.shp/.shx/.dbf/.prj`) or `.kml`.

```bash
curl -F "file=@samples/sample.kml" http://localhost:8000/api/files/
```
`201`
```json
{
  "id": "9f1c2e7a0b4d4c0f8a3e5d6b7c8d9e0f",
  "filename": "sample.kml",
  "feature_count": 3,
  "crs": "EPSG:4326",
  "status": "COMPLETED",
  "created_at": "2026-10-07T10:00:00+00:00",
  "layers": ["survey"],
  "warnings": [],
  "error": null
}
```
Errors: `415` wrong type · `413` too large · `400` empty · `422` unreadable/invalid data (body includes `id` and `status: "FAILED"`).

### `GET /api/files/{id}/` — file information
Returns the same object as above. `404` if unknown.

### `GET /api/files/{id}/measurements/` — per-feature measurements
Query params: `limit` (1–1000, default 100), `offset`, `geometry_type` (e.g. `Polygon`), `include_geometry` (default `true`).

```json
{
  "file_id": "9f1c...",
  "total": 3, "limit": 100, "offset": 0, "count": 3,
  "features": [
    {
      "index": 0, "id": 0, "layer": "survey",
      "geometry_type": "Polygon",
      "crs": "EPSG:4326",
      "properties": {"Name": "Plot A", "owner": "Ravi"},
      "geometry": {"type": "Polygon", "coordinates": [[[80.2, 13.0], "..."]]},
      "measurement": {
        "supported": true, "valid": true, "repaired": false,
        "measurement_crs": "EPSG:32644",
        "area_sq_m": 1199423.1, "area_hectares": 119.94, "perimeter_m": 4356.1,
        "length_m": null,
        "geodesic_area_sq_m": 1199418.7, "geodesic_length_m": null,
        "deviation_pct": 0.00037,
        "notes": []
      }
    }
  ]
}
```
Points return `supported: true` with all measurement fields `null`. Unsupported/empty geometries (e.g. `GeometryCollection`) return `supported: false` with an explanatory `notes` entry instead of failing the request. (Numbers above are illustrative.)

### `GET /api/files/{id}/summary/` — spatial analysis & validation *(enhancement)*
```json
{
  "id": "9f1c...", "filename": "sample.kml", "layers": ["survey"], "warnings": [],
  "feature_count": 3,
  "crs": {"code": "EPSG:4326", "name": "WGS 84", "type": "geographic", "units": ["degree", "degree"]},
  "bounds_wgs84": [80.2, 13.0, 80.21, 13.01],
  "geometry_distribution": {"Polygon": 1, "LineString": 1, "Point": 1},
  "totals": {
    "area_sq_m": 1199423.1, "area_hectares": 119.94, "area_sq_km": 1.199,
    "length_m": 1083.4, "length_km": 1.083,
    "geodesic_area_sq_m": 1199418.7, "geodesic_length_m": 1083.4
  },
  "measurement_crs_usage": {"EPSG:32644": 2},
  "validation": {
    "supported_features": 3, "unsupported_or_empty_features": 0,
    "invalid_geometries": 0, "repaired_geometries": 0,
    "tolerance_pct": 1.0, "max_deviation_pct": 0.0004, "mean_deviation_pct": 0.0002,
    "features_exceeding_tolerance": [], "accuracy_ok": true
  }
}
```

`GET /api/health` → `{"status": "ok"}`.

---

## Architecture

```
app/
  main.py              FastAPI app + router wiring
  config.py            env-driven settings (limits, tolerance)
  schemas.py           Pydantic response models
  storage.py           FileStore (JSON on disk + in-memory cache)
  routers/files.py     HTTP layer only: validation, status codes, pagination
  services/
    reader.py          zip/KML -> GeoDataFrame (+ CRS resolution, safety checks)
    measure.py         per-feature measurement + accuracy cross-check
    processor.py       orchestrates the pipeline, builds summary & record
api/index.py           Vercel entrypoint
tests/                 pytest end-to-end tests (KML, Shapefile, errors)
```

**File-processing flow**
1. Router checks extension and size, reads bytes.
2. `reader.load_upload` writes to a temp dir; zips are extracted with zip-slip and zip-bomb checks; every `.shp` (or every KML folder/layer) is read via pyogrio.
3. Layers are merged; CRS is resolved (see below). Z values are dropped (`force_2d`).
4. Each feature becomes a record: index/id, layer, geometry type, CRS, properties (JSON-safe), GeoJSON geometry (in the original CRS), measurement.
5. A summary is computed and everything is stored as `COMPLETED`; failures are stored as `FAILED` with a message.

**Measurement flow** (`measure.py`)
1. Geometry is transformed to WGS84 lon/lat once (vectorised).
2. For each polygon/line, the UTM zone of its representative point is chosen (`326xx` north, `327xx` south).
3. The geometry is projected to that UTM zone; **area** = polygon area, **length** = line length (perimeter also reported for polygons). `Multi*` types are handled natively.
4. Invalid polygons are repaired with `make_valid` before measuring and flagged.
5. **Validation:** the same feature is measured geodesically on the WGS84 ellipsoid (`pyproj.Geod`). `deviation_pct` is the difference between the two; the summary flags features above `ACCURACY_TOLERANCE_PCT`.

**CRS handling**
- Source CRS is read from `.prj` (Shapefile) or assumed by the KML spec (EPSG:4326).
- Degrees are never used for measurement: everything is projected to a metric CRS first.
- Missing `.prj`: assumed EPSG:4326 only if coordinates fit lon/lat ranges (with a warning); otherwise the upload is rejected rather than guessed.
- Files already in a projected CRS (e.g. UTM, State Plane) are handled the same way: they go through WGS84 and are then measured in the best-fit UTM zone, so results are consistent regardless of input CRS.

## Design Decisions

| Decision | Why | Alternatives considered |
|---|---|---|
| **Per-feature UTM zone** | Metric, low distortion, automatic, no config | Single zone for whole file (bad for wide extents); equal-area projection like Albers/LAEA (great for area, bad for length); local Transverse Mercator per file |
| **Geodesic cross-check** | Gives a real, quantified accuracy verification and catches large polygons where UTM distorts | Trust projection blindly |
| **GeoPandas + pyogrio** | Required stack; pyogrio ships GDAL in wheels, so no system GDAL install (important on Vercel) | Fiona (needs more native deps), pure `fastkml`/`pyshp` parsers |
| **Synchronous processing** | Simple, deterministic, fits serverless and ≤4 MB uploads; endpoints are plain `def` so FastAPI runs them in a threadpool | Celery/RQ background jobs with polling (the `status` field already supports this) |
| **Stored results, not re-computation** | `GET`s are cheap and consistent | Store raw file and compute on read |
| **Graceful failures** | Unsupported geometry, bad features, or bad files never produce a 500 | Fail whole upload |
| **Pluggable storage** | Swappable for Postgres/PostGIS/Redis/S3 | ORM from day one (overkill for the scope) |

## Known Limitations
- Storage is not durable on Vercel (see caveats above).
- Polygons crossing the antimeridian or covering a pole are not handled specially; the geodesic check will flag large distortions.
- A very large polygon spanning several UTM zones is measured in one zone; check `deviation_pct`.
- `.kmz`, GeoJSON, GeoPackage are not accepted (easy to add: pyogrio already reads them).

## Learnings
- KML is always WGS84, while Shapefiles can be anything and often lack `.prj`; CRS resolution deserves its own explicit policy rather than a default.
- `geometry.area` on lon/lat silently returns "square degrees", so tests must assert real-world magnitudes (e.g. a 0.01°×0.01° box near Chennai is ≈ 1.2 km²).
- Serverless changes architecture more than framework choice: storage, request limits, and package size drive design.
- Uploaded archives are untrusted input: zip-slip, zip-bombs, and malformed files all need handling.

## Future Scope
- Durable storage (PostGIS or Postgres + S3/Blob) and background processing with job status polling
- Direct-to-storage uploads for large files; streaming/chunked parsing
- More formats: KMZ, GeoJSON, GeoPackage, multi-file selection
- Choosable measurement strategy (UTM / equal-area / geodesic only) via query param
- Antimeridian/polar handling, topology checks (overlaps, gaps, duplicates) as extra validation
- Return perimeter/area in user-selected units, export results as CSV/GeoJSON
- Auth, rate limiting, and OpenAPI examples; CI with GitHub Actions; Dockerfile for non-serverless hosting
