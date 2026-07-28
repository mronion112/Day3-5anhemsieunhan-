# app/utils/token_tracker.py
import tiktoken

def count_tokens(text: str) -> int:
    try:
        # Sử dụng tokenizer chuẩn cl100k_base (tương tự GPT-4, đủ tốt để ước tính cho Gemini)
        encoding = tiktoken.get_encoding("cl100k_base")
        return len(encoding.encode(text))
    except Exception:
        # Fallback heuristic
        return len(text.split())

# app/utils/cost_calculator.py
from app.config import settings

def calculate_cost(input_tokens: int, output_tokens: int) -> dict:
    input_cost = (input_tokens / 1_000_000) * settings.PRICE_PER_1M_INPUT
    output_cost = (output_tokens / 1_000_000) * settings.PRICE_PER_1M_OUTPUT
    total = input_cost + output_cost
    return {
        "amount": round(total, 6),
        "currency": "USD"
    }