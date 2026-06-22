from __future__ import annotations

import asyncio
import contextlib
import logging
import re

from config import Settings
from models import parse_seaai_message
from state import MemoryState

try:
    from websockets import connect
except ImportError:  # pragma: no cover - dependency installed via requirements.txt
    connect = None


logger = logging.getLogger(__name__)
T2_LOG_RE = re.compile(r'("T2"\s*:\s*")(.*?)(")', re.DOTALL)


def _redact_large_payloads(payload: str) -> str:
    return T2_LOG_RE.sub(r'\1<base64>\3', payload)


def _normalize_ws_url(ws_url: str) -> str:
    normalized = ws_url.strip()
    if not normalized:
        return ""
    if normalized.startswith("://"):
        return f"ws{normalized}"
    if normalized.startswith("//"):
        return f"ws:{normalized}"
    if "://" not in normalized:
        return f"ws://{normalized}"
    return normalized


class SeaAIWebSocketClient:
    def __init__(self, settings: Settings, state: MemoryState) -> None:
        self.settings = settings
        self.state = state
        self._task: asyncio.Task[None] | None = None
        self._ws_url = _normalize_ws_url(settings.seaai_ws_url)
        self._active_socket = None
        self._reconnect_event = asyncio.Event()

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run_forever())

    async def stop(self) -> None:
        if self._task is None:
            return

        if self._active_socket is not None:
            await self._active_socket.close()
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        self._active_socket = None

    def get_ws_url(self) -> str:
        return self._ws_url

    async def set_ws_url(self, ws_url: str) -> str:
        normalized = _normalize_ws_url(ws_url)
        changed = normalized != self._ws_url
        self._ws_url = normalized

        logger.info("Updated upstream websocket URL to: %s", normalized or "<empty>")

        if not normalized:
            await self.state.set_connection_status(False, "SEAAI_WS_URL is not configured")

        self._reconnect_event.set()

        if changed and self._active_socket is not None:
            logger.info("Reconnecting upstream websocket with updated URL: %s", normalized)
            await self._active_socket.close()

        return normalized

    async def _wait_for_retry(self, delay_seconds: int) -> None:
        try:
            await asyncio.wait_for(self._reconnect_event.wait(), timeout=delay_seconds)
        except asyncio.TimeoutError:
            return
        finally:
            self._reconnect_event.clear()

    async def _run_forever(self) -> None:
        if connect is None:
            await self.state.set_connection_status(
                False, "Missing dependency: websockets"
            )
            return

        reconnect_delay = max(1, self.settings.reconnect_delay_seconds)

        while True:
            if not self._ws_url:
                await self.state.set_connection_status(
                    False, "SEAAI_WS_URL is not configured"
                )
                logger.info("Upstream websocket URL is empty; waiting for update")
                await self._wait_for_retry(reconnect_delay)
                continue

            try:
                logger.info("Connecting to upstream websocket: %s", self._ws_url)
                async with connect(
                    self._ws_url, ping_interval=20, ping_timeout=20
                ) as socket:
                    self._active_socket = socket
                    logger.info("Upstream websocket connected")
                    await self.state.set_connection_status(True)

                    async for raw_message in socket:
                        payload = (
                            raw_message.decode("utf-8", errors="ignore")
                            if isinstance(raw_message, bytes)
                            else str(raw_message)
                        )
                        safe_payload = _redact_large_payloads(payload)
                        logger.info("Upstream websocket message: %s", safe_payload)
                        try:
                            parsed = parse_seaai_message(payload)
                        except ValueError as exc:
                            logger.warning(
                                "Upstream websocket parse failure: %s | payload=%s",
                                exc,
                                safe_payload,
                            )
                            await self.state.set_connection_status(True, str(exc))
                            continue
                        await self.state.ingest_message(parsed)
            except asyncio.CancelledError:
                logger.info("Upstream websocket task cancelled")
                raise
            except Exception as exc:
                logger.warning(
                    "Upstream websocket connection failed for %s: %s",
                    self._ws_url,
                    exc,
                )
                await self.state.set_connection_status(False, str(exc))
                await self._wait_for_retry(reconnect_delay)
            else:
                logger.warning("Upstream websocket disconnected")
                await self.state.set_connection_status(
                    False, "Upstream websocket disconnected"
                )
                await self._wait_for_retry(reconnect_delay)
            finally:
                self._active_socket = None
