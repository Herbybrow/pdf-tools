import pymupdf as fitz

from app.core.page_ranges import parse_page_ranges


def merge_pdfs(file_bytes_list: list[bytes]) -> bytes:
    """Sequentially combines PDFs, preserving bookmarks (offset per-source TOC entries
    into one combined outline) and the first document's metadata."""
    result = fitz.open()
    combined_toc: list[list] = []
    page_offset = 0
    first_metadata = None
    for data in file_bytes_list:
        with fitz.open(stream=data, filetype="pdf") as src:
            if first_metadata is None:
                first_metadata = src.metadata
            result.insert_pdf(src)
            for level, title, page in src.get_toc():
                combined_toc.append([level, title, page + page_offset])
            page_offset += src.page_count
    if combined_toc:
        result.set_toc(combined_toc)
    if first_metadata:
        result.set_metadata(first_metadata)
    output = result.tobytes(garbage=4, deflate=True)
    result.close()
    return output


def _extract_indices(src: fitz.Document, indices: list[int]) -> bytes:
    result = fitz.open()
    for i in indices:
        result.insert_pdf(src, from_page=i, to_page=i)
    output = result.tobytes(garbage=4, deflate=True)
    result.close()
    return output


def split_into_range_groups(data: bytes, groups_spec: str) -> dict[str, bytes]:
    """groups_spec: range groups separated by ';' (each group may itself contain
    commas), e.g. '1-3;4-6;7' -> 3 output files, '1,3,5' -> 1 file with those pages."""
    groups = [g.strip() for g in groups_spec.split(";") if g.strip()]
    if not groups:
        raise ValueError("No page ranges provided.")
    files: dict[str, bytes] = {}
    with fitz.open(stream=data, filetype="pdf") as src:
        page_count = src.page_count
        for group in groups:
            indices = parse_page_ranges(group, page_count)
            safe_name = group.replace(",", "_").replace(" ", "")
            files[f"pages_{safe_name}.pdf"] = _extract_indices(src, indices)
    return files


def split_burst(data: bytes) -> dict[str, bytes]:
    """Every page becomes its own single-page PDF."""
    files: dict[str, bytes] = {}
    with fitz.open(stream=data, filetype="pdf") as src:
        width = len(str(src.page_count))
        for i in range(src.page_count):
            files[f"page_{str(i + 1).zfill(width)}.pdf"] = _extract_indices(src, [i])
    return files


def split_interval(data: bytes, every_n_pages: int) -> dict[str, bytes]:
    if every_n_pages < 1:
        raise ValueError("Interval must be at least 1 page.")
    files: dict[str, bytes] = {}
    with fitz.open(stream=data, filetype="pdf") as src:
        page_count = src.page_count
        for chunk_index, start in enumerate(range(0, page_count, every_n_pages), start=1):
            end = min(start + every_n_pages, page_count) - 1
            files[f"part_{chunk_index}_pages_{start + 1}-{end + 1}.pdf"] = _extract_indices(
                src, list(range(start, end + 1))
            )
    return files


def remove_pages(data: bytes, pages_spec: str) -> bytes:
    with fitz.open(stream=data, filetype="pdf") as src:
        to_remove = set(parse_page_ranges(pages_spec, src.page_count))
        keep = [i for i in range(src.page_count) if i not in to_remove]
        if not keep:
            raise ValueError("Removing these pages would leave an empty document.")
        return _extract_indices(src, keep)


def extract_pages(data: bytes, pages_spec: str) -> bytes:
    with fitz.open(stream=data, filetype="pdf") as src:
        indices = parse_page_ranges(pages_spec, src.page_count)
        return _extract_indices(src, indices)


def reorder_pages(data: bytes, page_order: list[int], rotations: dict[int, int] | None = None) -> bytes:
    """page_order: 0-based source page indices in desired output order (omit to delete,
    repeat to duplicate). rotations: {source_page_index: extra_degrees}, added to the
    page's existing rotation (0/90/180/270)."""
    rotations = rotations or {}
    with fitz.open(stream=data, filetype="pdf") as src:
        page_count = src.page_count
        for i in page_order:
            if i < 0 or i >= page_count:
                raise ValueError(f"Page index {i + 1} is out of range.")
        result = fitz.open()
        for i in page_order:
            result.insert_pdf(src, from_page=i, to_page=i)
            if i in rotations:
                new_page = result[-1]
                new_page.set_rotation((new_page.rotation + rotations[i]) % 360)
        output = result.tobytes(garbage=4, deflate=True)
        result.close()
        return output


def compose_pages(sources: dict[str, bytes], layout: list[dict]) -> bytes:
    """General page-composition primitive behind the visual Organize PDF tool: layout is
    an ordered list of {"source": <key into `sources`>, "page": 0-based index, "rotation": degrees},
    letting the frontend express reorder, delete (by omission), duplicate (by repetition),
    rotate, and insert-from-a-second-document all as one flat list."""
    if not layout:
        raise ValueError("The organized document has no pages.")
    docs = {key: fitz.open(stream=data, filetype="pdf") for key, data in sources.items()}
    try:
        result = fitz.open()
        for entry in layout:
            # str(...): the layout arrives as JSON, so a numeric source index (0, 1, ...)
            # decodes as a Python int, while `sources` keys (built from enumerate()) are
            # strings -- normalize here rather than relying on the frontend's exact
            # JSON.stringify output shape.
            source_key = str(entry.get("source"))
            if source_key not in docs:
                raise ValueError(f"Unknown source '{source_key}'.")
            src = docs[source_key]
            page_index = int(entry.get("page", -1))
            if page_index < 0 or page_index >= src.page_count:
                raise ValueError(f"Page {page_index + 1} is out of range for source '{source_key}'.")
            result.insert_pdf(src, from_page=page_index, to_page=page_index)
            rotation = int(entry.get("rotation", 0))
            if rotation:
                new_page = result[-1]
                new_page.set_rotation((new_page.rotation + rotation) % 360)
        output = result.tobytes(garbage=4, deflate=True)
        result.close()
        return output
    finally:
        for doc in docs.values():
            doc.close()


def assemble_images_to_pdf(image_bytes_list: list[bytes]) -> bytes:
    """Scan-to-PDF: compiles already-captured (client-side perspective-corrected) page
    images into a single PDF, one image per page sized to that image."""
    result = fitz.open()
    for img_bytes in image_bytes_list:
        if img_bytes[:4] == b"%PDF":
            with fitz.open(stream=img_bytes, filetype="pdf") as src:
                result.insert_pdf(src)
            continue
        pixmap = fitz.Pixmap(img_bytes)
        if pixmap.alpha:
            pixmap = fitz.Pixmap(pixmap, 0)
        page = result.new_page(width=pixmap.width, height=pixmap.height)
        page.insert_image(page.rect, pixmap=pixmap)
    output = result.tobytes(garbage=4, deflate=True)
    result.close()
    return output
