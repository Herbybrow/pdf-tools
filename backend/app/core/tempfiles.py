import logging
import shutil
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core.config import settings

logger = logging.getLogger("nssf.tempfiles")


@contextmanager
def temp_workspace() -> Iterator[Path]:
    """Isolated per-request scratch directory, always removed on exit (success or error)."""
    workspace = settings.temp_root / uuid.uuid4().hex
    workspace.mkdir(parents=True, exist_ok=True)
    try:
        yield workspace
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def cleanup_stale_temp() -> int:
    """Safety-net sweep for anything a crashed/aborted request left behind.

    Runs on an APScheduler interval (see app.main lifespan) rather than per-request,
    since the per-request `temp_workspace` context manager already cleans up the
    common path.
    """
    if not settings.temp_root.exists():
        return 0
    cutoff = time.time() - settings.temp_max_age_minutes * 60
    removed = 0
    for child in settings.temp_root.iterdir():
        try:
            if child.stat().st_mtime < cutoff:
                if child.is_dir():
                    shutil.rmtree(child, ignore_errors=True)
                else:
                    child.unlink(missing_ok=True)
                removed += 1
        except FileNotFoundError:
            continue
    if removed:
        logger.info("cleanup_stale_temp removed %d stale item(s)", removed)
    return removed
