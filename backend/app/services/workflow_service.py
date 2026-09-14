from typing import Callable

from app.services import convert_from_service, edit_service, optimize_service, organize_service, security_service

StepHandler = Callable[[bytes, dict], bytes]

STEP_HANDLERS: dict[str, StepHandler] = {
    "compress": lambda data, p: optimize_service.compress_pdf(data, p.get("level", "ebook")),
    "repair": lambda data, p: optimize_service.repair_pdf(data),
    "ocr": lambda data, p: optimize_service.ocr_pdf(data, p.get("language", "eng")),
    "rotate": lambda data, p: edit_service.rotate_pdf(data, int(p.get("angle", 90)), p.get("pages")),
    "crop": lambda data, p: edit_service.crop_pdf(data, p.get("top", 0), p.get("bottom", 0), p.get("left", 0), p.get("right", 0), p.get("pages")),
    "add-page-numbers": lambda data, p: edit_service.add_page_numbers(
        data, p.get("format", "Page {page} of {total}"), p.get("position", "bottom-center"), p.get("fontSize", 11), p.get("color", "#000000"), p.get("startNumber", 1), p.get("pages")
    ),
    "watermark": lambda data, p: edit_service.watermark_pdf(
        data, "text", p.get("text", "WATERMARK"), p.get("opacity", 0.3), p.get("rotation", 45), p.get("position", "center"), p.get("layer", "over"), p.get("pages")
    ),
    "remove-pages": lambda data, p: organize_service.remove_pages(data, p.get("pages", "")),
    "extract-pages": lambda data, p: organize_service.extract_pages(data, p.get("pages", "")),
    "protect": lambda data, p: security_service.protect_pdf(
        data, p.get("userPassword", ""), p.get("ownerPassword", ""), p.get("encryption", "aes256"), p.get("allowPrinting", True), p.get("allowCopying", False)
    ),
    "convert-pdfa": lambda data, p: convert_from_service.pdf_to_pdfa(data, p.get("standard", "pdfa-2b")),
}


def execute_pipeline(initial_files: list[bytes], steps: list[dict]) -> bytes:
    """Chains PDF operations entirely in-memory: the caller uploads once and downloads
    once, with every intermediate transformation happening server-side in between --
    no repeated round-trips to the client between steps.

    A leading {"step": "merge"} consumes all uploaded files into one document; otherwise
    only the first uploaded file is used as the pipeline's starting point.
    """
    if not steps:
        raise ValueError("Pipeline has no steps.")

    remaining = steps
    if steps[0].get("step") == "merge":
        if len(initial_files) < 2:
            raise ValueError("The 'merge' step requires at least 2 uploaded files.")
        # An explicit page layout (from the pipeline builder's drag-to-arrange grid) takes
        # a specific page order/rotation per source file, mirroring Organize/Merge PDF's
        # own /organize/compose endpoint; with no layout, every page of every file is
        # kept in upload order -- the original, simpler default behavior.
        layout = (steps[0].get("params") or {}).get("layout")
        if layout:
            sources = {str(i): data for i, data in enumerate(initial_files)}
            current = organize_service.compose_pages(sources, layout)
        else:
            current = organize_service.merge_pdfs(initial_files)
        remaining = steps[1:]
    else:
        if not initial_files:
            raise ValueError("At least one file must be uploaded.")
        current = initial_files[0]

    for step in remaining:
        step_name = step.get("step")
        handler = STEP_HANDLERS.get(step_name)
        if not handler:
            raise ValueError(f"Unknown pipeline step: '{step_name}'.")
        try:
            current = handler(current, step.get("params", {}) or {})
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError(f"Step '{step_name}' failed: {exc}") from exc

    return current
