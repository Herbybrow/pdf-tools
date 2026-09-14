from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.core.engines import require_engine
from app.core.responses import file_response
from app.services import convert_to_service

router = APIRouter()


@router.post("/image-to-pdf")
async def image_to_pdf(
    images: list[UploadFile] = File(...),
    orientation: str = Form("auto"),
    margin: str = Form("small"),
    pageSize: str = Form("a4"),
):
    if not images:
        raise HTTPException(status_code=400, detail="Please upload at least one image.")
    contents = [await f.read() for f in images]
    try:
        output = await run_in_threadpool(convert_to_service.images_to_pdf, contents, orientation, margin, pageSize)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert images to PDF: {exc}") from exc
    return file_response(output, "images.pdf", "application/pdf")


@router.post("/word-to-pdf")
async def word_to_pdf_endpoint(file: UploadFile = File(...), _lo: str = Depends(require_engine("libreoffice"))):
    data = await file.read()
    try:
        output = await run_in_threadpool(convert_to_service.word_to_pdf, data, file.filename or "document.docx")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert Word document: {exc}") from exc
    return file_response(output, "converted.pdf", "application/pdf")


@router.post("/powerpoint-to-pdf")
async def powerpoint_to_pdf_endpoint(file: UploadFile = File(...), _lo: str = Depends(require_engine("libreoffice"))):
    data = await file.read()
    try:
        output = await run_in_threadpool(convert_to_service.powerpoint_to_pdf, data, file.filename or "presentation.pptx")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert PowerPoint file: {exc}") from exc
    return file_response(output, "converted.pdf", "application/pdf")


@router.post("/excel-to-pdf")
async def excel_to_pdf_endpoint(file: UploadFile = File(...), _lo: str = Depends(require_engine("libreoffice"))):
    data = await file.read()
    try:
        output = await run_in_threadpool(convert_to_service.excel_to_pdf, data, file.filename or "spreadsheet.xlsx")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert Excel file: {exc}") from exc
    return file_response(output, "converted.pdf", "application/pdf")


@router.post("/html-to-pdf")
async def html_to_pdf_endpoint(
    inputMode: str = Form("url"),
    url: str | None = Form(None),
    html: str | None = Form(None),
    width: int = Form(1024),
    printBackground: bool = Form(True),
    margin: str = Form("small"),
):
    try:
        if inputMode == "url":
            if not url:
                raise ValueError("A page URL is required.")
            output = await run_in_threadpool(
                convert_to_service.html_to_pdf,
                url=url,
                html=None,
                width=width,
                print_background=printBackground,
                margin=margin,
            )
        else:
            if not html:
                raise ValueError("HTML source is required.")
            output = await run_in_threadpool(
                convert_to_service.html_to_pdf,
                url=None,
                html=html,
                width=width,
                print_background=printBackground,
                margin=margin,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to convert HTML to PDF: {exc}") from exc
    return file_response(output, "webpage.pdf", "application/pdf")
