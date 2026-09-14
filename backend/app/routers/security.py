import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.pdf_crypto import decrypt_if_needed
from app.core.responses import file_response
from app.core.validation import validate_pdf_upload
from app.services import security_service

router = APIRouter()


@router.post("/protect")
async def protect(
    file: UploadFile = File(...),
    userPassword: str = Form(...),
    ownerPassword: str = Form(""),
    encryption: str = Form("aes256"),
    allowPrinting: bool = Form(True),
    allowCopying: bool = Form(False),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    try:
        output = await run_in_threadpool(
            security_service.protect_pdf, data, userPassword, ownerPassword, encryption, allowPrinting, allowCopying
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to protect PDF: {exc}") from exc
    # sanitize=False: metadata stripping re-serializes the PDF, which would strip the
    # encryption this endpoint just applied.
    return file_response(output, "protected.pdf", "application/pdf", sanitize=False)


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...), password: str = Form(...)):
    """Returns plain decrypted PDF bytes for client-side tools (the canvas editor) that
    can't handle encrypted PDFs themselves -- e.g. pdf-lib has no encrypted-PDF support.
    Nothing is retained; this is the same in-memory decrypt_if_needed used everywhere
    else, just exposed directly for a one-time upfront decrypt."""
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    output = decrypt_if_needed(data, password, file.filename)  # not wrapped: lets EncryptedPdfError
    # (e.g. wrong password) reach the global exception handler instead of becoming a generic 500
    return file_response(output, "decrypted.pdf", "application/pdf")


@router.post("/unlock")
async def unlock(file: UploadFile = File(...), password: str = Form(...)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    try:
        output = await run_in_threadpool(security_service.unlock_pdf, data, password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to unlock PDF: {exc}") from exc
    return file_response(output, "unlocked.pdf", "application/pdf")


@router.post("/redact")
async def redact(file: UploadFile = File(...), regions: str = Form(...), password: str | None = Form(None)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        parsed_regions = json.loads(regions)
        output = await run_in_threadpool(security_service.redact_pdf, data, parsed_regions)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid regions JSON: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to redact PDF: {exc}") from exc
    return file_response(output, "redacted.pdf", "application/pdf")


@router.post("/compare")
async def compare(fileA: UploadFile = File(...), fileB: UploadFile = File(...), password: str | None = Form(None)):
    data_a = await fileA.read()
    validate_pdf_upload(data_a, fileA.filename)
    data_a = decrypt_if_needed(data_a, password, fileA.filename)
    data_b = await fileB.read()
    validate_pdf_upload(data_b, fileB.filename)
    data_b = decrypt_if_needed(data_b, password, fileB.filename)
    try:
        result = await run_in_threadpool(security_service.compare_pdfs, data_a, data_b)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compare PDFs: {exc}") from exc
    return result
