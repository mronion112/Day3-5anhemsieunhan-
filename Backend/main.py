import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.database.csv_engine import csv_engine
from app.config import settings
from app.database.history_db import init_db

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Book Assistant API")

# Danh sách các Domain / Port của Frontend được phép gọi API
origins = [
    "http://localhost:8443",
    "http://127.0.0.1:8443",
    "*" # Dùng "*" trong giai đoạn Dev để cho phép tất cả các nguồn gọi vào
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],  # Cho phép POST, GET, OPTIONS,...
    allow_headers=["*"],  # Cho phép mọi Header (Content-Type, Authorization...)
)

# ... Các route khác giữ nguyên


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Book Assistant API", version="1.0.0")

# Frontend Integration support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Trong production nên set cụ thể origin của frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Backend Services...")
    # 1. Initialize SQLite Database
    init_db()
    # 2. Load CSV Data to Memory Cache
    csv_engine.load_data(settings.CSV_FILE_PATH)
    logger.info("Server is ready.")

app.include_router(router, prefix="/api")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)