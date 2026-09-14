import io

import pymupdf
from PIL import Image

from app.core.page_ranges import parse_page_ranges

_WIDGET_TYPE_NAMES = {
    pymupdf.PDF_WIDGET_TYPE_TEXT: "text",
    pymupdf.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
    pymupdf.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
    pymupdf.PDF_WIDGET_TYPE_COMBOBOX: "dropdown",
    pymupdf.PDF_WIDGET_TYPE_LISTBOX: "dropdown",
}


def rotate_pdf(data: bytes, angle: int, pages_spec: str | None = None) -> bytes:
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        indices = parse_page_ranges(pages_spec, doc.page_count) if pages_spec else range(doc.page_count)
        for i in indices:
            page = doc[i]
            page.set_rotation((page.rotation + angle) % 360)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def crop_pdf(data: bytes, top: float, bottom: float, left: float, right: float, pages_spec: str | None = None) -> bytes:
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        indices = parse_page_ranges(pages_spec, doc.page_count) if pages_spec else range(doc.page_count)
        for i in indices:
            page = doc[i]
            rect = page.rect
            new_rect = pymupdf.Rect(rect.x0 + left, rect.y0 + top, rect.x1 - right, rect.y1 - bottom)
            if new_rect.width <= 1 or new_rect.height <= 1:
                raise ValueError(f"Crop margins are too large for page {i + 1}.")
            page.set_cropbox(new_rect)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def _hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return (0, 0, 0)
    r, g, b = (int(hex_color[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return (r, g, b)


def add_page_numbers(
    data: bytes,
    label_format: str = "Page {page} of {total}",
    position: str = "bottom-center",
    font_size: float = 11,
    color: str = "#000000",
    start_number: int = 1,
    pages_spec: str | None = None,
) -> bytes:
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        total = doc.page_count
        indices = parse_page_ranges(pages_spec, total) if pages_spec else range(total)
        rgb = _hex_to_rgb(color)
        margin = 24
        for offset, i in enumerate(indices):
            page = doc[i]
            label = label_format.replace("{page}", str(start_number + offset)).replace("{total}", str(total))
            rect = page.rect
            text_width = pymupdf.get_text_length(label, fontsize=font_size)
            if "left" in position:
                x = rect.x0 + margin
            elif "right" in position:
                x = rect.x1 - margin - text_width
            else:
                x = rect.x0 + (rect.width - text_width) / 2
            y = rect.y0 + margin + font_size if "top" in position else rect.y1 - margin
            page.insert_text((x, y), label, fontsize=font_size, color=rgb)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def _watermark_positions(rect: pymupdf.Rect, position: str) -> list[pymupdf.Point]:
    center = pymupdf.Point((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
    if position == "tiled":
        step_x, step_y = rect.width / 3, rect.height / 3
        return [
            pymupdf.Point(rect.x0 + col * step_x, rect.y0 + row * step_y)
            for row in range(1, 3)
            for col in range(1, 3)
        ]
    quarter_x, quarter_y = rect.width * 0.2, rect.height * 0.2
    mapping = {
        "center": center,
        "top-left": pymupdf.Point(rect.x0 + quarter_x, rect.y0 + quarter_y),
        "top-right": pymupdf.Point(rect.x1 - quarter_x, rect.y0 + quarter_y),
        "bottom-left": pymupdf.Point(rect.x0 + quarter_x, rect.y1 - quarter_y),
        "bottom-right": pymupdf.Point(rect.x1 - quarter_x, rect.y1 - quarter_y),
    }
    return [mapping.get(position, center)]


def _draw_text_watermark(page: pymupdf.Page, text: str, point: pymupdf.Point, rotation: float, opacity: float, overlay: bool) -> None:
    fontsize = 36
    text_width = pymupdf.get_text_length(text, fontsize=fontsize)
    matrix = pymupdf.Matrix(rotation)
    page.insert_text(
        pymupdf.Point(point.x - text_width / 2, point.y),
        text,
        fontsize=fontsize,
        color=(0.5, 0.5, 0.5),
        fill_opacity=opacity,
        morph=(point, matrix),
        overlay=overlay,
    )


def _draw_image_watermark(page: pymupdf.Page, image_bytes: bytes, point: pymupdf.Point, rotation: float, opacity: float, overlay: bool) -> None:
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = img.convert("RGBA")
        if rotation:
            img = img.rotate(rotation, expand=True)
        if opacity < 1:
            alpha = img.split()[3].point(lambda p: int(p * opacity))
            img.putalpha(alpha)
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        png_bytes = buffer.getvalue()
        width, height = img.size

    max_dim = min(page.rect.width, page.rect.height) * 0.4
    scale = min(max_dim / width, max_dim / height, 1)
    draw_w, draw_h = width * scale, height * scale
    rect = pymupdf.Rect(point.x - draw_w / 2, point.y - draw_h / 2, point.x + draw_w / 2, point.y + draw_h / 2)
    page.insert_image(rect, stream=png_bytes, overlay=overlay)


def watermark_pdf(
    data: bytes,
    mode: str = "text",
    text: str = "",
    opacity: float = 0.3,
    rotation: float = 45,
    position: str = "center",
    layer: str = "over",
    pages_spec: str | None = None,
    image_bytes: bytes | None = None,
) -> bytes:
    if mode == "image" and not image_bytes:
        raise ValueError("An image is required for image watermarks.")
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        indices = parse_page_ranges(pages_spec, doc.page_count) if pages_spec else range(doc.page_count)
        overlay = layer != "under"
        for i in indices:
            page = doc[i]
            for point in _watermark_positions(page.rect, position):
                if mode == "image" and image_bytes:
                    _draw_image_watermark(page, image_bytes, point, rotation, opacity, overlay)
                else:
                    _draw_text_watermark(page, text or "WATERMARK", point, rotation, opacity, overlay)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()


def detect_form_fields(data: bytes) -> list[dict]:
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        fields = []
        for page_index in range(doc.page_count):
            for widget in doc[page_index].widgets() or []:
                fields.append(
                    {
                        "name": widget.field_name,
                        "type": _WIDGET_TYPE_NAMES.get(widget.field_type, "text"),
                        "page": page_index,
                        "value": widget.field_value,
                        "options": widget.choice_values or None,
                    }
                )
        return fields
    finally:
        doc.close()


def fill_form_fields(data: bytes, values: dict[str, str], flatten: bool = False) -> bytes:
    doc = pymupdf.open(stream=data, filetype="pdf")
    try:
        for page in doc:
            widgets = list(page.widgets() or [])
            for widget in widgets:
                if widget.field_name in values:
                    widget.field_value = values[widget.field_name]
                    widget.update()
            if flatten:
                for widget in widgets:
                    value = widget.field_value
                    if value:
                        rect = widget.rect
                        fontsize = min(11, max(rect.height * 0.7, 6))
                        page.insert_textbox(rect, str(value), fontsize=fontsize, align=0)
                    page.delete_widget(widget)
        return doc.tobytes(garbage=4, deflate=True)
    finally:
        doc.close()
