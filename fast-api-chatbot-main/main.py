import json
import os
import asyncio
from fastapi import FastAPI, Request, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError
from dotenv import load_dotenv

# Load environmental variables
load_dotenv()

app = FastAPI(title="Orb AI Chatbot")

# CORS middleware for development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models for request validation
class Message(BaseModel):
    role: str # 'user' or 'model'
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    model: str = "gemini-2.5-flash"
    temperature: Optional[float] = None
    system_instruction: Optional[str] = None

@app.get("/api/health")
def health_check():
    # Return health status and whether server has a default key configured
    default_key_configured = bool(os.getenv("GEMINI_API_KEY"))
    return {
        "status": "ok",
        "api_key_configured": default_key_configured
    }

async def stream_gemini(request: ChatRequest, api_key: str):
    """
    Generator that calls the Google GenAI SDK stream endpoint
    and yields SSE messages to the client.
    """
    try:
        # Initialize client with specified API key
        client = genai.Client(api_key=api_key)
        
        # Build prompt contents compatible with the SDK
        contents = []
        for msg in request.messages:
            # Map roles: Google GenAI expects 'user' or 'model'
            role = "user" if msg.role == "user" else "model"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.content)]
                )
            )
            
        # Configure model parameters
        config = types.GenerateContentConfig(
            temperature=request.temperature,
            system_instruction=request.system_instruction,
        )
        
        # Start content generation stream
        response_stream = client.models.generate_content_stream(
            model=request.model,
            contents=contents,
            config=config,
        )
        
        # Yield chunks
        for chunk in response_stream:
            # Check chunk.text
            if chunk.text:
                yield f"data: {json.dumps({'text': chunk.text})}\n\n"
            # Yield control back to event loop
            await asyncio.sleep(0.005)
            
    except APIError as e:
        err_msg = str(e.message) if hasattr(e, "message") else str(e)
        yield f"data: {json.dumps({'error': f'Gemini API Error: {err_msg}'})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': f'Internal Server Error: {str(e)}'})}\n\n"

@app.post("/api/chat/stream")
async def chat_stream(
    request: ChatRequest,
    x_gemini_key: Optional[str] = Header(None, alias="X-Gemini-API-Key"),
    authorization: Optional[str] = Header(None)
):
    # Determine the API key to use
    api_key = x_gemini_key
    if not api_key and authorization and authorization.startswith("Bearer "):
        api_key = authorization.split(" ")[1]
        
    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY")
        
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=400,
            detail="Gemini API Key is missing. Please provide it in the X-Gemini-API-Key header or set GEMINI_API_KEY in the server environment."
        )
        
    # Return StreamingResponse with text/event-stream content type
    return StreamingResponse(
        stream_gemini(request, api_key),
        media_type="text/event-stream"
    )

# Serve static frontend files from 'static' directory
# Ensure 'static' folder exists and has files before routing gets shadowed
# Mount StaticFiles last so api endpoints take precedence
if not os.path.exists("static"):
    os.makedirs("static")
    os.makedirs("static/css")
    os.makedirs("static/js")

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    # Run dev server with reload enabled
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
