"""RefundPath's active API. The upstream agent stays isolated in legacy_main."""
import asyncio
import logging
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.db import session as db
from app.refundpath.api import purge_expired, router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.getLogger("pypdf").disabled = True
    await db.init_db()
    await purge_expired()

    async def retention():
        while True:
            await asyncio.sleep(60)
            try:
                await purge_expired()
            except Exception as exc:
                logging.getLogger("refundpath").error("Retention failed (%s)", type(exc).__name__)

    cleanup = asyncio.create_task(retention())
    try:
        yield
    finally:
        cleanup.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup
        await db.dispose()


class BodyLimit:
    """Bound multipart and chunked request bodies before any parser sees them."""
    def __init__(self, app, limit=5 * 1024 * 1024 + 65536):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        chunks, length = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            length += len(message.get("body", b""))
            if length > self.limit:
                return await JSONResponse({"detail": "Request exceeds the 5 MB upload limit."}, status_code=413)(scope, receive, send)
            chunks.append(message)
            if not message.get("more_body"):
                break
        index = 0

        async def replay():
            nonlocal index
            if index < len(chunks):
                message = chunks[index]
                index += 1
                return message
            return await receive()

        await self.app(scope, replay, send)


app = FastAPI(title="RefundPath · Australia sandbox", version="1.0.0", lifespan=lifespan)
app.include_router(router)
app.add_middleware(BodyLimit)
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if (FRONTEND_DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


@app.middleware("http")
async def privacy_headers(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        allowed = {str(request.base_url).rstrip("/"), "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"}
        if origin and origin not in allowed:
            return JSONResponse({"detail": "Cross-origin changes are not permitted."}, status_code=403)
    try:
        response = await call_next(request)
    except Exception as exc:
        # Catch before ServerErrorMiddleware re-raises and uvicorn prints private SQL parameters.
        logging.getLogger("refundpath").error("Request failed (%s)", type(exc).__name__)
        response = JSONResponse({"detail": "The request could not be completed. Please retry."}, status_code=500)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if not request.url.path.startswith("/api"):
        response.headers["Content-Security-Policy"] = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request, _exc):
    # Pydantic's default response includes user inputs, including private data.
    return JSONResponse({"detail": "Check the required fields, formats and allowed values."}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(_request, exc):
    logging.getLogger("refundpath").error("Request failed (%s)", type(exc).__name__)
    return JSONResponse({"detail": "The request could not be completed. Please retry."}, status_code=500)


@app.get("/api/health")
@app.get("/api/health/live")
@app.get("/api/health/ready")
async def health():
    return {"status": "ok", "product": "RefundPath", "sandbox": True, "external_submission": False}


@app.get("/{path:path}", include_in_schema=False)
async def frontend(path: str):
    if path.startswith("api/"):
        return JSONResponse({"detail": "Not found."}, status_code=404)
    if path == "favicon.svg" and (FRONTEND_DIST / path).is_file():
        return FileResponse(FRONTEND_DIST / path)
    if not (FRONTEND_DIST / "index.html").is_file():
        return JSONResponse({"detail": "Build the frontend with npm run build, or use the dev server on port 5173."}, status_code=503)
    return FileResponse(FRONTEND_DIST / "index.html")
