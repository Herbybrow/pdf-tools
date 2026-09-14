from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Rejects any request whose declared Content-Length exceeds the configured limit,
    before the body is read or any engine touches it. Applies to the whole request body
    (all files in a multi-file upload combined), not per-file."""

    def __init__(self, app, max_bytes: int):
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                declared_size = int(content_length)
            except ValueError:
                declared_size = 0
            if declared_size > self.max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": (
                            f"Request body is {declared_size / (1024 * 1024):.1f} MB, which exceeds the "
                            f"{self.max_bytes / (1024 * 1024):.0f} MB limit."
                        )
                    },
                )
        return await call_next(request)
