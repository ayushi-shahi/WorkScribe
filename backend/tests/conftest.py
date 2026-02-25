"""
Pytest configuration for WorkScribe backend tests.
"""

import pytest


def pytest_configure(config):
    """Configure pytest-asyncio mode."""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async"
    )