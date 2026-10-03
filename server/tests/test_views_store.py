"""Tests for server/views_store.py: the saved-view repository over SQLite."""

import sqlite3
from pathlib import Path

import pytest

from server.views_store import SCHEMA_VERSION, ViewsStore, parse_file, slugify

STATE = {"rows": ["Manager"], "cols": [], "measures": ["Net exposure"]}


@pytest.fixture
def store(tmp_path: Path) -> ViewsStore:
    return ViewsStore(tmp_path / "views.db")


def test_save_load_round_trip(store):
    file = store.save("Public", "Risk", "My View!", STATE)
    assert file == "Public/Risk/my-view"
    doc = store.load("Public", "Risk", "my-view")
    assert doc["name"] == "My View!"
    assert doc["path"] == "Public/Risk"
    assert doc["state"] == STATE
    assert doc["schema_version"] == SCHEMA_VERSION == 2
    assert doc["created"] and doc["updated"]


def test_save_at_section_root(store):
    assert store.save("Private", "", "Top", STATE) == "Private/top"
    assert store.load("Private", "", "top")["path"] == "Private"


def test_resave_keeps_created_and_replaces_state(store):
    store.save("Public", "", "v", STATE)
    with sqlite3.connect(store.db_path) as c:
        c.execute("UPDATE views SET created='2020-01-01T00:00:00Z'")
    again = store.save("Public", "", "V", {"rows": []})
    assert again == "Public/v"
    doc = store.load("Public", "", "v")
    assert doc["created"] == "2020-01-01T00:00:00Z"
    assert doc["name"] == "V"
    assert doc["state"] == {"rows": []}
    assert len(store.tree("Public")["views"]) == 1


def test_sections_are_isolated(store):
    store.save("Public", "", "v", STATE)
    with pytest.raises(FileNotFoundError):
        store.load("Private", "", "v")
    assert store.tree("Private") == {"folders": {}, "views": []}


def test_load_missing_raises(store):
    with pytest.raises(FileNotFoundError):
        store.load("Public", "", "nope")


def test_unknown_section_rejected(store):
    for bad in ("public", "Shared", "", "Public/x", "../Public"):
        with pytest.raises(ValueError):
            store.tree(bad)
        with pytest.raises(ValueError):
            store.save(bad, "", "v", STATE)


@pytest.mark.parametrize(
    "folder",
    [
        "..",
        "../x",
        "a/../b",
        ".",
        "a/./b",
        "a\\b",
        "\\",
        "/a",
        "a/",
        "a//b",
        "a/\x00",
        "a/\n",
    ],
)
def test_bad_folder_paths_rejected_in_every_segment(store, folder):
    with pytest.raises(ValueError):
        store.save("Public", folder, "v", STATE)
    with pytest.raises(ValueError):
        store.make_folder("Public", folder, "ok")
    with pytest.raises(ValueError):
        store.make_folder("Public", "", folder)
    assert store.tree("Public") == {"folders": {}, "views": []}


def test_unicode_lookalikes_are_inert_data(store):
    # Fullwidth dots / division slash are ordinary characters, not separators: they stay
    # inside their own segment and cannot reach another folder or section.
    store.save("Public", "．．", "v", STATE)
    store.save("Public", "a∕b", "v", STATE)
    tree = store.tree("Public")
    assert set(tree["folders"]) == {"．．", "a∕b"}
    assert store.tree("Private") == {"folders": {}, "views": []}


def test_make_folder_rejects_separator_in_name(store):
    with pytest.raises(ValueError):
        store.make_folder("Public", "", "a/b")
    with pytest.raises(ValueError):
        store.make_folder("Public", "", "")


def test_slugify_matches_barra():
    assert slugify("My View!") == "my-view"
    assert slugify("  Foo  Bar ") == "foo-bar"
    assert slugify("a_b-c") == "a_b-c"
    assert slugify("!!!") == "view"
    assert slugify("") == "view"
    assert slugify(None) == "view"
    assert slugify("../x") == "x"


def test_slug_never_carries_a_separator(store):
    file = store.save("Public", "", "../../etc/passwd", STATE)
    assert file == "Public/etc-passwd"


def test_tree_nesting_shape(store):
    store.save("Public", "", "root view", STATE)
    store.save("Public", "Risk/Daily", "Deep", STATE)
    store.make_folder("Public", "", "Empty")
    tree = store.tree("Public")
    assert set(tree["folders"]) == {"Risk", "Empty"}
    assert tree["folders"]["Empty"] == {"folders": {}, "views": []}
    assert set(tree["folders"]["Risk"]["folders"]) == {"Daily"}
    leaf = tree["folders"]["Risk"]["folders"]["Daily"]["views"][0]
    assert set(leaf) == {"name", "slug", "path", "file", "created", "updated"}
    assert leaf["name"] == "Deep"
    assert leaf["slug"] == "deep"
    assert leaf["path"] == "Public/Risk/Daily"
    assert leaf["file"] == "Public/Risk/Daily/deep"
    assert tree["views"][0]["file"] == "Public/root-view"
    assert tree["views"][0]["path"] == "Public"
    assert tree["folders"]["Risk"]["views"] == []


def test_make_folder_returns_path_and_is_idempotent(store):
    assert store.make_folder("Public", "", "A") == "A"
    assert store.make_folder("Public", "A", "B") == "A/B"
    assert store.make_folder("Public", "A", "B") == "A/B"
    assert list(store.tree("Public")["folders"]["A"]["folders"]) == ["B"]


def test_rename_folder_carries_nested_views_and_folders(store):
    store.save("Public", "Risk", "top", STATE)
    store.save("Public", "Risk/Daily", "deep", STATE)
    store.make_folder("Public", "Risk", "Empty")
    store.save("Public", "Riskier", "sibling", STATE)  # shares a prefix: must not move
    assert store.rename_folder("Public", "Risk", "Limits") == "Limits"
    tree = store.tree("Public")
    assert set(tree["folders"]) == {"Limits", "Riskier"}
    assert set(tree["folders"]["Limits"]["folders"]) == {"Daily", "Empty"}
    assert store.load("Public", "Limits/Daily", "deep")["path"] == "Public/Limits/Daily"
    assert store.load("Public", "Limits", "top")["state"] == STATE
    assert store.load("Public", "Riskier", "sibling")
    with pytest.raises(FileNotFoundError):
        store.load("Public", "Risk", "top")


def test_rename_nested_folder_returns_full_path(store):
    store.save("Public", "A/B", "v", STATE)
    assert store.rename_folder("Public", "A/B", "C") == "A/C"
    assert store.load("Public", "A/C", "v")


def test_rename_folder_is_atomic_on_collision(store):
    store.save("Public", "A", "v", STATE)
    store.save("Public", "B", "w", STATE)
    with pytest.raises(ValueError):
        store.rename_folder("Public", "A", "B")
    assert store.load("Public", "A", "v")
    assert store.load("Public", "B", "w")


def test_rename_folder_rolls_back_when_a_row_fails_midway(store):
    store.save("Public", "A", "v", STATE)
    store.save("Public", "A/sub", "x", STATE)
    with sqlite3.connect(store.db_path) as c:
        # Plant a views row whose rewritten key would collide, but which the pre-check
        # on the folders table cannot see: the transaction must still leave no trace.
        c.execute(
            "INSERT INTO views(section,folder,name,slug,state_json,created,updated) "
            "VALUES('Public','Z','n','v','{}','c','u')"
        )
    with pytest.raises(sqlite3.IntegrityError):
        store.rename_folder("Public", "A", "Z")
    assert store.load("Public", "A", "v")
    assert store.load("Public", "A/sub", "x")
    z = store.tree("Public")["folders"][
        "Z"
    ]  # only the planted row: nothing moved into it
    assert z["folders"] == {} and [v["name"] for v in z["views"]] == ["n"]


def test_rename_missing_or_other_section_folder_raises(store):
    store.make_folder("Private", "", "A")
    with pytest.raises(FileNotFoundError):
        store.rename_folder("Public", "A", "B")


def test_delete_folder_refuses_non_empty(store):
    store.save("Public", "A", "v", STATE)
    with pytest.raises(ValueError):
        store.delete_folder("Public", "A")
    store.make_folder("Public", "", "P")
    store.make_folder("Public", "P", "C")
    with pytest.raises(ValueError):
        store.delete_folder("Public", "P")
    store.delete_folder("Public", "P/C")
    store.delete_folder("Public", "P")
    assert set(store.tree("Public")["folders"]) == {"A"}


def test_delete_folder_missing_or_root_rejected(store):
    with pytest.raises(FileNotFoundError):
        store.delete_folder("Public", "nope")
    with pytest.raises(ValueError):
        store.delete_folder("Public", "")


def test_delete_view(store):
    store.save("Public", "A", "v", STATE)
    store.delete_view("Public", "A", "v")
    with pytest.raises(FileNotFoundError):
        store.load("Public", "A", "v")
    store.delete_view("Public", "A", "v")  # idempotent, as barra's was


def test_move_view_keeps_state_and_created(store):
    store.save("Public", "A", "My View", STATE)
    store.make_folder("Public", "", "B")
    created = store.load("Public", "A", "my-view")["created"]
    assert store.move_view("Public", "A", "my-view", "B") == "Public/B/my-view"
    doc = store.load("Public", "B", "my-view")
    assert (
        doc["name"] == "My View" and doc["state"] == STATE and doc["created"] == created
    )
    with pytest.raises(FileNotFoundError):
        store.load("Public", "A", "my-view")


def test_move_view_to_section_root_and_collision(store):
    store.save("Public", "A", "v", STATE)
    store.save("Public", "", "v", {"rows": []})
    with pytest.raises(ValueError):
        store.move_view("Public", "A", "v", "")
    assert store.load("Public", "", "v")["state"] == {"rows": []}
    assert store.load("Public", "A", "v")["state"] == STATE


def test_move_view_bad_destination_or_missing(store):
    store.save("Public", "A", "v", STATE)
    with pytest.raises(ValueError):
        store.move_view("Public", "A", "v", "..")
    with pytest.raises(FileNotFoundError):
        store.move_view("Public", "A", "nope", "B")


def test_rename_view_changes_name_and_slug_in_place(store):
    store.save("Public", "A", "Old", STATE)
    assert store.rename_view("Public", "A", "old", "New Name") == "Public/A/new-name"
    assert store.load("Public", "A", "new-name")["name"] == "New Name"
    with pytest.raises(FileNotFoundError):
        store.load("Public", "A", "old")


def test_rename_view_same_slug_updates_display_name(store):
    store.save("Public", "A", "old", STATE)
    assert store.rename_view("Public", "A", "old", "OLD") == "Public/A/old"
    assert store.load("Public", "A", "old")["name"] == "OLD"


def test_rename_view_collision_and_missing(store):
    store.save("Public", "A", "one", STATE)
    store.save("Public", "A", "two", STATE)
    with pytest.raises(ValueError):
        store.rename_view("Public", "A", "one", "two")
    with pytest.raises(FileNotFoundError):
        store.rename_view("Public", "A", "nope", "x")


def test_parse_file_round_trips_and_validates():
    assert parse_file("Public/Risk/Daily/my-view") == (
        "Public",
        "Risk/Daily",
        "my-view",
    )
    assert parse_file("Private/v") == ("Private", "", "v")
    for bad in ("Public", "", "Public/../v", "Nope/v", "Public//v", "Public\\v"):
        with pytest.raises(ValueError):
            parse_file(bad)


def test_persists_across_reopen(tmp_path):
    db = tmp_path / "nested" / "v.db"
    ViewsStore(db).save("Public", "A", "v", STATE)
    assert ViewsStore(db).load("Public", "A", "v")["state"] == STATE


def test_all_sql_is_parameterised(store):
    nasty = "x'; DROP TABLE views; --"
    store.save("Public", "", nasty, STATE)
    store.make_folder("Public", "", nasty)
    store.rename_folder("Public", nasty, "y' OR '1'='1")
    assert len(store.tree("Public")["views"]) == 1
    assert "y' OR '1'='1" in store.tree("Public")["folders"]
