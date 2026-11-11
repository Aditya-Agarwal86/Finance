import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .api.routes import core, scraping
from .core.config import settings
from .core.logging import setup_logging

setup_logging()
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app):
    # Original modules use cwd-relative paths (output/, data/)
    os.chdir(settings.repo_root)
    log.info("Started %s v%s; db=%s", settings.app_name, settings.version, settings.db_path)
    yield


app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan,
              description="REST API over the Corporate Event Miner scraping / NLP / graph pipeline.")

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(core.router, prefix="/api/v1")
app.include_router(scraping.router, prefix="/api/v1")


def _err(status, code, message, details=None):
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details}})


@app.exception_handler(StarletteHTTPException)
async def http_exc(request: Request, exc: StarletteHTTPException):
    d = exc.detail
    if isinstance(d, dict) and "code" in d:
        return _err(exc.status_code, d["code"], d["message"])
    return _err(exc.status_code, "http_error", str(d))


@app.exception_handler(RequestValidationError)
async def validation_exc(request: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return _err(422, "validation_error", "Request validation failed", details)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return _err(500, "internal_error", "Internal server error")
