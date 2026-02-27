"""
WebSocket endpoint.
Real-time notification delivery to authenticated users.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_token
from app.core.websocket import manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
) -> None:
    """
    WebSocket endpoint authenticated via JWT query param.
    Connect: WS /api/v1/ws?token={access_token}

    On connect:
    - Decode and validate JWT
    - Register connection in ConnectionManager
    - Keep alive until client disconnects

    On disconnect:
    - Unregister from ConnectionManager
    """
    # Validate token before accepting connection
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    await manager.connect(user_id=user_id, websocket=websocket)

    try:
        # Send confirmation on connect
        await websocket.send_json({
            "type": "connected",
            "user_id": user_id,
        })

        # Keep connection alive — wait for client messages or disconnect
        while True:
            # We don't process incoming messages in MVP
            # but we must await to detect disconnects
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as exc:
        logger.warning("WebSocket error for user_id=%s: %s", user_id, exc)
        manager.disconnect(user_id)