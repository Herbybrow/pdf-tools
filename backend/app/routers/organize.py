import base64
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.core.pdf_crypto import decrypt_if_needed
from app.core.responses import file_response, zip_response
from app.core.scan_sessions import scan_sessions
from app.core.validation import validate_pdf_upload
from app.services import organize_service, scan_service

router = APIRouter()


async def _read_all(files: list[UploadFile], password: str | None = None) -> list[bytes]:
    contents = []
    for f in files:
        data = await f.read()
        validate_pdf_upload(data, f.filename)
        contents.append(decrypt_if_needed(data, password, f.filename))
    return contents


@router.post("/merge")
async def merge(files: list[UploadFile] = File(...), password: str | None = Form(None)):
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Please upload at least 2 PDF files to merge.")
    for f in files:
        if not f.filename or not f.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"File {f.filename} is not a valid PDF.")
    contents = await _read_all(files, password)
    try:
        merged = await run_in_threadpool(organize_service.merge_pdfs, contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to merge PDFs: {exc}") from exc
    return file_response(merged, "merged_document.pdf", "application/pdf")


@router.post("/split")
async def split(
    file: UploadFile = File(...),
    mode: str = Form("ranges"),
    ranges: str | None = Form(None),
    interval: int = Form(1),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        if mode == "ranges":
            if not ranges:
                raise ValueError("`ranges` is required for mode=ranges, e.g. '1-3;4-6'.")
            files = await run_in_threadpool(organize_service.split_into_range_groups, data, ranges)
        elif mode == "burst":
            files = await run_in_threadpool(organize_service.split_burst, data)
        elif mode == "interval":
            files = await run_in_threadpool(organize_service.split_interval, data, interval)
        else:
            raise ValueError(f"Unknown split mode: {mode}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to split PDF: {exc}") from exc
    return zip_response(files, "split_pages.zip")


@router.post("/remove-pages")
async def remove_pages_endpoint(file: UploadFile = File(...), pages: str = Form(...), password: str | None = Form(None)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(organize_service.remove_pages, data, pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to remove pages: {exc}") from exc
    return file_response(output, "pages_removed.pdf", "application/pdf")


@router.post("/extract-pages")
async def extract_pages_endpoint(file: UploadFile = File(...), pages: str = Form(...), password: str | None = Form(None)):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        output = await run_in_threadpool(organize_service.extract_pages, data, pages)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to extract pages: {exc}") from exc
    return file_response(output, "extracted_pages.pdf", "application/pdf")


@router.post("/reorder")
async def reorder(
    file: UploadFile = File(...),
    order: str = Form(...),
    rotations: str | None = Form(None),
    password: str | None = Form(None),
):
    data = await file.read()
    validate_pdf_upload(data, file.filename)
    data = decrypt_if_needed(data, password, file.filename)
    try:
        page_order = [int(p.strip()) - 1 for p in order.split(",") if p.strip()]
        rotation_map: dict[int, int] = {}
        if rotations:
            for entry in rotations.split(","):
                entry = entry.strip()
                if not entry:
                    continue
                page_str, degrees_str = entry.split(":")
                rotation_map[int(page_str.strip()) - 1] = int(degrees_str.strip())
        output = await run_in_threadpool(organize_service.reorder_pages, data, page_order, rotation_map)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to reorder pages: {exc}") from exc
    return file_response(output, "reordered.pdf", "application/pdf")


@router.post("/compose")
async def compose(
    files: list[UploadFile] = File(...),
    layout: str = Form(...),
    password: str | None = Form(None),
):
    """Backs both Organize PDF (one document, optionally inserting pages from a second)
    and Merge PDF (an arbitrary number of documents, arranged into one). `files` is
    matched to each layout entry's `source` by position (0, 1, 2, ...) -- the frontend
    decides how many documents that means and what order their pages start in; this
    endpoint doesn't care which tool is calling it."""
    if not files:
        raise HTTPException(status_code=400, detail="At least one PDF file is required.")
    sources: dict[str, bytes] = {}
    for index, upload in enumerate(files):
        raw = await upload.read()
        validate_pdf_upload(raw, upload.filename)
        sources[str(index)] = decrypt_if_needed(raw, password, upload.filename)
    try:
        parsed_layout = json.loads(layout)
        if not isinstance(parsed_layout, list):
            raise ValueError("Layout must be a list of page entries.")
        output = await run_in_threadpool(organize_service.compose_pages, sources, parsed_layout)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid layout JSON: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compose PDF: {exc}") from exc
    return file_response(output, "organized.pdf", "application/pdf")


@router.post("/detect-document-edges")
async def detect_document_edges(image: UploadFile = File(...)):
    data = await image.read()
    try:
        corners = await run_in_threadpool(scan_service.detect_document_corners, data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to detect document edges: {exc}") from exc
    return {"corners": corners}


@router.post("/scan-to-pdf")
async def scan_to_pdf(images: list[UploadFile] = File(...)):
    if not images:
        raise HTTPException(status_code=400, detail="Please capture at least one page.")
    contents = [await f.read() for f in images]  # captured photos, never password-protected PDFs
    try:
        output = await run_in_threadpool(organize_service.assemble_images_to_pdf, contents)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to assemble scanned PDF: {exc}") from exc
    return file_response(output, "scanned_document.pdf", "application/pdf")


@router.websocket("/scan-session/{session_id}/ws")
async def scan_session_ws(websocket: WebSocket, session_id: str):
    """The desktop tab holds this connection open while showing the QR code, and gets
    pushed each photo the phone captures. Nothing the desktop sends over the socket is
    read -- it's a one-way relay from phone to desktop; the socket is only two-way at
    the transport level so the desktop can detect disconnects."""
    await scan_sessions.connect(session_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        scan_sessions.disconnect(session_id, websocket)


@router.post("/scan-session/{session_id}/upload")
async def scan_session_upload(session_id: str, image: UploadFile = File(...)):
    """The phone posts each captured photo here; it's relayed to the desktop's open
    WebSocket connection and never touches disk. `session_id` is a client-generated
    UUID with no server-side registration step -- there's nothing sensitive to guess
    into, since a session holds nothing but a handful of in-flight photo bytes that
    outlive the connection only briefly (see ScanSessionManager's TTL sweep)."""
    data = await image.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Captured photo is too large.")
    data_url = f"data:{image.content_type or 'image/jpeg'};base64,{base64.b64encode(data).decode('ascii')}"
    total_pages = await scan_sessions.broadcast_page_added(session_id, data_url)
    return {"status": "ok", "totalPages": total_pages}
