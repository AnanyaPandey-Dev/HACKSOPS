from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import HTTPException
from google.genai import errors as genai_errors
import os
import logging

logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)

api_key = os.getenv("GEMINI_API_KEY")
model_name = os.getenv("GEMINI_MODEL")

if not api_key:
    raise RuntimeError("GEMINI_API_KEY is missing from the environment or .env file")

if not model_name:
    raise RuntimeError("GEMINI_MODEL is missing from the environment or .env file")

client = genai.Client(api_key=api_key)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "ok", "message": "KrishiSetu API is running"}

class ChatRequest(BaseModel):
    prompt: str

@app.post("/chat")
def chat(req: ChatRequest):
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=req.prompt,
        )
    except genai_errors.ClientError as exc:
        logger.error("Gemini API request failed: %s", exc)
        if exc.code == 401:
            raise HTTPException(
                status_code=502,
                detail="Gemini authentication failed. Replace GEMINI_API_KEY with a valid Google AI Studio API key.",
            ) from exc
        raise HTTPException(status_code=502, detail=f"Gemini API request failed with status {exc.code}.") from exc
    except Exception as exc:
        logger.exception("Unexpected Gemini request failure")
        raise HTTPException(status_code=502, detail="Unexpected Gemini API failure.") from exc

    return {"reply": response.text}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002)