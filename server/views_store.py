"""Saved pivot views, stored in SQLite.

No web code. This is the server-side home of the repository that barra's ``views_repo.py`` kept as
JSON files on disk: two sections (Public, Private), nested folders, and one view per
(section, folder, slug). Folders are rows, not directories, so a user-supplied path is only ever
data and a ``..`` cannot reach anything. The path checks exist so the data stays well formed.

Folder paths are relative to their section: ``""`` is the section root, ``"Risk/Daily"`` is nested.
A view's client-facing id, ``file``, is ``<section>/<folder path>/<slug>``.

Errors: ``ValueError`` for a bad section, path, name clash or a non-empty folder;
``FileNotFoundError`` for a view or folder that does not exist.
"""

from __future__ import annotations

import datetime as _dt
import json
import re
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Self

SECTIONS = ("Public", "Private")
SCHEMA_VERSION = 2  # level keys in state, not risk_api names

_SCHEMA = """
CREATE TABLE IF NOT EXISTS folders (
    section TEXT NOT NULL,
    path    TEXT NOT NULL,
    PRIMARY KEY (section, path)
);
CREATE TABLE IF NOT EXISTS views (
    id         INTEGER PRIMARY KEY,
    section    TEXT NOT NULL,
    folder     TEXT NOT NULL,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created    TEXT NOT NULL,
    updated    TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 2,
    UNIQUE (section, folder, slug)
);
"""

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def slugify(name: str | None) -> str:
    """Same rules as barra's ``views_repo.slugify``."""
    s = re.sub(r"[^\w\-]+", "-", (name or "").strip().lower()).strip("-")
    return s or "view"


def _now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _check_section(section: str) -> str:
    if section not in SECTIONS:
        raise ValueError(f"section must be one of {list(SECTIONS)}: {section!r}")
    return section


def _check_segment(seg: str) -> str:
    """One path segment: non-blank, no separators, no control characters, not . or .."""
    if not isinstance(seg, str) or not seg.strip():
        raise ValueError("empty path segment")
    if seg in (".", "..") or "\\" in seg or "/" in seg or _CONTROL.search(seg):
        raise ValueError(f"unsafe path segment: {seg!r}")
    return seg


def _check_folder(folder: str) -> str:
    """A folder path within a section. ``""`` is the section root. Every segment is checked."""
    if not isinstance(folder, str):
        raise TypeError("folder must be a string")
    if folder == "":
        return ""
    for seg in folder.split("/"):
        _check_segment(seg)
    return folder


def _prefixes(folder: str) -> list[str]:
    parts = folder.split("/") if folder else []
    return ["/".join(parts[: i + 1]) for i in range(len(parts))]


def _display_path(section: str, folder: str) -> str:
    return f"{section}/{folder}" if folder else section


def _file(section: str, folder: str, slug: str) -> str:
    return f"{_display_path(section, folder)}/{slug}"


def parse_file(file: str) -> tuple[str, str, str]:
    """Split a client-facing ``file`` id into ``(section, folder, slug)``, validating every part."""
    if not isinstance(file, str):
        raise TypeError("file must be a string")
    parts = file.split("/")
    if len(parts) < 2:
        raise ValueError(f"not a view file id: {file!r}")
    section, *folder_parts, slug = parts
    _check_section(section)
    for seg in (
        *folder_parts,
        slug,
    ):  # checked per segment: "a//b" must not collapse to "a/b"
        _check_segment(seg)
    return section, "/".join(folder_parts), slug


class ViewsStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        # isolation_level=None: no implicit transactions; _tx() issues BEGIN/COMMIT itself.
        self._conn = sqlite3.connect(
            self.db_path, isolation_level=None, check_same_thread=False
        )
        try:
            self._conn.executescript(_SCHEMA)
            self._migrate()
        except BaseException:
            self._conn.close()
            raise

    def _migrate(self) -> None:
        """Add ``views.schema_version`` to a database created before the column existed.

        The DEFAULT is 2 because every row in such a database was written by v2 code, so 2 is the
        truthful version. save() always writes SCHEMA_VERSION explicitly.
        """
        # BEGIN IMMEDIATE serialises openers (DDL is transactional): the loser re-checks and skips.
        with self._tx() as c:
            cols = {r[1] for r in c.execute("PRAGMA table_info(views)")}
            if "schema_version" not in cols:
                c.execute(
                    "ALTER TABLE views ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 2"
                )

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        """One transaction: everything inside commits together or not at all."""
        with self._lock:
            try:
                # Inside the try: an interrupt delivered just after BEGIN returns must still roll back.
                self._conn.execute("BEGIN IMMEDIATE")
                yield self._conn
                self._conn.execute("COMMIT")
            except BaseException:
                if self._conn.in_transaction:
                    try:
                        self._conn.execute("ROLLBACK")
                    except BaseException:
                        # Cannot leave the transaction: fail loudly, not wedged. The original
                        # error stays chained as __context__.
                        self._conn.close()
                        raise
                raise

    def close(self) -> None:
        """Close the connection; safe to call twice."""
        with self._lock:
            self._conn.close()

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _ensure_folders(c: sqlite3.Connection, section: str, folder: str) -> None:
        for p in _prefixes(folder):
            c.execute(
                "INSERT OR IGNORE INTO folders(section, path) VALUES (?, ?)",
                (section, p),
            )

    @staticmethod
    def _folder_exists(c: sqlite3.Connection, section: str, folder: str) -> bool:
        return (
            c.execute(
                "SELECT 1 FROM folders WHERE section = ? AND path = ?",
                (section, folder),
            ).fetchone()
            is not None
        )

    @staticmethod
    def _view_row(c: sqlite3.Connection, section: str, folder: str, slug: str):
        row = c.execute(
            "SELECT id, name, state_json, created, updated, schema_version FROM views "
            "WHERE section = ? AND folder = ? AND slug = ?",
            (section, folder, slug),
        ).fetchone()
        if row is None:
            raise FileNotFoundError(f"view not found: {_file(section, folder, slug)}")
        return row

    # ------------------------------------------------------------------ read
    def tree(self, section: str) -> dict:
        """``{folders: {name: <subtree>}, views: [leaf]}`` for one section (barra's ``ViewTree``)."""
        _check_section(section)
        with self._lock:
            folder_paths = [
                r[0]
                for r in self._conn.execute(
                    "SELECT path FROM folders WHERE section = ?", (section,)
                )
            ]
            rows = self._conn.execute(
                "SELECT name, slug, folder, created, updated FROM views WHERE section = ?",
                (section,),
            ).fetchall()

        root: dict = {"folders": {}, "views": []}

        def node(folder: str) -> dict:
            cur = root
            for seg in folder.split("/") if folder else []:
                cur = cur["folders"].setdefault(seg, {"folders": {}, "views": []})
            return cur

        for p in sorted(folder_paths, key=str.lower):
            node(p)
        for name, slug, folder, created, updated in sorted(
            rows, key=lambda r: r[0].lower()
        ):
            node(folder)["views"].append(
                {
                    "name": name,
                    "slug": slug,
                    "path": _display_path(section, folder),
                    "file": _file(section, folder, slug),
                    "created": created,
                    "updated": updated,
                }
            )
        return root

    def load(self, section: str, folder: str, slug: str) -> dict:
        """The stored ViewDoc. Raises FileNotFoundError when there is no such view."""
        _check_section(section)
        _check_folder(folder)
        with self._lock:
            _id, name, state_json, created, updated, version = self._view_row(
                self._conn, section, folder, slug
            )
        return {
            "schema_version": version,
            "name": name,
            "path": _display_path(section, folder),
            "created": created,
            "updated": updated,
            "state": json.loads(state_json),
        }

    # ------------------------------------------------------------------ views
    def save(self, section: str, folder: str, name: str, state: dict) -> str:
        """Upsert by (section, folder, slug); a re-save keeps ``created``. Returns the ``file`` id."""
        _check_section(section)
        _check_folder(folder)
        slug = slugify(name)
        now = _now_iso()
        # allow_nan=False: NaN/Infinity would be stored but could never be served as JSON, so the
        # view could not be loaded back. Raises ValueError before any write. The only writer of
        # state_json (move and rename never re-serialise it).
        state_json = json.dumps(state, allow_nan=False)
        with self._tx() as c:
            self._ensure_folders(c, section, folder)
            c.execute(
                "INSERT INTO views(section, folder, name, slug, state_json, created, updated, "
                "schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(section, folder, slug) DO UPDATE SET "
                "name = excluded.name, state_json = excluded.state_json, updated = excluded.updated, "
                "schema_version = excluded.schema_version",
                (section, folder, name, slug, state_json, now, now, SCHEMA_VERSION),
            )
        return _file(section, folder, slug)

    def delete_view(self, section: str, folder: str, slug: str) -> None:
        """Idempotent: deleting a missing view is a no-op, as in barra."""
        _check_section(section)
        _check_folder(folder)
        with self._tx() as c:
            c.execute(
                "DELETE FROM views WHERE section = ? AND folder = ? AND slug = ?",
                (section, folder, slug),
            )

    def move_view(self, section: str, folder: str, slug: str, to_folder: str) -> str:
        """Move a view to another folder of the same section. Refuses to overwrite."""
        _check_section(section)
        _check_folder(folder)
        _check_folder(to_folder)
        with self._tx() as c:
            vid = self._view_row(c, section, folder, slug)[0]
            if to_folder != folder:
                clash = c.execute(
                    "SELECT 1 FROM views WHERE section = ? AND folder = ? AND slug = ?",
                    (section, to_folder, slug),
                ).fetchone()
                if clash:
                    raise ValueError(
                        f"a view already exists at {_file(section, to_folder, slug)}"
                    )
                self._ensure_folders(c, section, to_folder)
                c.execute("UPDATE views SET folder = ? WHERE id = ?", (to_folder, vid))
        return _file(section, to_folder, slug)

    def rename_view(self, section: str, folder: str, slug: str, new_name: str) -> str:
        """Rename in place: new display name and the slug derived from it. Refuses to overwrite."""
        _check_section(section)
        _check_folder(folder)
        new_slug = slugify(new_name)
        with self._tx() as c:
            vid = self._view_row(c, section, folder, slug)[0]
            if new_slug != slug:
                clash = c.execute(
                    "SELECT 1 FROM views WHERE section = ? AND folder = ? AND slug = ?",
                    (section, folder, new_slug),
                ).fetchone()
                if clash:
                    raise ValueError(
                        f"a view already exists at {_file(section, folder, new_slug)}"
                    )
            c.execute(
                "UPDATE views SET name = ?, slug = ?, updated = ? WHERE id = ?",
                (new_name, new_slug, _now_iso(), vid),
            )
        return _file(section, folder, new_slug)

    # ------------------------------------------------------------------ folders
    def make_folder(self, section: str, parent: str, name: str) -> str:
        """Create ``parent/name`` (and any missing ancestors). Idempotent. Returns its path."""
        _check_section(section)
        _check_folder(parent)
        _check_segment(name)
        path = f"{parent}/{name}" if parent else name
        with self._tx() as c:
            self._ensure_folders(c, section, path)
        return path

    def rename_folder(self, section: str, path: str, new_name: str) -> str:
        """Rename the last segment of ``path``; its views and sub-folders move with it, in one
        transaction. Returns the new path."""
        _check_section(section)
        _check_folder(path)
        _check_segment(new_name)
        if not path:
            raise ValueError("cannot rename a section root")
        parent = path.rpartition("/")[0]
        new_path = f"{parent}/{new_name}" if parent else new_name
        old_prefix = path + "/"
        cut = (
            len(path) + 1
        )  # SQL substr is 1-based: the suffix after `path` starts here
        with self._tx() as c:
            if not self._folder_exists(c, section, path):
                raise FileNotFoundError(
                    f"folder not found: {_display_path(section, path)}"
                )
            if new_path != path and self._folder_exists(c, section, new_path):
                raise ValueError(
                    f"folder already exists: {_display_path(section, new_path)}"
                )
            # Exact match or a descendant (prefix `path/`), compared with substr, not LIKE,
            # so `%` and `_` in a folder name are plain characters.
            args = (new_path, cut, section, path, len(old_prefix), old_prefix)
            c.execute(
                "UPDATE folders SET path = ? || substr(path, ?) "
                "WHERE section = ? AND (path = ? OR substr(path, 1, ?) = ?)",
                args,
            )
            c.execute(
                "UPDATE views SET folder = ? || substr(folder, ?) "
                "WHERE section = ? AND (folder = ? OR substr(folder, 1, ?) = ?)",
                args,
            )
        return new_path

    def delete_folder(self, section: str, path: str) -> None:
        """Delete an empty folder (no views, no sub-folders); otherwise ValueError."""
        _check_section(section)
        _check_folder(path)
        if not path:
            raise ValueError("cannot delete a section root")
        prefix = path + "/"
        with self._tx() as c:
            if not self._folder_exists(c, section, path):
                raise FileNotFoundError(
                    f"folder not found: {_display_path(section, path)}"
                )
            has_view = c.execute(
                "SELECT 1 FROM views WHERE section = ? AND folder = ? LIMIT 1",
                (section, path),
            ).fetchone()
            has_sub = c.execute(
                "SELECT 1 FROM folders WHERE section = ? AND substr(path, 1, ?) = ? LIMIT 1",
                (section, len(prefix), prefix),
            ).fetchone()
            if has_view or has_sub:
                raise ValueError("folder not empty")
            c.execute(
                "DELETE FROM folders WHERE section = ? AND path = ?", (section, path)
            )
