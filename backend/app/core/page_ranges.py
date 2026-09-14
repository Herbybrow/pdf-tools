def parse_page_ranges(spec: str, page_count: int) -> list[int]:
    """Parses '1-5, 8, 11-15' (1-based, inclusive) into a sorted list of unique 0-based indices."""
    indices: set[int] = set()
    spec = spec.strip()
    if not spec:
        raise ValueError("Page range cannot be empty.")
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_str, end_str = part.split("-", 1)
            start, end = int(start_str), int(end_str)
        else:
            start = end = int(part)
        if start < 1 or end < 1 or start > end:
            raise ValueError(f"Invalid page range segment: '{part}'")
        if end > page_count:
            raise ValueError(f"Page {end} is out of range (document has {page_count} pages).")
        indices.update(range(start - 1, end))
    if not indices:
        raise ValueError("No valid pages were selected.")
    return sorted(indices)
