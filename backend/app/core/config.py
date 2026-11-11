"""Application settings, driven by environment variables (all optional)."""
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
# The original pipeline modules (src/) live at the repository root and use
# cwd-relative paths ("output/", "data/"), so we expose the root on sys.path.
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


class Settings:
    app_name = "Corporate Event Miner - Financial Intelligence API"
    version = "2.0.0"
    repo_root: Path = REPO_ROOT
    output_dir: Path = Path(os.getenv("CEM_OUTPUT_DIR", REPO_ROOT / "output"))
    db_path: str = os.getenv("CEM_DB_PATH", str(Path(os.getenv("CEM_OUTPUT_DIR", REPO_ROOT / "output")) / "corporate_events.db"))
    cors_origins: list = [o.strip() for o in os.getenv(
        "CEM_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
    ).split(",") if o.strip()]
    log_level: str = os.getenv("CEM_LOG_LEVEL", "INFO")
    pipeline_timeout_sec: int = int(os.getenv("CEM_PIPELINE_TIMEOUT", "900"))


settings = Settings()
