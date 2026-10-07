import io
import zipfile
from pathlib import Path

import geopandas as gpd
from fastapi.testclient import TestClient
from shapely.geometry import LineString, Polygon

from app.main import app
from app.services.measure import utm_epsg_for

client = TestClient(app)
SAMPLE = Path(__file__).parent.parent / "samples" / "sample.kml"


def _upload(name, data):
    return client.post("/api/files/", files={"file": (name, data)})


def test_utm_zone():
    assert utm_epsg_for(80.2, 13.0) == 32644
    assert utm_epsg_for(-70, -33) == 32719


def test_kml_flow():
    r = _upload("survey.kml", SAMPLE.read_bytes())
    assert r.status_code == 201, r.text
    info = r.json()
    assert info["feature_count"] == 3 and info["crs"] == "EPSG:4326" and info["status"] == "COMPLETED"
    fid = info["id"]
    assert client.get(f"/api/files/{fid}/").json()["id"] == fid

    feats = client.get(f"/api/files/{fid}/measurements/").json()["features"]
    by_type = {f["geometry_type"]: f for f in feats}
    poly = by_type["Polygon"]["measurement"]
    assert 1.1e6 < poly["area_sq_m"] < 1.3e6
    assert poly["measurement_crs"] == "EPSG:32644"
    assert poly["deviation_pct"] < 0.1
    assert 1050 < by_type["LineString"]["measurement"]["length_m"] < 1110
    assert by_type["Point"]["measurement"]["area_sq_m"] is None

    s = client.get(f"/api/files/{fid}/summary/").json()
    assert s["geometry_distribution"] == {"Polygon": 1, "LineString": 1, "Point": 1}
    assert s["validation"]["accuracy_ok"] is True
    assert s["totals"]["area_sq_m"] == poly["area_sq_m"]


def test_shapefile_zip(tmp_path):
    gdf = gpd.GeoDataFrame(
        {"name": ["a", "b"]},
        geometry=[Polygon([(0, 0), (0.01, 0), (0.01, 0.01), (0, 0.01)]), LineString([(0, 0), (0.01, 0)])],
        crs=4326,
    )
    gdf.iloc[[0]].to_file(tmp_path / "poly.shp")
    gdf.iloc[[1]].to_file(tmp_path / "line.shp")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for p in tmp_path.iterdir():
            zf.write(p, p.name)
    r = _upload("data.zip", buf.getvalue())
    assert r.status_code == 201, r.text
    assert r.json()["feature_count"] == 2
    total = client.get(f"/api/files/{r.json()['id']}/summary/").json()["totals"]
    assert total["area_sq_m"] > 0 and total["length_m"] > 0


def test_errors():
    assert _upload("x.txt", b"hi").status_code == 415
    assert _upload("bad.zip", b"notazip").status_code == 422
    assert _upload("bad.kml", b"<kml>").status_code == 422
    assert client.get("/api/files/doesnotexist/").status_code == 404


def test_ui_and_sample():
    assert client.get("/").status_code == 200
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/sample").status_code == 200

