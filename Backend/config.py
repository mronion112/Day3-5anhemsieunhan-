import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gemini-1.5-flash")
    PRICE_PER_1M_INPUT: float = float(os.getenv("PRICE_PER_1M_INPUT", 0.35))
    PRICE_PER_1M_OUTPUT: float = float(os.getenv("PRICE_PER_1M_OUTPUT", 1.05))
    CSV_FILE_PATH: str = "data/Goodreadss Books.csv"
    DATABASE_URL: str = "sqlite:///./chat_history.db"

settings = Settings()