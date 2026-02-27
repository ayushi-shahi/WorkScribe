"""
WebSocket connection manager.
In-memory registry of active user connections — single server only (MVP).
"""

from __future__ import annotations

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Maps user_id (str) → active WebSocket.
    One connection per user. New connection replaces old.
    """

    def __init__(self) -> None:
        self._active: dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._active[user_id] = websocket
        logger.info("WebSocket connected: user_id=%s", user_id)

    def disconnect(self, user_id: str) -> None:
        self._active.pop(user_id, None)
        logger.info("WebSocket disconnected: user_id=%s", user_id)

    async def send_to_user(self, user_id: str, data: dict) -> None:
        """
        Send JSON payload to a connected user.
        Silently removes stale connection on any send error.
        """
        websocket = self._active.get(user_id)
        if websocket is None:
            return
        try:
            await websocket.send_json(data)
        except Exception as exc:
            logger.warning(
                "Failed to send to user_id=%s, removing connection: %s",
                user_id,
                exc,
            )
            self.disconnect(user_id)

    @property
    def connected_user_ids(self) -> list[str]:
        return list(self._active.keys())


# Module-level singleton — imported by routers and Celery tasks
manager = ConnectionManager()