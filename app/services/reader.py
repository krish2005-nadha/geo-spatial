"""Reads Shapefile (.zip) and KML uploads into a single GeoDataFrame."""
import os
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio

from ..config import settings

LAYER_COL = "__layer"


class FileProcessingError(Exception):
    """Raised for user-correctable problems (bad archive, no features, ...)."""


@dataclass
class ParsedDataset:
    gdf: gpd.GeoDataFrame
    layers: list[str]
    warnings: list[str] = field(default_factory=list)


def _safe_extract(zf: zipfile.ZipFile, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    root = str(dest.resolve()) + os.sep
    total = 0
    for info in zf.infolist():
        if info.is_dir():
            continue
        if not str((dest / info.filename).resolve()).startswith(root):
            raise FileProcessingError("Zip contains unsafe paths.")
        total += info.file_size
        if total > settings.max_uncompressed_bytes:
            raise FileProcessingError("Zip is too large when uncompressed.")
    zf.extractall(dest)


def _read_all_layers(path: Path) -> list[gpd.GeoDataFrame]:
    frames = []
    for name in pyogrio.list_layers(str(path))[:, 0]:
        gdf = pyogrio.read_dataframe(str(path), layer=str(name))
        if len(gdf):
            gdf[LAYER_COL] = str(name)
            frames.append(gdf)
    return frames


def load_upload(filename: str, content: bytes, workdir: Path) -> ParsedDataset:
    ext = Path(filename).suffix.lower()
    warnings: list[str] = []
    frames: list[gpd.GeoDataFrame] = []

    try:
        if ext == ".zip":
            archive = workdir / "upload.zip"
            archive.write_bytes(content)
            try:
                with zipfile.ZipFile(archive) as zf:
                    _safe_extract(zf, workdir / "x")
            except zipfile.BadZipFile as exc:
                raise FileProcessingError("Not a valid zip archive.") from exc
            shps = [p for p in (workdir / "x").rglob("*.shp") if "__MACOSX" not in p.parts]
            if not shps:
                raise FileProcessingError("No .shp file found inside the zip.")
            for shp in shps:
                frames += _read_all_layers(shp)
        elif ext == ".kml":
            kml = workdir / "upload.kml"
            kml.write_bytes(content)
            frames = _read_all_layers(kml)
        else:
            raise FileProcessingError("Unsupported file type. Upload a .zip (Shapefile) or .kml.")
    except FileProcessingError:
        raise
    except Exception as exc:  # GDAL/pyogrio errors
        raise FileProcessingError(f"Could not read geospatial data: {exc}") from exc

    if not frames:
        raise FileProcessingError("File contains no features.")

    # Resolve CRS (reproject mismatching layers to the first known CRS)
    target = next((f.crs for f in frames if f.crs is not None), None)
    fixed = []
    for f in frames:
        if f.crs is None:
            if target is None:
                minx, miny, maxx, maxy = f.total_bounds
                if not (-180 <= minx <= 180 and -180 <= maxx <= 180 and -90 <= miny <= 90 and -90 <= maxy <= 90):
                    raise FileProcessingError(
                        "CRS is missing (.prj) and coordinates do not look like lon/lat."
                    )
                f = f.set_crs(4326)
                warnings.append("No CRS defined; assumed EPSG:4326.")
            else:
                f = f.set_crs(target)
                warnings.append("A layer had no CRS; assumed same as other layers.")
        elif target is not None and f.crs != target:
            f = f.to_crs(target)
            warnings.append(f"Layer reprojected to {target.to_string()} to merge layers.")
        fixed.append(f)
    target = target or fixed[0].crs

    gdf = gpd.GeoDataFrame(pd.concat(fixed, ignore_index=True), crs=target)
    if len(gdf) > settings.max_features:
        raise FileProcessingError(f"Too many features ({len(gdf)} > {settings.max_features}).")
    return ParsedDataset(gdf=gdf, layers=sorted(set(gdf[LAYER_COL])), warnings=warnings)
