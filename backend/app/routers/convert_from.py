from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.engines import require_engine
from app.core.pdf_crypto import decrypt_if_needed
from app.core.responses import file_response, zip_response
from app.core.validation import validate_pdf_upload
from app.services import convert_from_service

router = APIRouter()

_WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.post("/pdf-to-word")
async def pdf_to_word_endpoint(
    file: UploadFile = File(...), ocrScanned: bool = Form(False), password: str | None = Form(None)
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(convert_from_service.pdf_to_word, data, ocrScanned)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to Word: {exc}") from exc
    return file_response(output, "converted.docx", _WORD_MIME)


@router.post("/pdf-to-powerpoint")
async def pdf_to_powerpoint_endpoint(file: UploadFile = File(...), password: str | None = Form(None)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(convert_from_service.pdf_to_powerpoint, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to PowerPoint: {exc}") from exc
    return file_response(output, "converted.pptx", _PPTX_MIME)


@router.post("/pdf-to-excel")
async def pdf_to_excel_endpoint(
    file: UploadFile = File(...),
    pages: str | None = Form(None),
    ocrScanned: bool = Form(False),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(convert_from_service.pdf_to_excel, data, pages or None, ocrScanned)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to Excel: {exc}") from exc
    return file_response(output, "converted.xlsx", _XLSX_MIME)


@router.post("/pdf-to-jpg")
async def pdf_to_jpg_endpoint(
    file: UploadFile = File(...),
    format: str = Form("jpg"),
    dpi: int = Form(150),
    extractEmbeddedImages: bool = Form(False),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        files = await run_in_threadpool(convert_from_service.pdf_to_images, data, format, dpi, extractEmbeddedImages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to images: {exc}") from exc
    return zip_response(files, "pdf_images.zip")


@router.post("/pdf-to-pdfa")
async def pdf_to_pdfa_endpoint(
    file: UploadFile = File(...),
    standard: str = Form("pdfa-2b"),
    password: str | None = Form(None),
    _gs: str = Depends(require_engine("ghostscript")),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(convert_from_service.pdf_to_pdfa, data, standard)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to PDF/A: {exc}") from exc
    return file_response(output, "archival.pdf", "application/pdf")


@router.post("/pdf-to-markdown")
async def pdf_to_markdown_endpoint(file: UploadFile = File(...), password: str | None = Form(None)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(convert_from_service.pdf_to_markdown, data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PDF to Markdown: {exc}") from exc
    return file_response(output, "converted.md", "text/markdown")
