import io
import threading

import pillow_heif
import pymupdf
from PIL import Image
from playwright.sync_api import sync_playwright

from app.core.config import BACKEND_ROOT
from app.core.engines import find_libreoffice
from app.core.subprocess_utils import run_cli
from app.core.tempfiles import temp_workspace

pillow_heif.register_heif_opener()

# LibreOffice's own startup cost (loading its framework, indexing fonts, initializing a
# user profile) dominates a headless --convert-to call -- measured at ~15s with a fresh
# profile directory each time vs. ~5s reusing one that's already been through that
# one-time setup. A small fixed pool of persistent profile directories gets that reuse
# for concurrent requests too, each protected by its own lock so no two conversions ever
# touch the same profile at once (LibreOffice profiles use their own internal lock file
# and refuse/misbehave under concurrent use, which is exactly what the previous
# fresh-directory-per-call design existed to avoid -- a pool of N independently-locked
# directories keeps that guarantee while still letting each one warm up after its first
# use). When every pool slot is already busy, conversion falls back to a one-off
# temporary profile directory -- slower, but exactly the previous, already-correct
# behavior, so correctness is never traded away for speed.
_LO_PROFILE_POOL_DIR = BACKEND_ROOT / "tmp" / "lo_profile_pool"
_LO_PROFILE_POOL_SIZE = 3
_lo_profile_locks = [threading.Lock() for _ in range(_LO_PROFILE_POOL_SIZE)]


class _PooledProfile:
    def __init__(self):
        self.index: int | None = None

    def __enter__(self) -> str | None:
        for i, lock in enumerate(_lo_profile_locks):
            if lock.acquire(blocking=False):
                self.index = i
                profile_dir = _LO_PROFILE_POOL_DIR / str(i)
                profile_dir.mkdir(parents=True, exist_ok=True)
                return profile_dir.as_posix()
        return None

    def __exit__(self, *_exc):
        if self.index is not None:
            _lo_profile_locks[self.index].release()

_PAGE_SIZES = {
    "a4": (595.28, 841.89),
    "letter": (612.0, 792.0),
}
_MARGINS_PT = {"none": 0, "small": 36, "big": 72}
_MARGIN_CSS = {"none": "0", "small": "0.5in", "big": "1in"}


def images_to_pdf(
    image_bytes_list: list[bytes],
    orientation: str = "auto",
    margin: str = "small",
    page_size: str = "a4",
) -> bytes:
    margin_pt = _MARGINS_PT.get(margin, 36)
    result = pymupdf.open()
    for img_bytes in image_bytes_list:
        with Image.open(io.BytesIO(img_bytes)) as pil_img:
            pil_img = pil_img.convert("RGB")
            img_w, img_h = pil_img.size
            buffer = io.BytesIO()
            pil_img.save(buffer, format="PNG")
            png_bytes = buffer.getvalue()

        if page_size == "fit":
            page_w, page_h = img_w + margin_pt * 2, img_h + margin_pt * 2
        else:
            page_w, page_h = _PAGE_SIZES.get(page_size, _PAGE_SIZES["a4"])
            want_landscape = orientation == "landscape" or (orientation == "auto" and img_w > img_h)
            if want_landscape and page_w < page_h:
                page_w, page_h = page_h, page_w
            elif not want_landscape and page_w > page_h:
                page_w, page_h = page_h, page_w

        page = result.new_page(width=page_w, height=page_h)
        available_w = max(page_w - margin_pt * 2, 1)
        available_h = max(page_h - margin_pt * 2, 1)
        scale = min(available_w / img_w, available_h / img_h)
        draw_w, draw_h = img_w * scale, img_h * scale
        x0, y0 = (page_w - draw_w) / 2, (page_h - draw_h) / 2
        page.insert_image(pymupdf.Rect(x0, y0, x0 + draw_w, y0 + draw_h), stream=png_bytes)

    output = result.tobytes(garbage=4, deflate=True)
    result.close()
    return output


def _convert_via_libreoffice(data: bytes, input_filename: str) -> bytes:
    soffice = find_libreoffice()
    if not soffice:
        raise RuntimeError("LibreOffice is not installed.")
    safe_name = input_filename.replace("/", "_").replace("\\", "_")
    with temp_workspace() as workspace, _PooledProfile() as pooled_profile_dir:
        input_path = workspace / safe_name
        input_path.write_bytes(data)
        profile_dir = pooled_profile_dir or (workspace / "lo_profile").as_posix()
        run_cli(
            [
                soffice,
                "--headless",
                "--norestore",
                f"-env:UserInstallation=file:///{profile_dir}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(workspace),
                str(input_path),
            ],
        )
        output_path = input_path.with_suffix(".pdf")
        if not output_path.exists():
            raise RuntimeError("LibreOffice did not produce a PDF output for this file.")
        return output_path.read_bytes()


def word_to_pdf(data: bytes, filename: str) -> bytes:
    return _convert_via_libreoffice(data, filename)


def powerpoint_to_pdf(data: bytes, filename: str) -> bytes:
    return _convert_via_libreoffice(data, filename)


def excel_to_pdf(data: bytes, filename: str) -> bytes:
    return _convert_via_libreoffice(data, filename)


def html_to_pdf(
    *,
    url: str | None,
    html: str | None,
    width: int = 1024,
    print_background: bool = True,
    margin: str = "small",
) -> bytes:
    margin_css = _MARGIN_CSS.get(margin, "0.5in")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            page = browser.new_page(viewport={"width": width, "height": 800})
            if url:
                page.goto(url, wait_until="networkidle", timeout=30000)
            elif html:
                page.set_content(html, wait_until="networkidle")
            else:
                raise ValueError("Either a page URL or raw HTML must be provided.")
            pdf_bytes = page.pdf(
                print_background=print_background,
                margin={"top": margin_css, "bottom": margin_css, "left": margin_css, "right": margin_css},
            )
        finally:
            browser.close()
    return pdf_bytes
