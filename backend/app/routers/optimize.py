from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.engines import require_engine
from app.core.pdf_crypto import decrypt_if_needed
from app.core.responses import file_response
from app.core.validation import validate_pdf_upload
from app.services import optimize_service

router = APIRouter()


@router.post("/compress")
async def compress(
    file: UploadFile = File(...),
    level: str = Form("ebook"),
    password: str | None = Form(None),
    _gs: str = Depends(require_engine("ghostscript")),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(optimize_service.compress_pdf, data, level)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compress PDF: {exc}") from exc
    return file_response(output, "compressed.pdf", "application/pdf")


@router.post("/repair")
async def repair(
    file: UploadFile = File(...),
    password: str | None = Form(None),
    _gs: str = Depends(require_engine("ghostscript")),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(optimize_service.repair_pdf, data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to repair PDF: {exc}") from exc
    return file_response(output, "repaired.pdf", "application/pdf")


@router.post("/ocr")
async def ocr(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    password: str | None = Form(None),
    _tesseract: str = Depends(require_engine("tesseract")),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(optimize_service.ocr_pdf, data, language)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to run OCR: {exc}") from exc
    return file_response(output, "ocr_searchable.pdf", "application/pdf")
