"""HTTP surface of the views store: route shapes and status codes follow barra's views_api.py."""

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.views_api import create_app

STATE = {"rows": ["a"], "cols": [], "measures": ["m"]}


@pytest.fixture
def client(tmp_path: Path):
    with TestClient(create_app(tmp_path / "v.db")) as c:
        yield c


def save(client, name="Alpha", folder="Public/Risk", state=STATE):
    r = client.put("/views/save", json={"name": name, "folder": folder, "state": state})
    assert r.status_code == 200, r.text
    return r.json()["file"]


def test_empty_tree_has_both_sections(client):
    r = client.get("/views")
    assert r.status_code == 200
    assert r.json() == {
        "sections": {
            "Public": {"folders": {}, "views": []},
            "Private": {"folders": {}, "views": []},
        }
    }


def test_save_returns_file_and_tree_lists_it(client):
    assert save(client) == "Public/Risk/alpha"
    tree = client.get("/views").json()["sections"]["Public"]
    leaf = tree["folders"]["Risk"]["views"][0]
    assert leaf["file"] == "Public/Risk/alpha"
    assert leaf["path"] == "Public/Risk"


def test_one_section_shape(client):
    save(client)
    r = client.get("/views", params={"section": "Public"})
    assert r.json()["section"] == "Public"
    assert "Risk" in r.json()["tree"]["folders"]


def test_unknown_section_is_400(client):
    assert client.get("/views", params={"section": "Shared"}).status_code == 400


def test_empty_section_param_means_both(client):
    assert "sections" in client.get("/views", params={"section": ""}).json()


def test_load_round_trips_state(client):
    f = save(client)
    r = client.get(f"/views/item/{f}")
    assert r.status_code == 200
    doc = r.json()
    assert doc["state"] == STATE
    assert doc["name"] == "Alpha"
    assert doc["path"] == "Public/Risk"


def test_load_accepts_and_strips_json_suffix(client):
    f = save(client)
    assert client.get(f"/views/item/{f}.json").status_code == 200


def test_load_missing_is_404(client):
    assert client.get("/views/item/Public/nope/x").status_code == 404


def test_load_bad_section_and_segment_are_400(client):
    assert client.get("/views/item/Other/x").status_code == 400
    assert client.get("/views/item/Public/%5C/x").status_code == 400
    assert client.get("/views/item/Public").status_code == 400


def test_save_section_root_folder(client):
    assert save(client, folder="Private") == "Private/alpha"


def test_save_bad_folder_is_400(client):
    for folder in ("", "Nope/x", "Public//x", "Public/../x", "Public/"):
        r = client.put("/views/save", json={"name": "a", "folder": folder, "state": {}})
        assert r.status_code == 400, folder


def test_save_missing_state_is_422(client):
    r = client.put("/views/save", json={"name": "a", "folder": "Public"})
    assert r.status_code == 422


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_save_non_finite_state_is_400_and_not_stored(client, token):
    raw = f'{{"name":"n","folder":"Public","state":{{"v":{token}}}}}'.encode()
    r = client.put(
        "/views/save", content=raw, headers={"content-type": "application/json"}
    )
    assert r.status_code == 400, r.text
    assert client.get("/views/item/Public/n").status_code == 404


@pytest.fixture
def lenient(tmp_path: Path):
    """A client that returns a 500 as a response instead of raising it."""
    with TestClient(create_app(tmp_path / "v.db"), raise_server_exceptions=False) as c:
        yield c


@pytest.mark.parametrize(
    "method, url, body",
    [
        ("put", "/views/save", '{"name":NaN,"folder":"Public","state":{}}'),
        ("put", "/views/save", '{"name":"n","folder":NaN,"state":{}}'),
        ("put", "/views/save", '{"name":"n","folder":"Public","state":NaN}'),
        ("put", "/views/save", '{"name":"n","folder":"Public","state":-Infinity}'),
        ("post", "/views/move", '{"file":NaN,"to_folder":"Public"}'),
        ("post", "/views/move", '{"file":"Public/n","to_folder":Infinity}'),
        ("post", "/views/rename", '{"file":"Public/n","new_name":NaN}'),
        ("post", "/views/folder", '{"parent":NaN,"name":"x"}'),
        ("post", "/views/folder", '{"parent":"Public","name":NaN}'),
        ("post", "/views/folder/rename", '{"rel":"Public/x","new_name":NaN}'),
    ],
)
def test_non_finite_token_in_any_body_field_is_4xx_never_500(
    lenient, method, url, body
):
    r = getattr(lenient, method)(
        url, content=body.encode(), headers={"content-type": "application/json"}
    )
    assert 400 <= r.status_code < 500, (r.status_code, r.text)
    assert "nan" not in r.text.lower() and "infinity" not in r.text.lower()
    assert lenient.get("/views/item/Public/n").status_code == 404
    assert lenient.get("/views").json()["sections"]["Public"] == {
        "folders": {},
        "views": [],
    }


def test_resave_overwrites_and_keeps_created(client):
    f = save(client)
    created = client.get(f"/views/item/{f}").json()["created"]
    save(client, state={"rows": ["z"]})
    doc = client.get(f"/views/item/{f}").json()
    assert doc["state"] == {"rows": ["z"]}
    assert doc["created"] == created


def test_delete_view_then_idempotent(client):
    f = save(client)
    r = client.delete(f"/views/item/{f}")
    assert r.status_code == 200 and r.json() == {"deleted": f}
    assert client.delete(f"/views/item/{f}").status_code == 200
    assert client.get(f"/views/item/{f}").status_code == 404


def test_delete_view_bad_path_is_400(client):
    assert client.delete("/views/item/Other/x").status_code == 400


def test_move(client):
    f = save(client)
    r = client.post("/views/move", json={"file": f, "to_folder": "Public/Other"})
    assert r.status_code == 200 and r.json() == {"file": "Public/Other/alpha"}
    assert client.get("/views/item/Public/Other/alpha").status_code == 200


def test_move_errors(client):
    f = save(client)
    save(client, folder="Public/Other")
    assert (
        client.post(
            "/views/move", json={"file": "Public/x/none", "to_folder": "Public"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/views/move", json={"file": f, "to_folder": "Public/Other"}
        ).status_code
        == 400
    )  # clash
    assert (
        client.post(
            "/views/move", json={"file": f, "to_folder": "Private/x"}
        ).status_code
        == 400
    )  # other section
    assert (
        client.post("/views/move", json={"file": f, "to_folder": ""}).status_code == 400
    )


def test_move_accepts_json_suffix(client):
    f = save(client)
    r = client.post("/views/move", json={"file": f + ".json", "to_folder": "Public"})
    assert r.json() == {"file": "Public/alpha"}


def test_rename(client):
    f = save(client)
    r = client.post("/views/rename", json={"file": f, "new_name": "Beta Two"})
    assert r.status_code == 200 and r.json() == {"file": "Public/Risk/beta-two"}


def test_rename_errors(client):
    f = save(client)
    save(client, name="Beta")
    assert (
        client.post(
            "/views/rename", json={"file": "Public/Risk/none", "new_name": "x"}
        ).status_code
        == 404
    )
    assert (
        client.post("/views/rename", json={"file": f, "new_name": "Beta"}).status_code
        == 400
    )
    assert (
        client.post("/views/rename", json={"file": "bad", "new_name": "x"}).status_code
        == 400
    )


def test_make_folder(client):
    r = client.post("/views/folder", json={"parent": "Public", "name": "Risk"})
    assert r.status_code == 200 and r.json() == {"folder": "Public/Risk"}
    r = client.post("/views/folder", json={"parent": "Public/Risk", "name": "Deep"})
    assert r.json() == {"folder": "Public/Risk/Deep"}
    assert (
        "Deep"
        in client.get("/views").json()["sections"]["Public"]["folders"]["Risk"][
            "folders"
        ]
    )


def test_make_folder_errors(client):
    for body in (
        {"parent": "", "name": "x"},
        {"parent": "Public", "name": "a/b"},
        {"parent": "Public", "name": ".."},
        {"parent": "Nope", "name": "x"},
    ):
        assert client.post("/views/folder", json=body).status_code == 400, body


def test_rename_folder_moves_contents(client):
    f = save(client)
    r = client.post(
        "/views/folder/rename", json={"rel": "Public/Risk", "new_name": "Ops"}
    )
    assert r.status_code == 200 and r.json() == {"folder": "Public/Ops"}
    assert client.get("/views/item/Public/Ops/alpha").status_code == 200
    assert client.get(f"/views/item/{f}").status_code == 404


def test_rename_folder_errors(client):
    save(client)
    client.post("/views/folder", json={"parent": "Public", "name": "Ops"})
    assert (
        client.post(
            "/views/folder/rename", json={"rel": "Public/Risk", "new_name": "Ops"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/views/folder/rename", json={"rel": "Public", "new_name": "X"}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/views/folder/rename", json={"rel": "Public/Gone", "new_name": "X"}
        ).status_code
        == 404
    )


def test_delete_folder(client):
    client.post("/views/folder", json={"parent": "Public", "name": "Tmp"})
    r = client.delete("/views/folder/Public/Tmp")
    assert r.status_code == 200 and r.json() == {"deleted": "Public/Tmp"}
    assert client.get("/views").json()["sections"]["Public"]["folders"] == {}


def test_delete_folder_errors(client):
    save(client)
    assert client.delete("/views/folder/Public/Risk").status_code == 400  # not empty
    assert client.delete("/views/folder/Public").status_code == 400  # section root
    assert client.delete("/views/folder/Public/Gone").status_code == 404
    assert client.delete("/views/folder/Other/x").status_code == 400


def test_locked_database_is_503(client):
    store = client.app.state.store
    store._conn.execute("PRAGMA busy_timeout=50")
    other = sqlite3.connect(store.db_path, isolation_level=None)
    other.execute("BEGIN IMMEDIATE")
    try:
        r = client.put(
            "/views/save", json={"name": "a", "folder": "Public", "state": {}}
        )
        assert r.status_code == 503
    finally:
        other.execute("ROLLBACK")
        other.close()


def test_env_db_path_and_store_closed_on_shutdown(tmp_path, monkeypatch):
    db = tmp_path / "sub" / "env.db"
    monkeypatch.setenv("VIEWS_DB", str(db))
    with TestClient(create_app()) as c:
        save(c)
        store = c.app.state.store
    assert db.exists()
    with pytest.raises(sqlite3.ProgrammingError):
        store._conn.execute("SELECT 1")


def test_load_reports_the_stored_schema_version(client):
    f = save(client)
    assert client.get(f"/views/item/{f}").json()["schema_version"] == 2
    with sqlite3.connect(client.app.state.store.db_path) as c:
        c.execute("UPDATE views SET schema_version = 1")
    assert client.get(f"/views/item/{f}").json()["schema_version"] == 1
