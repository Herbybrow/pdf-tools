import glob
import shutil
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException

from app.core.config import settings

# Standard OS install locations (not machine/user-specific) checked only as a last resort,
# after an explicit NSSF_*_PATH env var and the system PATH. winget-installed binaries
# frequently aren't on PATH for the process FastAPI runs in, so shutil.which() alone
# isn't enough on Windows.
_WINDOWS_FALLBACKS: dict[str, list[str]] = {
    "soffice": [
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ],
    "tesseract": [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    ],
    "gswin64c": [
        r"C:\Program Files\gs\gs*\bin\gswin64c.exe",
    ],
    "gswin32c": [
        r"C:\Program Files (x86)\gs\gs*\bin\gswin32c.exe",
    ],
}


@lru_cache(maxsize=None)
def find_engine(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    for pattern in _WINDOWS_FALLBACKS.get(name, []):
        matches = sorted(glob.glob(pattern), reverse=True)
        if matches:
            return matches[0]
    return None


def _resolve(explicit_path: str | None, *engine_names: str) -> str | None:
    if explicit_path and Path(explicit_path).is_file():
        return explicit_path
    for name in engine_names:
        found = find_engine(name)
        if found:
            return found
    return None


def find_ghostscript() -> str | None:
    return _resolve(settings.ghostscript_path, "gs", "gswin64c", "gswin32c")


def find_libreoffice() -> str | None:
    return _resolve(settings.libreoffice_path, "soffice")


def find_tesseract() -> str | None:
    return _resolve(settings.tesseract_path, "tesseract")


def engine_status() -> dict[str, bool]:
    return {
        "libreoffice": find_libreoffice() is not None,
        "tesseract": find_tesseract() is not None,
        "ghostscript": find_ghostscript() is not None,
    }


_RESOLVERS = {
    "libreoffice": find_libreoffice,
    "tesseract": find_tesseract,
    "ghostscript": find_ghostscript,
}

_INSTALL_HINT = {
    "libreoffice": "winget install --id TheDocumentFoundation.LibreOffice -e",
    "tesseract": "winget install --id UB-Mannheim.TesseractOCR -e",
    "ghostscript": "winget install --id ArtifexSoftware.GhostScript -e",
}


def require_engine(kind: str):
    """FastAPI dependency: resolves the engine's executable path or raises a clear 503."""

    def _dependency() -> str:
        resolved = _RESOLVERS[kind]()
        if not resolved:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"{kind.capitalize()} is not installed or could not be detected on this machine. "
                    f"Run backend/scripts/install-deps.ps1, set NSSF_{kind.upper()}_PATH, or manually: "
                    f"`{_INSTALL_HINT[kind]}`, then restart the backend server."
                ),
            )
        return resolved

    return _dependency
