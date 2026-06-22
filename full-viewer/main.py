from __future__ import annotations

import logging
import sqlite3
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

APP_DIR = Path(__file__).resolve().parent
REPO_DIR = APP_DIR.parent
sys.path.insert(0, str(APP_DIR))
sys.path.append(str(REPO_DIR / "lite-viewer"))

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from auth import create_token, decode_token, verify_password
from config import DB_PATH, settings
from database import Database
from seaai_client import SeaAIWebSocketClient
from state import PersistentState


COMPONENTS_DIR = REPO_DIR / "components"
STATIC_DIR = COMPONENTS_DIR / "static"
TEMPLATES_DIR = COMPONENTS_DIR / "templates"
LOGIN_TEMPLATE = APP_DIR / "templates" / "login.html"
AUTH_COOKIE = "seaai_token"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

database = Database(DB_PATH)
database.initialize(settings.admin_password, settings.seaai_ws_url)
persistent_state = PersistentState(settings, database)
seaai_client = SeaAIWebSocketClient(
    settings, persistent_state, database.get_setting("seaai_ws_url", settings.seaai_ws_url)
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await seaai_client.start()
    try:
        yield
    finally:
        await seaai_client.stop()


app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def current_user(request: Request) -> dict[str, Any]:
    token = request.cookies.get(AUTH_COOKIE, "")
    payload = decode_token(token, settings.jwt_secret)
    if payload is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = int(payload.get("sub", 0))
    user = database.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return dict(user)


def admin_user(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def redirect_if_unauthenticated(request: Request) -> dict[str, Any] | RedirectResponse:
    try:
        return current_user(request)
    except HTTPException:
        return RedirectResponse("/login", status_code=303)


@app.get("/login", include_in_schema=False)
async def login_page(request: Request) -> Response:
    try:
        current_user(request)
    except HTTPException:
        return FileResponse(LOGIN_TEMPLATE)
    return RedirectResponse("/", status_code=303)


@app.post("/api/login")
async def login(request: Request) -> dict[str, Any]:
    payload = await request.json()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    user = database.get_user_by_username(username)
    if user is None or not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_token(
        {"sub": str(user["id"]), "username": user["username"], "role": user["role"]},
        settings.jwt_secret,
        settings.jwt_expiry_seconds,
    )
    response = {"ok": True, "user": _public_user(dict(user))}
    request.state.response_cookie = token
    return response


@app.middleware("http")
async def auth_cookie_middleware(request: Request, call_next):
    response = await call_next(request)
    token = getattr(request.state, "response_cookie", None)
    if token:
        response.set_cookie(
            AUTH_COOKIE,
            token,
            httponly=True,
            samesite="lax",
            max_age=settings.jwt_expiry_seconds,
        )
    return response


@app.post("/api/logout")
async def logout() -> Response:
    response = Response(status_code=204)
    response.delete_cookie(AUTH_COOKIE)
    return response


@app.get("/", include_in_schema=False)
async def index(request: Request) -> Response:
    user_or_redirect = redirect_if_unauthenticated(request)
    if isinstance(user_or_redirect, RedirectResponse):
        return user_or_redirect
    return FileResponse(TEMPLATES_DIR / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> FileResponse:
    return FileResponse(STATIC_DIR / "assets" / "favicon.jpg", media_type="image/jpeg")


@app.get("/health")
async def health() -> dict[str, Any]:
    snapshot = await persistent_state.build_snapshot(limit=1)
    return {"ok": True, "status": snapshot["status"], "alertCount": snapshot["alertsTotal"]}


@app.get("/api/session")
async def session(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {
        "mode": "full",
        "user": _public_user(user),
        "canManageUsers": user["role"] == "admin",
        "canConfigureWebsocket": user["role"] == "admin",
        "canDemo": False,
        "canClear": False,
    }


@app.get("/api/state")
async def get_state(_: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    snapshot = await persistent_state.build_snapshot()
    return _with_viewer_permissions(snapshot, _)


@app.get("/api/alerts")
async def list_alerts(
    offset: int = 0,
    limit: int | None = None,
    _: dict[str, Any] = Depends(current_user),
) -> dict[str, Any]:
    page_limit = max(1, min(limit or settings.alert_page_size, 100))
    return await persistent_state.list_alerts(page_limit, max(0, offset))


@app.get("/api/config/upstream-websocket")
async def get_upstream_websocket_config(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    return {"url": seaai_client.get_ws_url(), "editable": user["role"] == "admin"}


@app.post("/api/config/upstream-websocket")
async def set_upstream_websocket_config(
    request: Request, _: dict[str, Any] = Depends(admin_user)
) -> dict[str, str]:
    payload = await request.json()
    raw_url = payload.get("url", "") if isinstance(payload, dict) else ""
    if not isinstance(raw_url, str):
        raise HTTPException(status_code=400, detail="url must be a string")
    url = await seaai_client.set_ws_url(raw_url)
    database.set_setting("seaai_ws_url", url)
    return {"url": url}


@app.get("/api/admin/users")
async def list_users(_: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    return {"users": database.list_users()}


@app.post("/api/admin/users")
async def create_user(request: Request, _: dict[str, Any] = Depends(admin_user)) -> dict[str, Any]:
    payload = await request.json()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if len(username) < 3 or len(password) < 8:
        raise HTTPException(status_code=400, detail="Username must be 3+ chars and password 8+ chars")
    try:
        user = database.create_user(username, password, "user")
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="Username already exists") from exc
    return {"user": user}


@app.delete("/api/admin/users/{user_id}")
async def delete_user(user_id: int, _: dict[str, Any] = Depends(admin_user)) -> dict[str, bool]:
    deleted = database.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=400, detail="User cannot be deleted")
    return {"deleted": True}


@app.get("/api/snapshots/{group_id}/{kind}")
async def get_snapshot(group_id: str, kind: str, _: dict[str, Any] = Depends(current_user)) -> Response:
    asset = await persistent_state.get_snapshot_asset(group_id, kind)
    if asset is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return Response(content=asset.content, media_type=asset.mime_type)


@app.websocket("/ws/ui")
async def ui_socket(websocket: WebSocket) -> None:
    token = websocket.cookies.get(AUTH_COOKIE, "")
    if decode_token(token, settings.jwt_secret) is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    queue = await persistent_state.register_subscriber()
    try:
        while True:
            snapshot = await queue.get()
            await websocket.send_json(snapshot)
    except WebSocketDisconnect:
        pass
    finally:
        await persistent_state.unregister_subscriber(queue)


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


def _with_viewer_permissions(snapshot: dict[str, Any], user: dict[str, Any]) -> dict[str, Any]:
    snapshot["viewer"] = {
        **snapshot.get("viewer", {}),
        "mode": "full",
        "role": user["role"],
        "canDemo": False,
        "canClear": False,
        "canConfigureWebsocket": user["role"] == "admin",
        "canManageUsers": user["role"] == "admin",
    }
    return snapshot


if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port)
