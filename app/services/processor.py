"""Orchestrates: read -> normalise -> measure -> summarise -> record."""
import json
import tempfile
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import shapely
from pyproj import CRS

from ..config import settings
from .measure import measure_feature
from .reader import LAYER_COL, FileProcessingError, load_upload


def crs_info(crs: CRS) -> dict[str, Any]:
    auth = crs.to_authority()
    return {
        "code": f"{auth[0]}:{auth[1]}" if auth else None,
        "name": crs.name,
        "type": "geographic" if crs.is_geographic else "projected",
        "units": [a.unit_name for a in crs.axis_info],
    }


def _summarise(features: list[dict], gdf_wgs, crs: CRS) -> dict[str, Any]:
    m = [f["measurement"] for f in features]
    areas = [x["area_sq_m"] for x in m if x["area_sq_m"] is not None]
    lengths = [x["length_m"] for x in m if x["length_m"] is not None]
    devs = [(f["index"], f["measurement"]["deviation_pct"]) for f in features
            if f["measurement"]["deviation_pct"] is not None]
    tol = settings.accuracy_tolerance_pct
    flagged = [i for i, d in devs if d > tol]
    bounds = [float(v) for v in gdf_wgs.total_bounds]
    return {
        "feature_count": len(features),
        "crs": crs_info(crs),
        "bounds_wgs84": bounds,
        "geometry_distribution": dict(Counter(f["geometry_type"] or "None" for f in features)),
        "totals": {
            "area_sq_m": round(sum(areas), 4),
            "area_hectares": round(sum(areas) / 10_000, 6),
            "area_sq_km": round(sum(areas) / 1_000_000, 8),
            "length_m": round(sum(lengths), 4),
            "length_km": round(sum(lengths) / 1000, 6),
            "geodesic_area_sq_m": round(sum(x["geodesic_area_sq_m"] or 0 for x in m), 4),
            "geodesic_length_m": round(sum(x["geodesic_length_m"] or 0 for x in m), 4),
        },
        "measurement_crs_usage": dict(Counter(x["measurement_crs"] for x in m if x["measurement_crs"])),
        "validation": {
            "supported_features": sum(x["supported"] for x in m),
            "unsupported_or_empty_features": sum(not x["supported"] for x in m),
            "invalid_geometries": sum(x["valid"] is False for x in m),
            "repaired_geometries": sum(x["repaired"] for x in m),
            "tolerance_pct": tol,
            "max_deviation_pct": max((d for _, d in devs), default=None),
            "mean_deviation_pct": round(sum(d for _, d in devs) / len(devs), 6) if devs else None,
            "features_exceeding_tolerance": flagged,
            "accuracy_ok": not flagged,
        },
    }


def process_upload(filename: str, content: bytes) -> dict[str, Any]:
    file_id = uuid.uuid4().hex
    record: dict[str, Any] = {
        "id": file_id, "filename": filename, "status": "PROCESSING",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "feature_count": 0, "crs": None, "layers": [], "warnings": [],
        "error": None, "summary": None, "features": [],
    }
    try:
        with tempfile.TemporaryDirectory() as tmp:
            ds = load_upload(filename, content, Path(tmp))
        gdf = ds.gdf
        layers = gdf.pop(LAYER_COL)
        geoms = shapely.force_2d(gdf.geometry.values)  # KML often carries Z=0
        gdf = gdf.set_geometry(geoms, crs=gdf.crs)
        wgs = gdf.to_crs(4326)  # all measuring starts from lon/lat
        props = json.loads(gdf.drop(columns="geometry").to_json(orient="records", date_format="iso"))

        features = []
        crs_code = crs_info(gdf.crs)["code"] or gdf.crs.name
        for i, (geom, wgeom) in enumerate(zip(gdf.geometry, wgs.geometry)):
            empty = geom is None or geom.is_empty
            features.append({
                "index": i,
                "id": i,
                "layer": layers.iloc[i],
                "geometry_type": None if geom is None else geom.geom_type,
                "crs": crs_code,
                "properties": props[i],
                "geometry": None if empty else geom.__geo_interface__,
                "measurement": measure_feature(wgeom),
            })
        record.update(
            status="COMPLETED", feature_count=len(features), crs=crs_code,
            layers=ds.layers, warnings=ds.warnings, features=features,
            summary=_summarise(features, wgs, gdf.crs),
        )
    except FileProcessingError as exc:
        record.update(status="FAILED", error=str(exc))
    except Exception as exc:  # never leak a 500 for bad data
        record.update(status="FAILED", error=f"Unexpected processing error: {exc}")
    return record
