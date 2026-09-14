import subprocess
from pathlib import Path

from app.core.config import settings


class CliError(RuntimeError):
    def __init__(self, message: str, returncode: int, stdout: str, stderr: str):
        super().__init__(message)
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def run_cli(args: list[str], cwd: Path | None = None, timeout: int | None = None) -> subprocess.CompletedProcess:
    """Synchronous subprocess runner.

    Args are passed as a list (never a shell string), so Windows paths containing
    spaces (e.g. "C:\\Program Files\\LibreOffice\\...") never need manual quoting.

    Call this via starlette.concurrency.run_in_threadpool from async route handlers
    so a long-running conversion doesn't block the Uvicorn event loop for other
    requests. `timeout` defaults to NSSF_ENGINE_TIMEOUT_SECONDS (300s) so every engine
    call has a bound -- a hung/oversized job fails cleanly with a clear message instead
    of hanging the request indefinitely.
    """
    effective_timeout = timeout if timeout is not None else settings.engine_timeout_seconds
    try:
        result = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=effective_timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(
            f"{Path(args[0]).name} did not finish within {effective_timeout}s. "
            "The file may be too large or complex -- try a smaller file or a lower quality/DPI setting."
        ) from exc
    if result.returncode != 0:
        raise CliError(
            f"Command failed ({Path(args[0]).name}): {result.stderr.strip() or result.stdout.strip() or 'no output'}",
            result.returncode,
            result.stdout,
            result.stderr,
        )
    return result
