from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class ErrorBody(BaseModel):
    code: str
    message: str
    details: Any = None


class ErrorResponse(BaseModel):
    error: ErrorBody


class SearchRequest(BaseModel):
    query: Optional[str] = Field(None, max_length=200, description="Company name / keyword")
    event_type: Optional[str] = None
    status: Optional[str] = None
    min_value_usd_m: Optional[float] = Field(None, ge=0)
    max_value_usd_m: Optional[float] = Field(None, ge=0)
    sort: Literal["events", "value", "name", "recent"] = "events"
    limit: int = Field(20, ge=1, le=200)
    offset: int = Field(0, ge=0)


class ScrapeRequest(BaseModel):
    mode: Literal["sample", "live"] = "sample"
    per_feed: int = Field(10, ge=1, le=50)
    retrain: bool = False


class AnalyzeTextRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    text: str = Field("", max_length=20000)


class HealthResponse(BaseModel):
    status: str
    version: str
    database_available: bool
    events: int
    pipeline_busy: bool
