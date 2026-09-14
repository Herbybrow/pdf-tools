import os
import tempfile
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


_DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"


class Settings:
    # Local-only by default: both localhost and 127.0.0.1 spellings of the dev frontend.
    # Override via CORS_ORIGINS (comma-separated) -- e.g. to append a future Vercel URL --
    # rather than editing code, per the earlier decision to keep this deployment-configurable.
    cors_origins: list[str] = [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
        if origin.strip()
    ]
    host: str = os.environ.get("NSSF_HOST", "127.0.0.1")
    port: int = int(os.environ.get("NSSF_PORT", "8000"))
    temp_root: Path = Path(os.environ.get("NSSF_TEMP_DIR", str(BACKEND_ROOT / "tmp" / "nssf_proc")))
    temp_max_age_minutes: int = int(os.environ.get("NSSF_TEMP_MAX_AGE_MINUTES", "15"))
    cleanup_interval_minutes: int = int(os.environ.get("NSSF_CLEANUP_INTERVAL_MINUTES", "15"))
    max_upload_mb: int = int(os.environ.get("NSSF_MAX_UPLOAD_MB", "200"))
    max_pages: int = int(os.environ.get("NSSF_MAX_PAGES", "2000"))
    engine_timeout_seconds: int = int(os.environ.get("NSSF_ENGINE_TIMEOUT_SECONDS", "300"))
    # Optional explicit engine paths -- checked before PATH and before the Windows
    # Program Files fallback locations, so a non-standard install never needs a code change.
    libreoffice_path: str | None = os.environ.get("NSSF_LIBREOFFICE_PATH")
    tesseract_path: str | None = os.environ.get("NSSF_TESSERACT_PATH")
    ghostscript_path: str | None = os.environ.get("NSSF_GHOSTSCRIPT_PATH")


settings = Settings()
settings.temp_root.mkdir(parents=True, exist_ok=True)

# Redirect this process's default temp directory into settings.temp_root. Ghostscript,
# LibreOffice, Tesseract/ocrmypdf, and Playwright all drop their own internal scratch
# files into the OS temp dir by default (outside anything we track) -- if one of them
# crashes or is SIGKILLed mid-job, those files would otherwise never get cleaned up.
# Redirecting TEMP/TMP (inherited by every subprocess we spawn) and Python's own
# tempfile module means the existing cleanup_stale_temp() sweep, which already watches
# temp_root, catches those stray files too, with no extra tracking logic needed.
# Scoped to this process's environment only -- never touches the user's system-wide
# TEMP/TMP.
os.environ["TEMP"] = str(settings.temp_root)
os.environ["TMP"] = str(settings.temp_root)
tempfile.tempdir = str(settings.temp_root)

# Winget's Tesseract package only ships the `eng` (+ `osd`) language pack, but this app
# also advertises Kiswahili and French OCR (relevant for an NSSF Tanzania audience). Those
# extra .traineddata files live in this project-local directory (fetched by
# scripts/install-deps.ps1, not committed -- see .gitignore) instead of requiring an
# admin-elevated write into the system Tesseract install under Program Files. When
# present, TESSDATA_PREFIX takes priority over Tesseract's own bundled tessdata dir, so
# this must contain every language the app can request, not just the extra ones.
_local_tessdata = BACKEND_ROOT / "tessdata"
if _local_tessdata.is_dir():
    os.environ["TESSDATA_PREFIX"] = str(_local_tessdata)
