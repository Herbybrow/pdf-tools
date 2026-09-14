import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.engines import engine_status
from app.core.middleware import MaxBodySizeMiddleware
from app.core.pdf_crypto import EncryptedPdfError
from app.core.scan_sessions import scan_sessions
from app.core.tempfiles import cleanup_stale_temp
from app.routers import convert_from, convert_to, edit, optimize, organize, security, workflow

logging.basicConfig(level=logging.INFO)

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler.add_job(
        cleanup_stale_temp,
        "interval",
        minutes=settings.cleanup_interval_minutes,
        id="cleanup_stale_temp",
    )
    scheduler.add_job(
        scan_sessions.sweep_stale,
        "interval",
        minutes=settings.cleanup_interval_minutes,
        id="sweep_stale_scan_sessions",
    )
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="NSSF PDF Tools API",
    description="Self-hosted backend engine for NSSF's internal PDF processing suite.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(MaxBodySizeMiddleware, max_bytes=settings.max_upload_mb * 1024 * 1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(EncryptedPdfError)
async def encrypted_pdf_handler(_: Request, exc: EncryptedPdfError):
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc), "encrypted": True, "wrongPassword": exc.wrong_password, "filename": exc.filename},
    )


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "NSSF PDF Tools backend is active",
        "engines": engine_status(),
    }


app.include_router(organize.router, prefix="/api/v1/organize", tags=["organize"])
app.include_router(optimize.router, prefix="/api/v1/optimize", tags=["optimize"])
app.include_router(convert_to.router, prefix="/api/v1/convert", tags=["convert-to"])
app.include_router(convert_from.router, prefix="/api/v1/convert", tags=["convert-from"])
app.include_router(edit.router, prefix="/api/v1/edit", tags=["edit"])
app.include_router(security.router, prefix="/api/v1/security", tags=["security"])
app.include_router(workflow.router, prefix="/api/v1/workflow", tags=["workflow"])
