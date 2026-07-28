import json
import uuid
from datetime import datetime
import asyncio
from app.database.csv_engine import csv_engine
from app.core.prompts import SYSTEM_PROMPT
from app.utils.token_tracker import count_tokens
from app.utils.cost_calculator import calculate_cost
from app.database.history_db import SessionLocal, InteractionLog
import google.generativeai as genai
from app.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)

async def chat_stream_generator(user_prompt: str):
    time_in = datetime.now()
    interaction_id = f"req_{uuid.uuid4().hex[:8]}"
    
    try:
        # 1. Yield Thinking State 1
        yield json.dumps({"state": "thinking", "message": "Analyzing user question..."}) + "\n"
        await asyncio.sleep(0.3)
        
        keywords = user_prompt.replace("Tôi muốn tìm sách", "").replace("giống", "").strip()
        
        # 2. Yield Thinking State 2
        yield json.dumps({"state": "thinking", "message": "Searching relevant book information..."}) + "\n"
        
        # SỬA 1: Bọc hàm CSV synchronous bằng asyncio.to_thread
        # db_results = await asyncio.to_thread(csv_engine.query_book, keyword=keywords, limit=3)
        db_results = await asyncio.to_thread(csv_engine.hybrid_search, user_query=keywords, limit=3)
        
        # 3. Yield Thinking State 3
        yield json.dumps({"state": "thinking", "message": "Processing book context..."}) + "\n"
        await asyncio.sleep(0.3)

        context_str = json.dumps(db_results, ensure_ascii=False, indent=2)
        final_prompt = f"{SYSTEM_PROMPT}\n\n[BOOK DATABASE RESULTS]:\n{context_str}\n\nUser Question: {user_prompt}"
        
        input_tokens = count_tokens(final_prompt)
        
        # 4. Generate Answer via Gemini
        yield json.dumps({"state": "thinking", "message": "Generating answer..."}) + "\n"
        
        model = genai.GenerativeModel(settings.LLM_MODEL)
        
        full_response = ""
        # SỬA 2: Chuyển sang generate_content_async và async for
        response_stream = await model.generate_content_async(final_prompt, stream=True)
        
        async for chunk in response_stream:
            # Lưu ý: Đôi khi chunk từ Gemini có thể bị block bởi safety settings (không có chunk.text)
            if hasattr(chunk, 'text') and chunk.text:
                full_response += chunk.text
                yield json.dumps({"state": "generating", "chunk": chunk.text}) + "\n"
                
    except Exception as e:
        print(f"Stream Error: {str(e)}")
        yield json.dumps({"state": "error", "message": f"Error: {str(e)}"}) + "\n"
        return

    # 5. Completed & Metadata Calculations
    time_out = datetime.now()
    output_tokens = count_tokens(full_response)
    cost = calculate_cost(input_tokens, output_tokens)
    
    safe_thinking_process = "1. Analyzed question.\n2. Searched relevant books.\n3. Compared book information.\n4. Generated answer based strictly on database."
    
    final_metadata = {
        "state": "completed",
        "thinking_process": safe_thinking_process,
        "interaction": {
            "id": interaction_id,
            "type": "single_request_response"
        },
        "input_token": input_tokens,
        "output_token": output_tokens,
        "title": "Cost of Execution",
        "price": cost,
        "log": {
            "time_in": time_in.strftime("%H:%M:%S.%f")[:-3],
            "time_out": time_out.strftime("%H:%M:%S.%f")[:-3],
            "duration_ms": int((time_out - time_in).total_seconds() * 1000)
        }
    }
    
    yield json.dumps(final_metadata) + "\n"

    # SỬA 3: Đảm bảo giải phóng DB Connection an toàn
    try:
        db = SessionLocal()
        try:
            log_entry = InteractionLog(
                id=interaction_id,
                user_prompt=user_prompt,
                ai_response=full_response,
                retrieved_context=context_str,
                input_token=input_tokens,
                output_token=output_tokens,
                cost=cost['amount'],
                time_in=time_in,
                time_out=time_out
            )
            db.add(log_entry)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"Failed to save log: {e}")