import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.pdf_crypto import decrypt_if_needed
from app.core.responses import file_response
from app.core.validation import validate_pdf_upload
from app.services import edit_service

router = APIRouter()


@router.post("/rotate")
async def rotate(
    file: UploadFile = File(...),
    angle: int = Form(90),
    pages: str | None = Form(None),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(edit_service.rotate_pdf, data, angle, pages or None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to rotate PDF: {exc}") from exc
    return file_response(output, "rotated.pdf", "application/pdf")


@router.post("/crop")
async def crop(
    file: UploadFile = File(...),
    top: float = Form(0),
    bottom: float = Form(0),
    left: float = Form(0),
    right: float = Form(0),
    pages: str | None = Form(None),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(edit_service.crop_pdf, data, top, bottom, left, right, pages or None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to crop PDF: {exc}") from exc
    return file_response(output, "cropped.pdf", "application/pdf")


@router.post("/add-page-numbers")
async def add_page_numbers(
    file: UploadFile = File(...),
    format: str = Form("Page {page} of {total}"),
    position: str = Form("bottom-center"),
    fontSize: float = Form(11),
    color: str = Form("#000000"),
    startNumber: int = Form(1),
    pages: str | None = Form(None),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(
            edit_service.add_page_numbers, data, format, position, fontSize, color, startNumber, pages or None
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add page numbers: {exc}") from exc
    return file_response(output, "numbered.pdf", "application/pdf")


@router.post("/watermark")
async def watermark(
    file: UploadFile = File(...),
    mode: str = Form("text"),
    text: str = Form(""),
    opacity: float = Form(30),
    rotation: float = Form(45),
    position: str = Form("center"),
    layer: str = Form("over"),
    pages: str | None = Form(None),
    watermarkImage: UploadFile | None = File(None),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    image_bytes = await watermarkImage.read() if watermarkImage is not None else None
    try:
        output = await run_in_threadpool(
            edit_service.watermark_pdf,
            data,
            mode,
            text,
            opacity / 100,
            rotation,
            position,
            layer,
            pages or None,
            image_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to add watermark: {exc}") from exc
    return file_response(output, "watermarked.pdf", "application/pdf")


@router.post("/forms/detect")
async def detect_form_fields(file: UploadFile = File(...), password: str | None = Form(None)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        fields = await run_in_threadpool(edit_service.detect_form_fields, data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to read form fields: {exc}") from exc
    return {"fields": fields}


@router.post("/forms/fill")
async def fill_form(
    file: UploadFile = File(...),
    values: str = Form(...),
    flatten: bool = Form(False),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        parsed_values = json.loads(values)
        output = await run_in_threadpool(edit_service.fill_form_fields, data, parsed_values, flatten)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid values JSON: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fill form: {exc}") from exc
    return file_response(output, "filled.pdf", "application/pdf")
