from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from config import settings
from models import parse_seaai_message
from seaai_client import SeaAIWebSocketClient
from state import MemoryState


APP_DIR = Path(__file__).resolve().parent
COMPONENTS_DIR = APP_DIR.parent / "components"
STATIC_DIR = COMPONENTS_DIR / "static"
TEMPLATES_DIR = COMPONENTS_DIR / "templates"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

memory_state = MemoryState(settings)
seaai_client = SeaAIWebSocketClient(settings, memory_state)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await seaai_client.start()
    try:
        yield
    finally:
        await seaai_client.stop()


app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(TEMPLATES_DIR / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> FileResponse:
    return FileResponse(STATIC_DIR / "assets" / "favicon.jpg", media_type="image/jpeg")


@app.get("/health")
async def health() -> dict:
    snapshot = await memory_state.build_snapshot()
    return {
        "ok": True,
        "status": snapshot["status"],
        "alertCount": len(snapshot["alerts"]),
    }


@app.get("/api/state")
async def get_state() -> dict:
    return await memory_state.build_snapshot()


@app.get("/api/config/upstream-websocket")
async def get_upstream_websocket_config() -> dict:
    url = seaai_client.get_ws_url()
    logging.getLogger(__name__).info("Read upstream websocket URL config: %s", url)
    return {"url": url}


@app.post("/api/config/upstream-websocket")
async def set_upstream_websocket_config(request: Request) -> dict:
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid request body")

    raw_url = payload.get("url", "")
    if not isinstance(raw_url, str):
        raise HTTPException(status_code=400, detail="url must be a string")

    logging.getLogger(__name__).info("Received upstream websocket URL update request: %s", raw_url)
    url = await seaai_client.set_ws_url(raw_url)
    logging.getLogger(__name__).info("Applied upstream websocket URL update: %s", url)
    return {"url": url}


@app.post("/api/alerts/clear")
async def clear_alerts() -> dict:
    await memory_state.clear_panel_alerts()
    return {"cleared": True}


@app.get("/api/snapshots/{group_id}/{kind}")
async def get_snapshot(group_id: str, kind: str) -> Response:
    asset = await memory_state.get_snapshot_asset(group_id, kind)
    if asset is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return Response(content=asset.content, media_type=asset.mime_type)


@app.post("/api/mock-alert")
async def mock_alert(request: Request) -> dict:
    payload = (await request.body()).decode("utf-8", errors="ignore")
    if not payload.strip():
        raise HTTPException(status_code=400, detail="Request body is empty")
    try:
        parsed = parse_seaai_message(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    accepted = await memory_state.ingest_message(parsed)
    return {"accepted": accepted}


@app.websocket("/ws/ui")
async def ui_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    queue = await memory_state.register_subscriber()
    try:
        while True:
            snapshot = await queue.get()
            await websocket.send_json(snapshot)
    except WebSocketDisconnect:
        pass
    finally:
        await memory_state.unregister_subscriber(queue)


if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port)
