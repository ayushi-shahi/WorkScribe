"""
Logging configuration.

The app called logging.getLogger(...) in several modules but never configured
logging, so warnings and handled errors (failed emails, dropped WebSocket
sends, Redis degradation) went nowhere. This wires a single stdout handler,
which is what Render/Docker collect.
"""

from __future__ import annotations

import logging
import sys

from app.core.config import settings

_configured = False


def configure_logging() -> None:
    """Install a stdout log handler once, at process start."""
    global _configured
    if _configured:
        return

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.LOG_LEVEL)

    # SQLAlchemy's echo=True installs its own handler on this logger. Letting
    # it also propagate to the root handler prints every statement twice, which
    # doubles log volume for no benefit.
    sa_logger = logging.getLogger("sqlalchemy.engine")
    sa_logger.setLevel(logging.INFO if settings.DEBUG else logging.WARNING)
    sa_logger.propagate = not settings.DEBUG

    _configured = True
