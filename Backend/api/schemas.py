# app/api/schemas.py
from pydantic import BaseModel

class ChatRequest(BaseModel):
    user_prompt: str

# app/api/routes.py
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.api.schemas import ChatRequest
from app.services.chat_service import chat_stream_generator

router = APIRouter()

@router.post("/chat")
async def chat_endpoint(request: ChatRequest):
    return StreamingResponse(
        chat_stream_generator(request.user_prompt), 
        media_type="application/x-ndjson"
    )