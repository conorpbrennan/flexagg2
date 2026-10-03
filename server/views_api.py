"""HTTP routes over ViewsStore, with the route shapes and status codes of barra's views_api.py.

Run: .venv/bin/uvicorn server.views_api:app --host 127.0.0.1 --port 8020
"""

from __future__ import annotations

import os
import sqlite3
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from server.views_store import SECTIONS, ViewsStore, parse_file

DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "views.db"


class SaveBody(BaseModel):
    name: str
    folder: str = ""  # section-prefixed, e.g. "Public/Risk"
    state: dict


class MoveBody(BaseModel):
    file: str
    to_folder: str = ""


class RenameBody(BaseModel):
    file: str
    new_name: str


class FolderBody(BaseModel):
    parent: str = ""
    name: str


class FolderRenameBody(BaseModel):
    rel: str
    new_name: str


def _split_folder(folder: str) -> tuple[str, str]:
    """``"Public/Risk"`` -> ``("Public", "Risk")``; ``"Public"`` -> ``("Public", "")``."""
    section, *rest = folder.split("/")
    if "" in rest:
        raise ValueError(f"empty path segment in {folder!r}")
    return section, "/".join(rest)


def _split_file(file: str) -> tuple[str, str, str]:
    """A client file id -> (section, folder, slug). A trailing ``.json`` (barra's ids) is stripped;
    a slug is made of word characters and ``-``, so it can never end in ``.json`` itself."""
    return parse_file(file.removesuffix(".json"))


def _path(section: str, folder: str) -> str:
    return f"{section}/{folder}" if folder else section


def _store(request: Request) -> ViewsStore:
    return request.app.state.store


router = APIRouter(prefix="/views", tags=["views"])


@router.get("")
def list_views(
    request: Request,
    section: str | None = Query(None, description="Public | Private; both if omitted"),
):
    store = _store(request)
    if section:
        if section not in SECTIONS:
            raise HTTPException(400, f"section must be one of {list(SECTIONS)}")
        return {"section": section, "tree": store.tree(section)}
    return {"sections": {s: store.tree(s) for s in SECTIONS}}


@router.get("/item/{file:path}")
def get_view(request: Request, file: str):
    try:
        return _store(request).load(*_split_file(file))
    except FileNotFoundError:
        raise HTTPException(404, f"view not found: {file}")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.put("/save")
def put_view(request: Request, body: SaveBody):
    try:
        section, folder = _split_folder(body.folder)
        file = _store(request).save(section, folder, body.name, body.state)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"file": file}


@router.delete("/item/{file:path}")
def remove_view(request: Request, file: str):
    try:
        _store(request).delete_view(*_split_file(file))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"deleted": file}


@router.post("/move")
def move(request: Request, body: MoveBody):
    try:
        section, folder, slug = _split_file(body.file)
        to_section, to_folder = _split_folder(body.to_folder)
        if to_section != section:
            raise ValueError("a view cannot move between sections")
        file = _store(request).move_view(section, folder, slug, to_folder)
    except FileNotFoundError:
        raise HTTPException(404, f"view not found: {body.file}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"file": file}


@router.post("/rename")
def rename(request: Request, body: RenameBody):
    try:
        section, folder, slug = _split_file(body.file)
        file = _store(request).rename_view(section, folder, slug, body.new_name)
    except FileNotFoundError:
        raise HTTPException(404, f"view not found: {body.file}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"file": file}


@router.post("/folder")
def add_folder(request: Request, body: FolderBody):
    try:
        section, parent = _split_folder(body.parent)
        path = _store(request).make_folder(section, parent, body.name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"folder": _path(section, path)}


@router.post("/folder/rename")
def rename_folder_route(request: Request, body: FolderRenameBody):
    try:
        section, path = _split_folder(body.rel)
        new = _store(request).rename_folder(section, path, body.new_name)
    except FileNotFoundError:
        raise HTTPException(404, f"folder not found: {body.rel}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"folder": _path(section, new)}


@router.delete("/folder/{rel:path}")
def remove_folder(request: Request, rel: str):
    try:
        section, path = _split_folder(rel)
        _store(request).delete_folder(section, path)
    except FileNotFoundError:
        raise HTTPException(404, f"folder not found: {rel}")
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"deleted": rel}


def create_app(db_path: Path | str | None = None) -> FastAPI:
    """One ViewsStore per app, opened at startup and closed at shutdown. The DB is `db_path`,
    else env VIEWS_DB, else data/views.db under the repo root."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        path = Path(db_path or os.environ.get("VIEWS_DB") or DEFAULT_DB)
        app.state.store = ViewsStore(path)
        try:
            yield
        finally:
            app.state.store.close()

    app = FastAPI(title="views", lifespan=lifespan)

    @app.exception_handler(sqlite3.OperationalError)
    async def _busy(_request: Request, exc: sqlite3.OperationalError):
        return JSONResponse(
            {"detail": f"views database unavailable: {exc}"}, status_code=503
        )

    @app.exception_handler(RequestValidationError)
    async def _invalid(_request: Request, exc: RequestValidationError):
        # The default 422 detail echoes the offending input; a bare NaN/Infinity token in it
        # cannot be rendered as JSON and turned the 422 into a 500. Report only where and why.
        detail = [
            {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]}
            for e in exc.errors()
        ]
        return JSONResponse({"detail": detail}, status_code=422)

    app.include_router(router)
    return app


app = create_app()
