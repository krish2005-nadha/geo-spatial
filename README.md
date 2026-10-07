# GeoMeasure Studio: Geospatial Measurement & Validation API

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel%20Deployment-emerald?style=for-the-badge&logo=vercel)](https://geo-spatial-git-main-krishnakumars-projects-caf4a40f.vercel.app/)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![GeoPandas](https://img.shields.io/badge/GeoPandas-1.0+-139C5A?style=for-the-badge&logo=pandas&logoColor=white)](https://geopandas.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

A high-performance **FastAPI + GeoPandas + Pyogrio** geospatial service and modern interactive Web Studio. Upload zipped **ESRI Shapefiles** or **KML datasets** to instantly calculate per-feature planar area & length in optimal local UTM projections, accompanied by an **automated spatial analysis & geodesic validation engine**.

🔗 **Live Deployment**: [GeoMeasure Studio | Geospatial File Measurement & Validation API](https://geo-spatial-git-main-krishnakumars-projects-caf4a40f.vercel.app/)  
📖 **Interactive Swagger UI**: [https://geo-spatial-git-main-krishnakumars-projects-caf4a40f.vercel.app/docs](https://geo-spatial-git-main-krishnakumars-projects-caf4a40f.vercel.app/docs)

---

## 🌟 Core Innovation

> **"To enhance the geospatial measurement API with an automated spatial analysis and validation feature that summarizes uploaded data, verifies measurement accuracy, and provides useful insights such as feature distribution, total area, total length, and CRS information."**

### Key Analytical Pillars:
1. **Automated Spatial Analysis & Summarization**:
   - Aggregates dataset-level metrics across all layers: total polygonal area (in $\text{m}^2$, hectares, and $\text{km}^2$), total linear length (in meters and kilometers), bounding extents, and geometry distributions.
2. **Dual Measurement & Geodesic Accuracy Verification**:
   - Rather than blindly trusting planar projections, each feature is projected to its localized metric UTM zone and cross-checked against ellipsoidal geodesic calculations on the **WGS84 ellipsoid** (`pyproj.Geod`).
   - Automatically computes percentage deviation ($\Delta\% = \frac{|\text{projected} - \text{geodesic}|}{\text{geodesic}} \times 100$) and flags features exceeding the configured accuracy threshold (`ACCURACY_TOLERANCE_PCT`).
3. **Smart CRS Detection & Dynamic Projection**:
   - Reads native CRS from `.prj` or defaults to `EPSG:4326` for KML.
   - For Shapefiles missing `.prj`, coordinates are validated within $[-180, 180]$ and $[-90, 90]$ bounds to safely assume WGS84 with warnings, or rejected if ambiguous.
   - Features are dynamically transformed to the exact **UTM Zone** containing their representative centroid (`EPSG:326xx` North / `EPSG:327xx` South) for distortion-minimized metric calculation.
4. **Self-Healing Geometry Pipeline**:
   - Automatically cleans 3D coordinates ($Z=0$ artifacts in KML) via `shapely.force_2d`.
   - Heals invalid geometries on-the-fly using `shapely.make_valid` and extracts polygonal components from resulting `GeometryCollection` structures.

---

## 🖥️ GeoMeasure Web Studio UI

The service includes an interactive, dark glassmorphism dashboard built with responsive Vanilla CSS and Leaflet.js:

* **1-Click Live Demo**: Click `✨ Try Sample KML (Chennai Survey)` to test the complete measurement pipeline without downloading or preparing local files.
* **Interactive Multi-Basemap Leaflet View**: Toggle between **🌙 CartoDB Dark Matter**, **🗺️ OpenStreetMap**, and **🛰️ ESRI Satellite Imagery** with real-time GeoJSON overlay rendering.
* **Rich Popups & Map Controls**: Inspect calculated area ($\text{ha}$, $\text{m}^2$), length ($\text{m}$), and geodesic $\Delta\%$ on map click, with automated "Fit Bounds" centering.
* **Measurement Table & Search Engine**: Filter by geometry type (`All`, `Polygons`, `Lines`, `Points`), live-search by attributes, and zoom directly to individual features.
* **Multi-Format Data Exports**: Export processed measurements as **GeoJSON FeatureCollection** or structured **JSON**.

---

## 🏗️ Architecture & Pipeline

```
                              ┌───────────────────────────────────┐
                              │  Client / GeoMeasure Web Studio   │
                              └─────────────────┬─────────────────┘
                                                │ (Multipart POST)
                                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FastAPI HTTP Gateway (app/routers/files.py)                                     │
│  - File type check (.zip, .kml)                                                 │
│  - Strict byte slicing & max size enforcement (MAX_UPLOAD_MB)                    │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Reader Service (app/services/reader.py)                                         │
│  - Zip-Slip & Zip-Bomb decompression safety                                     │
│  - Multi-layer extraction via pyogrio (GDAL C-API)                              │
│  - CRS resolution & coordinate bounds verification                              │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Processing & Measurement Engine (app/services/processor.py & measure.py)        │
│  - 2D coordinate flattening (shapely.force_2d)                                  │
│  - Centroid-based UTM EPSG zone determination (EPSG:326xx / 327xx)              │
│  - Planar projected metric calculation (Area / Length)                          │
│  - Ellipsoidal geodesic validation cross-check (pyproj.Geod)                    │
│  - Deviation % calculation & tolerance threshold compliance check               │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Storage & Response Layer (app/storage.py & schemas.py)                          │
│  - In-memory thread-safe cache + file-backed JSON store                         │
│  - Instant GET /summary/ and GET /measurements/ pagination                      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
geo-api/
├── api/
│   └── index.py            # Vercel Serverless entrypoint (with sys.path setup)
├── app/
│   ├── config.py           # Dataclass environment configuration
│   ├── main.py             # FastAPI app initialization, static mounting, /api/sample
│   ├── schemas.py          # Pydantic response models
│   ├── storage.py          # Thread-safe caching & JSON persistence
│   ├── routers/
│   │   └── files.py        # HTTP route controllers (upload, summary, measurements)
│   ├── services/
│   │   ├── measure.py      # UTM projection & geodesic cross-validation logic
│   │   ├── processor.py    # Pipeline orchestration & spatial summary aggregation
│   │   └── reader.py       # Safe archive decompression & pyogrio ingestion
│   └── static/             # Web Studio frontend assets (HTML, CSS, JS)
├── public/                 # Edge CDN static files for Vercel deployment
├── samples/
│   └── sample.kml          # Bundled sample cadastral survey dataset
├── tests/
│   └── test_api.py         # Pytest test suite covering full API flows
├── vercel.json             # Vercel serverless routing & asset inclusion rules
├── requirements.txt        # Production dependencies
└── requirements-dev.txt    # Development & test dependencies
```

---

## 📡 API Specification

### 1. `POST /api/files/` — Upload & Process Dataset
Accepts a multipart file upload (`.kml` or `.zip` containing `.shp`, `.shx`, `.dbf`, `.prj`).

**Request Example**:
```bash
curl -F "file=@samples/sample.kml" https://geo-spatial-git-main-krishnakumars-projects-caf4a40f.vercel.app/api/files/
```

**Response (`201 Created`)**:
```json
{
  "id": "9cc642b41cfc4c17a2b30ef3505f08ca",
  "filename": "sample.kml",
  "feature_count": 3,
  "crs": "EPSG:4326",
  "status": "COMPLETED",
  "created_at": "2026-10-07T16:16:55.738388+00:00",
  "layers": ["survey"],
  "warnings": [],
  "error": null
}
```

---

### 2. `GET /api/files/{id}/summary/` — Automated Spatial Analysis & Validation

Returns dataset-level spatial aggregation, geometry distribution, total measurements, and geodesic accuracy validation.

**Response (`200 OK`)**:
```json
{
  "id": "9cc642b41cfc4c17a2b30ef3505f08ca",
  "filename": "sample.kml",
  "layers": ["survey"],
  "warnings": [],
  "feature_count": 3,
  "crs": {
    "code": "EPSG:4326",
    "name": "WGS 84",
    "type": "geographic",
    "units": ["degree", "degree"]
  },
  "bounds_wgs84": [80.20, 13.00, 80.21, 13.01],
  "geometry_distribution": {
    "Polygon": 1,
    "LineString": 1,
    "Point": 1
  },
  "totals": {
    "area_sq_m": 1199409.2446,
    "area_hectares": 119.940924,
    "area_sq_km": 1.19940924,
    "length_m": 1084.5134,
    "length_km": 1.084513,
    "geodesic_area_sq_m": 1200148.5598,
    "geodesic_length_m": 1084.8476
  },
  "measurement_crs_usage": {
    "EPSG:32644": 2
  },
  "validation": {
    "supported_features": 3,
    "unsupported_or_empty_features": 0,
    "invalid_geometries": 0,
    "repaired_geometries": 0,
    "tolerance_pct": 1.0,
    "max_deviation_pct": 0.061602,
    "mean_deviation_pct": 0.046203,
    "features_exceeding_tolerance": [],
    "accuracy_ok": true
  }
}
```

---

### 3. `GET /api/files/{id}/measurements/` — Per-Feature Measurements

**Query Parameters**:
* `limit` (int, default `100`, max `1000`)
* `offset` (int, default `0`)
* `geometry_type` (string, optional: `Polygon`, `LineString`, `Point`)
* `include_geometry` (bool, default `true`)

**Response (`200 OK`)**:
```json
{
  "file_id": "9cc642b41cfc4c17a2b30ef3505f08ca",
  "total": 3,
  "limit": 100,
  "offset": 0,
  "count": 3,
  "features": [
    {
      "index": 0,
      "id": 0,
      "layer": "survey",
      "geometry_type": "Polygon",
      "crs": "EPSG:4326",
      "properties": {
        "Name": "Plot A",
        "owner": "Ravi"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[80.2, 13.0], [80.21, 13.0], [80.21, 13.01], [80.2, 13.01], [80.2, 13.0]]]
      },
      "measurement": {
        "supported": true,
        "valid": true,
        "repaired": false,
        "measurement_crs": "EPSG:32644",
        "area_sq_m": 1199409.2446,
        "area_hectares": 119.940924,
        "perimeter_m": 4356.1,
        "length_m": null,
        "geodesic_area_sq_m": 1200148.5598,
        "geodesic_length_m": null,
        "deviation_pct": 0.061602,
        "notes": []
      }
    }
  ]
}
```

---

## ⚙️ Configuration & Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `MAX_UPLOAD_MB` | `4` | Maximum allowable upload file size in MB (optimized for serverless). |
| `MAX_UNCOMPRESSED_MB` | `50` | Maximum uncompressed size for zip archives (zip-bomb guard). |
| `MAX_FEATURES` | `50000` | Maximum number of geospatial features per file. |
| `ACCURACY_TOLERANCE_PCT` | `1.0` | Maximum acceptable deviation (%) between projected & geodesic calculations. |
| `STORAGE_DIR` | `<tempdir>/geo_api_store` | Filesystem location for processed dataset records. |

---

## 🚀 Local Development Setup

### 1. Clone & create virtual environment
```bash
git clone https://github.com/krish2005-nadha/geo-spatial.git
cd geo-spatial

# Create virtual environment
python -m venv .venv

# Activate on Windows:
.\.venv\Scripts\activate

# Activate on macOS / Linux:
source .venv/bin/activate
```

### 2. Install dependencies
```bash
pip install --upgrade pip
pip install -r requirements-dev.txt
```

### 3. Run the development server
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

* **Web Studio Dashboard**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
* **Interactive API Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* **Run Test Suite**: `pytest`

---

## 🐳 Docker Deployment

To run in containerized environments (Render, Railway, Fly.io, Cloud Run, AWS ECS):

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app
COPY api/ ./api
COPY public/ ./public
COPY samples/ ./samples

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t geo-measure-studio .
docker run -p 8000:8000 geo-measure-studio
```

---

## 🛡️ Security & Defensive Engineering

* **Zip-Slip Attack Defense**: Verifies that all extracted paths stay strictly confined within the temporary sandbox directory before writing files.
* **Zip-Bomb Guard**: Tracks aggregate decompressed file sizes in memory against `MAX_UNCOMPRESSED_MB` during header inspection.
* **Path Traversal Protection**: Enforces alphanumeric identifiers (`file_id.isalnum()`) before accessing persisted storage files.
* **Fault-Isolated Processing**: Geometry calculation anomalies on complex features are logged into feature-level `notes` arrays rather than causing unexpected 500 crashes.

---

## 📄 License

Distributed under the **MIT License**.
