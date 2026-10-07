"""Per-feature measurement: projected (UTM) result cross-checked against geodesic result."""
import math
from functools import lru_cache
from typing import Any, Iterator, Optional

import numpy as np
import shapely
from pyproj import Geod, Transformer
from shapely.geometry.base import BaseGeometry

GEOD = Geod(ellps="WGS84")
POLYGONAL = {"Polygon", "MultiPolygon"}
LINEAR = {"LineString", "MultiLineString"}
POINTLIKE = {"Point", "MultiPoint"}
SUPPORTED = POLYGONAL | LINEAR | POINTLIKE


def utm_epsg_for(lon: float, lat: float) -> int:
    """UTM zone EPSG code (WGS84) containing the lon/lat."""
    zone = min(max(int((lon + 180) // 6) + 1, 1), 60)
    return (32600 if lat >= 0 else 32700) + zone


@lru_cache(maxsize=128)
def _to_utm(epsg: int) -> Transformer:
    return Transformer.from_crs(4326, epsg, always_xy=True)


def _polygonal_part(geom: BaseGeometry) -> BaseGeometry:
    """Keep only polygon components (make_valid may yield a GeometryCollection)."""
    if geom.geom_type in POLYGONAL:
        return geom
    polys = [g for g in getattr(geom, "geoms", []) if g.geom_type in POLYGONAL]
    return shapely.union_all(polys) if polys else geom


def _parts(geom: BaseGeometry) -> Iterator[BaseGeometry]:
    if hasattr(geom, "geoms"):
        for g in geom.geoms:
            yield from _parts(g)
    else:
        yield geom


def _geodesic_area(geom) -> float:
    return sum(abs(GEOD.geometry_area_perimeter(p)[0]) for p in _parts(geom))


def _geodesic_length(geom) -> float:
    return sum(GEOD.geometry_length(p) for p in _parts(geom))


def _dev(projected: float, geodesic: float) -> Optional[float]:
    return round(abs(projected - geodesic) / geodesic * 100, 6) if geodesic > 0 else None


def measure_feature(geom_wgs84: Optional[BaseGeometry]) -> dict[str, Any]:
    """`geom_wgs84` must be 2D lon/lat. Returns a measurement dict (never raises)."""
    out: dict[str, Any] = {
        "supported": False, "valid": None, "repaired": False,
        "measurement_crs": None, "area_sq_m": None, "area_hectares": None,
        "perimeter_m": None, "length_m": None,
        "geodesic_area_sq_m": None, "geodesic_length_m": None,
        "deviation_pct": None, "notes": [],
    }
    if geom_wgs84 is None or geom_wgs84.is_empty:
        out["notes"].append("Feature has no geometry.")
        return out
    gtype = geom_wgs84.geom_type
    if gtype not in SUPPORTED:
        out["notes"].append(f"Geometry type '{gtype}' is not supported for measurement.")
        return out
    out["supported"] = True
    out["valid"] = bool(geom_wgs84.is_valid)
    if gtype in POINTLIKE:
        return out

    try:
        geom = geom_wgs84
        if not out["valid"]:
            geom = shapely.make_valid(geom)
            if gtype in POLYGONAL:
                geom = _polygonal_part(geom)
            out["repaired"] = True
            out["notes"].append("Invalid geometry repaired with make_valid before measuring.")

        c = geom.representative_point()
        epsg = utm_epsg_for(c.x, c.y)
        t = _to_utm(epsg)
        projected = shapely.transform(geom, lambda c: np.column_stack(t.transform(c[:, 0], c[:, 1])))
        out["measurement_crs"] = f"EPSG:{epsg}"

        if gtype in POLYGONAL:
            area = projected.area
            geo = _geodesic_area(geom)
            if not math.isfinite(area):
                raise ValueError("non-finite projected area")
            out.update(area_sq_m=round(area, 4), area_hectares=round(area / 10_000, 6),
                       perimeter_m=round(projected.length, 4),
                       geodesic_area_sq_m=round(geo, 4), deviation_pct=_dev(area, geo))
        else:
            length = projected.length
            geo = _geodesic_length(geom)
            if not math.isfinite(length):
                raise ValueError("non-finite projected length")
            out.update(length_m=round(length, 4), geodesic_length_m=round(geo, 4),
                       deviation_pct=_dev(length, geo))
    except Exception as exc:  # graceful degradation per feature
        out["notes"].append(f"Measurement failed: {exc}")
    return out
