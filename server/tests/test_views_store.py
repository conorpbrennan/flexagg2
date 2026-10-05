"""Tests for server/views_store.py: the saved-view repository over SQLite."""

import _thread
import sqlite3
import threading
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


def test_failed_commit_leaves_no_open_transaction(store):
    store.save("Public", "", "keep", STATE)
    store._conn.execute("PRAGMA busy_timeout=50")  # short wait, not the 5 s default
    reader = sqlite3.connect(store.db_path, isolation_level=None)
    try:
        reader.execute("BEGIN")
        # a read inside BEGIN holds a shared lock, so the store's COMMIT cannot finish
        reader.execute("SELECT * FROM views").fetchall()
        with pytest.raises(sqlite3.OperationalError):
            store.save("Public", "", "doomed", STATE)
        assert not store._conn.in_transaction
        assert [v["slug"] for v in store.tree("Public")["views"]] == ["keep"]
    finally:
        reader.close()
    store.save("Public", "", "after", STATE)
    assert sorted(v["slug"] for v in store.tree("Public")["views"]) == ["after", "keep"]


def test_interrupt_right_after_begin_leaves_no_open_transaction(store):
    # The interrupt lands while BEGIN IMMEDIATE waits on another writer; Python delivers it as
    # soon as BEGIN returns, so BEGIN must already be inside the try that rolls back.
    store._conn.execute("PRAGMA busy_timeout=3000")
    other = sqlite3.connect(
        store.db_path, isolation_level=None, check_same_thread=False
    )
    other.execute("BEGIN IMMEDIATE")
    timers = [
        threading.Timer(0.1, _thread.interrupt_main),
        threading.Timer(0.3, lambda: other.execute("COMMIT")),
    ]
    try:
        for t in timers:
            t.start()
        with pytest.raises(KeyboardInterrupt):
            store.save("Public", "", "interrupted", STATE)
        assert not store._conn.in_transaction
    finally:
        for t in timers:
            t.join()
        other.close()
    store.save("Public", "", "after", STATE)
    assert [v["slug"] for v in store.tree("Public")["views"]] == ["after"]


class _RollbackFails:
    """Stands in for the connection: every statement works except ROLLBACK."""

    def __init__(self, real):
        self._real = real
        self.closed = False

    @property
    def in_transaction(self):
        return self._real.in_transaction

    def execute(self, sql, *args):
        if sql == "ROLLBACK":
            raise sqlite3.OperationalError("disk I/O error")
        return self._real.execute(sql, *args)

    def close(self):
        self.closed = True
        self._real.close()


def test_failed_rollback_closes_connection_and_keeps_original_chained(store):
    fake = _RollbackFails(store._conn)
    store._conn = fake
    with (
        pytest.raises(sqlite3.OperationalError, match="disk I/O") as info,
        store._tx(),
    ):
        raise ValueError("body failed")
    assert isinstance(info.value.__context__, ValueError)
    assert fake.closed
    with pytest.raises(sqlite3.ProgrammingError):
        store.save("Public", "", "x", STATE)


def test_context_manager_closes_connection(tmp_path):
    with ViewsStore(tmp_path / "v.db") as s:
        s.save("Public", "", "v", STATE)
    with pytest.raises(sqlite3.ProgrammingError):
        s.tree("Public")


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_save_rejects_non_finite_state_and_stores_nothing(store, bad):
    with pytest.raises(ValueError):
        store.save("Public", "Risk", "n", {"v": bad})
    with pytest.raises(ValueError):
        store.save("Public", "Risk", "n", {"deep": [{"v": bad}]})
    assert store.tree("Public") == {"folders": {}, "views": []}


def test_non_finite_resave_leaves_the_old_state(store):
    store.save("Public", "Risk", "n", STATE)
    with pytest.raises(ValueError):
        store.save("Public", "Risk", "n", {"v": float("nan")})
    assert store.load("Public", "Risk", "n")["state"] == STATE


def test_close_is_idempotent(tmp_path):
    s = ViewsStore(tmp_path / "v.db")
    s.close()
    s.close()


def test_load_returns_the_stored_schema_version(store):
    store.save("Public", "", "old", STATE)
    with sqlite3.connect(store.db_path) as c:
        c.execute("UPDATE views SET schema_version = 1")
    assert store.load("Public", "", "old")["schema_version"] == 1


def test_save_stamps_current_schema_version_and_resave_restamps(store):
    store.save("Public", "", "v", STATE)
    with sqlite3.connect(store.db_path) as c:
        c.execute("UPDATE views SET schema_version = 1")
    store.save("Public", "", "v", STATE)
    assert store.load("Public", "", "v")["schema_version"] == SCHEMA_VERSION


def test_open_migrates_a_database_without_the_column(tmp_path):
    db = tmp_path / "old.db"
    with sqlite3.connect(db) as c:
        c.executescript(
            """
            CREATE TABLE folders (section TEXT NOT NULL, path TEXT NOT NULL,
                                  PRIMARY KEY (section, path));
            CREATE TABLE views (
                id INTEGER PRIMARY KEY, section TEXT NOT NULL, folder TEXT NOT NULL,
                name TEXT NOT NULL, slug TEXT NOT NULL, state_json TEXT NOT NULL,
                created TEXT NOT NULL, updated TEXT NOT NULL,
                UNIQUE (section, folder, slug));
            INSERT INTO views(section, folder, name, slug, state_json, created, updated)
            VALUES ('Public', '', 'Legacy', 'legacy', '{"rows": []}', 't', 't');
            """
        )
    ViewsStore(db).close()  # a second open must not re-add the column
    s = ViewsStore(db)
    assert s.load("Public", "", "legacy")["schema_version"] == 2
    assert s.save("Public", "", "new", STATE) == "Public/new"
    assert s.load("Public", "", "new")["schema_version"] == SCHEMA_VERSION
    s.close()


_OLD_SCHEMA = """
CREATE TABLE folders (section TEXT NOT NULL, path TEXT NOT NULL, PRIMARY KEY (section, path));
CREATE TABLE views (
    id INTEGER PRIMARY KEY, section TEXT NOT NULL, folder TEXT NOT NULL,
    name TEXT NOT NULL, slug TEXT NOT NULL, state_json TEXT NOT NULL,
    created TEXT NOT NULL, updated TEXT NOT NULL, UNIQUE (section, folder, slug));
INSERT INTO views(section, folder, name, slug, state_json, created, updated)
VALUES ('Public', '', 'Legacy', 'legacy', '{"rows": []}', 't', 't');
"""


class _SpyConn:
    """Wraps a connection; ``on_execute(sql, conn)`` sees every statement after it runs."""

    def __init__(self, conn, on_execute):
        self._conn = conn
        self._on_execute = on_execute

    def execute(self, sql, *args):
        result = self._conn.execute(sql, *args)
        if sql.startswith("PRAGMA"):
            result = iter(result.fetchall())  # read lock released before the hook runs
        self._on_execute(sql, self._conn)
        return result

    def __getattr__(self, name):
        return getattr(self._conn, name)


def _spy_on_connect(monkeypatch, on_execute):
    real = sqlite3.connect
    monkeypatch.setattr(
        sqlite3, "connect", lambda *a, **k: _SpyConn(real(*a, **k), on_execute)
    )
    return real


def test_concurrent_opener_altering_first_does_not_break_open(tmp_path, monkeypatch):
    db = tmp_path / "old.db"
    with sqlite3.connect(db) as c:
        c.executescript(_OLD_SCHEMA)

    fired = {"in_tx": 0, "out_tx": 0}

    def rival_alters_after_our_check(sql, conn):
        if not sql.startswith("PRAGMA table_info"):
            return
        if conn.in_transaction:
            # Our check ran inside a transaction. Only BEGIN IMMEDIATE already holds the write lock
            # here; a deferred BEGIN holds just a read lock, which lets a rival take the write lock
            # and, in real concurrency, deadlocks the two upgrades ("database is locked").
            fired["in_tx"] += 1
            rival = real(db, isolation_level=None, timeout=0)
            try:
                with pytest.raises(
                    sqlite3.OperationalError, match="database is locked"
                ):
                    rival.execute("BEGIN IMMEDIATE")
            finally:
                rival.close()
        else:
            # Force the race: right after this opener's column check, a second opener adds the column.
            fired["out_tx"] += 1
            rival = real(db, isolation_level=None)
            rival.execute(
                "ALTER TABLE views ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 2"
            )
            rival.close()

    real = _spy_on_connect(monkeypatch, rival_alters_after_our_check)
    s = ViewsStore(db)  # must not raise "duplicate column name"
    assert fired["in_tx"] == 1, (
        "the check must run inside a transaction that holds the write lock"
    )
    assert fired["out_tx"] == 0
    assert s.load("Public", "", "legacy")["schema_version"] == 2
    s.close()


def test_fresh_database_never_runs_alter(tmp_path, monkeypatch):
    seen = []
    _spy_on_connect(monkeypatch, lambda sql, conn: seen.append(sql))
    ViewsStore(tmp_path / "fresh.db").close()
    assert not [q for q in seen if q.lstrip().upper().startswith("ALTER")]


@pytest.mark.parametrize("op", ["move", "rename_view", "rename_folder"])
def test_move_and_renames_keep_a_stored_schema_version(store, op):
    store.save("Public", "A", "v", STATE)
    store.make_folder("Public", "", "B")
    with sqlite3.connect(store.db_path) as c:
        c.execute("UPDATE views SET schema_version = 1")
    if op == "move":
        store.move_view("Public", "A", "v", "B")
        loaded = store.load("Public", "B", "v")
    elif op == "rename_view":
        store.rename_view("Public", "A", "v", "W")
        loaded = store.load("Public", "A", "w")
    else:
        store.rename_folder("Public", "A", "C")
        loaded = store.load("Public", "C", "v")
    assert loaded["schema_version"] == 1


def test_failed_init_closes_the_connection(tmp_path, monkeypatch):
    conns = []
    real = sqlite3.connect

    def spy(*a, **k):
        conns.append(real(*a, **k))
        return conns[-1]

    monkeypatch.setattr(sqlite3, "connect", spy)
    monkeypatch.setattr(
        ViewsStore, "_migrate", lambda self: (_ for _ in ()).throw(OSError("boom"))
    )
    with pytest.raises(OSError):
        ViewsStore(tmp_path / "x.db")
    with pytest.raises(sqlite3.ProgrammingError):
        conns[0].execute("SELECT 1")
