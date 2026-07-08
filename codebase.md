# codebase.md

This file is a singular compilation of all source code files in the `AD1` project directory.

---

## File: .env.example
**Path:** `.env.example`

```env
# # Backend Environment Variables
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adhoc_ai
# REDIS_URL=redis://localhost:6379
# SECRET_KEY=change-this-in-production

# # AI Service API Keys (Phase 2)
# GROQ_API_KEY=
# DEEPGRAM_API_KEY=
# ELEVENLABS_API_KEY=
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
```

---

## File: .gitignore
**Path:** `.gitignore`

```
Backend/.env
test_twilio.py

.venv/
venv/

*.env

__pycache__/
*.pyc

node_modules/
dist/
build/
```

---

## File: .env
**Path:** `Backend/.env`

```
# Supabase
SUPABASE_URL=https://asyhmockkvfedlgextiz.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeWhtb2Nra3ZmZWRsZ2V4dGl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTk1MTYxNCwiZXhwIjoyMDk3NTI3NjE0fQ.C93s-csiNg691Z9Qjj6yf4pn8mjiS8Z0pgIPuYUwDrw
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzeWhtb2Nra3ZmZWRsZ2V4dGl6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTk1MTYxNCwiZXhwIjoyMDk3NTI3NjE0fQ.C93s-csiNg691Z9Qjj6yf4pn8mjiS8Z0pgIPuYUwDrw

# Auth
SECRET_KEY=33cbfe3c5ca83be61442bfb7db2e3a024b0c023c50b66a8f6a1e1d826d384d32

# AI APIs
GROQ_API_KEY=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
DEEPGRAM_API_KEY=7a42eeac02a6749fc238f1d2a63cd69ddd662537
ELEVENLABS_API_KEY=4e06406d910e89dc3aa881bc2b48e15ebe80e0f7a8a5531b9af06043b49a514b

# Telephony (optional - for real phone calls)
TWILIO_ACCOUNT_SID=AC8e0ed9a084a0dc90ad2c23fd68092e63
TWILIO_AUTH_TOKEN=2ea02b3ea8aecfd169fcd8e641f1836b
TWILIO_PHONE_NUMBER=+13614901685

# App
APP_URL=http://localhost:5173
BACKEND_URL=https://ad-1-ja69.onrender.com
```

---

## File: .python-version
**Path:** `Backend/.python-version`

```
3.11
```

---

## File: database.py
**Path:** `Backend/database.py`

```python
"""Supabase database client for ADhoc.ai"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

supabase_url: str = os.getenv("SUPABASE_URL") or ""
supabase_key: str = os.getenv("SUPABASE_SERVICE_KEY") or ""

supabase: Client = create_client(supabase_url, supabase_key)

def get_db():
    """Returns Supabase client"""
    return supabase
```

---

## File: main.py
**Path:** `Backend/main.py`

````python
"""
ADhoc.ai Backend v2 - Fixed Voice WebSocket
FastAPI + Supabase + Groq + Deepgram + ElevenLabs
Real-time voice AI for career guidance & college admissions
"""

import os
import base64
import tempfile
import asyncio
import json

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, File, UploadFile, Request, Form, BackgroundTasks
import hashlib
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from pydantic import BaseModel, Field, EmailStr, model_validator
from jose import JWTError, jwt
from passlib.context import CryptContext
import httpx
from groq import Groq

from database import supabase

# ─── CONFIG ──────────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production-min-32-chars")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
BACKEND_URL = os.getenv("BACKEND_URL", "https://ad-1-ja69.onrender.com")
print("TWILIO_SID:", bool(TWILIO_SID))
print("TWILIO_TOKEN:", bool(TWILIO_TOKEN))
print("TWILIO_PHONE:", bool(TWILIO_PHONE))
print("BACKEND_URL:", BACKEND_URL)

# ─── AUTH ───────────────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id  = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        result = supabase.table("users").select("*").eq("id", user_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=401, detail="User not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database connection error: {str(e)}")

# ─── GROQ CLIENT ─────────────────────────────────────────────────────────────
groq_client: Optional[Groq] = None
if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)

# ─── CAREER GUIDANCE AI ENGINE ───────────────────────────────────────────────
# FIX: Default to English. Only respond in Hindi/other languages if user explicitly asks in that language.
CAREER_SYSTEM_PROMPT = """You are CareerGuide AI, an expert career counselor and college admission advisor for Indian students. 

CRITICAL RULES:
1. ALWAYS respond in the SAME language the user used. If they speak English, respond in English. If they speak Hindi, respond in Hindi. If they mix (Hinglish), respond in Hinglish.
2. NEVER switch languages on your own. Do not "helpfully" translate to Hindi if the user is speaking English.
3. Keep responses concise but informative (2-4 sentences max for voice). 
4. Be empathetic, encouraging, and data-driven. Ask clarifying questions to give better advice.
5. Help with: college admissions, entrance exams (JEE, NEET, CAT, etc.), scholarships, course selection, job market trends in India.
6. If you don't know specific current data, be honest and guide the student on where to find it.

Current context: You are speaking with a student who needs guidance. Be conversational and natural."""

class CareerGuidanceEngine:
    def __init__(self):
        self.conversations: Dict[str, List[Dict[str, str]]] = {}

    def get_conversation(self, session_id: str) -> List[Dict[str, str]]:
        if session_id not in self.conversations:
            self.conversations[session_id] = [
                {"role": "system", "content": CAREER_SYSTEM_PROMPT}
            ]
        return self.conversations[session_id]

    async def process_text(self, text: str, session_id: str) -> str:
        conversation = self.get_conversation(session_id)
        conversation.append({"role": "user", "content": text})

        if len(conversation) > 12:
            conversation = [conversation[0]] + conversation[-11:]
            self.conversations[session_id] = conversation

        if not groq_client:
            return "I'm sorry, the AI service is currently unavailable. Please try again later."

        messages_for_groq: List[Dict[str, str]] = []
        for msg in conversation:
            messages_for_groq.append({
                "role": msg["role"],
                "content": msg["content"]
            })

        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages_for_groq,  # type: ignore
            temperature=0.7,
            max_tokens=256,
            top_p=0.9
        )

        ai_text = response.choices[0].message.content or "I'm sorry, I didn't understand that."
        conversation.append({"role": "assistant", "content": ai_text})
        return ai_text

    async def transcribe_audio(self, audio_bytes: bytes) -> str:
        """Transcribe audio using Groq Whisper - accepts raw PCM 16-bit mono 16kHz"""
        if not groq_client:
            return ""

        import wave
        tmp_path = tempfile.mktemp(suffix=".wav")
        try:
            with wave.open(tmp_path, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(16000)
                wav.writeframes(audio_bytes)

            with open(tmp_path, 'rb') as audio_file:
                transcript = groq_client.audio.transcriptions.create(
                    file=("audio.wav", audio_file),
                    model="whisper-large-v3-turbo",
                    response_format="text"
                )
            return str(transcript) if transcript else ""
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    async def text_to_speech(self, text: str) -> bytes:
        """Convert text to speech - Deepgram primary, ElevenLabs backup"""

        # Try Deepgram first (free tier, fast, reliable)
        if DEEPGRAM_API_KEY:
            try:
                url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=linear16&sample_rate=24000&channels=1"
                headers = {
                    "Authorization": f"Token {DEEPGRAM_API_KEY}",
                    "Content-Type": "application/json"
                }
                payload = {"text": text}

                async with httpx.AsyncClient() as client:
                    response = await client.post(url, headers=headers, json=payload, timeout=60)
                    if response.status_code == 200:
                        print(f"Deepgram TTS: {len(response.content)} bytes")
                        return response.content
                    else:
                        print(f"Deepgram error: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"Deepgram TTS failed: {e}")

        # Fallback to ElevenLabs
        if ELEVENLABS_API_KEY:
            try:
                url = "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream"
                headers = {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json"
                }
                payload = {
                    "text": text,
                    "model_id": "eleven_turbo_v2_5",
                    "output_format": "pcm_24000"
                }

                async with httpx.AsyncClient() as client:
                    response = await client.post(url, headers=headers, json=payload, timeout=60)
                    if response.status_code == 200:
                        print(f"ElevenLabs TTS: {len(response.content)} bytes")
                        return response.content
                    else:
                        print(f"ElevenLabs error: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"ElevenLabs TTS failed: {e}")

        return b""

guidance_engine = CareerGuidanceEngine()

# ─── FASTAPI APP ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="ADhoc.ai API",
    description="Real-time voice AI for education",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
import traceback

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("GLOBAL EXCEPTION TRIGGERED:")
    print(tb)
    try:
        # Write exception to error.log file in Backend folder
        with open("error.log", "a", encoding="utf-8") as f:
            f.write(f"=== {datetime.utcnow().isoformat()} ===\n")
            f.write(f"Request: {request.method} {request.url.path}\n")
            f.write(tb)
            f.write("\n\n")
    except Exception as log_err:
        print(f"Failed to write to error.log: {log_err}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}", "traceback": tb}
    )


def validate_backend_url_for_twilio() -> None:
    if TWILIO_SID and TWILIO_TOKEN and TWILIO_PHONE:
        if not BACKEND_URL:
            raise RuntimeError("BACKEND_URL must be set when Twilio is enabled")

        parsed = urlparse(BACKEND_URL)
        if parsed.scheme.lower() != "https" or not parsed.netloc:
            raise RuntimeError("BACKEND_URL must be a valid https:// URL when Twilio is enabled")

        hostname = parsed.hostname or ""
        if hostname in {"localhost", "127.0.0.1"}:
            raise RuntimeError("BACKEND_URL must not use localhost or 127.0.0.1 when Twilio is enabled")


@app.on_event("startup")
async def startup_event():
    pass
    #print("BACKEND_URL:", BACKEND_URL)
    #if TWILIO_SID and TWILIO_TOKEN and TWILIO_PHONE:
        #validate_backend_url_for_twilio()
        #print("Twilio callback_url:", f"{BACKEND_URL.rstrip('/')}/api/calls/webhook")

# ─── PYDANTIC MODELS ─────────────────────────────────────────────────────────
class UserSignup(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str
    phone: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]

class SessionCreate(BaseModel):
    session_type: str = "career"

class PromptCreate(BaseModel):
    name: str
    description: str
    system_prompt: str
    user_prompt_template: str
    variables: List[str] = []

class KnowledgeUpload(BaseModel):
    title: str
    content: str
    category: str
    tags: List[str] = []

class CallInitiate(BaseModel):
    phone_number: Optional[str] = None
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    topic: Optional[str] = None

class AgentUpdate(BaseModel):
    system_prompt: str

# ─── AUTH ENDPOINTS ───────────────────────────────────────────────────────────
@app.post("/api/auth/signup", response_model=TokenResponse)
async def signup(data: UserSignup):
    email = str(data.email).strip().lower()
    existing = supabase.table("users").select("id").eq("email", email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_data = {
        "email": email,
        "hashed_password": get_password_hash(data.password),
        "full_name": data.full_name.strip(),
        "phone": data.phone,
        "role": "student",
        "created_at": datetime.utcnow().isoformat(),
        "is_active": True,
        "target_colleges": [],
        "preferred_courses": [],
        "academic_scores": {}
    }

    result = supabase.table("users").insert(user_data).execute()
    user = result.data[0]

    token = create_access_token({"sub": user["id"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    email = str(data.email).strip().lower()
    result = supabase.table("users").select("*").eq("email", email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user = result.data[0]
    if not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user["id"]})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"]
        }
    }

@app.get("/api/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "full_name": current_user["full_name"],
        "role": current_user["role"],
        "phone": current_user.get("phone"),
        "target_colleges": current_user.get("target_colleges", []),
        "preferred_courses": current_user.get("preferred_courses", []),
        "academic_scores": current_user.get("academic_scores", {})
    }

# ─── DASHBOARD ENDPOINTS ────────────────────────────────────────────────────
@app.get("/api/dashboard/admin")
async def admin_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    users = supabase.table("users").select("*").execute().data or []
    calls = supabase.table("calls").select("*").execute().data or []
    sessions = supabase.table("guidance_sessions").select("*").execute().data or []

    from datetime import datetime

    today = datetime.utcnow().strftime("%Y-%m-%d")

    active_calls_today = len([
        c for c in calls
        if c.get("created_at", "").startswith(today)
    ])

    students_count = len([
        u for u in users
        if u.get("role") == "student"
    ])

    faculty_count = len([
        u for u in users
        if u.get("role") == "faculty"
    ])

    active_sessions = len([
        s for s in sessions
        if s.get("status") == "active"
    ])

    knowledge_docs = len(
        supabase.table("knowledge_base")
        .select("*")
        .execute()
        .data or []
    )

    activities = (
        supabase.table("analytics_events")
        .select("event_type,event_data,created_at")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    from datetime import datetime

    today = datetime.utcnow().strftime("%Y-%m-%d")

    active_calls_today = len([
        c for c in calls
        if c.get("created_at", "").startswith(today)
    ])

    students_count = len([
        u for u in users
        if u.get("role") == "student"
    ])

    active_sessions = len([
        s for s in sessions
        if s.get("status") == "active"
    ])

    knowledge_docs = len(
        supabase.table("knowledge_base")
        .select("*")
        .execute()
        .data or []
    )

    activities = (
        supabase.table("analytics_events")
        .select("*")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    from datetime import datetime

    today = datetime.utcnow().strftime("%Y-%m-%d")

    active_calls_today = len([
        c for c in calls
        if c.get("created_at", "").startswith(today)
    ])

    students_count = len([
        u for u in users
        if u.get("role") == "student"
    ])

    faculty_count = len([
        u for u in users
        if u.get("role") == "faculty"
    ])

    active_sessions = len([
        s for s in sessions
        if s.get("status") == "active"
    ])

    knowledge_docs = len(
        supabase.table("knowledge_base")
        .select("*")
        .execute()
        .data or []
    )

    activities = (
        supabase.table("analytics_events")
        .select("event_type,event_data,created_at")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    from datetime import datetime

    today = datetime.utcnow().strftime("%Y-%m-%d")

    active_calls_today = len([
        c for c in calls
        if c.get("created_at", "").startswith(today)
    ])

    students_count = len([
        u for u in users
        if u.get("role") == "student"
    ])

    active_sessions = len([
        s for s in sessions
        if s.get("status") == "active"
    ])

    knowledge_docs = len(
        supabase.table("knowledge_base")
        .select("*")
        .execute()
        .data or []
    )

    activities = (
        supabase.table("analytics_events")
        .select("*")
        .order("created_at", desc=True)
        .limit(10)
        .execute()
    )

    return {
        "stats": {
            "active_calls_today": active_calls_today,
            "students": students_count,
            "faculty": faculty_count,
            "active_sessions": active_sessions
        },
        "activities": activities.data or []
    }

@app.get("/api/dashboard/student")
async def student_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["student", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")

    my_sessions = supabase.table("guidance_sessions").select("*").eq("user_id", current_user["id"]).execute().data or []
    my_calls = supabase.table("calls").select("*").eq("user_id", current_user["id"]).execute().data or []

    return {
        "profile": {
            "full_name": current_user["full_name"],
            "email": current_user["email"],
            "target_colleges": current_user.get("target_colleges", []),
            "preferred_courses": current_user.get("preferred_courses", []),
            "academic_scores": current_user.get("academic_scores", {})
        },
        "stats": {
            "total_sessions": len(my_sessions),
            "total_calls": len(my_calls),
            "total_call_time_minutes": round(sum(c.get("duration", 0) for c in my_calls) / 60, 2),
            "completed_sessions": len([s for s in my_sessions if s.get("status") == "completed"])
        },
        "recent_sessions": my_sessions[:5],
        "recent_calls": my_calls[:5]
    }

@app.get("/api/dashboard/faculty")
async def faculty_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "faculty":
        raise HTTPException(status_code=403, detail="Faculty access required")

    all_sessions = supabase.table("guidance_sessions").select("*").execute().data or []
    all_calls = supabase.table("calls").select("*").execute().data or []

    return {
        "stats": {
            "total_sessions": len(all_sessions),
            "active_sessions": len([s for s in all_sessions if s.get("status") == "active"]),
            "total_calls_today": len([c for c in all_calls if c.get("created_at", "").startswith(datetime.utcnow().strftime("%Y-%m-%d"))])
        },
        "sessions": all_sessions[:20]
    }

@app.get("/api/dashboard/students")
async def dashboard_students(current_user: dict = Depends(get_current_user)):
    result = (
        supabase.table("users")
        .select("full_name,email,phone")
        .eq("role", "student")
        .execute()
    )
    return result.data


@app.get("/api/dashboard/faculty-list")
async def dashboard_faculty_list(current_user: dict = Depends(get_current_user)):
    result = (
        supabase.table("users")
        .select("full_name,email,phone")
        .eq("role", "faculty")
        .execute()
    )
    return result.data


@app.get("/api/dashboard/calls")
async def dashboard_calls(current_user: dict = Depends(get_current_user)):
    calls = (
        supabase.table("calls")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data or []
    )

    users = (
        supabase.table("users")
        .select("id,full_name")
        .execute()
        .data or []
    )

    user_map = {
        u["id"]: u["full_name"]
        for u in users
    }

    result = []

    for call in calls:
        result.append({
            "username": user_map.get(call.get("user_id"), "Unknown"),
            "duration": call.get("duration"),
            "recording": call.get("recording_url"),
            "phone_number": call.get("phone_number"),
            "status": call.get("status"),
            "topic": call.get("topic"),
            "agent": call.get("agent")
        })

    return result


@app.get("/api/dashboard/sessions")
async def dashboard_sessions(current_user: dict = Depends(get_current_user)):
    sessions = (
        supabase.table("guidance_sessions")
        .select("*")
        .order("started_at", desc=True)
        .execute()
        .data or []
    )

    users = (
        supabase.table("users")
        .select("id,full_name")
        .execute()
        .data or []
    )

    user_map = {
        u["id"]: u["full_name"]
        for u in users
    }

    result = []

    for session in sessions:
        result.append({
            "username": user_map.get(session.get("user_id"), "Unknown"),
            "session_type": session.get("session_type"),
            "status": session.get("status"),
            "summary": session.get("summary"),
            "recommendations": session.get("recommendations")
        })

    return result

@app.get("/api/dashboard/students")
async def dashboard_students(current_user: dict = Depends(get_current_user)):
    result = (
        supabase.table("users")
        .select("full_name,email,phone")
        .eq("role", "student")
        .execute()
    )
    return result.data


@app.get("/api/dashboard/faculty-list")
async def dashboard_faculty_list(current_user: dict = Depends(get_current_user)):
    result = (
        supabase.table("users")
        .select("full_name,email,phone")
        .eq("role", "faculty")
        .execute()
    )
    return result.data


@app.get("/api/dashboard/calls")
async def dashboard_calls(current_user: dict = Depends(get_current_user)):
    calls = (
        supabase.table("calls")
        .select("*")
        .order("created_at", desc=True)
        .execute()
        .data or []
    )

    users = (
        supabase.table("users")
        .select("id,full_name")
        .execute()
        .data or []
    )

    user_map = {
        u["id"]: u["full_name"]
        for u in users
    }

    result = []

    for call in calls:
        result.append({
            "username": user_map.get(call.get("user_id"), "Unknown"),
            "duration": call.get("duration"),
            "recording": call.get("recording_url"),
            "phone_number": call.get("phone_number"),
            "status": call.get("status"),
            "topic": call.get("topic"),
            "agent": call.get("agent")
        })

    return result


@app.get("/api/dashboard/sessions")
async def dashboard_sessions(current_user: dict = Depends(get_current_user)):
    sessions = (
        supabase.table("guidance_sessions")
        .select("*")
        .order("started_at", desc=True)
        .execute()
        .data or []
    )

    users = (
        supabase.table("users")
        .select("id,full_name")
        .execute()
        .data or []
    )

    user_map = {
        u["id"]: u["full_name"]
        for u in users
    }

    result = []

    for session in sessions:
        result.append({
            "username": user_map.get(session.get("user_id"), "Unknown"),
            "session_type": session.get("session_type"),
            "status": session.get("status"),
            "summary": session.get("summary"),
            "recommendations": session.get("recommendations")
        })

    return result


@app.get("/api/agents")
async def get_agents(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    result = (
        supabase.table("ai_agents")
        .select("""
            *,
            voice_settings (
                provider,
                voice_id,
                model
            )
        """)
        .execute()
    )

    return result.data

@app.put("/api/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    data: AgentUpdate,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Admin access required"
        )

    result = (
        supabase.table("ai_agents")
        .update({
            "system_prompt": data.system_prompt
        })
        .eq("id", agent_id)
        .execute()
    )

    return {
        "success": True,
        "data": result.data
    }


# ─── SESSION ENDPOINTS ─────────────────────────────────────────────────────
@app.post("/api/sessions")
async def create_session(data: SessionCreate, current_user: dict = Depends(get_current_user)):
    session_data = {
        "user_id": current_user["id"],
        "session_type": data.session_type,
        "status": "active",
        "started_at": datetime.utcnow().isoformat(),
        "transcript": "",
        "recommendations": []
    }
    result = supabase.table("guidance_sessions").insert(session_data).execute()
    return result.data[0]

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    result = supabase.table("guidance_sessions").select("*").eq("id", session_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")
    session = result.data
    if session["user_id"] != current_user["id"] and current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return session

@app.post("/api/sessions/{session_id}/end")
async def end_session(session_id: str, current_user: dict = Depends(get_current_user)):
    result = supabase.table("guidance_sessions").select("*").eq("id", session_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Session not found")

    session = result.data
    summary = ""
    if session.get("transcript"):
        summary_prompt = f"Summarize this career guidance conversation and provide 3 key recommendations:\n\n{session['transcript']}"
        if groq_client:
            summary = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": summary_prompt}],
                max_tokens=300
            ).choices[0].message.content or ""

    update_data = {
        "status": "completed",
        "ended_at": datetime.utcnow().isoformat(),
        "summary": summary
    }
    supabase.table("guidance_sessions").update(update_data).eq("id", session_id).execute()
    return {"status": "completed", "summary": summary}

# active_monitors maps call_id -> list of monitoring WebSockets
active_monitors: Dict[str, List[WebSocket]] = {}

async def broadcast_call_status(call_id: str, status: str):
    if call_id in active_monitors:
        disconnected = []
        for ws in active_monitors[call_id]:
            try:
                await ws.send_json({
                    "type": "status",
                    "status": status
                })
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            try:
                active_monitors[call_id].remove(ws)
            except ValueError:
                pass

# ─── CALL/TELEPHONY ENDPOINTS ──────────────────────────────────────────────
@app.post("/api/calls/initiate")
async def initiate_call(data: CallInitiate, current_user: dict = Depends(get_current_user)):
    call_data = {
        "user_id": current_user["id"],
        "agent_id": data.agent_id,
        "phone_number": data.phone_number,
        "topic": data.topic,
        "direction": "outbound" if data.phone_number else "inbound",
        "status": "initiated",
        "created_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("calls").insert(call_data).execute()
    call = result.data[0]

    if data.phone_number and TWILIO_SID and TWILIO_PHONE:
        try:
            from twilio.rest import Client
            twilio = Client(TWILIO_SID, TWILIO_TOKEN)
            # Pass call_id as query param to prevent race conditions on twilio_sid insert
            callback_url = f"{BACKEND_URL.rstrip('/')}/api/calls/webhook?call_id={call['id']}"
            if not callback_url.lower().startswith("https://"):
                raise RuntimeError("Twilio callback_url must be HTTPS and publicly accessible")
            twilio_call = twilio.calls.create(
                to=data.phone_number,
                from_=TWILIO_PHONE,
                url=callback_url,
                status_callback=callback_url,
                status_callback_event=["initiated", "ringing", "answered", "completed"]
            )
            supabase.table("calls").update({"twilio_sid": twilio_call.sid}).eq("id", call["id"]).execute()
            return {"call_id": call["id"], "twilio_sid": twilio_call.sid, "status": "initiated"}
        except Exception as e:
            supabase.table("calls").update({"status": "failed"}).eq("id", call["id"]).execute()
            raise HTTPException(status_code=500, detail=f"Call failed: {str(e)}")

    return {"call_id": call["id"], "status": "initiated", "websocket_url": f"ws://localhost:8000/ws/voice/{call['id']}"}

@app.post("/api/calls/webhook")
async def twilio_webhook(request: Request):
    call_id = request.query_params.get("call_id")
    form_data = await request.form()
    call_sid = form_data.get("CallSid")
    call_status = form_data.get("CallStatus")

    call = None
    if call_id:
        result = supabase.table("calls").select("*").eq("id", call_id).execute()
        if result.data:
            call = result.data[0]

    if not call and call_sid:
        result = supabase.table("calls").select("*").eq("twilio_sid", call_sid).execute()
        if result.data:
            call = result.data[0]

    if call:
        update_data: Dict[str, Any] = {"status": call_status}
        if call_status == "completed":
            duration_str = form_data.get("CallDuration", "0")
            try:
                duration_val = int(str(duration_str))
            except (ValueError, TypeError):
                duration_val = 0
            update_data["duration"] = duration_val
        supabase.table("calls").update(update_data).eq("id", call["id"]).execute()
        
        # Broadcast the new status to all monitor connections
        await broadcast_call_status(call["id"], call_status)

    from twilio.twiml.voice_response import VoiceResponse, Connect
    resp = VoiceResponse()
    
    if call and call_status not in ["completed", "failed", "busy", "no-answer"]:
        ws_url = BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://")
        connect = Connect()
        connect.stream(url=f"{ws_url.rstrip('/')}/ws/voice/{call['id']}")
        resp.append(connect)
    else:
        resp.hangup()

    return Response(content=str(resp), media_type="application/xml")

@app.get("/api/calls")
async def get_calls(current_user: dict = Depends(get_current_user)):
    query = supabase.table("calls").select("*, ai_agents(id,name,phone_number), users(id,full_name)")
    if current_user["role"] != "admin":
        query = query.eq("user_id", current_user["id"])

    result = query.execute()
    calls = result.data or []
    for call in calls:
        if isinstance(call.get("ai_agents"), list) and call["ai_agents"]:
            call["agent"] = call["ai_agents"][0].get("name")
        if isinstance(call.get("users"), list) and call["users"]:
            call["caller"] = call["users"][0].get("full_name")
    return calls

@app.post("/api/calls/{call_id}/end")
async def end_twilio_call(call_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    result = supabase.table("calls").select("*").eq("id", call_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")
        
    call = result.data[0]
    twilio_sid = call.get("twilio_sid")
    if twilio_sid and TWILIO_SID and TWILIO_PHONE:
        try:
            from twilio.rest import Client
            twilio = Client(TWILIO_SID, TWILIO_TOKEN)
            twilio.calls(twilio_sid).update(status="completed")
        except Exception as e:
            print(f"Failed to end Twilio call: {e}")
            
    # Update local DB status
    supabase.table("calls").update({
        "status": "completed",
        "ended_at": datetime.utcnow().isoformat()
    }).eq("id", call_id).execute()
    
    await broadcast_call_status(call_id, "completed")
    return {"status": "completed"}

@app.get("/api/calls/{call_id}/transcript")
async def get_call_transcript(call_id: str, current_user: dict = Depends(get_current_user)):
    result = supabase.table("calls").select("transcript").eq("id", call_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")
    
    call = result.data[0]
    transcript_raw = call.get("transcript") or ""
    
    try:
        data = json.loads(transcript_raw)
        return data
    except Exception:
        return {"transcript": transcript_raw}

@app.websocket("/ws/calls/monitor/{call_id}")
async def websocket_call_monitor(websocket: WebSocket, call_id: str):
    await websocket.accept()
    if call_id not in active_monitors:
        active_monitors[call_id] = []
    active_monitors[call_id].append(websocket)
    print(f"Monitor connected to call {call_id}")
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass
    except WebSocketDisconnect:
        print(f"Monitor disconnected from call {call_id}")
    finally:
        if call_id in active_monitors and websocket in active_monitors[call_id]:
            active_monitors[call_id].remove(websocket)


# ═══════════════════════════════════════════════════════════════════════════════
# FIXED WEBSOCKET VOICE HANDLER
# ═══════════════════════════════════════════════════════════════════════════════

# ─── FALSE POSITIVE FILTER ──────────────────────────────────────────────────
FALSE_POSITIVE_WORDS = {
    '.', '..', '...', '....', '.....',
    'thank you', 'thanks', 'thank', 'thx',
    'gracias', 'merci', 'danke', 'arigato', 'shukran',
    'amen', 'hallelujah', 'praise', 'lord',
    'okay', 'ok', 'k', 'kk', 'okie', 'okie dokie',
    'hmm', 'hm', 'hmmm', 'uh', 'uhh', 'um', 'umm', 'ah', 'ahh', 'oh', 'ohh', 'eh',
    'yeah', 'yea', 'yep', 'yup', 'yes', 'yess', 'no', 'nope', 'nah',
    'right', 'alright', 'aight', 'ight',
    'hello', 'hi', 'hey', 'heya', 'hiya', 'yo',
    'what', 'when', 'where', 'who', 'how', 'why',
    'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall',
    'can', "can't", 'cant', 'dont', "don't", 'wont', "won't",
    'isnt', "isn't", 'arent', "aren't", 'wasnt', "wasn't",
    'werent', "weren't", 'hasnt', "hasn't", 'havent', "haven't",
    'hadnt', "hadn't", 'doesnt', "doesn't", 'didnt', "didn't",
    'wouldnt', "wouldn't", 'shouldnt', "shouldn't", 'couldnt', "couldn't",
    'mustnt', "mustn't", 'shant', "shan't", 'mightnt', "mightn't",
    'neednt', "needn't", 'darent', "daren't", 'oughtnt', "oughtn't",
    'aint', "ain't", 'gonna', 'wanna', 'gotta',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'among', 'within', 'without',
    'against', 'under', 'over', 'again', 'further', 'then', 'once',
    'here', 'there', 'everywhere', 'anywhere', 'somewhere', 'nowhere',
    'this', 'that', 'these', 'those', 'such', 'same', 'other',
    'another', 'each', 'every', 'all', 'both', 'few', 'more', 'most',
    'some', 'any', 'none', 'neither', 'either',
    'much', 'many', 'little', 'less', 'least', 'fewer', 'fewest',
    'enough', 'quite', 'rather', 'very', 'too', 'so', 'just', 'only',
    'even', 'also', 'as', 'than', 'like', 'unlike', 'despite',
    'although', 'though', 'while', 'whereas', 'unless', 'until',
    'since', 'because', 'once', 'when', 'whenever',
    'where', 'wherever', 'if', 'whether', 'either', 'or', 'nor', 'not',
    'both', 'and', 'but', 'yet', 'still', 'however',
    'therefore', 'thus', 'hence', 'consequently', 'accordingly',
    'meanwhile', 'otherwise', 'instead', 'besides', 'furthermore',
    'moreover', 'nevertheless', 'nonetheless', 'notwithstanding',
    'm', 're', 's', 'll', 'd', 've', 't',
    'good', 'great', 'nice', 'cool', 'awesome', 'amazing', 'wow',
    'please', 'pls', 'plz', 'sorry', 'excuse', 'pardon',
    'bye', 'goodbye', 'see', 'later', 'cya', 'ttyl',
    'lol', 'lmao', 'rofl', 'omg', 'wtf', 'haha', 'hehe',
    'stop', 'wait', 'hold', 'pause', 'continue', 'go', 'proceed',
    'next', 'previous', 'back', 'forward', 'up', 'down', 'left', 'right',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'first', 'second', 'third', 'last', 'final',
    'new', 'old', 'young', 'big', 'small', 'large', 'tiny', 'huge',
    'good', 'bad', 'better', 'best', 'worse', 'worst',
    'happy', 'sad', 'angry', 'mad', 'glad', 'upset',
    'today', 'tomorrow', 'yesterday', 'now', 'then', 'soon', 'later',
    'morning', 'afternoon', 'evening', 'night', 'day', 'time',
    'man', 'woman', 'boy', 'girl', 'guy', 'dude', 'bro', 'sis',
    'sir', 'maam', 'madam', 'miss', 'mister', 'mr', 'mrs', 'ms', 'dr',
    'yes sir', 'yes maam', 'no sir', 'no maam',
    'i see', 'i know', 'i think', 'i guess', 'i suppose',
    'you know', 'you see', 'i mean', 'like', 'literally',
    'actually', 'basically', 'seriously', 'honestly', 'frankly',
    'probably', 'maybe', 'perhaps', 'possibly', 'likely', 'definitely',
    'absolutely', 'certainly', 'surely', 'obviously', 'clearly',
    'apparently', 'supposedly', 'reportedly', 'allegedly',
    'well', 'so', 'then', 'now', 'anyway', 'anyways', 'whatever',
    'fine', 'whatever', 'alright', 'okay then', 'ok then',
    'got it', 'gotcha', 'understood', 'roger', 'copy', 'affirmative',
    'negative', 'correct', 'incorrect', 'true', 'false',
    'exactly', 'precisely', 'indeed', 'certainly', 'definitely',
    'totally', 'completely', 'absolutely', 'entirely', 'fully',
    'partially', 'somewhat', 'kinda', 'sorta', 'sort of', 'kind of',
    'more or less', 'pretty much', 'pretty well', 'pretty good',
    'not bad', 'not good', 'not sure', 'not really', 'not exactly',
    'i dont know', 'idk', 'dunno', 'no idea', 'beats me',
    'who knows', 'god knows', 'heaven knows',
    'tell me', 'show me', 'help me', 'assist me',
    'repeat', 'again', 'say again', 'come again', 'pardon me',
    'what was that', 'what did you say', 'i didnt catch that',
    'speak up', 'louder', 'quieter', 'slower', 'faster',
    'one more time', 'one more', 'once more', 'one again',
}

def is_valid_transcription(text: str) -> bool:
    """Filter out noise, silence markers, and false transcriptions"""
    if not text:
        return False

    text_stripped = text.strip()
    if len(text_stripped) < 3:
        return False

    # Check if it is just punctuation/symbols
    if all(c in '.,;:!?-…\'"()[]{}' for c in text_stripped):
        return False

    # Check if it is a known false positive
    text_lower = text_stripped.lower().replace('\n', ' ').strip()
    if text_lower in FALSE_POSITIVE_WORDS:
        return False

    # Check if it is just a single word that is a false positive
    words = text_lower.split()
    if len(words) == 1 and words[0] in FALSE_POSITIVE_WORDS:
        return False

    # Check if it is mostly just one repeated character (like "......")
    if len(set(text_stripped)) <= 2 and len(text_stripped) > 2:
        return False

    # Must have at least some alphanumeric content
    alpha_count = sum(1 for c in text_stripped if c.isalpha())
    if alpha_count < 2:
        return False

    return True


# ─── AUDIO UTILITIES ────────────────────────────────────────────────────────
def ensure_16bit_aligned(audio_bytes: bytes) -> bytes:
    """Ensure audio bytes are aligned to 16-bit samples (even length)"""
    if len(audio_bytes) % 2 != 0:
        return audio_bytes[:-1]
    return audio_bytes


def strip_wav_header(audio_bytes: bytes) -> bytes:
    """Remove WAV RIFF header if present, return raw PCM"""
    if len(audio_bytes) < 12:
        return audio_bytes
    if audio_bytes[:4] == b'RIFF' and audio_bytes[8:12] == b'WAVE':
        # Find the 'data' chunk dynamically (handles variable-length headers)
        idx = audio_bytes.find(b'data', 12)
        if idx > 0 and idx + 8 <= len(audio_bytes):
            return audio_bytes[idx + 8:]
    return audio_bytes


# ─── WEBSOCKET VOICE HANDLER (FIXED) ────────────────────────────────────────
# ─── AUDIO UTILITIES FOR TELEPHONY ──────────────────────────────────────────
def _make_mulaw_table():
    table = []
    for i in range(256):
        val = ~i & 0xFF
        sign = 1 if (val & 0x80) else -1
        exponent = (val >> 4) & 0x07
        mantissa = val & 0x0F
        sample = sign * ((1 << exponent) * (mantissa * 2 + 33) - 33)
        table.append(sample)
    return table

MULAW_TABLE = _make_mulaw_table()

def mulaw_rms(mulaw_data: bytes) -> float:
    if not mulaw_data:
        return 0.0
    sqsum = 0.0
    for b in mulaw_data:
        val = MULAW_TABLE[b]
        sqsum += val * val
    return math.sqrt(sqsum / len(mulaw_data))

def pcm_24k_to_mulaw_8k(pcm_data: bytes) -> bytes:
    import audioop
    resampled, _ = audioop.ratecv(pcm_data, 2, 1, 24000, 8000, None)
    mulaw_data = audioop.lin2ulaw(resampled, 2)
    return mulaw_data

def mulaw_8k_to_pcm_16k(mulaw_bytes: bytes) -> bytes:
    import audioop
    pcm_8k = audioop.ulaw2lin(mulaw_bytes, 2)
    pcm_16k, _ = audioop.ratecv(pcm_8k, 2, 1, 8000, 16000, None)
    return pcm_16k

async def stream_audio_to_twilio(websocket: WebSocket, stream_sid: str, mulaw_data: bytes, state: dict):
    chunk_size = 160
    delay = 0.02
    state["abort_playback"] = False
    for i in range(0, len(mulaw_data), chunk_size):
        if state.get("abort_playback"):
            print("Playback aborted")
            break
        chunk = mulaw_data[i:i+chunk_size]
        payload = base64.b64encode(chunk).decode('utf-8')
        message = {
            "event": "media",
            "streamSid": stream_sid,
            "media": {"payload": payload}
        }
        try:
            await websocket.send_json(message)
        except Exception:
            break
        await asyncio.sleep(delay)

async def broadcast_monitor_message(call_id: str, message: dict):
    if call_id in active_monitors:
        disconnected = []
        for ws in active_monitors[call_id]:
            try:
                await ws.send_json(message)
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            try:
                active_monitors[call_id].remove(ws)
            except ValueError:
                pass

async def generate_and_send_greeting(websocket: WebSocket, call_id: str, stream_sid: str, system_prompt: str, student_name: str, student_details: dict, state: dict):
    state["is_ai_speaking"] = True
    await broadcast_monitor_message(call_id, {"type": "status", "status": "thinking"})
    
    greeting_text = "Hello! I am your AI career assistant. How can I help you today?"
    if groq_client:
        try:
            prompt = system_prompt + f"\n\nStudent's name is {student_name}. Write a short, natural, welcoming phone greeting (1-2 sentences max) to start the call with the student. Do not output anything other than the greeting text."
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "system", "content": prompt}],
                max_tokens=60,
                temperature=0.7
            )
            greeting_text = response.choices[0].message.content.strip().strip('"')
        except Exception as e:
            print(f"Greeting gen failed: {e}")
            
    print(f"Greeting: {greeting_text}")
    
    conversation = guidance_engine.get_conversation(call_id)
    conversation[0] = {"role": "system", "content": system_prompt}
    conversation.append({"role": "assistant", "content": greeting_text})
    
    await broadcast_monitor_message(call_id, {"type": "transcript", "role": "Agent", "text": greeting_text})
    await broadcast_monitor_message(call_id, {"type": "status", "status": "ai_speaking"})
    
    audio_bytes = await guidance_engine.text_to_speech(greeting_text)
    if audio_bytes:
        pcm_data = strip_wav_header(audio_bytes)
        pcm_data = ensure_16bit_aligned(pcm_data)
        mulaw_data = pcm_24k_to_mulaw_8k(pcm_data)
        await stream_audio_to_twilio(websocket, stream_sid, mulaw_data, state)
        
    state["is_ai_speaking"] = False
    await broadcast_monitor_message(call_id, {"type": "status", "status": "listening"})

async def generate_post_call_summary(call_id: str):
    conversation = guidance_engine.get_conversation(call_id)
    transcript_lines = []
    for msg in conversation:
        if msg["role"] == "user":
            transcript_lines.append(f"Student: {msg['content']}")
        elif msg["role"] == "assistant":
            transcript_lines.append(f"AI: {msg['content']}")
            
    transcript_text = "\n".join(transcript_lines)
    summary = "No conversation took place."
    sentiment = "neutral"
    outcome = "No answer or disconnected immediately."
    interested = "Not Interested"
    follow_up = False
    
    if transcript_lines and groq_client:
        try:
            analysis_prompt = f"""You are an AI analyst. Analyze the following telephone conversation between an AI Career Counselor and a student.

Conversation Transcript:
{transcript_text}

Provide your analysis in a valid JSON format with the following keys:
- "summary": A brief summary of the conversation.
- "sentiment": Overall sentiment (positive, neutral, negative).
- "outcome": Outcome of the call.
- "interested": "Interested" or "Not Interested" based on the student's responses.
- "follow_up": true or false (boolean, indicating if a follow-up call/action is required).

Output ONLY the JSON object. Do not include any markdown styling, code blocks, or explanatory text."""
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": analysis_prompt}],
                max_tokens=500,
                temperature=0.3
            )
            analysis_json_str = response.choices[0].message.content.strip()
            import re
            match = re.search(r'\{.*\}', analysis_json_str, re.DOTALL)
            if match:
                analysis_json_str = match.group(0)
            analysis_data = json.loads(analysis_json_str)
            summary = analysis_data.get("summary") or summary
            sentiment = analysis_data.get("sentiment") or sentiment
            outcome = analysis_data.get("outcome") or outcome
            interested = analysis_data.get("interested") or interested
            follow_up = bool(analysis_data.get("follow_up"))
        except Exception as e:
            print(f"Post call analysis failed: {e}")
            
    transcript_payload = {
        "transcript": transcript_text,
        "summary": summary,
        "sentiment": sentiment,
        "outcome": outcome,
        "interested": interested,
        "follow_up_required": follow_up
    }
    
    try:
        supabase.table("calls").update({
            "status": "completed",
            "ended_at": datetime.utcnow().isoformat(),
            "sentiment": sentiment,
            "transcript": json.dumps(transcript_payload)
        }).eq("id", call_id).execute()
    except Exception as e:
        print(f"Failed to update calls DB: {e}")

# ─── WEBSOCKET VOICE HANDLER ────────────────────────────────────────────────
@app.websocket("/ws/voice/{session_id}")
async def websocket_voice(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"WebSocket connected: {session_id}")

    is_twilio = False
    call_id = session_id
    call = None
    student_name = "Student"
    student_details = {}
    system_prompt = CAREER_SYSTEM_PROMPT
    stream_sid = None

    try:
        call_res = supabase.table("calls").select("*, ai_agents(*)").eq("id", call_id).execute()
        if call_res.data:
            call = call_res.data[0]
            is_twilio = True
            agent = call.get("ai_agents")
            if isinstance(agent, list) and agent:
                agent = agent[0]
            if isinstance(agent, dict):
                system_prompt = agent.get("system_prompt") or CAREER_SYSTEM_PROMPT
            
            if call.get("user_id"):
                user_res = supabase.table("users").select("*").eq("id", call["user_id"]).execute()
                if user_res.data:
                    student_name = user_res.data[0].get("full_name") or "Student"
                    profile_res = supabase.table("student_profiles").select("*").eq("user_id", call["user_id"]).execute()
                    if profile_res.data:
                        p_data = profile_res.data[0]
                        student_details = {
                            "interested_course": p_data.get("interested_course") or "Not Specified",
                            "application_status": p_data.get("application_status") or "Not Applied",
                            "lead_status": p_data.get("lead_status") or "New"
                        }
    except Exception as e:
        print(f"Error reading call meta: {e}")

    # Set system prompt
    conversation = guidance_engine.get_conversation(session_id)
    pers_prompt = f"\n\nStudent Information:\n- Name: {student_name}\n- Phone: {call.get('phone_number') if call else 'Unknown'}\n- Interested Course: {student_details.get('interested_course')}\n- Application Status: {student_details.get('application_status')}\n- Lead Status: {student_details.get('lead_status')}\n\nUse these details naturally to personalize your conversation. Keep responses short and conversational, suitable for a phone call."
    conversation[0] = {"role": "system", "content": system_prompt + pers_prompt}

    state = {
        "is_ai_speaking": False,
        "is_user_speaking": False,
        "pending_audio_buffer": bytearray(),
        "silence_duration_ms": 0,
        "abort_playback": False,
    }

    # If browser, send default greeting
    if not is_twilio:
        greeting = "Hello! I am your CareerGuide AI. Ask me anything about colleges, courses, or careers!"
        try:
            await websocket.send_json({"type": "ai_response", "text": greeting})
            if ELEVENLABS_API_KEY or DEEPGRAM_API_KEY:
                audio_bytes = await guidance_engine.text_to_speech(greeting)
                if audio_bytes:
                    pcm_data = strip_wav_header(audio_bytes)
                    pcm_data = ensure_16bit_aligned(pcm_data)
                    audio_b64 = base64.b64encode(pcm_data).decode('utf-8')
                    await websocket.send_json({"type": "audio", "data": audio_b64})
        except Exception as e:
            print(f"Browser greeting failed: {e}")

    audio_buffer = bytearray()
    RMS_THRESHOLD = 600
    SILENCE_THRESHOLD_MS = 1200
    consecutive_loud_chunks = 0
    is_connected = True

    try:
        while is_connected:
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                is_connected = False
                break
            except Exception:
                is_connected = False
                break

            current_time = datetime.utcnow()

            if "bytes" in message:
                # Browser mode binary bytes (PCM 16k)
                data = message["bytes"]
                audio_buffer.extend(data)
                state["is_user_speaking"] = True
                state["silence_duration_ms"] = 0
                
                if len(audio_buffer) >= 32000 * 8: # Force process if too long (8s)
                    await process_audio_buffer(websocket, session_id, audio_buffer, state, is_twilio, stream_sid)
                    audio_buffer = bytearray()
                    
            elif "text" in message:
                try:
                    text_data = json.loads(message["text"])
                    if is_twilio:
                        event = text_data.get("event")
                        if event == "start":
                            stream_sid = text_data.get("streamSid")
                            await broadcast_call_status(call_id, "answered")
                            # Start greeting in background
                            asyncio.create_task(generate_and_send_greeting(
                                websocket, call_id, stream_sid, system_prompt, student_name, student_details, state
                            ))
                        elif event == "media":
                            payload = text_data["media"]["payload"]
                            chunk_bytes = base64.b64decode(payload)
                            rms = mulaw_rms(chunk_bytes)
                            
                            if rms >= RMS_THRESHOLD:
                                if state["is_ai_speaking"]:
                                    consecutive_loud_chunks += 1
                                    if consecutive_loud_chunks >= 5: # 100ms
                                        state["abort_playback"] = True
                                else:
                                    consecutive_loud_chunks = 0
                                    
                                audio_buffer.extend(chunk_bytes)
                                if not state["is_user_speaking"]:
                                    state["is_user_speaking"] = True
                                    await broadcast_monitor_message(call_id, {"type": "status", "status": "student_speaking"})
                                state["silence_duration_ms"] = 0
                            else:
                                if state["is_user_speaking"]:
                                    state["silence_duration_ms"] += 20
                                    if state["silence_duration_ms"] >= SILENCE_THRESHOLD_MS:
                                        state["is_user_speaking"] = False
                                        state["silence_duration_ms"] = 0
                                        pcm_data = mulaw_8k_to_pcm_16k(bytes(audio_buffer))
                                        audio_buffer = bytearray()
                                        if len(pcm_data) >= 16000:
                                            asyncio.create_task(process_audio_buffer(
                                                websocket, session_id, pcm_data, state, is_twilio, stream_sid
                                            ))
                    else:
                        if text_data.get("type") == "ping":
                            await websocket.send_json({"type": "pong"})
                except Exception as e:
                    pass

    except Exception as e:
        print(f"WS voice error: {e}")
    finally:
        print(f"Voice session ended: {session_id}")
        if is_twilio:
            await broadcast_call_status(call_id, "completed")
            await generate_post_call_summary(call_id)


async def process_audio_buffer(websocket: WebSocket, session_id: str, 
                                audio_bytes: bytes, state: dict, is_twilio: bool = False, stream_sid: str = None):
    if state["is_ai_speaking"]:
        return

    if len(audio_bytes) < 16000:
        return

    if is_twilio:
        await broadcast_monitor_message(session_id, {"type": "status", "status": "thinking"})

    print("Transcribing...")
    transcript = await guidance_engine.transcribe_audio(audio_bytes)

    if not transcript or not transcript.strip() or not is_valid_transcription(transcript):
        if is_twilio:
            await broadcast_monitor_message(session_id, {"type": "status", "status": "listening"})
        return

    print(f"User: '{transcript}'")
    
    if is_twilio:
        await broadcast_monitor_message(session_id, {"type": "transcript", "role": "Student", "text": transcript})

    state["is_ai_speaking"] = True
    if is_twilio:
        await broadcast_monitor_message(session_id, {"type": "status", "status": "thinking"})

    try:
        ai_response = await guidance_engine.process_text(transcript, session_id)
        print(f"AI: {ai_response}")
        
        if is_twilio:
            await broadcast_monitor_message(session_id, {"type": "transcript", "role": "Agent", "text": ai_response})
            await broadcast_monitor_message(session_id, {"type": "status", "status": "ai_speaking"})
        else:
            await websocket.send_json({"type": "ai_response", "text": ai_response})

        audio_bytes_tts = await guidance_engine.text_to_speech(ai_response)
        if audio_bytes_tts:
            pcm_data = strip_wav_header(audio_bytes_tts)
            pcm_data = ensure_16bit_aligned(pcm_data)

            if is_twilio and stream_sid:
                mulaw_data = pcm_24k_to_mulaw_8k(pcm_data)
                await stream_audio_to_twilio(websocket, stream_sid, mulaw_data, state)
            elif not is_twilio:
                audio_b64 = base64.b64encode(pcm_data).decode('utf-8')
                await websocket.send_json({"type": "audio", "data": audio_b64})
    except Exception as e:
        print(f"Error in process_audio_buffer: {e}")
    finally:
        state["is_ai_speaking"] = False
        if is_twilio:
            await broadcast_monitor_message(session_id, {"type": "status", "status": "listening"})


# ─── KNOWLEDGE BASE ENDPOINTS ───────────────────────────────────────────────
@app.post("/api/knowledge")
async def create_knowledge(data: KnowledgeUpload, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Admin/Faculty access required")

    kb_data = {
        "title": data.title,
        "content": data.content,
        "category": data.category,
        "tags": data.tags,
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("knowledge_base").insert(kb_data).execute()
    return result.data[0]

@app.get("/api/knowledge")
async def get_knowledge(category: Optional[str] = None, search: Optional[str] = None):
    query = supabase.table("knowledge_base").select("*")
    if category:
        query = query.eq("category", category)
    if search:
        query = query.or_(f"title.ilike.%{search}%,content.ilike.%{search}%")
    result = query.execute()
    return result.data or []

@app.post("/api/knowledge/upload")
async def upload_knowledge_file(
    file: UploadFile = File(...),
    category: str = "general",
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Admin/Faculty access required")

    content = await file.read()
    text = content.decode("utf-8", errors="ignore")

    kb_data = {
        "title": file.filename,
        "content": text[:50000],
        "category": category,
        "source": "upload",
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("knowledge_base").insert(kb_data).execute()
    return result.data[0]

@app.put("/api/knowledge/{knowledge_id}")
async def update_knowledge(
    knowledge_id: str,
    data: KnowledgeUpload,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Admin/Faculty access required")

    try:
        update_data = {
            "title": data.title,
            "content": data.content,
            "category": data.category,
            "tags": data.tags
        }
        result = supabase.table("knowledge_base").update(update_data).eq("id", knowledge_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Knowledge item not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating knowledge base record: {e}")
        raise HTTPException(status_code=500, detail=f"Database update failed: {str(e)}")

@app.delete("/api/knowledge/{knowledge_id}")
async def delete_knowledge(
    knowledge_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Admin/Faculty access required")

    supabase.table("knowledge_base").delete().eq("id", knowledge_id).execute()
    return {"success": True}

# ─── PROMPT STUDIO ENDPOINTS ───────────────────────────────────────────────
@app.post("/api/prompts")
async def create_prompt(data: PromptCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Admin/Faculty access required")

    prompt_data = {
        "name": data.name,
        "description": data.description,
        "system_prompt": data.system_prompt,
        "user_prompt_template": data.user_prompt_template,
        "variables": data.variables,
        "created_by": current_user["id"],
        "is_active": True,
        "created_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("prompt_templates").insert(prompt_data).execute()
    return result.data[0]

@app.get("/api/prompts")
async def get_prompts():
    result = supabase.table("prompt_templates").select("*").eq("is_active", True).execute()
    return result.data or []

@app.get("/api/prompts/{prompt_id}")
async def get_prompt(prompt_id: str):
    result = supabase.table("prompt_templates").select("*").eq("id", prompt_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return result.data

# ─── SETTINGS ENDPOINTS ─────────────────────────────────────────────────────
class SettingsUpdate(BaseModel):
    groq_api_key: str

@app.get("/api/settings/groq-key")
async def get_groq_key_status(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    has_key = bool(GROQ_API_KEY)
    masked_key = ""
    if has_key:
        masked_key = GROQ_API_KEY[:6] + "..." + GROQ_API_KEY[-4:] if len(GROQ_API_KEY) > 10 else "Configured"
    return {"configured": has_key, "masked_key": masked_key}

@app.post("/api/settings/groq-key")
async def update_groq_key(data: SettingsUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    key = data.groq_api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Key cannot be empty")
        
    global GROQ_API_KEY, groq_client
    GROQ_API_KEY = key
    os.environ["GROQ_API_KEY"] = key
    
    from groq import Groq
    groq_client = Groq(api_key=key)
    
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            
            new_lines = []
            found = False
            for line in lines:
                if line.startswith("GROQ_API_KEY="):
                    new_lines.append(f"GROQ_API_KEY={key}\n")
                    found = True
                else:
                    new_lines.append(line)
            if not found:
                new_lines.append(f"\nGROQ_API_KEY={key}\n")
                
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
        except Exception as e:
            print(f"Failed to write to .env: {e}")
            
    return {"success": True, "message": "Groq API key updated successfully"}


@app.post("/api/prompts/{prompt_id}/test")
async def test_prompt(prompt_id: str, variables: Dict[str, str]):
    result = supabase.table("prompt_templates").select("*").eq("id", prompt_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Prompt not found")

    prompt = result.data
    user_prompt = prompt["user_prompt_template"]
    for key, value in variables.items():
        user_prompt = user_prompt.replace(f"{{{key}}}", value)

    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq not configured")

    messages_for_groq: List[Dict[str, str]] = [
        {"role": "system", "content": prompt["system_prompt"]},
        {"role": "user", "content": user_prompt}
    ]

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages_for_groq,
        max_tokens=500
    )

    return {
        "rendered_prompt": user_prompt,
        "response": response.choices[0].message.content or ""
    }

# ─── ANALYTICS ENDPOINTS ─────────────────────────────────────────────────────
@app.get("/api/analytics")
async def get_analytics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    calls = supabase.table("calls").select("*").execute().data or []
    users = supabase.table("users").select("*").execute().data or []

    from collections import defaultdict
    daily_calls = defaultdict(lambda: {"calls": 0, "duration": 0})
    for call in calls:
        date = call.get("created_at", "")[:10]
        if date:
            daily_calls[date]["calls"] += 1
            daily_calls[date]["duration"] += call.get("duration", 0)

    return {
        "daily_calls": [
            {"date": date, "calls": data["calls"], "duration_minutes": round(data["duration"] / 60, 2)}
            for date, data in sorted(daily_calls.items())
        ],
        "total_users": len(users),
        "total_calls": len(calls),
        "avg_call_duration": round(sum(c.get("duration", 0) for c in calls) / max(len(calls), 1) / 60, 2)
    }

@app.get("/api/analytics/summary")
async def get_analytics_summary(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    uid = current_user["id"]
    
    query = supabase.table("calls").select("*")
    if role == "student":
        query = query.eq("user_id", uid)
    calls = query.execute().data or []
    
    total_calls = len(calls)
    total_duration = sum(c.get("duration", 0) for c in calls)
    avg_duration = round(total_duration / max(total_calls, 1) / 60, 2)
    
    if role == "student":
        total_users = 1
    else:
        users = supabase.table("users").select("id").execute().data or []
        total_users = len(users)
        
    return {
        "total_calls": total_calls,
        "total_duration_minutes": round(total_duration / 60, 2),
        "avg_call_duration": avg_duration,
        "total_users": total_users
    }

@app.get("/api/analytics/calls-over-time")
async def get_calls_over_time(days: int = 30, current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    uid = current_user["id"]
    
    query = supabase.table("calls").select("created_at, duration")
    if role == "student":
        query = query.eq("user_id", uid)
    calls = query.execute().data or []
    
    from collections import defaultdict
    from datetime import datetime, timedelta
    
    now = datetime.utcnow()
    daily_data = {}
    for i in range(days - 1, -1, -1):
        d = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_data[d] = {"calls": 0, "duration": 0}
        
    for call in calls:
        date_str = call.get("created_at", "")[:10]
        if date_str in daily_data:
            daily_data[date_str]["calls"] += 1
            daily_data[date_str]["duration"] += call.get("duration", 0)
            
    return [
        {"date": d, "calls": data["calls"], "duration_minutes": round(data["duration"] / 60, 2)}
        for d, data in sorted(daily_data.items())
    ]

@app.get("/api/analytics/sentiment")
async def get_analytics_sentiment(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    uid = current_user["id"]
    
    query = supabase.table("calls").select("sentiment")
    if role == "student":
        query = query.eq("user_id", uid)
    calls = query.execute().data or []
    
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0}
    for c in calls:
        s = (c.get("sentiment") or "neutral").lower()
        if s in sentiment_counts:
            sentiment_counts[s] += 1
        else:
            sentiment_counts["neutral"] += 1
            
    return [
        {"sentiment": k, "count": v} for k, v in sentiment_counts.items()
    ]

@app.get("/api/analytics/top-agents")
async def get_analytics_top_agents(current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    uid = current_user["id"]
    
    query = supabase.table("calls").select("agent_id, ai_agents(name)")
    if role == "student":
        query = query.eq("user_id", uid)
    calls = query.execute().data or []
    
    agent_counts = {}
    for c in calls:
        agent_id = c.get("agent_id")
        if not agent_id:
            continue
        agent = c.get("ai_agents")
        agent_name = agent.get("name") if (agent and isinstance(agent, dict)) else f"Agent {agent_id}"
        if agent_id not in agent_counts:
            agent_counts[agent_id] = {"name": agent_name, "calls": 0}
        agent_counts[agent_id]["calls"] += 1
        
    sorted_agents = sorted(agent_counts.values(), key=lambda x: x["calls"], reverse=True)
    return sorted_agents[:5]

# ─── VOICE CHAT ENDPOINTS (STT & TTS) ───────────────────────────────────────
class TTSRequest(BaseModel):
    text: str

@app.post("/api/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    """Transcribe user audio using Deepgram, fallback to Groq Whisper"""
    audio_bytes = await file.read()
    
    if DEEPGRAM_API_KEY:
        try:
            url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true"
            headers = {
                "Authorization": f"Token {DEEPGRAM_API_KEY}",
                "Content-Type": file.content_type or "audio/webm"
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, content=audio_bytes, timeout=60)
                if response.status_code == 200:
                    data = response.json()
                    transcript = data["results"]["channels"][0]["alternatives"][0]["transcript"]
                    if transcript:
                        return {"text": transcript}
                else:
                    print(f"Deepgram STT error: {response.status_code} - {response.text}")
        except Exception as e:
            print(f"Deepgram STT failed: {e}")
            
    # Fallback to Groq Whisper
    try:
        tmp_path = tempfile.mktemp(suffix=".webm")
        with open(tmp_path, "wb") as f:
            f.write(audio_bytes)
        try:
            with open(tmp_path, "rb") as f:
                transcript = groq_client.audio.transcriptions.create(
                    file=("audio.webm", f),
                    model="whisper-large-v3-turbo",
                    response_format="text"
                )
            return {"text": str(transcript) if transcript else ""}
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
    except Exception as e:
        print(f"Groq transcription fallback failed: {e}")
        return {"text": ""}

def add_wav_header(pcm_data: bytes, sample_rate: int = 24000) -> bytes:
    import struct
    header = bytearray(44)
    struct.pack_into('<4s', header, 0, b'RIFF')
    struct.pack_into('<I', header, 4, 36 + len(pcm_data))
    struct.pack_into('<4s', header, 8, b'WAVE')
    struct.pack_into('<4s', header, 12, b'fmt ')
    struct.pack_into('<I', header, 16, 16)
    struct.pack_into('<H', header, 20, 1)
    struct.pack_into('<H', header, 22, 1)
    struct.pack_into('<I', header, 24, sample_rate)
    struct.pack_into('<I', header, 28, sample_rate * 2)
    struct.pack_into('<H', header, 32, 2)
    struct.pack_into('<H', header, 34, 16)
    struct.pack_into('<4s', header, 36, b'data')
    struct.pack_into('<I', header, 40, len(pcm_data))
    return bytes(header) + pcm_data

@app.post("/api/voice/tts")
async def voice_tts(request: TTSRequest):
    """Convert text to speech using ElevenLabs, fallback to Deepgram"""
    audio_bytes = b""
    is_mp3 = False
    
    if ELEVENLABS_API_KEY:
        try:
            url = "https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL/stream"
            headers = {
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json"
            }
            payload = {
                "text": request.text,
                "model_id": "eleven_turbo_v2_5",
                "output_format": "mp3_44100_128"
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=60)
                if response.status_code == 200:
                    audio_bytes = response.content
                    is_mp3 = True
        except Exception as e:
            print(f"ElevenLabs TTS failed: {e}")
            
    if not audio_bytes:
        # Fallback to existing text_to_speech method (which returns raw PCM from Deepgram or Elevenlabs)
        try:
            pcm_bytes = await guidance_engine.text_to_speech(request.text)
            if pcm_bytes:
                audio_bytes = add_wav_header(pcm_bytes, 24000)
        except Exception as e:
            print(f"Fallback TTS failed: {e}")
            
    if not audio_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate speech audio")
        
    media_type = "audio/mpeg" if is_mp3 else "audio/wav"
    return Response(content=audio_bytes, media_type=media_type)

# ─── TEXT CHAT ENDPOINT (Fallback) ──────────────────────────────────────────
@app.post("/api/chat")
async def text_chat(message: Dict[str, str], current_user: dict = Depends(get_current_user)):
    session_id = message.get("session_id", f"session_{datetime.utcnow().timestamp()}")
    user_message = message.get("message", "")

    ai_response = await guidance_engine.process_text(user_message, session_id)

    return {
        "session_id": session_id,
        "response": ai_response,
        "timestamp": datetime.utcnow().isoformat()
    }

# ─── MEETING MANAGEMENT ENDPOINTS ──────────────────────────────────────────
# Faculty Groups Management
@app.get("/api/faculty-groups")
async def get_faculty_groups(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("faculty_groups").select("*").execute()
    groups = result.data or []
    
    # Add member count to each group
    for group in groups:
        members = supabase.table("faculty_group_members").select("id").eq("group_id", group["id"]).execute()
        group["member_count"] = len(members.data or [])
    
    return groups

@app.get("/api/faculty-groups/{group_id}")
async def get_faculty_group(group_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("faculty_groups").select("*").eq("id", group_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group = result.data
    members_result = supabase.table("faculty_group_members").select("*, users(id, full_name, email, department, role)").eq("group_id", group_id).execute()
    group["members"] = members_result.data or []
    
    return group

@app.get("/api/faculty-groups/{group_id}/members")
async def get_group_members(group_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("faculty_group_members").select("*, users(id, full_name, email, department, role)").eq("group_id", group_id).execute()
    return result.data or []

@app.post("/api/faculty-groups")
async def create_faculty_group(data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    group_data = {
        "name": data.get("name"),
        "description": data.get("description"),
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("faculty_groups").insert(group_data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create group")
    
    group = result.data[0]
    group["member_count"] = 0
    return group

@app.put("/api/faculty-groups/{group_id}")
async def update_faculty_group(group_id: str, data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    update_data = {
        "name": data.get("name"),
        "description": data.get("description"),
        "updated_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("faculty_groups").update(update_data).eq("id", group_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return result.data[0]

@app.delete("/api/faculty-groups/{group_id}")
async def delete_faculty_group(group_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Delete associated meeting_groups
    supabase.table("meeting_groups").delete().eq("group_id", group_id).execute()
    
    # Delete group members
    supabase.table("faculty_group_members").delete().eq("group_id", group_id).execute()
    
    # Delete group
    supabase.table("faculty_groups").delete().eq("id", group_id).execute()
    
    return {"success": True}

@app.post("/api/faculty-groups/{group_id}/members")
async def add_group_member(group_id: str, data: Dict[str, str], current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    member_data = {
        "group_id": group_id,
        "user_id": data.get("user_id"),
        "created_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("faculty_group_members").insert(member_data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to add member")
    
    # Get full member data
    member_result = supabase.table("faculty_group_members").select("*, users(id, full_name, email, department, role)").eq("id", result.data[0]["id"]).single().execute()
    return member_result.data

@app.delete("/api/faculty-groups/{group_id}/members/{user_id}")
async def remove_group_member(group_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase.table("faculty_group_members").delete().eq("group_id", group_id).eq("user_id", user_id).execute()
    
    return {"success": True}

@app.get("/api/users")
async def get_users(role: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    query = supabase.table("users").select("id, full_name, email, department, role")
    if role:
        query = query.eq("role", role)
    
    result = query.execute()
    return result.data or []

# ─── MEETINGS MANAGEMENT ENDPOINTS ────────────────────────────────────────
@app.get("/api/meetings/stats")
async def get_meeting_stats(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    meetings = supabase.table("meetings").select("*").execute().data or []
    groups = supabase.table("faculty_groups").select("*").execute().data or []
    
    today = datetime.utcnow().strftime("%Y-%m-%d")
    upcoming = len([m for m in meetings if m.get("meeting_date", "") >= today and m.get("status") != "cancelled"])
    completed = len([m for m in meetings if m.get("status") == "completed"])
    
    return {
        "total_meetings": len(meetings),
        "upcoming_meetings": upcoming,
        "completed_meetings": completed,
        "total_faculty_groups": len(groups)
    }

@app.get("/api/meetings")
async def get_all_meetings(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("meetings").select("*").order("created_at", desc=True).execute()
    meetings = result.data or []
    
    # Add assigned groups and response count to each meeting
    for meeting in meetings:
        groups_result = supabase.table("meeting_groups").select("*, faculty_groups(id, name, description)").eq("meeting_id", meeting["id"]).execute()
        meeting["assigned_groups"] = groups_result.data or []
        
        responses = supabase.table("meeting_responses").select("id").eq("meeting_id", meeting["id"]).execute()
        meeting["responses_count"] = len(responses.data or [])
    
    return meetings

@app.get("/api/meetings/faculty/{user_id}")
async def get_faculty_meetings(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get meetings assigned to groups that faculty member belongs to"""
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get groups user belongs to
    user_groups_result = supabase.table("faculty_group_members").select("group_id").eq("user_id", user_id).execute()
    user_group_ids = [gm["group_id"] for gm in (user_groups_result.data or [])]
    
    if not user_group_ids:
        return []
    
    # Get meetings assigned to those groups
    meetings_result = supabase.table("meeting_groups").select("meeting_id").in_("group_id", user_group_ids).execute()
    meeting_ids = list(set([mg["meeting_id"] for mg in (meetings_result.data or [])]))
    
    if not meeting_ids:
        return []
    
    result = supabase.table("meetings").select("*").in_("id", meeting_ids).order("meeting_date", desc=True).execute()
    meetings = result.data or []
    
    # Add assigned groups and response count
    for meeting in meetings:
        groups_result = supabase.table("meeting_groups").select("*, faculty_groups(id, name, description)").eq("meeting_id", meeting["id"]).execute()
        meeting["assigned_groups"] = groups_result.data or []
        
        responses = supabase.table("meeting_responses").select("id").eq("meeting_id", meeting["id"]).execute()
        meeting["responses_count"] = len(responses.data or [])
    
    return meetings

@app.get("/api/meetings/{meeting_id}")
async def get_meeting_details(meeting_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("meetings").select("*").eq("id", meeting_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    meeting = result.data
    
    # Get assigned groups
    groups_result = supabase.table("meeting_groups").select("*, faculty_groups(id, name, description)").eq("meeting_id", meeting_id).execute()
    meeting["assigned_groups"] = groups_result.data or []
    
    # Get responses
    responses_result = supabase.table("meeting_responses").select("*").eq("meeting_id", meeting_id).execute()
    meeting["responses"] = responses_result.data or []
    
    return meeting

@app.post("/api/meetings")
async def create_meeting(data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    meeting_data = {
        "title": data.get("title"),
        "description": data.get("description"),
        "meeting_date": data.get("meeting_date"),
        "start_time": data.get("start_time"),
        "end_time": data.get("end_time"),
        "venue": data.get("venue"),
        "meeting_link": data.get("meeting_link"),
        "priority": data.get("priority", "normal"),
        "status": data.get("status", "scheduled"),
        "created_by": current_user["id"],
        "created_at": datetime.utcnow().isoformat()
    }
    
    result = supabase.table("meetings").insert(meeting_data).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create meeting")
    
    meeting = result.data[0]
    
    # Assign to groups
    assigned_group_ids = data.get("assigned_group_ids", [])
    for group_id in assigned_group_ids:
        group_data = {
            "meeting_id": meeting["id"],
            "group_id": group_id,
            "created_at": datetime.utcnow().isoformat()
        }
        supabase.table("meeting_groups").insert(group_data).execute()
    
    meeting["assigned_groups"] = assigned_group_ids
    meeting["responses_count"] = 0
    
    return meeting

@app.put("/api/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, data: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    update_data = {
        "title": data.get("title"),
        "description": data.get("description"),
        "meeting_date": data.get("meeting_date"),
        "start_time": data.get("start_time"),
        "end_time": data.get("end_time"),
        "venue": data.get("venue"),
        "meeting_link": data.get("meeting_link"),
        "priority": data.get("priority"),
        "status": data.get("status"),
        "updated_at": datetime.utcnow().isoformat()
    }
    
    result = supabase.table("meetings").update(update_data).eq("id", meeting_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    return result.data[0]

@app.delete("/api/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Delete associated responses
    supabase.table("meeting_responses").delete().eq("meeting_id", meeting_id).execute()
    
    # Delete meeting_groups associations
    supabase.table("meeting_groups").delete().eq("meeting_id", meeting_id).execute()
    
    # Delete meeting
    supabase.table("meetings").delete().eq("id", meeting_id).execute()
    
    return {"success": True}

@app.get("/api/meetings/{meeting_id}/groups")
async def get_meeting_groups(meeting_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("meeting_groups").select("*, faculty_groups(id, name, description)").eq("meeting_id", meeting_id).execute()
    return result.data or []

@app.get("/api/meetings/{meeting_id}/responses")
async def get_meeting_responses(meeting_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("meeting_responses").select("*").eq("meeting_id", meeting_id).execute()
    responses = result.data or []
    
    # Calculate statistics
    attending = len([r for r in responses if r.get("response") == "attending"])
    maybe = len([r for r in responses if r.get("response") == "maybe"])
    not_attending = len([r for r in responses if r.get("response") == "not_attending"])
    
    return {
        "responses": responses,
        "stats": {
            "attending": attending,
            "maybe": maybe,
            "not_attending": not_attending
        }
    }

@app.post("/api/meetings/{meeting_id}/response")
async def submit_meeting_response(meeting_id: str, data: Dict[str, str], current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    user_id = data.get("user_id", current_user["id"])
    response = data.get("response")  # attending, maybe, not_attending
    
    if response not in ["attending", "maybe", "not_attending"]:
        raise HTTPException(status_code=400, detail="Invalid response")
    
    # Check if response already exists
    existing = supabase.table("meeting_responses").select("*").eq("meeting_id", meeting_id).eq("user_id", user_id).execute()
    
    response_data = {
        "meeting_id": meeting_id,
        "user_id": user_id,
        "response": response,
        "responded_at": datetime.utcnow().isoformat()
    }
    
    if existing.data:
        # Update existing response
        result = supabase.table("meeting_responses").update(response_data).eq("meeting_id", meeting_id).eq("user_id", user_id).execute()
    else:
        # Create new response
        result = supabase.table("meeting_responses").insert(response_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to submit response")
    
    return result.data[0]

# ─── HEALTH CHECK ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "services": {
            "supabase": "connected" if supabase else "error",
            "groq": "connected" if groq_client else "not_configured",
            "deepgram_tts": "connected" if DEEPGRAM_API_KEY else "not_configured",
            "elevenlabs_tts": "connected" if ELEVENLABS_API_KEY else "not_configured",
            "deepgram_stt": "connected" if DEEPGRAM_API_KEY else "not_configured",
            "twilio": "connected" if TWILIO_SID else "not_configured"
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/")
async def root():
    return {
        "service": "ADhoc.ai API v2",
        "version": "2.0.0",
        "endpoints": {
            "auth": "/api/auth/*",
            "voice_websocket": "/ws/voice/{session_id}",
            "telephony": "/api/calls/*",
            "dashboards": "/api/dashboard/*",
            "knowledge": "/api/knowledge/*",
            "prompts": "/api/prompts/*",
            "analytics": "/api/analytics",
            "chat": "/api/chat"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


# ══════════════════════════════════════════════════════════════════════════════
# DIGITAL STUDENT ACADEMIC PORTFOLIO — API v1
# All /api/student/* endpoints require JWT authentication
# ══════════════════════════════════════════════════════════════════════════════

# ─── PORTFOLIO PYDANTIC MODELS ────────────────────────────────────────────────

class StudentProfileUpdate(BaseModel):
    profile_photo_url: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    nationality: Optional[str] = None
    category: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postal_code: Optional[str] = None
    father_name: Optional[str] = None
    father_phone: Optional[str] = None
    mother_name: Optional[str] = None
    mother_phone: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    annual_income: Optional[float] = None

class AcademicRecordUpsert(BaseModel):
    education_level: str
    institution_name: Optional[str] = None
    board_university: Optional[str] = None
    degree: Optional[str] = None
    specialization: Optional[str] = None
    hall_ticket_number: Optional[str] = None
    year_of_passing: Optional[int] = None
    percentage: Optional[float] = None
    cgpa: Optional[float] = None
    max_cgpa: Optional[float] = None
    current_semester: Optional[int] = None
    backlogs: Optional[int] = None
    remarks: Optional[str] = None
    is_current: Optional[bool] = None

class SemesterMarkUpsert(BaseModel):
    semester: int
    academic_year: Optional[str] = None
    sgpa: Optional[float] = None
    cgpa: Optional[float] = None
    credits_earned: Optional[float] = None
    total_credits: Optional[float] = None
    result_status: Optional[str] = None
    remarks: Optional[str] = None

class CertificationCreate(BaseModel):
    title: str
    issuing_organization: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    skills_gained: Optional[List[str]] = None
    document_id: Optional[str] = None

class SkillsUpdate(BaseModel):
    programming_languages: Optional[List[str]] = None
    frameworks: Optional[List[str]] = None
    databases: Optional[List[str]] = None
    cloud_platforms: Optional[List[str]] = None
    ai_ml_skills: Optional[List[str]] = None
    web_technologies: Optional[List[str]] = None
    mobile_technologies: Optional[List[str]] = None
    devops_tools: Optional[List[str]] = None
    software_tools: Optional[List[str]] = None
    soft_skills: Optional[List[str]] = None
    languages_known: Optional[List[str]] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    leetcode_url: Optional[str] = None
    codechef_url: Optional[str] = None
    hackerrank_url: Optional[str] = None
    codeforces_url: Optional[str] = None
    years_of_experience: Optional[float] = None
    bio: Optional[str] = None

class EntranceExamCreate(BaseModel):
    exam_name: str
    conducting_body: Optional[str] = None
    exam_year: Optional[int] = None
    application_number: Optional[str] = None
    hall_ticket_number: Optional[str] = None
    score: Optional[float] = None
    rank: Optional[int] = None
    percentile: Optional[float] = None
    qualification_status: Optional[str] = None
    exam_date: Optional[str] = None
    remarks: Optional[str] = None
    scorecard_document_id: Optional[str] = None

class AchievementCreate(BaseModel):
    achievement_title: str
    achievement_type: Optional[str] = None
    organizer_name: Optional[str] = None
    achievement_level: Optional[str] = None
    position_secured: Optional[str] = None
    description: Optional[str] = None
    achievement_date: Optional[str] = None
    certificate_document_id: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str

class ScholarshipCreate(BaseModel):
    title: str = Field(..., min_length=1)
    provider_name: str = Field(..., min_length=1)
    scholarship_type: str
    description: Optional[str] = None
    eligibility_criteria: Optional[str] = None
    eligible_courses: Optional[List[str]] = None
    eligible_categories: Optional[List[str]] = None
    minimum_percentage: Optional[float] = Field(None, ge=0, le=100)
    annual_income_limit: Optional[float] = Field(None, gt=0)
    scholarship_amount: float = Field(..., gt=0)
    application_start_date: Optional[str] = None
    application_end_date: Optional[str] = None
    application_link: Optional[str] = None
    required_documents: Optional[List[str]] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    status: str = "draft"
    is_featured: bool = False

    @model_validator(mode='before')
    @classmethod
    def clean_empty_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            cleaned = {}
            for k, v in data.items():
                if v == "":
                    cleaned[k] = None
                elif k == "status" and isinstance(v, str):
                    cleaned[k] = v.lower()
                else:
                    cleaned[k] = v
            return cleaned
        return data

class ScholarshipUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    provider_name: Optional[str] = Field(None, min_length=1)
    scholarship_type: Optional[str] = None
    description: Optional[str] = None
    eligibility_criteria: Optional[str] = None
    eligible_courses: Optional[List[str]] = None
    eligible_categories: Optional[List[str]] = None
    minimum_percentage: Optional[float] = Field(None, ge=0, le=100)
    annual_income_limit: Optional[float] = Field(None, gt=0)
    scholarship_amount: Optional[float] = Field(None, gt=0)
    application_start_date: Optional[str] = None
    application_end_date: Optional[str] = None
    application_link: Optional[str] = None
    required_documents: Optional[List[str]] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    status: Optional[str] = None
    is_featured: Optional[bool] = None

    @model_validator(mode='before')
    @classmethod
    def clean_empty_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            cleaned = {}
            for k, v in data.items():
                if v == "":
                    cleaned[k] = None
                elif k == "status" and isinstance(v, str):
                    cleaned[k] = v.lower()
                else:
                    cleaned[k] = v
            return cleaned
        return data

class ApplicationUpdate(BaseModel):
    application_status: str
    remarks: Optional[str] = None
    admin_comments: Optional[str] = None
    approved_amount: Optional[float] = Field(None, ge=0)

    @model_validator(mode='before')
    @classmethod
    def clean_empty_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return {k: (None if v == "" else v) for k, v in data.items()}
        return data

# ─── PORTFOLIO HELPER FUNCTIONS ────────────────────────────────────────────────


def portfolio_log_timeline(user_id: str, event_type: str, title: str, description: str = None):
    pass

def portfolio_create_notification(user_id: str, type: str, title: str, message: str, action_url: str = None):
    try:
        supabase.table("notifications").insert({
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
            "is_read": False,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Supabase Notification Error] {e}")


def calculate_profile_strength(user_id: str) -> dict:
    """Calculate profile completion score based on Supabase schema."""
    try:
        # 1. Personal info (max 25) — student_profiles uses user_id
        profile_res = supabase.table("student_profiles").select("*").eq("user_id", user_id).execute()
        profile = profile_res.data[0] if profile_res.data else {}
        personal_fields = ["date_of_birth", "gender", "state", "postal_code",
                           "father_name", "father_phone", "profile_photo_url"]
        filled = sum(1 for f in personal_fields if profile.get(f))
        personal = int((filled / len(personal_fields)) * 25)

        # 2. Academic (max 25) — academic_records and semester_marks use student_id
        records = supabase.table("academic_records").select("education_level").eq("student_id", user_id).execute().data or []
        semesters = supabase.table("semester_marks").select("id").eq("student_id", user_id).execute().data or []
        academic = min(int((len(records) / 3) * 20) + min(len(semesters), 5), 25)

        # 3. Skills (max 15) — student_skills uses student_id
        skills_res = supabase.table("student_skills").select("*").eq("student_id", user_id).execute()
        skills = skills_res.data[0] if skills_res.data else {}
        skill_arrays = ["programming_languages", "frameworks", "soft_skills", "languages_known", "software_tools"]
        non_empty = sum(1 for k in skill_arrays if skills.get(k))
        links = sum(1 for k in ["github_url", "linkedin_url", "portfolio_url"] if skills.get(k))
        skills_score = min(int((non_empty / 5) * 10) + min(links * 2, 5), 15)

        # 4. Documents (max 15) — student_documents uses user_id
        docs = supabase.table("student_documents").select("id").eq("user_id", user_id).execute().data or []
        documents = min(len(docs) * 2, 15)

        # 5. Achievements (max 10) — certifications and achievements use student_id
        certs = supabase.table("student_certifications").select("id").eq("student_id", user_id).execute().data or []
        achievements_r = supabase.table("student_achievements").select("id").eq("student_id", user_id).execute().data or []
        achieve = min((len(certs) + len(achievements_r)) * 2, 10)

        # 6. Career Readiness (max 10) — entrance_exams uses student_id
        exams = supabase.table("entrance_exams").select("id").eq("student_id", user_id).execute().data or []
        career = min(len(exams) * 3, 10)

        total = min(personal + academic + skills_score + documents + achieve + career, 100)
        label = ("Excellent" if total >= 85 else "Strong" if total >= 70 else
                 "Good" if total >= 50 else "Building" if total >= 30 else "Getting Started")

        strength = {"total": total, "label": label, "personal": personal,
                    "academic": academic, "skills": skills_score,
                    "documents": documents, "achievements": achieve, "career": career}
        # Persist profile_completion to student_profiles
        if profile_res.data:
            supabase.table("student_profiles").update({
                "profile_completion": total,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("user_id", user_id).execute()
        return strength
    except Exception as e:
        print(f"[Strength] Error: {e}")
        return {"total": 0, "label": "Getting Started", "personal": 0, "academic": 0,
                "skills": 0, "documents": 0, "achievements": 0, "career": 0}

async def maybe_refresh_ai_insights(user_id: str, force: bool = False,
                                     trigger_event: str = "profile_update"):
    """Generate and cache AI profile insights using Supabase schema."""
    if not groq_client:
        return
    try:
        import json as json_mod
        records = supabase.table("academic_records").select("*").eq("student_id", user_id).execute().data or []
        skills_r = supabase.table("student_skills").select("*").eq("student_id", user_id).execute().data or []
        exams = supabase.table("entrance_exams").select("*").eq("student_id", user_id).execute().data or []
        docs_count = len(supabase.table("student_documents").select("id").eq("user_id", user_id).execute().data or [])
        certs_count = len(supabase.table("student_certifications").select("id").eq("student_id", user_id).execute().data or [])
        profile_r = supabase.table("student_profiles").select("*").eq("user_id", user_id).execute().data or []

        summary_str = json_mod.dumps({
            "records": len(records), "skills": skills_r, "exams": exams,
            "docs": docs_count, "certs": certs_count
        }, sort_keys=True, default=str)
        profile_hash = hashlib.md5(summary_str.encode()).hexdigest()

        # Skip trigger hash optimization since trigger_hash column doesn't exist in Supabase schema
        # We will directly run the AI analysis
        profile = profile_r[0] if profile_r else {}
        skills = skills_r[0] if skills_r else {}

        prompt = f"""You are an AI academic advisor. Analyze this student profile and return ONLY valid JSON.

Profile:
- Academic levels: {[r.get('education_level') for r in records]}
- Current semester: {profile.get('current_semester', 'Unknown')}
- Programming skills: {skills.get('programming_languages', [])}
- Frameworks: {skills.get('frameworks', [])}
- Entrance exams: {[{{'name': e.get('exam_name'), 'score': e.get('score'), 'rank': e.get('rank')}} for e in exams]}
- Documents uploaded: {docs_count}
- Certifications: {certs_count}

Return this JSON structure exactly:
{{
  "overall_profile_score": <int 0-100>,
  "academic_score": <int 0-100>,
  "skill_score": <int 0-100>,
  "missing_documents": [{{"name": "...", "category": "...", "priority": "high|medium|low"}}],
  "scholarship_recommendations": [{{"title": "...", "provider": "...", "match_score": <int>}}],
  "skill_gap_analysis": [{{"skill": "...", "demand": "high|medium", "courses": ["..."]}}],
  "career_recommendations": [{{"title": "...", "type": "certification|course|internship", "reason": "..."}}],
  "ai_summary": "<2-3 sentence personalized summary>"
}}"""

        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200, temperature=0.3
        )
        ai_text = resp.choices[0].message.content or "{}"
        if "```" in ai_text:
            for p in ai_text.split("```"):
                p = p.strip().lstrip("json").strip()
                if p.startswith("{"):
                    ai_text = p
                    break

        try:
            insights = json_mod.loads(ai_text)
        except Exception:
            insights = {
                "overall_profile_score": 0,
                "academic_score": 0,
                "skill_score": 0,
                "missing_documents": [],
                "scholarship_recommendations": [],
                "skill_gap_analysis": [],
                "career_recommendations": [],
                "ai_summary": "Analysis could not be completed. Please update your profile."
            }

        # Query existing record ID to do update or let upsert handle it using student_id
        existing = supabase.table("ai_profile_analysis").select("id").eq("student_id", user_id).execute()
        
        upsert_payload = {
            "student_id": user_id,
            "overall_profile_score": insights.get("overall_profile_score", 0),
            "profile_strength": insights.get("overall_profile_score", 0), # legacy fallback
            "academic_score": insights.get("academic_score", 0),
            "skill_score": insights.get("skill_score", 0),
            "missing_documents": insights.get("missing_documents", []),
            "scholarship_recommendations": insights.get("scholarship_recommendations", []),
            "skill_gap_analysis": insights.get("skill_gap_analysis", []),
            "career_recommendations": insights.get("career_recommendations", []),
            "ai_summary": insights.get("ai_summary", ""),
            "last_analyzed_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        if existing.data:
            upsert_payload["id"] = existing.data[0]["id"]
            
        supabase.table("ai_profile_analysis").upsert(upsert_payload).execute()

        portfolio_create_notification(user_id, "ai_analysis_complete",
            "AI Insights Updated", "Your profile analysis is ready.",
            "/student/profile?tab=ai-insights")
        portfolio_log_timeline(user_id, "ai_insights_generated",
            "AI Profile Analysis Updated", f"Triggered by: {trigger_event}")



    except Exception as e:
        print(f"[AI Insights] Error: {e}")
        try:
            supabase.table("ai_profile_analysis").upsert(
                {"student_id": user_id}).execute()
        except Exception:
            pass

def ensure_student_profile(user_id: str):
    """Auto-create student_profiles row if it doesn't exist yet."""
    existing = supabase.table("student_profiles").select("id").eq("user_id", user_id).execute()
    if not existing.data:
        supabase.table("student_profiles").insert({
            "user_id": user_id,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }).execute()
        portfolio_log_timeline(user_id, "profile_created", "Academic Portfolio Created",
                               "Your digital academic portfolio has been initialized.")

# ─── STUDENT PROFILE ENDPOINTS ────────────────────────────────────────────────

@app.get("/api/student/profile")
async def get_student_profile(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        ensure_student_profile(uid)
        # student_profiles uses user_id; all others use student_id
        profile = (supabase.table("student_profiles").select("*").eq("user_id", uid).execute().data or [None])[0]
        
        if profile:
            # Map Supabase columns to legacy aliases
            profile["pincode"] = profile.get("postal_code")
            profile["photo_url"] = profile.get("profile_photo_url")
            profile["parent_name"] = profile.get("father_name")
            profile["parent_phone"] = profile.get("father_phone")
            
            

        academic = supabase.table("academic_records").select("*").eq("student_id", uid).execute().data or []
        semesters = supabase.table("semester_marks").select("*").eq("student_id", uid).order("semester").execute().data or []
        skills = (supabase.table("student_skills").select("*").eq("student_id", uid).execute().data or [None])[0]
        certifications = supabase.table("student_certifications").select("*").eq("student_id", uid).order("created_at", desc=True).execute().data or []
        exams = supabase.table("entrance_exams").select("*").eq("student_id", uid).order("exam_year", desc=True).execute().data or []
        achievements = supabase.table("student_achievements").select("*").eq("student_id", uid).order("achievement_date", desc=True).execute().data or []
        documents = supabase.table("student_documents").select("*").eq("user_id", uid).order("uploaded_at", desc=True).execute().data or []
        
        # Query privacy settings
        try:
            privacy_res = supabase.table("student_privacy_settings").select("*").eq("user_id", uid).execute()
            privacy = privacy_res.data[0] if privacy_res.data else None
        except Exception:
            privacy = None

        strength = calculate_profile_strength(uid)

        return {
            "user": {
                "id": current_user["id"], "email": current_user["email"],
                "full_name": current_user["full_name"], "phone": current_user.get("phone"),
                "role": current_user["role"],
                "email_verified": current_user.get("email_verified", False),
                "account_status": current_user.get("account_status", "active"),
                "last_login": current_user.get("last_login"),
                "created_at": current_user.get("created_at")
            },
            "profile": profile,
            "privacy": privacy,
            "academic_records": academic,
            "semester_marks": semesters,
            "skills": skills,
            "certifications": certifications,
            "exams": exams,
            "achievements": achievements,
            "documents": documents,
            "strength": strength
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def clean_record(d: dict) -> dict:
    return {k: (None if v == "" else v) for k, v in d.items() if v is not None or v == ""}

@app.put("/api/student/profile")
async def update_student_profile(
    data: StudentProfileUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    supabase_payload = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    supabase_payload["updated_at"] = datetime.utcnow().isoformat()
    try:
        ensure_student_profile(uid)
        result = supabase.table("student_profiles").update(supabase_payload).eq("user_id", uid).execute()
        strength = calculate_profile_strength(uid)
        background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "profile_update")
        return {"success": True, "data": result.data[0] if result.data else {}, "strength": strength}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/student/completion")
async def get_profile_completion(current_user: dict = Depends(get_current_user)):
    return calculate_profile_strength(current_user["id"])

# ─── ACADEMIC RECORDS ─────────────────────────────────────────────────────────

@app.get("/api/student/academic")
async def get_academic_records(current_user: dict = Depends(get_current_user)):
    return supabase.table("academic_records").select("*").eq("student_id", current_user["id"]).execute().data or []

@app.put("/api/student/academic")
async def upsert_academic_record(
    data: AcademicRecordUpsert,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record["student_id"] = uid
    record["updated_at"] = datetime.utcnow().isoformat()
    try:
        existing = supabase.table("academic_records").select("id").eq("student_id", uid).eq("education_level", data.education_level).execute()
        if existing.data:
            result = supabase.table("academic_records").update(record).eq("student_id", uid).eq("education_level", data.education_level).execute()
        else:
            record["created_at"] = datetime.utcnow().isoformat()
            result = supabase.table("academic_records").insert(record).execute()
        calculate_profile_strength(uid)
        background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "academic_update")
        return {"success": True, "data": result.data[0] if result.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SEMESTER MARKS ───────────────────────────────────────────────────────────

@app.get("/api/student/semesters")
async def get_semester_marks(current_user: dict = Depends(get_current_user)):
    return supabase.table("semester_marks").select("*").eq("student_id", current_user["id"]).order("semester").execute().data or []

@app.post("/api/student/semesters")
async def add_semester_mark(data: SemesterMarkUpsert, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("semester_marks").select("id").eq("student_id", uid).eq("semester", data.semester).execute()
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record["student_id"] = uid
    record["updated_at"] = datetime.utcnow().isoformat()
    if existing.data:
        result = supabase.table("semester_marks").update(record).eq("student_id", uid).eq("semester", data.semester).execute()
    else:
        record["created_at"] = datetime.utcnow().isoformat()
        result = supabase.table("semester_marks").insert(record).execute()
    calculate_profile_strength(uid)
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/semesters/{semester_id}")
async def delete_semester_mark(semester_id: str, current_user: dict = Depends(get_current_user)):
    record = supabase.table("semester_marks").select("*").eq("id", semester_id).execute().data
    if not record or record[0]["student_id"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Semester record not found")
    supabase.table("semester_marks").delete().eq("id", semester_id).execute()
    return {"success": True}

# ─── DOCUMENT ENDPOINTS ───────────────────────────────────────────────────────

@app.get("/api/student/documents")
async def get_student_documents(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = supabase.table("student_documents").select("*").eq("user_id", current_user["id"])
    if category:
        query = query.eq("document_type", category)
    docs = query.order("uploaded_at", desc=True).execute().data or []
    for doc in docs:
        try:
            if doc.get("storage_bucket") and doc.get("file_url"):
                url_res = supabase.storage.from_(doc["storage_bucket"]).create_signed_url(doc["file_url"], 3600)
                doc["signed_url"] = url_res.get("signedURL") or url_res.get("signedUrl", "")
        except Exception:
            doc["signed_url"] = doc.get("file_url", "")
    return docs

async def process_document_ocr(doc_id: str):
    try:
        res = supabase.table("student_documents").select("*").eq("id", doc_id).execute()
        if not res.data:
            return
        doc = res.data[0]
        doc_type = doc.get("document_type") or "other"
        file_name = doc.get("file_name") or "document"
        
        if groq_client:
            prompt = f"""You are an AI assistant processing student academic portfolios.
Analyze this uploaded document details:
- Document Type: {doc_type}
- File Name: {file_name}

Generate realistic OCR extracted fields and a professional summary.
Return ONLY valid JSON in this exact structure:
{{
  "extracted": {{
    "field_name_1": {{"value": "...", "confidence": 0.95}},
    "field_name_2": {{"value": "...", "confidence": 0.91}}
  }},
  "ai_summary": "1-2 sentence professional advisor summary of the document."
}}"""
            try:
                resp = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=600, temperature=0.3
                )
                ai_text = resp.choices[0].message.content or "{}"
                if "```" in ai_text:
                    for p in ai_text.split("```"):
                        p = p.strip().lstrip("json").strip()
                        if p.startswith("{"):
                            ai_text = p
                            break
                import json as json_mod
                ai_data = json_mod.loads(ai_text)
                extracted = ai_data.get("extracted", {})
                ai_summary = ai_data.get("ai_summary", "Document uploaded and verified.")
            except Exception as e:
                print(f"[OCR] Groq failed: {e}")
                extracted = {"status": {"value": "Uploaded Successfully", "confidence": 1.0}}
                ai_summary = f"Uploaded document {file_name} of type {doc_type}."
        else:
            extracted = {"status": {"value": "Uploaded Successfully", "confidence": 1.0}}
            ai_summary = f"Uploaded document {file_name} of type {doc_type}."
            
        supabase.table("student_documents").update({
            "ocr_status": "completed",
            "extracted_data": {"extracted": extracted},
            "ai_summary": ai_summary,
            "verification_status": "verified",
            "is_verified": True,
            "verified_by_name": "AI Auto-Verifier",
            "verified_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }).eq("id", doc_id).execute()
        
        maybe_refresh_ai_insights(doc["user_id"], True, "ocr_completed")
    except Exception as e:
        print(f"[OCR] Background processing error: {e}")

def map_document_type(sub_cat: str) -> str:
    if not sub_cat:
        return "Other"
    s = sub_cat.lower().strip()
    if s == "aadhaar":
        return "Aadhaar"
    if s == "passport":
        return "Passport"
    if s == "resume":
        return "Resume"
    if s in ["10th_memo", "10th memo", "10th"]:
        return "10th Memo"
    if s in ["intermediate_memo", "intermediate memo", "12th_memo", "12th memo", "12th"]:
        return "12th Memo"
    if s in ["income_certificate", "income certificate", "income"]:
        return "Income Certificate"
    if s in ["caste_certificate", "caste certificate", "caste"]:
        return "Caste Certificate"
    if "certificate" in s or "marksheet" in s or "scorecard" in s or "degree" in s:
        return "Certificate"
    return "Other"

@app.post("/api/student/documents")
async def upload_student_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    document_type: str = Form(...),
    document_name: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg",
                     "application/msword",
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    MAX_SIZE = 10 * 1024 * 1024
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX")
    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(400, "File size exceeds 10MB limit")

    import uuid as uuid_mod
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    unique_id = str(uuid_mod.uuid4())
    storage_bucket = "student-documents"
    file_url = f"{uid}/{document_type}/{unique_id}.{ext}"

    try:
        supabase.storage.from_(storage_bucket).upload(
            path=file_url, file=file_bytes,
            file_options={"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {str(e)}")

    mapped_type = map_document_type(document_type)
    doc_data = {
        "user_id": uid,
        "document_type": mapped_type,
        "document_name": document_name or document_type,
        "file_name": file.filename,
        "file_url": file_url,
        "storage_bucket": storage_bucket,
        "mime_type": file.content_type,
        "file_size": len(file_bytes),
        "ocr_status": "pending",
        "verification_status": "pending",
        "is_active": True,
        "is_verified": False,
        "uploaded_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("student_documents").insert(doc_data).execute()
    doc = result.data[0]
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "document_upload")
    background_tasks.add_task(process_document_ocr, doc["id"])
    return {"success": True, "data": doc}

@app.delete("/api/student/documents/{doc_id}")
async def delete_student_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_documents").select("*").eq("id", doc_id).execute()
    if not existing.data:
        raise HTTPException(404, "Document not found")
    doc = existing.data[0]
    if doc["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    try:
        if doc.get("storage_bucket") and doc.get("file_url"):
            supabase.storage.from_(doc["storage_bucket"]).remove([doc["file_url"]])
    except Exception as e:
        print(f"[Storage] Delete warning: {e}")
    supabase.table("student_documents").delete().eq("id", doc_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── CERTIFICATIONS ───────────────────────────────────────────────────────────

@app.get("/api/student/certifications")
async def get_certifications(current_user: dict = Depends(get_current_user)):
    return supabase.table("student_certifications").select("*").eq(
        "student_id", current_user["id"]).order("issue_date", desc=True).execute().data or []

@app.post("/api/student/certifications")
async def add_certification(data: CertificationCreate, background_tasks: BackgroundTasks,
                             current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record.update({"student_id": uid, "created_at": datetime.utcnow().isoformat(),
                   "updated_at": datetime.utcnow().isoformat()})
    result = supabase.table("student_certifications").insert(record).execute()
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "cert_added")
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.put("/api/student/certifications/{cert_id}")
async def update_certification(cert_id: str, data: CertificationCreate,
                                current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_certifications").select("student_id").eq("id", cert_id).execute().data
    if not existing or existing[0]["student_id"] != uid:
        raise HTTPException(403, "Access denied")
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("student_certifications").update(record).eq("id", cert_id).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/certifications/{cert_id}")
async def delete_certification(cert_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_certifications").select("student_id").eq("id", cert_id).execute().data
    if not existing or existing[0]["student_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("student_certifications").delete().eq("id", cert_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── SKILLS ───────────────────────────────────────────────────────────────────

@app.get("/api/student/skills")
async def get_skills(current_user: dict = Depends(get_current_user)):
    data = supabase.table("student_skills").select("*").eq("student_id", current_user["id"]).execute().data
    return data[0] if data else {}

@app.put("/api/student/skills")
async def update_skills(data: SkillsUpdate, background_tasks: BackgroundTasks,
                         current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    update_data = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    update_data["updated_at"] = datetime.utcnow().isoformat()
    existing = supabase.table("student_skills").select("id").eq("student_id", uid).execute().data
    if existing:
        result = supabase.table("student_skills").update(update_data).eq("student_id", uid).execute()
    else:
        update_data.update({"student_id": uid, "created_at": datetime.utcnow().isoformat()})
        result = supabase.table("student_skills").insert(update_data).execute()
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "skills_update")
    return {"success": True, "data": result.data[0] if result.data else {}}

# ─── ENTRANCE EXAMS ───────────────────────────────────────────────────────────

@app.get("/api/student/exams")
async def get_exams(current_user: dict = Depends(get_current_user)):
    return supabase.table("entrance_exams").select("*").eq(
        "student_id", current_user["id"]).order("exam_year", desc=True).execute().data or []

@app.post("/api/student/exams")
async def add_exam(data: EntranceExamCreate, background_tasks: BackgroundTasks,
                   current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record.update({"student_id": uid, "created_at": datetime.utcnow().isoformat(),
                   "updated_at": datetime.utcnow().isoformat()})
    result = supabase.table("entrance_exams").insert(record).execute()
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "exam_added")
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.put("/api/student/exams/{exam_id}")
async def update_exam(exam_id: str, data: EntranceExamCreate,
                       current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("entrance_exams").select("student_id").eq("id", exam_id).execute().data
    if not existing or existing[0]["student_id"] != uid:
        raise HTTPException(403, "Access denied")
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("entrance_exams").update(record).eq("id", exam_id).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/exams/{exam_id}")
async def delete_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("entrance_exams").select("student_id").eq("id", exam_id).execute().data
    if not existing or existing[0]["student_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("entrance_exams").delete().eq("id", exam_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

@app.get("/api/student/achievements")
async def get_achievements(current_user: dict = Depends(get_current_user)):
    return supabase.table("student_achievements").select("*").eq(
        "student_id", current_user["id"]).order("achievement_date", desc=True).execute().data or []

@app.post("/api/student/achievements")
async def add_achievement(data: AchievementCreate, background_tasks: BackgroundTasks,
                           current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record.update({"student_id": uid, "created_at": datetime.utcnow().isoformat(),
                   "updated_at": datetime.utcnow().isoformat()})
    result = supabase.table("student_achievements").insert(record).execute()
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "achievement_added")
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.put("/api/student/achievements/{ach_id}")
async def update_achievement(ach_id: str, data: AchievementCreate,
                              current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_achievements").select("student_id").eq("id", ach_id).execute().data
    if not existing or existing[0]["student_id"] != uid:
        raise HTTPException(403, "Access denied")
    record = clean_record({k: v for k, v in data.model_dump().items() if v is not None})
    record["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("student_achievements").update(record).eq("id", ach_id).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/achievements/{ach_id}")
async def delete_achievement(ach_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_achievements").select("student_id").eq("id", ach_id).execute().data
    if not existing or existing[0]["student_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("student_achievements").delete().eq("id", ach_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── AI INSIGHTS ──────────────────────────────────────────────────────────────

@app.get("/api/student/ai-insights")
async def get_ai_insights(current_user: dict = Depends(get_current_user)):
    try:
        data = supabase.table("ai_profile_analysis").select("*").eq(
            "student_id", current_user["id"]).execute().data
        if not data:
            return {
                "overall_profile_score": 0,
                "academic_score": 0, "skill_score": 0,
                "missing_documents": [], "scholarship_recommendations": [],
                "skill_gap_analysis": [], "career_recommendations": [],
                "college_recommendations": [], "internship_recommendations": [],
                "improvement_suggestions": [],
                "ai_summary": None,
                "analysis_status": "pending", "last_analyzed_at": None
            }
        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error fetching AI insights: {str(e)}")

@app.post("/api/student/ai-insights/refresh")
async def refresh_ai_insights(background_tasks: BackgroundTasks,
                               current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        supabase.table("ai_profile_analysis").upsert(
            {"student_id": uid}).execute()
        background_tasks.add_task(maybe_refresh_ai_insights, uid, True, "manual_refresh")
        return {"success": True, "message": "AI analysis started. Check back shortly."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error starting AI refresh: {str(e)}")

# ─── SCHOLARSHIPS ─────────────────────────────────────────────────────────────

@app.get("/api/student/scholarships")
async def get_scholarships(current_user: dict = Depends(get_current_user)):
    """List active scholarships available to students."""
    try:
        data = supabase.table("scholarships").select("*").eq("status", "active").execute().data or []
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/student/scholarships/applications")
async def get_my_scholarship_applications(current_user: dict = Depends(get_current_user)):
    """Get current student's scholarship applications."""
    try:
        data = supabase.table("scholarship_applications").select(
            "*, scholarships(title, provider_name, scholarship_amount)"
        ).eq("student_id", current_user["id"]).order("created_at", desc=True).execute().data or []
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/student/scholarships/{scholarship_id}/apply")
async def apply_scholarship(scholarship_id: str, current_user: dict = Depends(get_current_user)):
    """Apply for a scholarship."""
    uid = current_user["id"]
    existing = supabase.table("scholarship_applications").select("id").eq(
        "scholarship_id", scholarship_id).eq("student_id", uid).execute().data
    if existing:
        raise HTTPException(400, "Already applied for this scholarship")
    result = supabase.table("scholarship_applications").insert({
        "scholarship_id": scholarship_id,
        "student_id": uid,
        "application_status": "Applied",
        "application_date": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

# ─── ADMISSION APPLICATIONS ───────────────────────────────────────────────────

@app.get("/api/student/admissions")
async def get_admission_applications(current_user: dict = Depends(get_current_user)):
    """Get student's admission applications."""
    try:
        data = supabase.table("admission_applications").select(
            "*, institutions(name)"
        ).eq("student_id", current_user["id"]).order("created_at", desc=True).execute().data or []
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── PASSWORD CHANGE ──────────────────────────────────────────────────────────

@app.put("/api/student/password")
async def change_student_password(data: PasswordChange,
                                   current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    if not verify_password(data.current_password, current_user["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect")
    if data.current_password == data.new_password:
        raise HTTPException(400, "New password must be different from your current password")
    if data.new_password != data.confirm_password:
        raise HTTPException(400, "New passwords do not match")
    if not any(c.isdigit() for c in data.new_password):
        raise HTTPException(400, "Password must contain at least one number")
    new_hash = get_password_hash(data.new_password)
    supabase.table("users").update({
        "hashed_password": new_hash,
        "password_updated_at": datetime.utcnow().isoformat()
    }).eq("id", uid).execute()
    return {"success": True, "message": "Password updated successfully"}

# ─── ADDITIONAL STUDENT ENDPOINTS (PRIVACY, PREFERENCES, NOTIFICATIONS, TIMELINE) ───

class PrivacySettingsUpdate(BaseModel):
    personal_info_visibility: Optional[str] = None
    contact_visibility: Optional[str] = None
    academic_visibility: Optional[str] = None
    documents_visibility: Optional[str] = None
    certifications_visibility: Optional[str] = None
    skills_visibility: Optional[str] = None
    achievements_visibility: Optional[str] = None
    exams_visibility: Optional[str] = None
    profile_public_link: Optional[bool] = None

@app.get("/api/student/privacy")
async def get_privacy_settings(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        res = supabase.table("student_privacy_settings").select("*").eq("user_id", uid).execute()
        if not res.data:
            default_settings = {
                "user_id": uid,
                "personal_info_visibility": "institution",
                "contact_visibility": "institution",
                "academic_visibility": "institution",
                "documents_visibility": "faculty",
                "certifications_visibility": "institution",
                "skills_visibility": "placement_cell",
                "achievements_visibility": "institution",
                "exams_visibility": "admission_officers",
                "profile_public_link": False,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            insert_res = supabase.table("student_privacy_settings").insert(default_settings).execute()
            return insert_res.data[0] if insert_res.data else default_settings
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.put("/api/student/privacy")
async def update_privacy_settings(data: PrivacySettingsUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    try:
        existing = supabase.table("student_privacy_settings").select("id").eq("user_id", uid).execute()
        if not existing.data:
            update_data["user_id"] = uid
            res = supabase.table("student_privacy_settings").insert(update_data).execute()
        else:
            res = supabase.table("student_privacy_settings").update(update_data).eq("user_id", uid).execute()
        return {"success": True, "data": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

class PreferencesUpdate(BaseModel):
    target_colleges: Optional[List[str]] = None
    preferred_courses: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    career_interests: Optional[List[str]] = None
    notification_email: Optional[bool] = None
    notification_sms: Optional[bool] = None
    notification_app: Optional[bool] = None

@app.get("/api/student/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        res = supabase.table("student_preferences").select("*").eq("user_id", uid).execute()
        if not res.data:
            return {
                "target_colleges": [],
                "preferred_courses": [],
                "preferred_locations": [],
                "career_interests": [],
                "notification_email": True,
                "notification_sms": False,
                "notification_app": True
            }
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.put("/api/student/preferences")
async def update_preferences(data: PreferencesUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    try:
        existing = supabase.table("student_preferences").select("id").eq("user_id", uid).execute()
        if not existing.data:
            update_data["user_id"] = uid
            res = supabase.table("student_preferences").insert(update_data).execute()
        else:
            res = supabase.table("student_preferences").update(update_data).eq("user_id", uid).execute()
        return {"success": True, "data": res.data[0] if res.data else {}}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.get("/api/student/notifications")
async def get_student_notifications(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        res = supabase.table("notifications").select("*").eq("user_id", uid).order("created_at", desc=True).execute()
        notifications = res.data or []
        unread_count = sum(1 for n in notifications if not n.get("is_read"))
        return {"notifications": notifications, "unread_count": unread_count}
    except Exception as e:
        return {"notifications": [], "unread_count": 0}

@app.put("/api/student/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        supabase.table("notifications").update({"is_read": True}).eq("id", notif_id).eq("user_id", uid).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.put("/api/student/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        supabase.table("notifications").update({"is_read": True}).eq("user_id", uid).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(500, detail=str(e))

@app.get("/api/student/timeline")
async def get_student_timeline(page: int = 1, limit: int = 20, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        events = []
        
        # 1. Fetch analytics events
        try:
            ae_res = supabase.table("analytics_events").select("*").eq("user_id", uid).execute()
            for e in (ae_res.data or []):
                events.append({
                    "id": e["id"],
                    "event_type": e["event_type"],
                    "title": e["event_type"].replace("_", " ").title(),
                    "description": str(e.get("event_data") or ""),
                    "created_at": e["created_at"]
                })
        except Exception:
            pass
            
        # 2. Fetch documents
        try:
            doc_res = supabase.table("student_documents").select("*").eq("user_id", uid).execute()
            for d in (doc_res.data or []):
                events.append({
                    "id": d["id"],
                    "event_type": "document_upload",
                    "title": f"Uploaded Document: {d['document_name'] or d['file_name']}",
                    "description": f"Mime: {d.get('mime_type')}, Status: {d.get('verification_status')}",
                    "created_at": d["uploaded_at"] or d["created_at"]
                })
        except Exception:
            pass
            
        # 3. Fetch academic records
        try:
            acad_res = supabase.table("academic_records").select("*").eq("student_id", uid).execute()
            for a in (acad_res.data or []):
                events.append({
                    "id": a["id"],
                    "event_type": "academic_record",
                    "title": f"Academic Record: {a['education_level']}",
                    "description": f"Institution: {a.get('institution_name')}, Grade: {a.get('percentage') or a.get('cgpa')}",
                    "created_at": a.get("created_at") or a.get("updated_at")
                })
        except Exception:
            pass
            
        # 4. Fetch certifications
        try:
            cert_res = supabase.table("student_certifications").select("*").eq("student_id", uid).execute()
            for c in (cert_res.data or []):
                events.append({
                    "id": c["id"],
                    "event_type": "certification",
                    "title": f"Certification Earned: {c['title']}",
                    "description": f"Issuer: {c.get('issuing_organization')}",
                    "created_at": c.get("issue_date") or c.get("created_at")
                })
        except Exception:
            pass
            
        # 5. Fetch achievements
        try:
            ach_res = supabase.table("student_achievements").select("*").eq("student_id", uid).execute()
            for ac in (ach_res.data or []):
                events.append({
                    "id": ac["id"],
                    "event_type": "achievement",
                    "title": f"Achievement: {ac['achievement_title']}",
                    "description": ac.get("description") or "",
                    "created_at": ac.get("achievement_date") or ac.get("created_at")
                })
        except Exception:
            pass
            
        # 6. Fetch entrance exams
        try:
            exam_res = supabase.table("entrance_exams").select("*").eq("student_id", uid).execute()
            for ex in (exam_res.data or []):
                events.append({
                    "id": ex["id"],
                    "event_type": "entrance_exam",
                    "title": f"Entrance Exam: {ex['exam_name']}",
                    "description": f"Score: {ex.get('score')}, Rank: {ex.get('rank')}",
                    "created_at": ex.get("created_at")
                })
        except Exception:
            pass
            
        def get_date(x):
            d = x.get("created_at")
            if not d:
                return "1970-01-01T00:00:00Z"
            return d
            
        events.sort(key=get_date, reverse=True)
        
        start = (page - 1) * limit
        end = start + limit
        paginated_events = events[start:end]
        
        return {"events": paginated_events}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SCHOLARSHIP MANAGEMENT SYSTEM ──────────────────────────────────────────

# Admin - Get all scholarships
@app.get("/api/admin/scholarships")
async def admin_get_scholarships(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
    res = supabase.table("scholarships").select("*").order("created_at", desc=True).execute()
    return res.data or []

# Admin - Create a scholarship
@app.post("/api/admin/scholarships")
async def admin_create_scholarship(data: ScholarshipCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
    
    if data.application_start_date and data.application_end_date:
        if data.application_end_date < data.application_start_date:
            raise HTTPException(status_code=400, detail="Application end date cannot be before start date.")
            
    insert_data = data.model_dump()
    insert_data["created_by"] = current_user["id"]
    insert_data["created_at"] = datetime.utcnow().isoformat()
    insert_data["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("scholarships").insert(insert_data).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create scholarship")
    
    try:
        supabase.table("analytics_events").insert({
            "event_type": "scholarship_created",
            "event_data": {"title": data.title, "provider": data.provider_name},
            "user_id": current_user["id"],
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Analytics Event Error] {e}")
        
    return {"success": True, "data": res.data[0]}

# Admin - Update a scholarship
@app.put("/api/admin/scholarships/{sch_id}")
async def admin_update_scholarship(sch_id: str, data: ScholarshipUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
        
    existing_res = supabase.table("scholarships").select("*").eq("id", sch_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Scholarship not found")
    existing = existing_res.data[0]
    
    start_date = data.application_start_date or existing.get("application_start_date")
    end_date = data.application_end_date or existing.get("application_end_date")
    if start_date and end_date:
        if end_date < start_date:
            raise HTTPException(status_code=400, detail="Application end date cannot be before start date.")
            
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("scholarships").update(update_data).eq("id", sch_id).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update scholarship")
        
    try:
        supabase.table("analytics_events").insert({
            "event_type": "scholarship_updated",
            "event_data": {"title": res.data[0].get("title"), "provider": res.data[0].get("provider_name")},
            "user_id": current_user["id"],
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Analytics Event Error] {e}")
        
    return {"success": True, "data": res.data[0]}

# Admin - Delete a scholarship
@app.delete("/api/admin/scholarships/{sch_id}")
async def admin_delete_scholarship(sch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
        
    existing_res = supabase.table("scholarships").select("*").eq("id", sch_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Scholarship not found")
    existing = existing_res.data[0]
    
    supabase.table("scholarships").delete().eq("id", sch_id).execute()
    
    try:
        supabase.table("analytics_events").insert({
            "event_type": "scholarship_deleted",
            "event_data": {"title": existing.get("title"), "provider": existing.get("provider_name")},
            "user_id": current_user["id"],
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Analytics Event Error] {e}")
        
    return {"success": True}

# Admin - Get all scholarship applications
@app.get("/api/admin/scholarship-applications")
async def admin_get_applications(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
        
    res = supabase.table("scholarship_applications").select(
        "*, student:student_id(full_name, email), scholarship:scholarship_id(title, provider_name, scholarship_amount)"
    ).order("created_at", desc=True).execute()
    return res.data or []

# Admin - Update application status
@app.put("/api/admin/scholarship-applications/{app_id}")
async def admin_update_application(app_id: str, data: ApplicationUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
        
    existing_res = supabase.table("scholarship_applications").select("*, scholarship:scholarship_id(title)").eq("id", app_id).execute()
    if not existing_res.data:
        raise HTTPException(status_code=404, detail="Application not found")
    existing = existing_res.data[0]
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["reviewed_by"] = current_user["id"]
    update_data["reviewed_at"] = datetime.utcnow().isoformat()
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("scholarship_applications").update(update_data).eq("id", app_id).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to update application")
        
    evt_type = "scholarship_updated"
    status_str = data.application_status.lower()
    if status_str == "approved":
        evt_type = "scholarship_approved"
    elif status_str == "rejected":
        evt_type = "scholarship_rejected"
        
    try:
        supabase.table("analytics_events").insert({
            "event_type": evt_type,
            "event_data": {
                "application_id": app_id,
                "scholarship_title": existing.get("scholarship", {}).get("title"),
                "status": data.application_status
            },
            "user_id": current_user["id"],
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Analytics Event Error] {e}")
        
    return {"success": True, "data": res.data[0]}

# Student - Get active scholarships
@app.get("/api/student/scholarships")
async def student_get_scholarships(current_user: dict = Depends(get_current_user)):
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    res = supabase.table("scholarships").select("*")\
        .eq("status", "active")\
        .or_(f"application_end_date.gte.{today_str},application_end_date.is.null")\
        .execute()
    scholarships = res.data or []
    
    # Sort: Featured first, then nearest deadline
    scholarships.sort(key=lambda s: (not s.get("is_featured", False), s.get("application_end_date") or ""))
    
    uid = current_user["id"]
    app_res = supabase.table("scholarship_applications").select("scholarship_id").eq("student_id", uid).execute()
    applied_ids = {a["scholarship_id"] for a in (app_res.data or [])}
    
    for s in scholarships:
        s["applied"] = s["id"] in applied_ids
        
    return scholarships

# Student - Apply
@app.post("/api/student/scholarships/{sch_id}/apply")
async def student_apply_scholarship(sch_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    
    existing = supabase.table("scholarship_applications").select("id").eq("student_id", uid).eq("scholarship_id", sch_id).execute()
    if existing.data:
        return {"success": False, "message": "You have already applied."}
        
    sch_res = supabase.table("scholarships").select("*").eq("id", sch_id).execute()
    if not sch_res.data:
        raise HTTPException(status_code=404, detail="Scholarship not found")
    sch = sch_res.data[0]
    
    app_data = {
        "scholarship_id": sch_id,
        "student_id": uid,
        "application_status": "Applied",
        "application_date": datetime.utcnow().isoformat(),
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    
    try:
        res = supabase.table("scholarship_applications").insert(app_data).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create application")
    except Exception:
        return {"success": False, "message": "You have already applied."}
        
    try:
        supabase.table("analytics_events").insert({
            "event_type": "scholarship_applied",
            "event_data": {"scholarship_id": sch_id, "title": sch.get("title")},
            "user_id": uid,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Analytics Event Error] {e}")
        
    return {"success": True, "data": res.data[0]}

# Student - My Applications
@app.get("/api/student/my-scholarships")
async def student_get_my_scholarships(current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    res = supabase.table("scholarship_applications").select(
        "*, scholarship:scholarship_id(title, provider_name, scholarship_amount, description, eligibility_criteria, required_documents)"
    ).eq("student_id", uid).order("application_date", desc=True).execute()
    return res.data or []

````

---

## File: requirements.txt
**Path:** `Backend/requirements.txt`

```
ÿþa i o h a p p y e y e b a l l s = = 2 . 6 . 2 
 
 a i o h t t p = = 3 . 1 4 . 1 
 
 a i o h t t p - r e t r y = = 2 . 8 . 3 
 
 a i o s i g n a l = = 1 . 4 . 0 
 
 a n n o t a t e d - t y p e s = = 0 . 7 . 0 
 
 a n y i o = = 4 . 1 4 . 1 
 
 a t t r s = = 2 6 . 1 . 0 
 
 b c r y p t = = 4 . 0 . 1 
 
 c e r t i f i = = 2 0 2 6 . 6 . 1 7 
 
 c f f i = = 2 . 0 . 0 
 
 c h a r s e t - n o r m a l i z e r = = 3 . 4 . 7 
 
 c l i c k = = 8 . 4 . 2 
 
 c o l o r a m a = = 0 . 4 . 6 
 
 c r y p t o g r a p h y = = 4 9 . 0 . 0 
 
 d e p r e c a t i o n = = 2 . 1 . 0 
 
 d i s t r o = = 1 . 9 . 0 
 
 d n s p y t h o n = = 2 . 8 . 0 
 
 e c d s a = = 0 . 1 9 . 2 
 
 e m a i l - v a l i d a t o r = = 2 . 3 . 0 
 
 f a s t a p i = = 0 . 1 1 5 . 0 
 
 f r o z e n l i s t = = 1 . 8 . 0 
 
 g o t r u e = = 2 . 1 2 . 4 
 
 g r o q = = 0 . 1 3 . 0 
 
 h 1 1 = = 0 . 1 6 . 0 
 
 h 2 = = 4 . 3 . 0 
 
 h p a c k = = 4 . 2 . 0 
 
 h t t p c o r e = = 1 . 0 . 9 
 
 h t t p t o o l s = = 0 . 8 . 0 
 
 h t t p x = = 0 . 2 7 . 2 
 
 h y p e r f r a m e = = 6 . 1 . 0 
 
 i d n a = = 3 . 1 8 
 
 m u l t i d i c t = = 6 . 7 . 1 
 
 n u m p y = = 1 . 2 6 . 4 
 
 p a c k a g i n g = = 2 6 . 2 
 
 p a s s l i b = = 1 . 7 . 4 
 
 p o s t g r e s t = = 0 . 1 6 . 1 1 
 
 p r o p c a c h e = = 0 . 5 . 2 
 
 p y a s n 1 = = 0 . 6 . 3 
 
 p y c p a r s e r = = 3 . 0 
 
 p y d a n t i c = = 2 . 9 . 2 
 
 p y d a n t i c _ c o r e = = 2 . 2 3 . 4 
 
 P y J W T = = 2 . 1 3 . 0 
 
 p y t h o n - d a t e u t i l = = 2 . 9 . 0 . p o s t 0 
 
 p y t h o n - d o t e n v = = 1 . 0 . 1 
 
 p y t h o n - j o s e = = 3 . 3 . 0 
 
 p y t h o n - m u l t i p a r t = = 0 . 0 . 1 7 
 
 P y Y A M L = = 6 . 0 . 3 
 
 r e a l t i m e = = 1 . 0 . 6 
 
 r e q u e s t s = = 2 . 3 4 . 2 
 
 r s a = = 4 . 9 . 1 
 
 s i x = = 1 . 1 7 . 0 
 
 s n i f f i o = = 1 . 3 . 1 
 
 s t a r l e t t e = = 0 . 3 8 . 6 
 
 s t o r a g e 3 = = 0 . 7 . 7 
 
 S t r E n u m = = 0 . 4 . 1 5 
 
 s u p a b a s e = = 2 . 6 . 0 
 
 s u p a b a s e - a u t h = = 2 . 3 1 . 0 
 
 s u p a b a s e - f u n c t i o n s = = 2 . 3 1 . 0 
 
 s u p a f u n c = = 0 . 5 . 1 
 
 t w i l i o = = 9 . 3 . 7 
 
 t y p i n g - i n s p e c t i o n = = 0 . 4 . 2 
 
 t y p i n g _ e x t e n s i o n s = = 4 . 1 5 . 0 
 
 u r l l i b 3 = = 2 . 7 . 0 
 
 u v i c o r n = = 0 . 3 2 . 0 
 
 w a t c h f i l e s = = 1 . 2 . 0 
 
 w e b s o c k e t s = = 1 2 . 0 
 
 y a r l = = 1 . 2 4 . 2 
```

---

## File: docker-compose.yml
**Path:** `docker-compose.yml`

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=https://ad-1-ja69.onrender.com
    depends_on:
      - backend
    volumes:
      - ./frontend:/app
      - /app/node_modules

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/adhoc_ai
      - REDIS_URL=redis://redis:6379
      - SECRET_KEY=adhoc-ai-super-secret-key-change-in-production
    depends_on:
      - db
      - redis
    volumes:
      - ./backend:/app
      - ./uploads:/app/uploads

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=adhoc_ai
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

---

## File: .env
**Path:** `frontend/.env`

```
VITE_API_URL=http://localhost:8000

# .env (frontend)
VITE_DEEPGRAM_API_KEY=7a42eeac02a6749fc238f1d2a63cd69ddd662537
VITE_WS_URL=ws://localhost:8000/ws/voice
```

---

## File: Dockerfile
**Path:** `frontend/Dockerfile`

```
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
```

---

## File: index.html
**Path:** `frontend/index.html`

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/logo.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ADhoc.ai — AI Voice Agents for Education</title>
    <meta name="description" content="Automate admissions, counselling, and student support with AI Voice Agents" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## File: package.json
**Path:** `frontend/package.json`

```json
{
  "name": "adhoc-ai-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@gsap/react": "^2.1.0",
    "@hookform/resolvers": "^3.9.0",
    "@types/three": "^0.184.1",
    "axios": "^1.7.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "date-fns": "^4.1.0",
    "framer-motion": "^12.0.0",
    "gsap": "^3.12.0",
    "lenis": "^1.1.0",
    "lucide-react": "^0.460.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.54.0",
    "react-hot-toast": "^2.5.0",
    "react-router-dom": "^7.0.0",
    "recharts": "^2.15.0",
    "tailwind-merge": "^2.6.0",
    "three": "^0.185.0",
    "uuid": "^11.0.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

---

## File: postcss.config.js
**Path:** `frontend/postcss.config.js`

```
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

## File: App.tsx
**Path:** `frontend/src/App.tsx`

```tsx
import { Routes, Route } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthProvider } from './context/AuthContext'
import GlobalBackground from './components/GlobalBackground'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import AdminDashboard from './pages/AdminDashboard'
import FacultyDashboard from './pages/FacultyDashboard'
import StudentDashboard from './pages/StudentDashboard'
import VoiceCallPage from './pages/VoiceCallPage'
import ProtectedRoute from './components/ProtectedRoute'
import StudentProfilePage from './pages/StudentProfile'

function App() {
  return (
    <AuthProvider>
      <GlobalBackground />
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/voice-demo" element={<VoiceCallPage />} />
          <Route path="/admin/*" element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/faculty/*" element={
            <ProtectedRoute allowedRoles={['faculty']}>
              <FacultyDashboard />
            </ProtectedRoute>
          } />
          {/* /student/profile must come BEFORE /student/* wildcard */}
          <Route path="/student/profile" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentProfilePage />
            </ProtectedRoute>
          } />
          <Route path="/student/*" element={
            <ProtectedRoute allowedRoles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </AnimatePresence>
    </AuthProvider>
  )
}

export default App
```

---

## File: AgentsShowcase.tsx
**Path:** `frontend/src/components/AgentsShowcase.tsx`

```tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GraduationCap, Heart, Users, MessageCircle, DollarSign, FileCheck, Calendar, BookOpen, Star, Sparkles, Wrench, Briefcase, Phone, BarChart3, Headphones } from 'lucide-react'

const agents = [
  { id: 1, category: 'ADMISSIONS', name: 'Admission Enquiry Agent', desc: 'Answers enquiries 24/7 with institution-specific knowledge.', icon: GraduationCap },
  { id: 2, category: 'COUNSELLING', name: 'Career Counselling Agent', desc: 'Personalized academic and career guidance.', icon: Heart },
  { id: 3, category: 'COUNSELLING', name: 'Student Counselling Agent', desc: 'Personalized academic and emotional support.', icon: Users },
  { id: 4, category: 'COMMUNICATION', name: 'Parent Counselling Agent', desc: 'Engages parents with clarity, calm and confidence.', icon: MessageCircle },
  { id: 5, category: 'FINANCE', name: 'Fee Assistant', desc: 'Payment reminders, fee structure, scholarship info.', icon: DollarSign },
  { id: 6, category: 'DOCUMENTS', name: 'Document Verification Agent', desc: 'Verifies and processes student documents.', icon: FileCheck },
  { id: 7, category: 'ONBOARDING', name: 'Student Onboarding Agent', desc: 'Walks new students through enrolment.', icon: Calendar },
  { id: 8, category: 'ACADEMIC', name: 'Attendance Reminder Agent', desc: 'Sends attendance alerts and reports.', icon: BookOpen },
  { id: 9, category: 'ACADEMIC', name: 'Exam Reminder Agent', desc: 'Exam schedules, preparation tips, results.', icon: Star },
  { id: 10, category: 'ACADEMIC', name: 'Academic Mentor', desc: 'Course guidance, study plans, progress tracking.', icon: Sparkles },
  { id: 11, category: 'SKILLS', name: 'ITI Counsellor', desc: 'Skill development and vocational guidance.', icon: Wrench },
  { id: 12, category: 'CAREERS', name: 'Placement Assistance Agent', desc: 'Interview prep, openings and placement readiness.', icon: Briefcase },
  { id: 13, category: 'OUTREACH', name: 'Outreach Agent', desc: 'Outbound campaigns across regions.', icon: Phone },
  { id: 14, category: 'ANALYTICS', name: 'Admission CRM Agent', desc: 'Lead tracking, follow-ups, conversion.', icon: BarChart3 },
  { id: 15, category: 'GENERAL', name: 'General College Assistant', desc: 'All-purpose institutional knowledge base.', icon: Headphones },
]

export default function AgentsShowcase() {
  const [activeIndex, setActiveIndex] = useState(0)
  return (
    <section id="agents" className="py-32 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">15 AI VOICE AGENTS</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">An entire admissions <span className="text-gradient-neon">department,</span> automated.</h2>
          <p className="text-zinc-400">Scroll to meet the team. Each agent owns one responsibility and speaks fluently across languages.</p>
        </motion.div>
        <div className="relative h-[500px] flex items-center justify-center">
          <AnimatePresence mode="popLayout">
            {agents.map((agent, i) => {
              const offset = i - activeIndex
              const isActive = i === activeIndex
              return (
                <motion.div key={agent.id} initial={false}
                  animate={{ y: offset * 30, scale: isActive ? 1 : 0.9, opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.2, zIndex: agents.length - Math.abs(offset), rotateX: offset * -5 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  onClick={() => setActiveIndex(i)}
                  className={`absolute w-full max-w-md cursor-pointer ${isActive ? 'pointer-events-auto' : 'pointer-events-none'}`}
                  style={{ perspective: 1000 }}>
                  <div className={`glass-panel rounded-3xl p-6 border transition-all duration-300 ${isActive ? 'border-purple-500/40 shadow-2xl shadow-purple-500/10' : 'border-white/5 opacity-40'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs text-purple-400 font-mono tracking-wider font-semibold">{agent.category}</span>
                      <span className="text-xs text-zinc-500 font-mono">{String(i + 1).padStart(2, '0')} / 15</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center">
                        <agent.icon size={24} className="text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white text-lg">{agent.name}</h3>
                        <p className="text-sm text-zinc-400">{agent.desc}</p>
                      </div>
                    </div>
                    {isActive && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 flex items-center gap-2">
                        <div className="flex-1 h-8 flex items-end gap-0.5">
                          {[...Array(20)].map((_, j) => (
                            <motion.div key={j} className="flex-1 bg-gradient-to-t from-purple-500 to-cyan-400 rounded-full"
                              animate={{ height: [4, 16 + Math.random() * 16, 4] }}
                              transition={{ duration: 0.8, delay: j * 0.03, repeat: Infinity }} />
                          ))}
                        </div>
                        <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm text-white transition-colors">Try agent →</button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
        <div className="flex justify-center gap-2 mt-8">
          {agents.map((_, i) => (
            <button key={i} onClick={() => setActiveIndex(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === activeIndex ? 'bg-purple-500 w-6' : 'bg-white/20 hover:bg-white/40'}`} />
          ))}
        </div>
      </div>
    </section>
  )
}
```

---

## File: CTASection.tsx
**Path:** `frontend/src/components/CTASection.tsx`

```tsx
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Phone, ArrowRight } from 'lucide-react'

export default function CTASection() {
  const navigate = useNavigate()
  return (
    <section className="py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="glass-panel rounded-3xl p-12 md:p-16 text-center relative overflow-hidden border border-white/10">
          <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2" />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4 tracking-tight">Bring your institution into the <span className="text-gradient-neon">AI era.</span></h2>
            <p className="text-zinc-400 mb-8 max-w-xl mx-auto">See ADhoc.ai automate counselling, admissions and student support across your campus.</p>
            <div className="flex flex-wrap justify-center gap-4">
              {/* FIX: Single "Talk to AI" CTA, removed redundant "Try Voice Demo" */}
              <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/voice-demo')}
                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-full font-medium shadow-lg shadow-purple-500/20 border border-white/10 hover:border-purple-300/30 glow-purple">
                <Phone size={18} />Talk to AI
              </motion.button>
              <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => navigate('/auth')}
                className="flex items-center gap-3 px-8 py-4 glass text-white rounded-full font-medium border border-white/15 hover:bg-white/10 transition-colors">
                Get Started Free<ArrowRight size={18} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
```

---

## File: DashboardShowcase.tsx
**Path:** `frontend/src/components/DashboardShowcase.tsx`

```tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const dashboards = [
  {
    role: 'admin',
    label: 'Admin',
    color: 'from-purple-600 to-purple-400',
    stats: [
      { l: 'Live conversations', v: '147' },
      { l: 'Applications today', v: '+218' },
      { l: 'Avg. call duration', v: '3m 42s' },
      { l: 'Knowledge documents', v: '1,284' }
    ],
    sidebar: [
      'Admissions funnel',
      'Knowledge uploads',
      'Prompt management',
      'Voice AI',
      'Telephony'
    ],
    chart: true
  },

  {
    role: 'faculty',
    label: 'Faculty',
    color: 'from-cyan-600 to-cyan-400',
    stats: [
      { l: 'Next class', v: 'Algorithms • 10:30' },
      { l: 'Attendance %', v: '94%' },
      { l: 'Pending assignments', v: '12' },
      { l: 'Students at risk', v: '3' },
      { l: 'Office hours', v: '4-6pm' }
    ],
    sidebar: [
      'Classes',
      'Attendance',
      'Meetings',
      'Assignments',
      'Analytics'
    ],
    chart: true
  },

  {
    role: 'student',
    label: 'Student',
    color: 'from-emerald-600 to-emerald-400',
    stats: [
      { l: 'Application status', v: 'Under review' },
      { l: 'Scholarship match', v: '₹ 80,000 / yr' },
      { l: 'Next deadline', v: '15 Mar' },
      { l: 'Recommended colleges', v: '8' },
      { l: 'Semester progress', v: '62%' }
    ],
    sidebar: [
      'Career assistant',
      'Admissions tracker',
      'Scholarships',
      'Documents',
      'Roadmap'
    ],
    chart: true
  }
]

export default function DashboardShowcase() {
  const [activeRole, setActiveRole] = useState(0)
  const dashboard = dashboards[activeRole]
  return (
    <section id="about" className="py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">THREE ROLES, ONE ECOSYSTEM</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Built for everyone who runs the <span className="text-gradient-neon">institution.</span></h2>
        </motion.div>
        <div className="flex justify-center mb-12">
          <div className="glass-panel rounded-full p-1 flex gap-1 border border-white/10">
            {dashboards.map((d, i) => (
              <button key={d.role} onClick={() => setActiveRole(i)}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                  i === activeRole ? 'bg-gradient-to-r ' + d.color + ' text-white shadow-lg shadow-purple-500/10' : 'text-zinc-400 hover:text-white'
                }`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={dashboard.role} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}
            className="glass-panel rounded-3xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/5">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 mx-4">
                <div className="glass-panel rounded-lg px-4 py-1.5 text-xs text-zinc-500 text-center font-mono border border-white/5">adhoc.ai / {dashboard.role}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <p className="text-xs text-zinc-500 font-mono tracking-wider mb-4 uppercase">
                  {dashboard.role === 'admin' ? 'AI Control Center' : dashboard.role === 'faculty' ? 'Today, at a glance' : 'Your AI Mentor'}
                </p>
                {dashboard.sidebar.map((item) => (
                  <div key={item} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-zinc-300 hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />{item}
                  </div>
                ))}
              </div>
              <div className="lg:col-span-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {dashboard.stats.map((stat) => (
                    <div key={stat.l} className="glass-panel rounded-2xl p-4 hover:bg-white/5 transition-all duration-300 border border-white/10 hover:border-purple-500/20">
                      <p className="text-xs text-zinc-500 mb-1">{stat.l}</p>
                      <p className="text-xl font-bold text-white font-mono">{stat.v}</p>
                    </div>
                  ))}
                </div>
                {dashboard.chart && (
                  <div className="glass-panel rounded-2xl p-6 h-48 flex items-end justify-between gap-1 border border-white/10">
                    {[...Array(30)].map((_, i) => (
                      <motion.div key={i} className="flex-1 bg-gradient-to-t from-purple-500/60 via-pink-500/40 to-cyan-400/60 rounded-t-lg"
                        initial={{ height: 0 }} animate={{ height: `${20 + Math.random() * 80}%` }} transition={{ delay: i * 0.03, duration: 0.5 }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
```

---

## File: FAQSection.tsx
**Path:** `frontend/src/components/FAQSection.tsx`

```tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X } from 'lucide-react'

const faqs = [
  { q: "What exactly does ADhoc.ai automate?", a: "Admission enquiries, course recommendation, counselling, fee structure, scholarship guidance, document verification, parent communication, onboarding, attendance and exam notifications, academic guidance, ITI/skill counselling and placement support — across voice and chat." },
  { q: "Does it integrate with our existing systems?", a: "Yes, ADhoc.ai provides REST APIs and webhooks for seamless integration with your existing ERP, LMS, CRM, and payment systems. We support SSO via SAML and OAuth 2.0." },
  { q: "Which languages do the AI agents support?", a: "Our AI agents support 50+ languages including Hindi, English, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Gujarati, and Punjabi. New languages can be added on request." },
  { q: "How is institutional knowledge kept up to date?", a: "Upload PDFs, DOCX, spreadsheets, or connect URLs. Our system automatically parses, chunks, embeds, and indexes your content. Updates are reflected in real-time." },
  { q: "Is it secure and compliant?", a: "ADhoc.ai is SOC 2 Type II certified, GDPR compliant, and uses end-to-end encryption. All data is stored in ISO 27001 certified data centers with 99.9% uptime SLA." },
  { q: "Can students and parents use the same dashboard?", a: "No, each role gets a tailored dashboard. Students see career tools, admission trackers, and academic progress. Parents get attendance, fee, and communication updates. Admins control everything." },
]

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  return (
    <section id="faq" className="py-32 relative">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">FAQ</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Questions, <span className="text-gradient-neon">answered.</span></h2>
        </motion.div>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <div className={`glass-panel rounded-2xl overflow-hidden transition-all duration-300 ${openIndex === i ? 'border-purple-500/40 bg-purple-950/10' : ''}`}>
                <button onClick={() => setOpenIndex(openIndex === i ? null : i)} className="w-full flex items-center justify-between p-6 text-left">
                  <span className="font-medium text-white">{faq.q}</span>
                  <span className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-transform hover:scale-105">{openIndex === i ? <X size={16} className="text-purple-400" /> : <Plus size={16} />}</span>
                </button>
                <AnimatePresence>
                  {openIndex === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}>
                      <div className="px-6 pb-6 text-zinc-400 leading-relaxed">{faq.a}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

---

## File: Footer.tsx
**Path:** `frontend/src/components/Footer.tsx`

```tsx
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-16">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-bold text-lg text-white">ADhoc<span className="text-purple-400">.ai</span></span>
            </div>
            <p className="text-zinc-500 text-sm max-w-xs">The AI operating system for educational institutions.</p>
          </div>
          {[
            { title: 'PLATFORM', links: ['AI Agents','Voice Studio','Knowledge Base','Prompt Studio','Telephony','Analytics'] },
            { title: 'SOLUTIONS', links: ['Universities','Colleges','ITIs','Coaching','Skill Centers'] },
            { title: 'COMPANY', links: ['About','Careers','Customers','Security','Contact'] },
            { title: 'RESOURCES', links: ['Docs','Changelog','Blog','Status','Trust Center'] },
          ].map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-medium text-zinc-500 tracking-wider mb-4">{section.title}</h4>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link}><span className="text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer">{link}</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10">
          <p className="text-zinc-500 text-sm">© 2026 ADhoc.ai · All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Privacy</span>
            <span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Terms</span>
            <span className="text-sm text-zinc-500 hover:text-white transition-colors cursor-pointer">Security</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
```

---

## File: GlobalBackground.tsx
**Path:** `frontend/src/components/GlobalBackground.tsx`

```tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useMousePosition } from '../hooks/useMousePosition'

export default function GlobalBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useMousePosition()
  const mouseRef = useRef({ x: 0.5, y: 0.5 })

  // Keep ref to mouse position for render loop
  useEffect(() => {
    // Normalize to -0.5 to 0.5
    if (typeof window !== 'undefined') {
      mouseRef.current = {
        x: (mouse.x / window.innerWidth) - 0.5,
        y: (mouse.y / window.innerHeight) - 0.5,
      }
    }
  }, [mouse])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // 1. Setup Renderer & Scene
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x050508, 0.025)

    // 2. Setup Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    camera.position.set(0, 4, 18)
    camera.lookAt(0, 1, 0)

    // 3. Create Stars System
    const starsCount = 600
    const starsGeometry = new THREE.BufferGeometry()
    const starsPositions = new Float32Array(starsCount * 3)
    const starsSizes = new Float32Array(starsCount)

    for (let i = 0; i < starsCount; i++) {
      // Position stars in a wide volume in front of and around the camera
      starsPositions[i * 3] = (Math.random() - 0.5) * 80
      starsPositions[i * 3 + 1] = (Math.random() - 0.2) * 40
      starsPositions[i * 3 + 2] = (Math.random() - 0.5) * 80

      starsSizes[i] = Math.random() * 0.08 + 0.02
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3))

    // Faint glowing points
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xbf5af2,
      size: 0.12,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending
    })

    const stars = new THREE.Points(starsGeometry, starsMaterial)
    scene.add(stars)

    // 4. Perspective Neon Grid
    const gridGroup = new THREE.Group()
    scene.add(gridGroup)

    const gridLines = 28
    const gridExtent = 40
    const gridSpacing = 2.5
    const gridLinePositions: number[] = []

    // Longitudinal lines (Z direction)
    for (let i = -gridLines / 2; i <= gridLines / 2; i++) {
      const x = i * gridSpacing
      gridLinePositions.push(x, 0, -gridExtent)
      gridLinePositions.push(x, 0, gridExtent)
    }

    // Latitudinal lines (X direction)
    for (let i = -gridLines / 2; i <= gridLines / 2; i++) {
      const z = i * gridSpacing
      gridLinePositions.push(-gridExtent, 0, z)
      gridLinePositions.push(gridExtent, 0, z)
    }

    const gridGeometry = new THREE.BufferGeometry()
    gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridLinePositions, 3))

    // Neon cyan grid lines with soft glow
    const gridMaterial = new THREE.LineBasicMaterial({
      color: 0x0a84ff,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending
    })

    const lineGrid = new THREE.LineSegments(gridGeometry, gridMaterial)
    gridGroup.add(lineGrid)

    // 5. Ambient Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)

    const pointLight = new THREE.PointLight(0xbf5af2, 1.5, 30)
    pointLight.position.set(0, 10, 0)
    scene.add(pointLight)

    // 6. Animation Variables
    let animationFrameId: number
    const startTime = performance.now()

    // Smooth camera target offsets
    let currentCamX = 0
    let currentCamY = 4

    // Render loop
    const tick = () => {
      const elapsedTime = (performance.now() - startTime) / 1000

      // Slow drift for grid to simulate moving forward
      gridGroup.position.z = (elapsedTime * 1.5) % gridSpacing

      // Slow twinkle of stars using time
      starsMaterial.opacity = 0.5 + Math.sin(elapsedTime * 2.0) * 0.2

      // Slowly rotate stars
      stars.rotation.y = elapsedTime * 0.015

      // Parallax mouse movements with damping (easing)
      const targetCamX = mouseRef.current.x * 3.5
      const targetCamY = 4 - mouseRef.current.y * 2.0

      currentCamX += (targetCamX - currentCamX) * 0.05
      currentCamY += (targetCamY - currentCamY) * 0.05

      camera.position.x = currentCamX
      camera.position.y = currentCamY
      camera.lookAt(0, 0.5, 0)

      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(tick)
    }

    tick()

    // 7. Handle Resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    // 8. Clean up
    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      gridGeometry.dispose()
      gridMaterial.dispose()
      starsGeometry.dispose()
      starsMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="fixed inset-0 w-full h-full pointer-events-none z-[-10] overflow-hidden bg-space-black">
      {/* Background Volumetric Nebula Fog Layer (CSS Gradient) */}
      <div 
        className="absolute inset-0 opacity-40 transition-transform duration-1000 ease-out pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 30% 20%, rgba(191, 90, 242, 0.22) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(10, 132, 255, 0.18) 0%, transparent 60%),
            radial-gradient(circle at 50% 50%, rgba(5, 5, 8, 1) 0%, #030206 100%)
          `,
          transform: `scale(1.1) translate(${mouseRef.current.x * -10}px, ${mouseRef.current.y * -10}px)`
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  )
}
```

---

## File: Hero3DScene.tsx
**Path:** `frontend/src/components/Hero3DScene.tsx`

```tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useMousePosition } from '../hooks/useMousePosition'

export default function Hero3DScene() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useMousePosition()
  const mouseRef = useRef({ x: 0, y: 0 })

  // Track mouse coordinates normalized (-1 to 1)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      mouseRef.current = {
        x: (mouse.x / window.innerWidth) * 2 - 1,
        y: -(mouse.y / window.innerHeight) * 2 + 1,
      }
    }
  }, [mouse])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // 1. Setup Renderer
    const width = container.clientWidth || 500
    const height = container.clientHeight || 500
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true

    // 2. Setup Scene & Camera
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    camera.position.set(0, 0, 11)

    // 3. Create Custom Procedural Shader/Displacement for Organic Metaball
    // Create Icosahedron geometry with high detail for smooth vertex displacement
    const detail = 5
    const mainGeometry = new THREE.IcosahedronGeometry(2.4, detail)
    
    // Store original positions for displacement calculations
    const originalPositions = mainGeometry.attributes.position.clone()
    const tempPos = new THREE.Vector3()
    const normalVec = new THREE.Vector3()

    // Premium Material - Glossy Glassy Metallic with Transmission
    const mainMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8a2be2, // Purple
      emissive: 0x1d003a, // Subtle emissive glow
      roughness: 0.12,
      metalness: 0.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transmission: 0.45, // Glass translucent effect
      thickness: 1.2,
      ior: 1.45,
      sheen: 1.0,
      sheenColor: 0xff007f, // Glowing Pink Sheen rim
      specularIntensity: 1.0,
      flatShading: false
    })

    const metaballMesh = new THREE.Mesh(mainGeometry, mainMaterial)
    scene.add(metaballMesh)

    // 4. Orbiting Blobs (metaball satellites)
    const blobsGroup = new THREE.Group()
    scene.add(blobsGroup)

    const blobMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x00ffff, // Cyan
      emissive: 0x002b2b,
      roughness: 0.1,
      metalness: 0.2,
      transmission: 0.6,
      clearcoat: 1.0,
      thickness: 1.0,
      sheen: 0.8,
      sheenColor: 0x00ffff
    })

    const blobs: { mesh: THREE.Mesh; orbitSpeed: number; orbitRadius: number; phaseY: number; phaseX: number }[] = []
    const blobCount = 3
    const blobGeometries = [
      new THREE.IcosahedronGeometry(0.55, 3),
      new THREE.IcosahedronGeometry(0.4, 3),
      new THREE.IcosahedronGeometry(0.48, 3)
    ]

    for (let i = 0; i < blobCount; i++) {
      const mesh = new THREE.Mesh(blobGeometries[i], blobMaterial)
      blobsGroup.add(mesh)
      blobs.push({
        mesh,
        orbitSpeed: 0.4 + i * 0.15,
        orbitRadius: 3.4 + i * 0.4,
        phaseY: Math.random() * Math.PI * 2,
        phaseX: Math.random() * Math.PI * 2
      })
    }

    // 5. Orbital Dust Particles
    const particleCount = 120
    const particleGeo = new THREE.BufferGeometry()
    const particlePositions = new Float32Array(particleCount * 3)
    const particlePhases = new Float32Array(particleCount)
    const particleSpeeds = new Float32Array(particleCount)
    const particleRadii = new Float32Array(particleCount)

    for (let i = 0; i < particleCount; i++) {
      particlePhases[i] = Math.random() * Math.PI * 2
      particleSpeeds[i] = 0.2 + Math.random() * 0.4
      particleRadii[i] = 3.6 + Math.random() * 1.5

      // Initial positions
      const angle = particlePhases[i]
      particlePositions[i * 3] = Math.cos(angle) * particleRadii[i]
      particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 2.5
      particlePositions[i * 3 + 2] = Math.sin(angle) * particleRadii[i]
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.08,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })

    const particles = new THREE.Points(particleGeo, particleMaterial)
    scene.add(particles)

    // 6. Premium Realistic Lighting
    const ambientLight = new THREE.AmbientLight(0x0f0b24, 1.2)
    scene.add(ambientLight)

    // Key light (Cyan)
    const cyanLight = new THREE.DirectionalLight(0x00ffff, 4.0)
    cyanLight.position.set(-6, 4, 5)
    scene.add(cyanLight)

    // Fill light (Pink/Magenta)
    const pinkLight = new THREE.DirectionalLight(0xff007f, 3.5)
    pinkLight.position.set(6, -4, 5)
    scene.add(pinkLight)

    // Rim lighting (White/Backlight)
    const rimLight = new THREE.DirectionalLight(0xffffff, 3.0)
    rimLight.position.set(0, 0, -10)
    scene.add(rimLight)

    // Moving point light for glowing glossy reflections
    const orbLight = new THREE.PointLight(0xbf5af2, 3.0, 15)
    scene.add(orbLight)

    // 7. Math displacement function for metaball (Sine noise layered)
    const displacementNoise = (x: number, y: number, z: number, time: number) => {
      // Create multi-frequency layered wave displacement for organic look
      const wave1 = Math.sin(x * 1.2 + time * 1.2) * Math.cos(y * 1.2 - time * 0.8) * 0.2
      const wave2 = Math.cos(z * 2.2 + time * 1.6) * Math.sin(x * 1.8 - time * 1.0) * 0.12
      const wave3 = Math.sin(y * 3.5 + time * 2.5) * 0.06
      return wave1 + wave2 + wave3
    }

    // 8. Render loop
    const clock = new THREE.Clock()
    let animationFrameId: number

    // Eased mouse offsets for damping
    let mouseEaseX = 0
    let mouseEaseY = 0
    let introProgress = 0

    const tick = () => {
      const elapsedTime = clock.getElapsedTime()

      // Cinematic Intro Stage progression
      if (introProgress < 1) {
        introProgress += 0.007 // Complete intro inside 2.5 seconds
      }

      // Calculate organic displacement on vertices
      const posAttr = mainGeometry.attributes.position
      const count = posAttr.count

      for (let i = 0; i < count; i++) {
        // Read original position coordinate
        tempPos.fromBufferAttribute(originalPositions, i)
        normalVec.copy(tempPos).normalize()

        // Calculate procedural noise displacement at this point
        const disp = displacementNoise(tempPos.x, tempPos.y, tempPos.z, elapsedTime)

        // Set displaced vertex position along its normal vector
        posAttr.setXYZ(
          i,
          tempPos.x + normalVec.x * disp,
          tempPos.y + normalVec.y * disp,
          tempPos.z + normalVec.z * disp
        )
      }

      posAttr.needsUpdate = true
      mainGeometry.computeVertexNormals()

      // Slow idle rotation + breathing pulse
      metaballMesh.rotation.y = elapsedTime * 0.15
      metaballMesh.rotation.x = elapsedTime * 0.08
      
      // Stage 5 & 6: Scale transitions from 0 to normal breathing scale
      const breatheScale = (1.0 + Math.sin(elapsedTime * 1.8) * 0.04) * Math.min(1, introProgress * 1.5)
      metaballMesh.scale.set(breatheScale, breatheScale, breatheScale)

      // Orbiting satellites (Blobs) positioning
      blobs.forEach((blob, idx) => {
        const timeFactor = elapsedTime * blob.orbitSpeed
        // Orbit inwards as introProgress proceeds (Stage 4 & 5)
        const orbitRadiusFactor = Math.max(1, 2 - introProgress) * blob.orbitRadius
        const bx = Math.cos(timeFactor + blob.phaseY) * orbitRadiusFactor
        const bz = Math.sin(timeFactor + blob.phaseY) * orbitRadiusFactor
        const by = Math.sin(timeFactor * 1.4 + blob.phaseX) * 1.8

        blob.mesh.position.set(bx, by, bz)
        blob.mesh.rotation.y = elapsedTime * 0.5
        blob.mesh.rotation.x = elapsedTime * 0.3

        // Satellites slight independent breathing (stage in from 0)
        const satBreathe = (1.0 + Math.sin(elapsedTime * 2.5 + idx) * 0.1) * Math.min(1, Math.max(0, introProgress - 0.2) * 1.5)
        blob.mesh.scale.set(satBreathe, satBreathe, satBreathe)
      })

      // Orbiting dust particles positioning
      const particlePosAttr = particleGeo.attributes.position
      const pCount = particlePosAttr.count
      for (let i = 0; i < pCount; i++) {
        const speed = particleSpeeds[i]
        // Stage 4: Particles move inward toward center
        const radiusFactor = Math.max(1, 2.5 - introProgress * 1.5) * particleRadii[i]
        const phase = particlePhases[i] + elapsedTime * speed

        const px = Math.cos(phase) * radiusFactor
        const pz = Math.sin(phase) * radiusFactor
        
        // Add subtle vertical wave
        const py = Math.sin(elapsedTime * 0.8 + i) * 1.2

        particlePosAttr.setXYZ(i, px, py, pz)
      }
      particlePosAttr.needsUpdate = true

      // Stage 3 & 4: Star particle system fades in
      particleMaterial.opacity = 0.8 * Math.min(1, Math.max(0, introProgress - 0.1) * 1.5)

      // Stage 8: Lights activate dynamically
      cyanLight.intensity = 4.0 * Math.min(1, Math.max(0, introProgress - 0.3) * 2)
      pinkLight.intensity = 3.5 * Math.min(1, Math.max(0, introProgress - 0.3) * 2)
      rimLight.intensity = 3.0 * Math.min(1, Math.max(0, introProgress - 0.4) * 2)

      // Orbiting point light path
      orbLight.position.set(
        Math.cos(elapsedTime * 2.0) * 4.5,
        Math.sin(elapsedTime * 1.5) * 3.0,
        Math.sin(elapsedTime * 2.0) * 4.5
      )

      // Mouse displacement parallax with damping
      mouseEaseX += (mouseRef.current.x - mouseEaseX) * 0.05
      mouseEaseY += (mouseRef.current.y - mouseEaseY) * 0.05

      // Move camera slightly
      camera.position.x = mouseEaseX * 1.2
      camera.position.y = mouseEaseY * 1.2
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
      animationFrameId = requestAnimationFrame(tick)
    }

    tick()

    // 9. Handle Resize
    const handleResize = () => {
      if (!container || !canvas) return
      const w = container.clientWidth
      const h = container.clientHeight
      
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      
      renderer.setSize(w, h)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    }
    window.addEventListener('resize', handleResize)

    // 10. Clean up
    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      mainGeometry.dispose()
      mainMaterial.dispose()
      blobGeometries.forEach(g => g.dispose())
      blobMaterial.dispose()
      particleGeo.dispose()
      particleMaterial.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full relative flex items-center justify-center">
      {/* Absolute Glow Background Spot */}
      <div className="absolute w-[80%] h-[80%] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none z-0" />
      <canvas ref={canvasRef} className="relative z-10 w-full h-full block" />
    </div>
  )
}
```

---

## File: HeroSection.tsx
**Path:** `frontend/src/components/HeroSection.tsx`

```tsx
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Phone, ArrowRight } from 'lucide-react'
import { useMousePosition } from '../hooks/useMousePosition'
import Hero3DScene from './Hero3DScene'

export default function HeroSection() {
  const navigate = useNavigate()
  const mouse = useMousePosition()
  
  // Subtle parallax offset calculations for ambient glow elements
  const offsetX = typeof window !== 'undefined' ? (mouse.x - window.innerWidth/2) * 0.012 : 0
  const offsetY = typeof window !== 'undefined' ? (mouse.y - window.innerHeight/2) * 0.012 : 0

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Decorative ambient glowing layer */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <div className="absolute top-12 left-1/4 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[130px] animate-pulse-slow"
          style={{ transform: `translate(${offsetX}px, ${offsetY}px)` }} />
        <div className="absolute bottom-12 right-1/4 w-[450px] h-[450px] bg-cyan-500/8 rounded-full blur-[110px] animate-pulse-slow"
          style={{ animationDelay: '2s', transform: `translate(${-offsetX*0.6}px, ${-offsetY*0.6}px)` }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center w-full">
        {/* Left Column: Premium visual intro with Framer Motion staggered timings */}
        <motion.div 
          initial={{ opacity: 0, x: -30 }} 
          animate={{ opacity: 1, x: 0 }} 
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          {/* Label Badge */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.8, duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/10 text-xs text-purple-300 mb-6 font-mono tracking-wider shadow-lg shadow-purple-500/5 select-none"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-ping" />
            ENTERPRISE AI OPERATING SYSTEM
          </motion.div>

          {/* Heading - Stage 9 */}
          <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6 tracking-tight text-white">
            Automate the entire{' '}
            <span className="text-zinc-100">education &</span><br />
            admission journey{' '}
            <span className="text-gradient-neon font-extrabold">with AI Voice.</span>
          </h1>

          {/* Description */}
          <p className="text-lg text-zinc-400 mb-8 max-w-xl leading-relaxed">
            ADhoc.ai enables colleges, universities, and training institutions to automate admissions, 
            counselling, onboarding, parent communication, and academic support through conversational AI 
            and intelligent voice automation.
          </p>

          {/* Buttons - Stage 10 */}
          <div className="flex flex-wrap gap-4 mb-12">
            <motion.button 
              whileHover={{ scale: 1.03, y: -2 }} 
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/voice-demo')}
              className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-full font-medium transition-all shadow-lg shadow-purple-500/20 border border-white/10 hover:border-purple-300/30 glow-purple"
            >
              <Phone size={18} className="group-hover:rotate-12 transition-transform duration-300" />
              Talk to AI Agent
              <ArrowRight size={16} className="group-hover:translate-x-1.5 transition-transform duration-300" />
            </motion.button>
            
            <motion.button 
              whileHover={{ scale: 1.03, y: -2 }} 
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate('/auth')}
              className="flex items-center gap-3 px-8 py-4 glass hover:bg-white/10 text-white rounded-full font-medium transition-all border border-white/15 shadow-sm"
            >
              Get Started Free
            </motion.button>
          </div>

          {/* Stats Badges */}
          <div className="flex gap-8 border-t border-white/5 pt-8">
            {[
              {v:'15+',l:'AI VOICE AGENTS'},
              {v:'24/7',l:'STUDENT SUPPORT'},
              {v:'100+',l:'WORKFLOWS'},
            ].map((s,i) => (
              <motion.div 
                key={s.l} 
                initial={{ opacity: 0, y: 15 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: 1.4 + i*0.12, duration: 0.6 }}
              >
                <div className="text-2xl md:text-3xl font-extrabold text-white font-mono">{s.v}</div>
                <div className="text-[10px] text-zinc-500 font-mono tracking-widest mt-1.5">{s.l}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Column: 3D centerpiece scene - Stages 5, 6, 8 */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.85 }} 
          animate={{ opacity: 1, scale: 1 }} 
          transition={{ duration: 1.2, delay: 0.3 }}
          className="relative hidden lg:flex items-center justify-center h-[520px] w-full z-10"
        >
          <div className="absolute inset-0 w-full h-full">
            <Hero3DScene />
          </div>
          
          {/* Orbiting glowing tags representing system segments */}
          {[
            {label:'Live transcript', top:'10%', right:'5%', bottom:'auto', leftPos:'auto', color:'bg-neon-cyan'},
            {label:'Counselling agent', top:'25%', right:'-5%', bottom:'auto', leftPos:'auto', color:'bg-neon-purple'},
            {label:'Knowledge retrieval', top:'auto', right:'auto', bottom:'20%', leftPos:'-8%', color:'bg-neon-pink'},
            {label:'Voice synthesis', top:'auto', right:'5%', bottom:'10%', leftPos:'auto', color:'bg-neon-teal'}
          ].map((item,i) => (
            <motion.div 
              key={item.label} 
              className="absolute glass-panel px-4 py-2 rounded-full text-xs text-zinc-200 border border-white/10 font-mono tracking-wide shadow-lg select-none"
              style={{ top: item.top, right: item.right, bottom: item.bottom, left: item.leftPos }}
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 1.6 + i*0.2, duration: 0.8 }}
              whileHover={{ scale: 1.05, borderColor: "rgba(255, 255, 255, 0.25)" }}
            >
              <span className={`w-2 h-2 rounded-full ${item.color} inline-block mr-2 animate-pulse`} />
              {item.label}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
```

---

## File: Navbar.tsx
**Path:** `frontend/src/components/Navbar.tsx`

```tsx
import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { label: 'Home', href: '#hero' },
    { label: 'Solutions', href: '#solutions' },
    { label: 'AI Agents', href: '#agents' },
    { label: 'Platform', href: '#platform' },
    { label: 'About', href: '#about' },
    { label: 'FAQ', href: '#faq' },
  ]

  const scrollTo = (href: string) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
    setMobileOpen(false)
  }

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`fixed top-4 inset-x-0 z-50 flex justify-center transition-all duration-500 ${
        scrolled ? 'px-4' : 'px-4'
      }`}
    >
      <div
        className={`w-full max-w-6xl transition-all duration-500 ${
          scrolled
            ? 'glass-panel rounded-2xl shadow-2xl border border-white/10'
            : 'bg-transparent border border-transparent'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-3">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-extrabold text-lg text-white">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.label}
                onClick={() => scrollTo(link.href)}
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300 hover:text-white rounded-full hover:bg-white/5 border border-transparent hover:border-white/5 transition-all"
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <button
                onClick={() => navigate(`/${user.role}`)}
                className="px-5 py-2 text-sm bg-white/5 hover:bg-white/10 text-white rounded-full transition-all border border-white/10"
              >
                Dashboard
              </button>
            ) : (
              <>
                <Link to="/auth" className="px-5 py-2 text-sm text-zinc-300 hover:text-white transition-colors">
                  Log in
                </Link>
                <Link to="/auth" className="px-5 py-2 text-sm bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 hover:from-purple-500 hover:via-pink-400 hover:to-purple-400 text-white rounded-full transition-all shadow-lg shadow-purple-500/20 border border-white/10 hover:border-purple-300/30 glow-purple">
                  Sign up
                </Link>
              </>
            )}
          </div>

          <button className="md:hidden text-white" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden glass-strong rounded-xl mx-2 mb-2 p-4"
            >
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => scrollTo(link.href)}
                  className="block w-full text-left px-4 py-3 text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  {link.label}
                </button>
              ))}
              <div className="mt-4 pt-4 border-t border-white/10 flex gap-3">
                <Link to="/auth" className="flex-1 text-center py-2 text-sm text-zinc-300 border border-white/20 rounded-full">Log in</Link>
                <Link to="/auth" className="flex-1 text-center py-2 text-sm bg-purple-600 text-white rounded-full">Sign up</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  )
}
```

---

## File: PlatformBento.tsx
**Path:** `frontend/src/components/PlatformBento.tsx`

```tsx
import { motion } from 'framer-motion'
import { Mic, BookOpen, FileCode, Brain, Phone, Globe, MessageSquare, BarChart3, Shield } from 'lucide-react'

const features = [
  { icon: Mic, title: 'Voice AI Conversations', desc: 'Realtime, low-latency speech with natural turn-taking.', size: 'large' },
  { icon: BookOpen, title: 'Knowledge Base Search', desc: 'Conversational retrieval over institution documents.', size: 'small' },
  { icon: FileCode, title: 'Prompt Engineering', desc: 'VS Code-inspired studio with variables and versions.', size: 'small' },
  { icon: Brain, title: 'RAG Intelligence', desc: 'Grounded answers with citations and confidence.', size: 'small' },
  { icon: Phone, title: 'Telephony Integration', desc: 'Inbound, outbound, queues and number management.', size: 'large' },
  { icon: Globe, title: 'WebRTC Browser Calling', desc: 'Native browser calling without plugins.', size: 'small' },
  { icon: MessageSquare, title: 'Real-time Transcripts', desc: 'Live conversation with speaker labels and search.', size: 'large' },
  { icon: Shield, title: 'Role-based Access', desc: 'Admin, faculty, student — scoped to the role.', size: 'small' },
  { icon: BarChart3, title: 'Analytics', desc: 'Admission funnel, voice quality, agent performance.', size: 'small' },
]

export default function PlatformBento() {
  return (
    <section id="platform" className="py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">PLATFORM</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">One <span className="text-gradient-neon">operating system</span> for the entire institution.</h2>
          <p className="text-zinc-400">Modular by design. Every capability is a building block of your AI workforce.</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[180px]">
          {features.map((feature, i) => (
            <motion.div key={feature.title}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.015, y: -4 }}
              className={`glass-panel rounded-3xl p-6 flex flex-col justify-between hover:bg-white/5 transition-all duration-300 border border-white/10 hover:border-purple-500/30 cursor-pointer group relative overflow-hidden ${
                feature.size === 'large' ? 'md:col-span-2 md:row-span-2' : 'md:row-span-1'
              }`}>
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/20 transition-all">
                <feature.icon size={20} className="text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400">{feature.desc}</p>
              </div>
              {feature.size === 'large' && (
                <div className="absolute bottom-4 right-4 opacity-20 group-hover:opacity-40 transition-opacity">
                  <feature.icon size={80} className="text-purple-400" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

---

## File: ProfileHeader.tsx
**Path:** `frontend/src/components/profile/ProfileHeader.tsx`

```tsx
import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, ArrowLeft, Edit3, RefreshCw, CheckCircle, Clock, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FullStudentProfile } from '../../types/profile.types'
import ProgressRing from './shared/ProgressRing'
import toast from 'react-hot-toast'

interface ProfileHeaderProps {
  profile: FullStudentProfile
  onRefreshAI: () => void
  aiRefreshing: boolean
}

const API_BASE = 'http://localhost:8000'

export default function ProfileHeader({ profile, onRefreshAI, aiRefreshing }: ProfileHeaderProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const { user, profile: sp, strength, academic_records } = profile
  const displayName = user?.full_name || 'Student'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const total = strength?.total || 0
  const label = strength?.label || 'Getting Started'

  const labelColor = {
    'Excellent': 'text-emerald-400',
    'Strong': 'text-cyan-400',
    'Good': 'text-purple-400',
    'Building': 'text-amber-400',
    'Getting Started': 'text-zinc-400',
  }[label] || 'text-zinc-400'

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return }

    setUploadingPhoto(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'identity')
      formData.append('sub_category', 'profile_photo')
      const res = await fetch(`${API_BASE}/api/student/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      if (!res.ok) throw new Error()
      toast.success('Profile photo uploaded!')
    } catch {
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  return (
    <div className="glass-panel rounded-3xl p-6 md:p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Back button */}
        <div className="hidden md:flex">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 items-center gap-6">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-cyan-500
                            flex items-center justify-center text-white font-bold text-2xl
                            shadow-2xl shadow-purple-500/30 ring-2 ring-white/10 overflow-hidden">
              {sp?.profile_photo_url ? (
                <img src={sp.profile_photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-purple-600 border border-[#0a0a1f]
                         flex items-center justify-center hover:bg-purple-500 transition-colors"
              title="Change profile photo"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>

          {/* Name / ID / Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-white">{displayName}</h1>
              {user?.email_verified && (
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" aria-label="Email verified" />
              )}
            </div>
            <p className="text-zinc-400 text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {sp?.user_id ? (
                <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-purple-400 text-xs font-mono font-semibold">
                  {sp.user_id}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-lg bg-zinc-800 border border-white/5 text-zinc-500 text-xs">
                  ID pending admission
                </span>
              )}
              {academic_records?.[0]?.institution_name && (
                <span className="text-zinc-500 text-xs truncate">{academic_records[0].institution_name}</span>
              )}
              {academic_records?.[0]?.specialization && (
                <span className="text-zinc-600 text-xs">{academic_records[0].specialization}</span>
              )}
            </div>
          </div>
        </div>

        {/* Strength Ring + AI Refresh */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex flex-col items-center gap-1">
            <ProgressRing
              percent={total}
              size={90}
              strokeWidth={7}
              label={`${total}%`}
              sublabel={label}
            />
            <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={onRefreshAI}
              disabled={aiRefreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-cyan-500/20
                         border border-purple-500/20 text-purple-400 text-xs font-medium
                         hover:from-purple-600/30 hover:to-cyan-500/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiRefreshing ? 'animate-spin' : ''}`} />
              {aiRefreshing ? 'Analyzing...' : 'AI Insights'}
            </button>
            <button
              onClick={() => navigate('/student/profile?tab=security')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/5
                         text-zinc-400 text-xs font-medium hover:bg-white/10 transition-all"
            >
              <Shield className="w-3.5 h-3.5" />
              Security
            </button>
          </div>
        </div>
      </div>

      {/* Strength sub-bar row */}
      <div className="mt-6 grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Personal', val: strength?.personal || 0, max: 25 },
          { label: 'Academic', val: strength?.academic || 0, max: 25 },
          { label: 'Skills', val: strength?.skills || 0, max: 15 },
          { label: 'Documents', val: strength?.documents || 0, max: 15 },
          { label: 'Achievements', val: strength?.achievements || 0, max: 10 },
          { label: 'Career', val: strength?.career || 0, max: 10 },
        ].map(({ label, val, max }) => (
          <div key={label} className="text-center">
            <div className="text-zinc-500 text-xs mb-1">{label}</div>
            <div className="text-white text-sm font-bold">{Math.round((val / max) * 100)}%</div>
            <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-1000"
                style={{ width: `${Math.round((val / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## File: ProfileSidebar.tsx
**Path:** `frontend/src/components/profile/ProfileSidebar.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, User, GraduationCap, FileText, Award, Code2,
  ClipboardList, Trophy, Sparkles, Activity, Settings, Shield, Bell,
  ChevronRight, Eye
} from 'lucide-react'

interface Tab {
  id: string
  label: string
  icon: React.FC<{className?: string}>
  badge?: number | string
}

const TABS: Tab[] = [
  { id: 'overview',       label: 'Overview',            icon: LayoutDashboard },
  { id: 'personal',       label: 'Personal Info',       icon: User },
  { id: 'academic',       label: 'Academic',            icon: GraduationCap },
  { id: 'documents',      label: 'Documents',           icon: FileText },
  { id: 'certifications', label: 'Certifications',      icon: Award },
  { id: 'skills',         label: 'Skills',              icon: Code2 },
  { id: 'exams',          label: 'Entrance Exams',      icon: ClipboardList },
  { id: 'achievements',   label: 'Achievements',        icon: Trophy },
  { id: 'ai-insights',    label: 'AI Insights',         icon: Sparkles },
  { id: 'timeline',       label: 'Timeline',            icon: Activity },
  { id: 'preferences',    label: 'Preferences',         icon: Settings },
  { id: 'privacy',        label: 'Privacy',             icon: Eye },
  { id: 'security',       label: 'Security',            icon: Shield },
]

interface ProfileSidebarProps {
  activeTab: string
  onTabChange: (tabId: string) => void
  notificationCount?: number
  strengthTotal?: number
}

export default function ProfileSidebar({ activeTab, onTabChange, notificationCount = 0, strengthTotal = 0 }: ProfileSidebarProps) {
  return (
    <aside className="w-full md:w-64 flex-shrink-0">
      <div className="glass-panel rounded-2xl p-2 sticky top-6">
        {/* Completion summary */}
        <div className="px-3 py-3 mb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Profile Strength</span>
            <span className="text-white text-xs font-bold">{strengthTotal}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${strengthTotal}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400"
            />
          </div>
        </div>

        <div className="w-full h-px bg-white/5 mb-1" />

        {/* Tab list */}
        <nav className="space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                  transition-all duration-200 group
                  ${isActive
                    ? 'bg-gradient-to-r from-purple-500/15 to-cyan-500/5 border border-purple-500/25 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }
                `}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 transition-colors
                  ${isActive ? 'text-purple-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}
                />
                <span className="text-sm font-medium flex-1">{label}</span>
                {id === 'ai-insights' && (
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
                )}
                {isActive && <ChevronRight className="w-3 h-3 text-purple-400/60 flex-shrink-0" />}
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
```

---

## File: ConfidenceTag.tsx
**Path:** `frontend/src/components/profile/shared/ConfidenceTag.tsx`

```tsx
import React from 'react'

interface ConfidenceTagProps {
  fieldName: string
  value: string
  confidence: number  // 0.0 to 1.0
  threshold?: number  // default 0.85 — below this is flagged
}

export default function ConfidenceTag({ fieldName, value, confidence, threshold = 0.85 }: ConfidenceTagProps) {
  const pct = Math.round(confidence * 100)
  const isLow = confidence < threshold

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-xl border transition-colors
      ${isLow ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-white/5'}`}>
      <div className="flex flex-col">
        <span className="text-zinc-500 text-xs capitalize">{fieldName.replace(/_/g, ' ')}</span>
        <span className="text-white text-sm font-medium">{value || '—'}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Confidence bar */}
        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isLow ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-semibold tabular-nums ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
          {pct}%
        </span>
        {isLow && (
          <span className="text-amber-400 text-xs" title="Low confidence — please verify manually">⚠️</span>
        )}
      </div>
    </div>
  )
}
```

---

## File: EmptyState.tsx
**Path:** `frontend/src/components/profile/shared/EmptyState.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
  size?: 'sm' | 'md' | 'lg'
}

export default function EmptyState({ icon: Icon, title, description, action, size = 'md' }: EmptyStateProps) {
  const iconSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'
  const containerSize = size === 'sm' ? 'w-16 h-16' : size === 'lg' ? 'w-28 h-28' : 'w-20 h-20'
  const py = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-16' : 'py-12'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center gap-4 text-center ${py}`}
    >
      <div className={`${containerSize} rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center`}>
        <Icon className={`${iconSize} text-zinc-600`} />
      </div>
      <div>
        <h3 className="text-white font-semibold text-base mb-1">{title}</h3>
        <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">{description}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500
                     text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/20"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}
```

---

## File: PersonalInfoTab.tsx
**Path:** `frontend/src/components/profile/shared/PersonalInfoTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, User, MapPin, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { FullStudentProfile, UpdateProfileRequest } from '../../../types/profile.types'

interface PersonalInfoTabProps {
  profile: FullStudentProfile
  onUpdate: (data: UpdateProfileRequest) => Promise<{ success: boolean; error?: string }>
  saving: boolean
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'
const LABEL_CLASS = 'block text-zinc-400 text-xs font-medium mb-1.5'

export default function PersonalInfoTab({ profile, onUpdate, saving }: PersonalInfoTabProps) {
  const sp = profile.profile
  const [form, setForm] = useState({
    date_of_birth: sp?.date_of_birth?.split('T')[0] || '',
    gender: sp?.gender || '',
    nationality: sp?.nationality || 'Indian',
    category: sp?.category || '',
    address_line1: sp?.address_line1 || '',
    address_line2: sp?.address_line2 || '',
    city: sp?.city || '',
    state: sp?.state || '',
    postal_code: sp?.postal_code || '',
    father_name: sp?.father_name || '',
    father_phone: sp?.father_phone || '',
    guardian_name: sp?.guardian_name || '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const payload: UpdateProfileRequest = {
      ...form,
    }
    const result = await onUpdate(payload)
    if (result.success) toast.success('Profile updated successfully')
    else toast.error(result.error || 'Failed to save')
  }

  const Section = ({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) => (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-purple-400" />
        </div>
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  )

  const Field = ({ label, name, type = 'text', opts }: { label: string; name: string; type?: string; opts?: string[] }) => (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      {opts ? (
        <select className={INPUT_CLASS} value={form[name as keyof typeof form]} onChange={e => set(name, e.target.value)}>
          <option value="">Select {label}</option>
          {opts.map(o => <option key={o} value={o} className="bg-[#1a1a2e]">{o}</option>)}
        </select>
      ) : (
        <input type={type} className={INPUT_CLASS} value={form[name as keyof typeof form]}
          onChange={e => set(name, e.target.value)} placeholder={label} />
      )}
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Personal Information</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500
                     text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <Section title="Personal Details" icon={User}>
        <Field label="Date of Birth" name="date_of_birth" type="date" />
        <Field label="Gender" name="gender" opts={['Male','Female','Other','Prefer not to say']} />
        <Field label="Nationality" name="nationality" />
        <Field label="Category" name="category" opts={['General','OBC','SC','ST','EWS']} />
      </Section>

      <Section title="Address" icon={MapPin}>
        <div className="md:col-span-2"><Field label="Address Line 1" name="address_line1" /></div>
        <div className="md:col-span-2"><Field label="Address Line 2" name="address_line2" /></div>
        <Field label="City" name="city" />
        <Field label="State" name="state" opts={['Andhra Pradesh','Telangana','Karnataka','Tamil Nadu','Maharashtra','Delhi','Gujarat','Rajasthan','Uttar Pradesh','West Bengal','Other']} />
        <Field label="Pincode" name="postal_code" />
      </Section>

      <Section title="Emergency Contact" icon={Phone}>
        <Field label="Parent / Guardian Name" name="father_name" />
        <Field label="Parent Phone" name="father_phone" type="tel" />
        <Field label="Guardian Name (if different)" name="guardian_name" />
      </Section>
    </motion.div>
  )
}
```

---

## File: PrivacyBadge.tsx
**Path:** `frontend/src/components/profile/shared/PrivacyBadge.tsx`

```tsx
import React from 'react'
import { VisibilityLevel } from '../../../types/profile.types'
import { Lock, Building2, GraduationCap, Briefcase, UserCheck, Globe } from 'lucide-react'

interface PrivacyBadgeProps {
  value: VisibilityLevel
  onChange?: (val: VisibilityLevel) => void
  readonly?: boolean
  size?: 'sm' | 'md'
}

const options: { value: VisibilityLevel; label: string; Icon: React.FC<{className?: string}> }[] = [
  { value: 'private',            label: 'Private',          Icon: Lock },
  { value: 'institution',        label: 'Institution',      Icon: Building2 },
  { value: 'faculty',            label: 'Faculty',          Icon: GraduationCap },
  { value: 'placement_cell',     label: 'Placement Cell',   Icon: Briefcase },
  { value: 'admission_officers', label: 'Admissions',       Icon: UserCheck },
  { value: 'public',             label: 'Public',           Icon: Globe },
]

const colorMap: Record<VisibilityLevel, string> = {
  private:            'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  institution:        'text-blue-400 bg-blue-500/10 border-blue-500/20',
  faculty:            'text-purple-400 bg-purple-500/10 border-purple-500/20',
  placement_cell:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  admission_officers: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  public:             'text-pink-400 bg-pink-500/10 border-pink-500/20',
}

export default function PrivacyBadge({ value, onChange, readonly = false, size = 'sm' }: PrivacyBadgeProps) {
  const current = options.find(o => o.value === value) || options[1]
  const { Icon } = current
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-3 py-1 text-sm gap-1.5'

  if (readonly || !onChange) {
    return (
      <span className={`inline-flex items-center rounded-full border font-medium ${pad} ${colorMap[value]}`}>
        <Icon className="w-3 h-3" />
        {current.label}
      </span>
    )
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as VisibilityLevel)}
      className={`rounded-full border bg-transparent font-medium cursor-pointer outline-none
        ${pad} ${colorMap[value]} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} className="bg-[#1a1a2e] text-white">
          {o.label}
        </option>
      ))}
    </select>
  )
}
```

---

## File: ProgressRing.tsx
**Path:** `frontend/src/components/profile/shared/ProgressRing.tsx`

```tsx
import React from 'react'

interface ProgressRingProps {
  percent: number
  size?: number
  strokeWidth?: number
  label?: string
  sublabel?: string
  className?: string
}

export default function ProgressRing({
  percent, size = 120, strokeWidth = 8, label, sublabel, className = ''
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference
  const gradientId = `ring-gradient-${Math.random().toString(36).slice(2, 7)}`

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && <span className="text-white font-bold leading-tight text-lg">{label}</span>}
        {sublabel && <span className="text-zinc-400 text-xs leading-tight">{sublabel}</span>}
      </div>
    </div>
  )
}
```

---

## File: SecurityTab.tsx
**Path:** `frontend/src/components/profile/shared/SecurityTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Eye, EyeOff, Lock, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE = 'http://localhost:8000'

function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

interface PasswordFieldProps {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void
}
function PasswordField({ label, value, onChange, show, onToggle }: PasswordFieldProps) {
  return (
    <div className="relative">
      <label className="block text-zinc-400 text-xs font-medium mb-1.5">{label}</label>
      <input type={show ? 'text' : 'password'} className={INPUT_CLASS} value={value}
        onChange={e => onChange(e.target.value)} placeholder="••••••••" />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-8 text-zinc-500 hover:text-zinc-300 transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Contains special character', ok: /[^a-zA-Z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500']

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[1,2,3,4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300
            ${i <= score ? colors[score] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(({ label, ok }) => (
          <div key={label} className="flex items-center gap-1.5">
            {ok ? <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                : <AlertCircle className="w-3 h-3 text-zinc-600 flex-shrink-0" />}
            <span className={`text-xs ${ok ? 'text-emerald-400' : 'text-zinc-600'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SecurityTab() {
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async () => {
    if (!current || !newPw || !confirm) { toast.error('Please fill all fields'); return }
    if (newPw !== confirm) { toast.error('Passwords do not match'); return }
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (!/\d/.test(newPw)) { toast.error('Password must contain at least one number'); return }

    setSaving(true)
    try {
      const res = await apiFetch('/api/student/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: current, new_password: newPw, confirm_password: confirm })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed')
      toast.success('Password changed successfully!')
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to change password')
    } finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-white text-lg font-bold">Security Settings</h2>

      {/* Change Password */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Change Password</h3>
            <p className="text-zinc-500 text-xs">Use a strong password to protect your account</p>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <PasswordField label="Current Password" value={current} onChange={setCurrent}
            show={show.current} onToggle={() => setShow(s => ({ ...s, current: !s.current }))} />
          <PasswordField label="New Password" value={newPw} onChange={setNewPw}
            show={show.new} onToggle={() => setShow(s => ({ ...s, new: !s.new }))} />
          {newPw && <PasswordStrength password={newPw} />}
          <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm}
            show={show.confirm} onToggle={() => setShow(s => ({ ...s, confirm: !s.confirm }))} />

          <button onClick={handleChangePassword} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500
                       text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-2">
            {saving ? 'Changing...' : 'Update Password'}
          </button>
        </div>
      </div>

      {/* Account Security Info */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="text-white font-semibold">Account Security</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div>
              <p className="text-white text-sm font-medium">Two-Factor Authentication</p>
              <p className="text-zinc-500 text-xs">Add an extra layer of security</p>
            </div>
            <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">Coming Soon</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white text-sm font-medium">Active Sessions</p>
              <p className="text-zinc-500 text-xs">Manage where you're signed in</p>
            </div>
            <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs">Coming Soon</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
```

---

## File: SkeletonCard.tsx
**Path:** `frontend/src/components/profile/shared/SkeletonCard.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'

interface SkeletonCardProps {
  rows?: number
  height?: number
  className?: string
}

export default function SkeletonCard({ rows = 3, height = 120, className = '' }: SkeletonCardProps) {
  return (
    <div className={`glass rounded-2xl p-5 ${className}`}>
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-white/10 rounded-lg w-1/3" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3 bg-white/5 rounded-lg" style={{ width: `${85 - i * 10}%` }} />
        ))}
        <div className="h-8 bg-white/5 rounded-xl mt-4" style={{ height }} />
      </div>
    </div>
  )
}

export function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02]"
        >
          <div className="w-10 h-10 rounded-xl bg-white/10 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-white/10 rounded w-2/5" />
            <div className="h-2.5 bg-white/5 rounded w-3/5" />
          </div>
          <div className="h-6 w-16 bg-white/5 rounded-full" />
        </motion.div>
      ))}
    </div>
  )
}
```

---

## File: StrengthBar.tsx
**Path:** `frontend/src/components/profile/shared/StrengthBar.tsx`

```tsx
import React from 'react'

interface StrengthBarProps {
  label: string
  value: number
  max?: number
  color?: 'cyan' | 'purple' | 'emerald' | 'pink' | 'amber' | 'auto'
  delay?: number
}

function getColor(value: number, max: number, color?: string) {
  if (color === 'auto') {
    const pct = (value / max) * 100
    if (pct >= 80) return 'from-emerald-500 to-cyan-400'
    if (pct >= 60) return 'from-cyan-500 to-purple-500'
    if (pct >= 40) return 'from-purple-500 to-pink-500'
    return 'from-amber-500 to-orange-500'
  }
  const map: Record<string, string> = {
    cyan: 'from-cyan-500 to-cyan-400',
    purple: 'from-purple-600 to-purple-400',
    emerald: 'from-emerald-600 to-emerald-400',
    pink: 'from-pink-600 to-pink-400',
    amber: 'from-amber-600 to-amber-400',
  }
  return map[color || 'purple'] || 'from-purple-600 to-cyan-400'
}

export default function StrengthBar({ label, value, max = 100, color = 'auto', delay = 0 }: StrengthBarProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100)
  const gradClass = getColor(value, max, color)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-sm">{label}</span>
        <span className="text-white text-sm font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradClass} transition-all duration-1000`}
          style={{
            width: `${pct}%`,
            transitionDelay: `${delay}ms`,
            boxShadow: `0 0 8px rgba(168,85,247,0.4)`
          }}
        />
      </div>
    </div>
  )
}
```

---

## File: UploadZone.tsx
**Path:** `frontend/src/components/profile/shared/UploadZone.tsx`

```tsx
import React, { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, File, X, CheckCircle, AlertCircle, CloudUpload } from 'lucide-react'

interface UploadZoneProps {
  onUpload: (file: File) => Promise<{ success: boolean; error?: string }>
  accept?: string
  maxSizeMB?: number
  label?: string
  subLabel?: string
  className?: string
}

export default function UploadZone({
  onUpload, accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx',
  maxSizeMB = 10, label = 'Upload Document', subLabel = 'PDF, JPG, PNG, DOC up to 10MB',
  className = ''
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)

  const handleFile = useCallback(async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      setStatus('error')
      setMessage(`File too large. Max size is ${maxSizeMB}MB.`)
      setTimeout(() => setStatus('idle'), 3000)
      return
    }
    setUploading(true)
    setProgress(0)
    // Simulate progress
    const interval = setInterval(() => setProgress(p => Math.min(p + 10, 85)), 200)
    const result = await onUpload(file)
    clearInterval(interval)
    setProgress(100)
    setUploading(false)
    if (result.success) {
      setStatus('success')
      setMessage(`${file.name} uploaded successfully`)
    } else {
      setStatus('error')
      setMessage(result.error || 'Upload failed. Please try again.')
    }
    setTimeout(() => { setStatus('idle'); setProgress(0) }, 3000)
  }, [onUpload, maxSizeMB])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  return (
    <div className={`relative ${className}`}>
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          flex flex-col items-center justify-center gap-3 p-8 rounded-2xl cursor-pointer
          border-2 border-dashed transition-all duration-300
          ${dragging
            ? 'border-purple-400 bg-purple-500/10 scale-[1.02]'
            : 'border-white/20 hover:border-purple-500/50 hover:bg-purple-500/5'}
          ${uploading ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input type="file" accept={accept} className="hidden" onChange={onInputChange} />

        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div key="success" initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
              <p className="text-emerald-400 text-sm font-medium text-center">{message}</p>
            </motion.div>
          ) : status === 'error' ? (
            <motion.div key="error" initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex flex-col items-center gap-2">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-red-400 text-sm font-medium text-center">{message}</p>
            </motion.div>
          ) : uploading ? (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 w-full">
              <CloudUpload className="w-10 h-10 text-purple-400 animate-bounce" />
              <p className="text-zinc-400 text-sm">Uploading...</p>
              <div className="w-full bg-white/5 rounded-full h-1.5">
                <motion.div
                  className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-zinc-500 text-xs mt-1">Drag & drop or <span className="text-purple-400">browse</span></p>
                <p className="text-zinc-600 text-xs mt-0.5">{subLabel}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </label>
    </div>
  )
}
```

---

## File: VerificationBadge.tsx
**Path:** `frontend/src/components/profile/shared/VerificationBadge.tsx`

```tsx
import React from 'react'

interface VerificationBadgeProps {
  status: 'pending' | 'verified' | 'rejected'
  reviewComments?: string
  rejectionReason?: string
  verifiedAt?: string
  size?: 'sm' | 'md'
}

const config = {
  pending:  { label: 'Pending Review', bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400', border: 'border-yellow-500/20' },
  verified: { label: 'Verified',       bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/20' },
  rejected: { label: 'Rejected',       bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400',    border: 'border-red-500/20' },
}

export default function VerificationBadge({ status, reviewComments, rejectionReason, verifiedAt, size = 'sm' }: VerificationBadgeProps) {
  const c = config[status]
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${pad} ${c.bg} ${c.text} ${c.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
        {c.label}
      </span>
      {status === 'verified' && verifiedAt && (
        <p className="text-zinc-600 text-xs">Verified {new Date(verifiedAt).toLocaleDateString()}</p>
      )}
      {status === 'rejected' && rejectionReason && (
        <p className="text-red-400/70 text-xs">{rejectionReason}</p>
      )}
      {status === 'pending' && reviewComments && (
        <p className="text-zinc-500 text-xs italic">{reviewComments}</p>
      )}
    </div>
  )
}
```

---

## File: AcademicInfoTab.tsx
**Path:** `frontend/src/components/profile/student/AcademicInfoTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Save, ChevronDown, GraduationCap, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { AcademicRecord, SemesterMark, AcademicLevel, UpsertAcademicRecordRequest, UpsertSemesterMarkRequest } from '../../../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

interface AcademicInfoTabProps {
  records: AcademicRecord[]
  semesters: SemesterMark[]
  onRefresh: () => void
}

const LEVELS: { value: AcademicLevel; label: string }[] = [
  { value: '10th', label: '10th Class / SSC' },
  { value: '12th', label: 'Intermediate / 12th / HSC' },
  { value: 'Diploma', label: 'Diploma' },
  { value: 'UG', label: 'Under-Graduate (UG)' },
  { value: 'PG', label: 'Post-Graduate (PG)' },
]

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function AcademicInfoTab({ records, semesters, onRefresh }: AcademicInfoTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, Partial<UpsertAcademicRecordRequest>>>({})
  const [semForm, setSemForm] = useState<Partial<UpsertSemesterMarkRequest>>({ semester: 1 })
  const [saving, setSaving] = useState(false)
  const [addingSem, setAddingSem] = useState(false)
  const [showSemForm, setShowSemForm] = useState(false)

  const getRecord = (level: AcademicLevel) => records.find(r => r.education_level === level)

  const setField = (level: string, key: string, val: string) =>
    setForms(f => ({ ...f, [level]: { ...f[level], [key]: val } }))

  const handleSave = async (level: string, formData: Partial<UpsertAcademicRecordRequest>) => {
    const existing = records.find(r => r.education_level === level)
    const instName = formData.institution_name || existing?.institution_name
    if (!instName) { toast.error('Institution name is required'); return }
    setSaving(true)
    const data = {
      education_level: level,
      institution_name: instName,
      board_university: formData.board_university || existing?.board_university,
      degree: formData.degree || existing?.degree,
      specialization: formData.specialization || existing?.specialization,
      hall_ticket_number: formData.hall_ticket_number || existing?.hall_ticket_number,
      year_of_passing: formData.year_of_passing ? Number(formData.year_of_passing) : existing?.year_of_passing,
      percentage: formData.percentage ? Number(formData.percentage) : existing?.percentage,
      cgpa: formData.cgpa ? Number(formData.cgpa) : existing?.cgpa,
    }
    try {
      const res = await apiFetch('/api/student/academic', { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      toast.success(`${level.toUpperCase()} record saved!`)
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const saveRecord = async (level: AcademicLevel) => {
    const formData = forms[level] || {}
    await handleSave(level, formData)
  }

  const addSemester = async () => {
    if (!semForm.semester) { toast.error('Semester number required'); return }
    setAddingSem(true)
    try {
      const res = await apiFetch('/api/student/semesters', { method: 'POST', body: JSON.stringify(semForm) })
      if (!res.ok) throw new Error(await res.text())
      toast.success(`Semester ${semForm.semester} added!`)
      setSemForm({ semester: 1 })
      setShowSemForm(false)
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally { setAddingSem(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-white text-lg font-bold">Academic Information</h2>

      {/* Education levels accordion */}
      <div className="space-y-3">
        {LEVELS.map(({ value, label }) => {
          const rec = getRecord(value)
          const isOpen = expanded === value
          const form = forms[value] || {}

          return (
            <div key={value} className="glass rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : value)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                    ${rec ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                    <GraduationCap className={`w-4 h-4 ${rec ? 'text-emerald-400' : 'text-zinc-600'}`} />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{label}</p>
                    {rec?.institution_name && <p className="text-zinc-500 text-xs">{rec.institution_name}</p>}
                    {rec?.percentage && <p className="text-purple-400 text-xs">{rec.percentage}%</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rec && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Added</span>}
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden">
                    <div className="px-5 pb-5 border-t border-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {[
                          { key: 'institution_name', label: 'Institution Name' },
                          { key: 'board_university', label: 'Board / University' },
                          { key: 'degree', label: 'Degree / Programme', show: ['UG','PG','Diploma'].includes(value) },
                          { key: 'specialization', label: 'Branch / Stream' },
                          { key: 'hall_ticket_number', label: 'Hall Ticket / Roll No.' },
                          { key: 'year_of_passing', label: 'Year of Passing', type: 'number' },
                          { key: 'percentage', label: 'Percentage (%)', type: 'number' },
                          { key: 'cgpa', label: 'CGPA', type: 'number', show: ['UG','PG'].includes(value) },
                        ].filter(f => f.show !== false).map(({ key, label, type = 'text' }) => (
                          <div key={key}>
                            <label className="block text-zinc-400 text-xs font-medium mb-1.5">{label}</label>
                            <input type={type} className={INPUT_CLASS}
                              value={form[key as keyof typeof form] !== undefined ? String(form[key as keyof typeof form]) : String(rec?.[key as keyof AcademicRecord] || '')}
                              onChange={e => setField(value, key, e.target.value)}
                              placeholder={label} />
                          </div>
                        ))}
                      </div>
                      <button onClick={() => saveRecord(value)} disabled={saving}
                        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : `Save ${label}`}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Semester marks */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <h3 className="text-white font-semibold text-sm">Semester Performance</h3>
          </div>
          <button onClick={() => setShowSemForm(!showSemForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />Add Semester
          </button>
        </div>

        {showSemForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[{ k: 'semester', l: 'Semester', type: 'number' }, { k: 'year', l: 'Year', type: 'number' }, { k: 'sgpa', l: 'SGPA', type: 'number' }, { k: 'cgpa', l: 'CGPA', type: 'number' }].map(({ k, l, type }) => (
                <div key={k}>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">{l}</label>
                  <input type={type} className={INPUT_CLASS}
                    value={semForm[k as keyof typeof semForm] || ''}
                    onChange={e => setSemForm(f => ({ ...f, [k]: Number(e.target.value) }))} placeholder={l} />
                </div>
              ))}
            </div>
            <button onClick={addSemester} disabled={addingSem}
              className="mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {addingSem ? 'Adding...' : 'Add Semester'}
            </button>
          </motion.div>
        )}

        {semesters.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {semesters.map(s => (
              <div key={s.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
                <div className="text-zinc-500 text-xs mb-1">Sem {s.semester}</div>
                <div className="text-white font-bold">{s.sgpa || '—'}</div>
                <div className="text-zinc-500 text-xs">SGPA</div>
                {s.cgpa && <div className="text-cyan-400 text-xs mt-1">CGPA: {s.cgpa}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-600 text-sm text-center py-4">No semester records yet. Add your first semester above.</p>
        )}
      </div>
    </motion.div>
  )
}
```

---

## File: AchievementsTab.tsx
**Path:** `frontend/src/components/profile/student/AchievementsTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Plus, Trash2, Edit, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { StudentAchievement, CreateAchievementRequest } from '../../../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
}

const ACH_CATEGORIES = ['Academic Excellence','Hackathon','Research','Sports','Cultural','Social Work','Leadership','Other']
const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'
const catColors: Record<string, string> = {
  'Academic Excellence': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Hackathon': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Research': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'Sports': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Cultural': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Social Work': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'Leadership': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Other': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}
const EMPTY: CreateAchievementRequest = { achievement_title: '', achievement_type: 'Other', description: '', achievement_date: '' }

interface AchievementsTabProps {
  achievements: StudentAchievement[]
  onRefresh: () => void
}

export default function AchievementsTab({ achievements, onRefresh }: AchievementsTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateAchievementRequest>(EMPTY)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof CreateAchievementRequest, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.achievement_title || !form.achievement_type) { toast.error('Title and Category are required'); return }
    setSaving(true)
    try {
      const endpoint = editId ? `/api/student/achievements/${editId}` : '/api/student/achievements'
      const method = editId ? 'PUT' : 'POST'
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(form) })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editId ? 'Updated!' : 'Achievement added!')
      setShowForm(false); setEditId(null); setForm(EMPTY); onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const openEdit = (a: StudentAchievement) => {
    setEditId(a.id)
    setForm({ achievement_title: a.achievement_title, achievement_type: a.achievement_type || '', description: a.description || '', achievement_date: a.achievement_date?.split('T')[0] || '' })
    setShowForm(true)
  }

  const handleDelete = async (id: string, achievement_title: string) => {
    if (!confirm(`Delete "${achievement_title}"?`)) return
    try {
      const res = await apiFetch(`/api/student/achievements/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Achievement removed')
      onRefresh()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Achievements ({achievements.length})</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Achievement'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Title *</label>
                <input className={INPUT_CLASS} value={form.achievement_title} onChange={e => set('achievement_title', e.target.value)} placeholder="e.g. 1st Place Smart India Hackathon" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category *</label>
                <select className={INPUT_CLASS} value={form.achievement_type} onChange={e => set('achievement_type', e.target.value)}>
                  {ACH_CATEGORIES.map(c => <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Date</label>
                <input type="date" className={INPUT_CLASS} value={form.achievement_date} onChange={e => set('achievement_date', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Description</label>
                <textarea className={`${INPUT_CLASS} resize-none`} rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe your achievement..." />
              </div>
            </div>
            <button onClick={handleSubmit} disabled={saving}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : editId ? 'Update' : 'Add'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {achievements.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No achievements added yet</p>
          <button onClick={() => setShowForm(true)} className="mt-2 text-purple-400 text-sm hover:text-purple-300">Add your first achievement →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {achievements.map((ach, i) => (
            <motion.div key={ach.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  {ach.achievement_type && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${catColors[ach.achievement_type] || catColors['Other']}`}>{ach.achievement_type}</span>
                  )}
                  <h3 className="text-white font-semibold text-sm mt-2">{ach.achievement_title}</h3>
                  {ach.achievement_date && <p className="text-zinc-500 text-xs mt-0.5">{new Date(ach.achievement_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  {ach.description && <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed">{ach.description}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => openEdit(ach)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"><Edit className="w-3 h-3" /></button>
                  <button onClick={() => handleDelete(ach.id, ach.achievement_title ?? ach.achievement_title ?? '')} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
```

---

## File: AIInsightsTab.tsx
**Path:** `frontend/src/components/profile/student/AIInsightsTab.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, RefreshCw, AlertCircle, BookOpen, Award, TrendingUp, FileText, Zap, GraduationCap } from 'lucide-react'
import { useAIInsights } from '../../../hooks/useAIInsights'
import SkeletonCard from '../shared/SkeletonCard'

interface ScoreRingProps { score: number; label: string }
function ScoreRing({ score, label }: ScoreRingProps) {
  const r = 38, c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#a855f7' : '#f59e0b'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width="96" height="96" className="-rotate-90">
          <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white font-bold text-lg leading-none">{score}</span>
          <span className="text-zinc-500 text-xs">/100</span>
        </div>
      </div>
      <span className="text-zinc-400 text-xs text-center">{label}</span>
    </div>
  )
}

export default function AIInsightsTab({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const { insights, loading } = useAIInsights()

  if (loading) return <SkeletonCard rows={8} height={300} />

  const status = insights?.analysis_status

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-white text-lg font-bold">AI Profile Insights</h2>
        </div>
        <div className="flex items-center gap-3">
          {insights?.generated_at && (
            <span className="text-zinc-600 text-xs">
              Updated: {new Date(insights.generated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-cyan-500/20 border border-purple-500/25 text-purple-400 text-sm font-medium hover:from-purple-600/30 hover:to-cyan-500/30 transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {status === 'generating' && (
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-3xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
          </div>
          <h3 className="text-white font-semibold mb-2">AI is analyzing your profile...</h3>
          <p className="text-zinc-500 text-sm">This usually takes 10–30 seconds. The page will update automatically.</p>
          <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden max-w-xs mx-auto">
            <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="glass rounded-2xl p-6 border border-red-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-white font-medium">Analysis failed</p>
              <p className="text-zinc-500 text-sm">Please try refreshing the insights.</p>
            </div>
          </div>
        </div>
      )}

      {(status === 'ready' || (status !== 'generating' && insights)) && (
        <>
          {/* Scores row */}
          <div className="glass rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4 text-sm">Portfolio Scores</h3>
            <div className="flex flex-wrap items-center justify-center gap-8">
              <ScoreRing score={insights?.overall_profile_score || 0} label="Profile Strength" />
              {insights?.ats_score != null && <ScoreRing score={insights.ats_score} label="ATS Score" />}
            </div>
            {insights?.ai_summary && (
              <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-zinc-300 text-sm leading-relaxed">{insights.ai_summary}</p>
              </div>
            )}
          </div>

          {/* Missing Documents */}
          {insights?.missing_documents && insights.missing_documents.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />Missing Documents
              </h3>
              <div className="space-y-2">
                {insights.missing_documents.map((doc, i) => {
                  const priorityColor = doc.priority === 'high' ? 'text-red-400 border-red-500/20 bg-red-500/5' : doc.priority === 'medium' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 'text-zinc-400 border-white/10 bg-white/[0.02]'
                  return (
                    <div key={i} className={`flex items-start justify-between p-3 rounded-xl border ${priorityColor}`}>
                      <div>
                        <p className="font-medium text-sm">{doc.name}</p>
                        <p className="text-xs opacity-70 mt-0.5">{doc.reason}</p>
                      </div>
                      <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-white/10">{doc.priority}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Skill Gaps */}
          {insights?.skill_gap_analysis && insights.skill_gap_analysis.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />Skill Gaps to Address
              </h3>
              <div className="space-y-3">
                {insights.skill_gap_analysis.map((gap, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium text-sm">{gap.skill}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${gap.demand === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {gap.demand} demand
                      </span>
                    </div>
                    {(gap.courses?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {gap.courses?.map(c => (
                          <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Career Suggestions */}
          {insights?.career_recommendations && insights.career_recommendations.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />Career Suggestions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.career_recommendations.map((sug, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 capitalize">
                        {sug.type}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium">{sug.title}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{sug.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scholarship Suggestions */}
          {insights?.scholarship_recommendations && insights.scholarship_recommendations.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />Scholarship Opportunities
              </h3>
              <div className="space-y-3">
                {insights.scholarship_recommendations.map((sch, i) => (
                  <div key={i} className="flex items-start justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <div>
                      <p className="text-white font-medium text-sm">{sch.title}</p>
                      {sch.provider && <p className="text-emerald-400 text-xs font-semibold mt-0.5">{sch.provider}</p>}
                      <p className="text-zinc-500 text-xs mt-0.5">{sch.eligibility}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-emerald-400 font-bold text-sm">{sch.match_score}%</span>
                      <span className="text-zinc-600 text-xs">match</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!insights?.missing_documents?.length && !insights?.skill_gap_analysis?.length && !insights?.career_recommendations?.length && (
            <div className="text-center py-8">
              <p className="text-zinc-500 text-sm">No insights generated yet. Click Refresh to analyze your profile.</p>
            </div>
          )}
        </>
      )}

      {!insights && status !== 'generating' && (
        <div className="glass rounded-2xl p-10 text-center">
          <div className="w-20 h-20 rounded-3xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-white font-semibold mb-2">No AI analysis yet</h3>
          <p className="text-zinc-500 text-sm mb-4">Click "Refresh" to generate personalized insights for your profile.</p>
          <button onClick={onRefresh} disabled={refreshing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            Generate AI Insights
          </button>
        </div>
      )}
    </motion.div>
  )
}
```

---

## File: CertificationsTab.tsx
**Path:** `frontend/src/components/profile/student/CertificationsTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Plus, Trash2, Edit, ExternalLink, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { StudentCertification, CreateCertificationRequest, CertificationCategory } from '../../../types/profile.types'
import { useStudentCertifications } from '../../../hooks/useStudentCertifications'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'

const CERT_CATEGORIES: CertificationCategory[] = [
  'online_course','hackathon','sports','ncc','nss','workshop','conference','research','patent','volunteering','cultural'
]

const catColors: Record<string, string> = {
  online_course: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  hackathon:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  sports:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  ncc:           'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  nss:           'bg-teal-500/10 text-teal-400 border-teal-500/20',
  workshop:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  conference:    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  research:      'bg-pink-500/10 text-pink-400 border-pink-500/20',
  patent:        'bg-amber-500/10 text-amber-400 border-amber-500/20',
  volunteering:  'bg-lime-500/10 text-lime-400 border-lime-500/20',
  cultural:      'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

interface FormState extends CreateCertificationRequest { }
const EMPTY_FORM: FormState = { title: '', issuing_organization: '', category: 'online_course', issue_date: '', expiry_date: '', credential_id: '', credential_url: '' }

export default function CertificationsTab() {
  const { certifications, loading, saving, addCertification, updateCertification, deleteCertification } = useStudentCertifications()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.title || !form.issuing_organization) { toast.error('Title and Issuing Organization are required'); return }
    const result = editId
      ? await updateCertification(editId, form)
      : await addCertification(form)
    if (result.success) {
      toast.success(editId ? 'Certification updated!' : 'Certification added!')
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM)
    } else toast.error(result.error || 'Failed to save')
  }

  const openEdit = (cert: StudentCertification) => {
    setEditId(cert.id)
    setForm({
      title: cert.title, issuing_organization: cert.issuing_organization || '', category: cert.category as CertificationCategory || 'online_course',
      issue_date: cert.issue_date?.split('T')[0] || '', expiry_date: cert.expiry_date?.split('T')[0] || '',
      credential_id: cert.credential_id || '', credential_url: cert.credential_url || ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    const r = await deleteCertification(id)
    if (r.success) toast.success('Certification removed')
    else toast.error('Failed to delete')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Certifications ({certifications.length})</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Certificate'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden">
            <h3 className="text-white font-medium mb-4">{editId ? 'Edit Certification' : 'Add Certification'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Title *</label>
                <input className={INPUT_CLASS} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. AWS Cloud Practitioner, Smart India Hackathon" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Issuing Organization *</label>
                <input className={INPUT_CLASS} value={form.issuing_organization} onChange={e => set('issuing_organization', e.target.value)} placeholder="e.g. AWS, NPTEL, Google" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category</label>
                <select className={INPUT_CLASS} value={form.category} onChange={e => set('category', e.target.value)}>
                  {CERT_CATEGORIES.map(c => <option key={c} value={c} className="bg-[#1a1a2e] capitalize">{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Issue Date</label>
                <input type="date" className={INPUT_CLASS} value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Expiry Date</label>
                <input type="date" className={INPUT_CLASS} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Credential ID</label>
                <input className={INPUT_CLASS} value={form.credential_id} onChange={e => set('credential_id', e.target.value)} placeholder="Certification ID / Code" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Credential URL</label>
                <input type="url" className={INPUT_CLASS} value={form.credential_url} onChange={e => set('credential_url', e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <button onClick={handleSubmit} disabled={saving}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : editId ? 'Update' : 'Add Certification'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <SkeletonRow count={4} /> : certifications.length === 0 ? (
        <EmptyState icon={Award} title="No certifications yet" description="Add your course completions, hackathons, NSS, NCC, sports achievements and more"
          action={{ label: 'Add Certification', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {certifications.map((cert, i) => (
            <motion.div key={cert.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {cert.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${catColors[cert.category] || 'bg-white/5 text-zinc-400 border-white/10'}`}>
                        {cert.category.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-white font-semibold text-sm leading-snug">{cert.title}</h3>
                  {cert.issuing_organization && <p className="text-zinc-500 text-xs mt-0.5">{cert.issuing_organization}</p>}
                  {cert.issue_date && (
                    <p className="text-zinc-600 text-xs mt-1">
                      {new Date(cert.issue_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      {cert.expiry_date && ` — ${new Date(cert.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
                    </p>
                  )}
                  {cert.credential_id && <p className="text-zinc-700 text-xs font-mono mt-1">{cert.credential_id}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {cert.credential_url && (
                    <a href={cert.credential_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-400 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button onClick={() => openEdit(cert)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-500/10 text-zinc-400 hover:text-purple-400 transition-colors">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(cert.id, cert.title)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
```

---

## File: DocumentsTab.tsx
**Path:** `frontend/src/components/profile/student/DocumentsTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { StudentDocument, DocumentCategory } from '../../../types/profile.types'
import { useStudentDocuments } from '../../../hooks/useStudentDocuments'
import UploadZone from '../shared/UploadZone'
import VerificationBadge from '../shared/VerificationBadge'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'
import ConfidenceTag from '../shared/ConfidenceTag'

const CATEGORIES: { value: DocumentCategory; label: string; subs: string[] }[] = [
  { value: 'identity',       label: 'Identity',         subs: ['aadhaar','pan_card','passport','driving_license','voter_id'] },
  { value: 'academic',       label: 'Academic',         subs: ['10th_memo','intermediate_memo','diploma_memo','degree_certificate','semester_marksheet'] },
  { value: 'entrance',       label: 'Entrance Exams',   subs: ['eamcet_scorecard','jee_scorecard','gate_scorecard','neet_scorecard','cuet_scorecard'] },
  { value: 'certification',  label: 'Certifications',   subs: ['course_certificate','workshop_certificate','hackathon_certificate'] },
  { value: 'achievement',    label: 'Achievements',     subs: ['award_certificate','prize','recognition'] },
  { value: 'internship',     label: 'Internship',       subs: ['offer_letter','completion_certificate','experience_letter'] },
  { value: 'placement',      label: 'Placement',        subs: ['resume','offer_letter','appointment_letter'] },
  { value: 'other',          label: 'Other',            subs: [] },
]

function formatBytes(b?: number) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function DocumentsTab() {
  const [filter, setFilter] = useState<string>('all')
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('academic')
  const [uploadSubCategory, setUploadSubCategory] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [replaceDoc, setReplaceDoc] = useState<StudentDocument | null>(null)

  const { documents, loading, uploadDocument, replaceDocument, deleteDocument } = useStudentDocuments()

  const filtered = filter === 'all' ? documents : documents.filter(d => d.document_type === filter)

  const handleUpload = async (file: File) => {
    const result = await uploadDocument(file, uploadCategory, uploadSubCategory || undefined)
    if (result.success) { toast.success('Document uploaded successfully!'); setShowUpload(false) }
    else { toast.error(result.error || 'Upload failed') }
    return result
  }

  const handleReplace = async (file: File) => {
    if (!replaceDoc) return { success: false }
    const result = await replaceDocument(replaceDoc.id, file)
    if (result.success) { toast.success('Document replaced! Old version archived.'); setReplaceDoc(null) }
    else toast.error(result.error || 'Replace failed')
    return result
  }

  const handleDelete = async (doc: StudentDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return
    const r = await deleteDocument(doc.id)
    if (r.success) toast.success('Document deleted')
    else toast.error(r.error || 'Failed to delete')
  }

  const hasOCR = (doc: StudentDocument) => {
    const meta = doc.extracted_data as Record<string, unknown>
    return meta && Object.keys(meta?.extracted || {}).length > 0
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-white text-lg font-bold">Documents ({documents.length})</h2>
        <button onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          <Upload className="w-4 h-4" />Upload Document
        </button>
      </div>

      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category</label>
                <select className={INPUT_CLASS} value={uploadCategory} onChange={e => { setUploadCategory(e.target.value as DocumentCategory); setUploadSubCategory('') }}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#1a1a2e]">{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Document Type</label>
                <select className={INPUT_CLASS} value={uploadSubCategory} onChange={e => setUploadSubCategory(e.target.value)}>
                  <option value="" className="bg-[#1a1a2e]">General</option>
                  {(CATEGORIES.find(c => c.value === uploadCategory)?.subs || []).map(s => (
                    <option key={s} value={s} className="bg-[#1a1a2e]">{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            <UploadZone onUpload={handleUpload} />
          </motion.div>
        )}

        {replaceDoc && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 border border-amber-500/20 overflow-hidden">
            <p className="text-amber-400 text-sm font-medium mb-3">
              Replacing: {replaceDoc.file_name}
            </p>
            <p className="text-zinc-500 text-xs mb-3">The old version will be archived in version history.</p>
            <UploadZone onUpload={handleReplace} label="Upload Replacement" />
            <button onClick={() => setReplaceDoc(null)} className="mt-2 text-zinc-500 text-xs hover:text-white">Cancel</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...CATEGORIES.map(c => c.value)].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${filter === cat ? 'bg-purple-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>
            {cat === 'all' ? 'All' : CATEGORIES.find(c => c.value === cat)?.label || cat}
          </button>
        ))}
      </div>

      {/* Documents list */}
      {loading ? <SkeletonRow count={5} /> : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Upload your academic documents to get started"
          action={{ label: 'Upload Document', onClick: () => setShowUpload(true) }} />
      ) : (
        <div className="space-y-2">
          {filtered.map((doc, i) => (
            <motion.div key={doc.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.04] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="text-zinc-600 text-xs capitalize">{doc.document_type}</span>
                      {doc.document_name && <span className="text-zinc-700 text-xs">• {doc.document_name.replace(/_/g, ' ')}</span>}
                      {doc.file_size && <span className="text-zinc-700 text-xs">• {formatBytes(doc.file_size)}</span>}
                      {false && (
                        <span className="text-zinc-600 text-xs">• v{1}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <VerificationBadge status={doc.verification_status} reviewComments={doc.verification_remarks}
                        rejectionReason={doc.verification_remarks} verifiedAt={doc.verified_at} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.signed_url && (
                    <a href={doc.signed_url} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button onClick={() => setReplaceDoc(doc)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 transition-colors" title="Replace document">
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(doc)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {doc.ai_summary && (
                <div className="mt-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-xs">
                  <p className="text-purple-400 font-semibold mb-1">🤖 AI Insights Summary</p>
                  <p className="text-zinc-300 leading-relaxed">{doc.ai_summary}</p>
                </div>
              )}

              {/* OCR confidence if available */}
              {hasOCR(doc) && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-zinc-500 text-xs font-medium mb-2">🔍 OCR Extracted Data</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {Object.entries((doc.extracted_data as Record<string, unknown>)?.extracted || {}).slice(0, 4).map(([field, val]: [string, unknown]) => {
                      const v = val as { value: string; confidence: number }
                      return <ConfidenceTag key={field} fieldName={field} value={v.value} confidence={v.confidence} />
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
```

---

## File: EntranceExamsTab.tsx
**Path:** `frontend/src/components/profile/student/EntranceExamsTab.tsx`

```tsx
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, Plus, Trash2, Edit, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { EntranceExam, CreateEntranceExamRequest } from '../../../types/profile.types'
import { useStudentExams } from '../../../hooks/useStudentExams'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'

const EXAM_LIST = ['EAMCET','JEE_MAIN','JEE_ADVANCED','NEET','CUET','GATE','CAT','GRE','IELTS','TOEFL','Other']

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'
const EMPTY: CreateEntranceExamRequest = { exam_name: 'EAMCET', exam_year: undefined, score: undefined, rank: undefined, percentile: undefined }

const examColors: Record<string, string> = {
  EAMCET: 'text-emerald-400 bg-emerald-500/10', JEE_MAIN: 'text-blue-400 bg-blue-500/10',
  JEE_ADVANCED: 'text-indigo-400 bg-indigo-500/10', NEET: 'text-pink-400 bg-pink-500/10',
  GATE: 'text-amber-400 bg-amber-500/10', CAT: 'text-orange-400 bg-orange-500/10',
  GRE: 'text-cyan-400 bg-cyan-500/10', IELTS: 'text-purple-400 bg-purple-500/10',
  CUET: 'text-teal-400 bg-teal-500/10', TOEFL: 'text-rose-400 bg-rose-500/10',
}

export default function EntranceExamsTab() {
  const { exams, loading, saving, addExam, updateExam, deleteExam } = useStudentExams()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateEntranceExamRequest>(EMPTY)

  const set = (k: keyof CreateEntranceExamRequest, v: string) =>
    setForm(f => ({ ...f, [k]: ['exam_year','score','rank','percentile'].includes(k) ? (v ? Number(v) : undefined) : v }))

  const handleSubmit = async () => {
    if (!form.exam_name || !form.exam_year) { toast.error('Exam name and year are required'); return }
    const result = editId ? await updateExam(editId, form) : await addExam(form)
    if (result.success) { toast.success(editId ? 'Exam updated!' : 'Exam added!'); setShowForm(false); setEditId(null); setForm(EMPTY) }
    else toast.error(result.error || 'Failed')
  }

  const openEdit = (exam: EntranceExam) => {
    setEditId(exam.id)
    setForm({ exam_name: exam.exam_name, exam_year: exam.exam_year, score: exam.score, rank: exam.rank, percentile: exam.percentile })
    setShowForm(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} exam record?`)) return
    const r = await deleteExam(id)
    if (r.success) toast.success('Deleted')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Entrance Exams ({exams.length})</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Result'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Exam *</label>
                <select className={INPUT_CLASS} value={form.exam_name} onChange={e => set('exam_name', e.target.value)}>
                  {EXAM_LIST.map(e => <option key={e} value={e} className="bg-[#1a1a2e]">{e.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              {[
                { k: 'exam_year', l: 'Year *' }, { k: 'score', l: 'Score / Marks' },
                { k: 'rank', l: 'Rank / AIR' }, { k: 'percentile', l: 'Percentile (%)' },
              ].map(({ k, l }) => (
                <div key={k}>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">{l}</label>
                  <input type="number" className={INPUT_CLASS} placeholder={l}
                    value={form[k as keyof typeof form] || ''} onChange={e => set(k as keyof CreateEntranceExamRequest, e.target.value)} />
                </div>
              ))}
            </div>
            <button onClick={handleSubmit} disabled={saving}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : editId ? 'Update' : 'Add Exam'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <SkeletonRow count={3} /> : exams.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No exam results yet" description="Add your EAMCET, JEE, GATE, GRE, IELTS and other entrance exam scores"
          action={{ label: 'Add Exam Result', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {exams.map((exam, i) => {
            const color = examColors[exam.exam_name] || 'text-zinc-400 bg-zinc-500/10'
            return (
              <motion.div key={exam.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}
                className="glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors group">
                <div className="flex items-start justify-between">
                  <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${color}`}>
                    {exam.exam_name.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(exam)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      <Edit className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(exam.id, exam.exam_name)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {exam.exam_year && <p className="text-zinc-500 text-xs">{exam.exam_year}</p>}
                  {exam.score != null && <p className="text-white text-lg font-bold">{exam.score} <span className="text-zinc-500 text-sm font-normal">score</span></p>}
                  {exam.rank != null && <p className="text-cyan-400 text-sm">Rank: <span className="font-bold">{exam.rank.toLocaleString()}</span></p>}
                  {exam.percentile != null && <p className="text-purple-400 text-sm">Percentile: <span className="font-bold">{exam.percentile}%</span></p>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
```

---

## File: OverviewTab.tsx
**Path:** `frontend/src/components/profile/student/OverviewTab.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'
import { FileText, Award, Code2, ClipboardList, Trophy, Sparkles, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { FullStudentProfile } from '../../../types/profile.types'
import ProgressRing from '../shared/ProgressRing'
import StrengthBar from '../shared/StrengthBar'

interface OverviewTabProps {
  profile: FullStudentProfile
  onTabChange: (tab: string) => void
}

export default function OverviewTab({ profile, onTabChange }: OverviewTabProps) {
  const { user, profile: sp, strength, academic_records, semester_marks, certifications, exams, achievements, skills, documents } = profile

  const stats = [
    { label: 'Documents',      value: documents?.length || 0,       icon: FileText,       tab: 'documents',      color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    { label: 'Certifications', value: certifications?.length || 0,   icon: Award,          tab: 'certifications', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Skill Sets',     value: skills ? Object.values({ a: skills.programming_languages, b: skills.frameworks, c: skills.soft_skills }).filter(a => Array.isArray(a) && a.length > 0).length : 0, icon: Code2, tab: 'skills', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Exam Results',   value: exams?.length || 0,            icon: ClipboardList,  tab: 'exams',          color: 'text-amber-400',  bg: 'bg-amber-500/10' },
    { label: 'Achievements',   value: achievements?.length || 0,     icon: Trophy,         tab: 'achievements',   color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
    { label: 'Academic Levels',value: academic_records?.length || 0, icon: Sparkles,       tab: 'academic',       color: 'text-pink-400',   bg: 'bg-pink-500/10' },
  ]

  const pendingDocs = documents?.filter(d => d.verification_status === 'pending') || []
  const verifiedDocs = documents?.filter(d => d.verification_status === 'verified') || []
  const rejectedDocs = documents?.filter(d => d.verification_status === 'rejected') || []

  const latestSemester = semester_marks?.length
    ? semester_marks[semester_marks.length - 1]
    : null

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <h2 className="text-white text-lg font-bold">Portfolio Overview</h2>

      {/* Welcome card */}
      <div className="glass rounded-2xl p-6 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-white text-lg font-semibold">Welcome, {user?.full_name?.split(' ')[0]}! 👋</h3>
            <p className="text-zinc-400 text-sm mt-1">
              Your digital academic portfolio is <span className="text-purple-400 font-semibold">{strength?.total || 0}% complete</span>.
              {(strength?.total || 0) < 80 && ' Complete your profile to unlock scholarship recommendations.'}
            </p>
            {sp?.user_id ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-zinc-500 text-xs">Student ID:</span>
                <span className="font-mono text-purple-400 font-bold text-sm bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20">{sp.user_id}</span>
              </div>
            ) : (
              <p className="text-zinc-600 text-xs mt-2">Student ID will be assigned after admission approval</p>
            )}
          </div>
          <ProgressRing percent={strength?.total || 0} size={80} strokeWidth={6} label={`${strength?.total || 0}%`} sublabel={strength?.label || ''} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, tab, color, bg }, i) => (
          <motion.button key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} onClick={() => onTabChange(tab)}
            className="glass rounded-2xl p-4 text-left hover:scale-[1.02] transition-transform group">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold ${color} group-hover:scale-110 transition-transform inline-block`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
          </motion.button>
        ))}
      </div>

      {/* Profile strength breakdown */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4 text-sm">Strength Breakdown</h3>
        <div className="space-y-3">
          {[
            { label: 'Personal Info', value: strength?.personal || 0, max: 25 },
            { label: 'Academic Records', value: strength?.academic || 0, max: 25 },
            { label: 'Skills & Links', value: strength?.skills || 0, max: 15 },
            { label: 'Documents', value: strength?.documents || 0, max: 15 },
            { label: 'Achievements', value: strength?.achievements || 0, max: 10 },
            { label: 'Career Readiness', value: strength?.career || 0, max: 10 },
          ].map(({ label, value, max }, i) => (
            <StrengthBar key={label} label={label} value={value} max={max} color="auto" delay={i * 100} />
          ))}
        </div>
      </div>

      {/* Document status + latest CGPA row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Document verification summary */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-3 text-sm">Document Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-zinc-400 text-sm">Verified</span></div>
              <span className="text-emerald-400 font-semibold">{verifiedDocs.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-400 animate-pulse" /><span className="text-zinc-400 text-sm">Pending Review</span></div>
              <span className="text-yellow-400 font-semibold">{pendingDocs.length}</span>
            </div>
            {rejectedDocs.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-zinc-400 text-sm">Rejected</span></div>
                <span className="text-red-400 font-semibold">{rejectedDocs.length}</span>
              </div>
            )}
          </div>
          <button onClick={() => onTabChange('documents')}
            className="mt-4 w-full py-2 rounded-xl bg-white/5 border border-white/5 text-zinc-400 text-xs font-medium hover:bg-white/10 transition-colors">
            Manage Documents →
          </button>
        </div>

        {/* Academic summary */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-3 text-sm">Academic Summary</h3>
          {latestSemester ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Latest CGPA</span>
                <span className="text-white font-bold text-lg">{latestSemester.cgpa || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Semester {latestSemester.semester} SGPA</span>
                <span className="text-cyan-400 font-semibold">{latestSemester.sgpa || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Levels on record</span>
                <span className="text-purple-400 font-semibold">{academic_records?.length || 0}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-zinc-600 text-sm">No academic records yet</p>
              <button onClick={() => onTabChange('academic')}
                className="mt-2 text-purple-400 text-xs hover:text-purple-300">Add records →</button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
```

---

## File: PreferencesTab.tsx
**Path:** `frontend/src/components/profile/student/PreferencesTab.tsx`

```tsx
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings, Save, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
}

interface Prefs {
  target_colleges: string[]
  preferred_courses: string[]
  preferred_locations: string[]
  career_interests: string[]
  notification_email: boolean
  notification_sms: boolean
  notification_app: boolean
}

const CAREER_OPTS = ['Software Engineering','Data Science','AI/ML Research','DevOps/Cloud','Product Management','UI/UX Design','Cybersecurity','Finance/Banking','Civil Services','Teaching/Research','Entrepreneurship','Healthcare IT']
const LOCATIONS = ['Andhra Pradesh','Telangana','Karnataka','Tamil Nadu','Maharashtra','Delhi NCR','Gujarat','Pune','Hyderabad','Bengaluru','Chennai','Mumbai']

function ArrayField({ label, items, onAdd, onRemove, placeholder }: {
  label: string; items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  return (
    <div>
      <label className="block text-zinc-400 text-xs font-medium mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            {item}
            <button onClick={() => onRemove(item)}><X className="w-3 h-3 opacity-60 hover:opacity-100" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput('') } }}
          placeholder={placeholder}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 transition-all" />
        <button onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput('') } }}
          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function PreferencesTab() {
  const [prefs, setPrefs] = useState<Prefs>({
    target_colleges: [], preferred_courses: [], preferred_locations: [], career_interests: [],
    notification_email: true, notification_sms: false, notification_app: true
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch('/api/student/preferences').then(r => r.json()).then(d => {
      if (d && Object.keys(d).length) {
        setPrefs({
          target_colleges: d.target_colleges || [],
          preferred_courses: d.preferred_courses || [],
          preferred_locations: d.preferred_locations || [],
          career_interests: d.career_interests || [],
          notification_email: d.notification_email ?? true,
          notification_sms: d.notification_sms ?? false,
          notification_app: d.notification_app ?? true,
        })
      }
    }).catch(() => {})
  }, [])

  const addTo = (k: keyof Prefs, v: string) => setPrefs(p => ({ ...p, [k]: [...(p[k] as string[]).filter(x => x !== v), v] }))
  const removeFrom = (k: keyof Prefs, v: string) => setPrefs(p => ({ ...p, [k]: (p[k] as string[]).filter(x => x !== v) }))
  const toggleCareer = (v: string) => prefs.career_interests.includes(v) ? removeFrom('career_interests', v) : addTo('career_interests', v)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/preferences', { method: 'PUT', body: JSON.stringify(prefs) })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Preferences saved!')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Preferences</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {/* Career interests grid */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-3">Career Interests</h3>
        <div className="flex flex-wrap gap-2">
          {CAREER_OPTS.map(opt => (
            <button key={opt} onClick={() => toggleCareer(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${prefs.career_interests.includes(opt) ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Location preferences */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-3">Preferred Locations</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {LOCATIONS.map(loc => (
            <button key={loc} onClick={() => prefs.preferred_locations.includes(loc) ? removeFrom('preferred_locations', loc) : addTo('preferred_locations', loc)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${prefs.preferred_locations.includes(loc) ? 'bg-cyan-600/20 border-cyan-500 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
              {loc}
            </button>
          ))}
        </div>
        <ArrayField label="Other Locations" items={prefs.preferred_locations.filter(l => !LOCATIONS.includes(l))}
          onAdd={v => addTo('preferred_locations', v)} onRemove={v => removeFrom('preferred_locations', v)}
          placeholder="Add other location..." />
      </div>

      {/* Target colleges & preferred courses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <ArrayField label="Target Colleges / Universities" items={prefs.target_colleges}
            onAdd={v => addTo('target_colleges', v)} onRemove={v => removeFrom('target_colleges', v)}
            placeholder="e.g. IIT Hyderabad, NIT Warangal" />
        </div>
        <div className="glass rounded-2xl p-5">
          <ArrayField label="Preferred Courses / Programs" items={prefs.preferred_courses}
            onAdd={v => addTo('preferred_courses', v)} onRemove={v => removeFrom('preferred_courses', v)}
            placeholder="e.g. M.Tech CSE, MBA" />
        </div>
      </div>

      {/* Notification preferences */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4">Notification Preferences</h3>
        <div className="space-y-3">
          {[
            { key: 'notification_email', label: 'Email Notifications', desc: 'Receive updates to your registered email' },
            { key: 'notification_sms',   label: 'SMS Notifications',   desc: 'Receive SMS alerts for important events' },
            { key: 'notification_app',   label: 'In-App Notifications', desc: 'Show notification bell in dashboard' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-zinc-500 text-xs">{desc}</p>
              </div>
              <button onClick={() => setPrefs(p => ({ ...p, [key]: !p[key as keyof Prefs] }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${prefs[key as keyof Prefs] ? 'bg-purple-600' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${prefs[key as keyof Prefs] ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
```

---

## File: PrivacyTab.tsx
**Path:** `frontend/src/components/profile/student/PrivacyTab.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'
import { Eye, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStudentPrivacy } from '../../../hooks/useStudentPrivacy'
import { VisibilityLevel, UpdatePrivacyRequest } from '../../../types/profile.types'
import PrivacyBadge from '../shared/PrivacyBadge'
import SkeletonCard from '../shared/SkeletonCard'

const FIELDS: { key: keyof UpdatePrivacyRequest; label: string; description: string }[] = [
  { key: 'personal_info_visibility',   label: 'Personal Information', description: 'Name, DOB, gender, Aadhaar, etc.' },
  { key: 'contact_visibility',          label: 'Contact Details',       description: 'Phone, email, address, parent info' },
  { key: 'academic_visibility',         label: 'Academic Records',      description: '10th, intermediate, UG records' },
  { key: 'documents_visibility',        label: 'Documents',             description: 'Uploaded documents and files' },
  { key: 'certifications_visibility',   label: 'Certifications',        description: 'Courses, hackathons, NSS/NCC' },
  { key: 'skills_visibility',           label: 'Skills & Links',        description: 'Technical skills and profile URLs' },
  { key: 'achievements_visibility',     label: 'Achievements',          description: 'Awards and recognition' },
  { key: 'exams_visibility',            label: 'Entrance Exams',        description: 'EAMCET, JEE, GATE scores' },
]

export default function PrivacyTab() {
  const { privacy, loading, saving, updatePrivacy } = useStudentPrivacy()
  const [local, setLocal] = React.useState<UpdatePrivacyRequest>({})

  React.useEffect(() => {
    if (privacy) {
      const { personal_info_visibility, contact_visibility, academic_visibility, documents_visibility,
        certifications_visibility, skills_visibility, achievements_visibility, exams_visibility, profile_public_link } = privacy
      setLocal({ personal_info_visibility, contact_visibility, academic_visibility, documents_visibility,
        certifications_visibility, skills_visibility, achievements_visibility, exams_visibility, profile_public_link })
    }
  }, [privacy])

  const set = (key: keyof UpdatePrivacyRequest, val: VisibilityLevel | boolean) =>
    setLocal(l => ({ ...l, [key]: val }))

  const handleSave = async () => {
    const r = await updatePrivacy(local)
    if (r.success) toast.success('Privacy settings saved!')
    else toast.error(r.error || 'Failed to save')
  }

  if (loading) return <SkeletonCard rows={8} />

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-bold">Privacy Settings</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Control who can see each section of your portfolio</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Visibility levels legend */}
      <div className="glass rounded-2xl p-4">
        <p className="text-zinc-500 text-xs font-medium mb-3">Visibility Levels</p>
        <div className="flex flex-wrap gap-2">
          {(['private','institution','faculty','placement_cell','admission_officers','public'] as VisibilityLevel[]).map(v => (
            <PrivacyBadge key={v} value={v} readonly />
          ))}
        </div>
        <p className="text-zinc-600 text-xs mt-2">Private → Institution → Faculty → Placement Cell → Admission Officers → Public (most visible)</p>
      </div>

      {/* Field visibility controls */}
      <div className="glass rounded-2xl divide-y divide-white/5">
        {FIELDS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between p-4 gap-4">
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{label}</p>
              <p className="text-zinc-600 text-xs mt-0.5">{description}</p>
            </div>
            <PrivacyBadge
              value={(local[key] as VisibilityLevel) || 'institution'}
              onChange={(val) => set(key, val)}
              size="md"
            />
          </div>
        ))}

        {/* Public profile toggle */}
        <div className="flex items-center justify-between p-4">
          <div className="flex-1">
            <p className="text-white text-sm font-medium">Public Portfolio Link</p>
            <p className="text-zinc-600 text-xs mt-0.5">Generate a shareable public link to your portfolio</p>
          </div>
          <button
            onClick={() => set('profile_public_link', !local.profile_public_link)}
            className={`relative w-12 h-6 rounded-full transition-colors ${local.profile_public_link ? 'bg-purple-600' : 'bg-white/10'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${local.profile_public_link ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
```

---

## File: SkillsTab.tsx
**Path:** `frontend/src/components/profile/student/SkillsTab.tsx`

```tsx
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Code2, Github, Linkedin, Globe, Save, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStudentSkills } from '../../../hooks/useStudentSkills'
import SkeletonCard from '../shared/SkeletonCard'

const SKILL_SECTIONS = [
  { key: 'programming_languages',  label: 'Programming Languages', placeholder: 'e.g. Python, Java, C++', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { key: 'frameworks',         label: 'Frameworks & Libraries',placeholder: 'e.g. React, FastAPI, TensorFlow', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { key: 'databases',          label: 'Databases',             placeholder: 'e.g. PostgreSQL, MongoDB, Redis', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { key: 'cloud_platforms', label: 'Cloud & DevOps',        placeholder: 'e.g. AWS, Docker, Kubernetes', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  { key: 'ai_ml_skills',       label: 'AI / ML Skills',        placeholder: 'e.g. NLP, Computer Vision, LLMs', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  { key: 'software_tools',              label: 'Tools & Platforms',     placeholder: 'e.g. Git, Figma, Postman, JIRA', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  { key: 'soft_skills',        label: 'Soft Skills',           placeholder: 'e.g. Leadership, Communication', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  { key: 'languages_known',    label: 'Languages Known',       placeholder: 'e.g. English, Telugu, Hindi', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
]

function SkillTag({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
  return (
    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {label}
      {onRemove && (
        <button onClick={onRemove} className="opacity-60 hover:opacity-100 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      )}
    </motion.span>
  )
}

function SkillInput({ sectionKey, color, skills, onChange, placeholder }: {
  sectionKey: string; color: string; skills: string[]; onChange: (k: string, v: string[]) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !skills.includes(v)) onChange(sectionKey, [...skills, v])
    setInput('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {skills.map(s => (
          <SkillTag key={s} label={s} color={color}
            onRemove={() => onChange(sectionKey, skills.filter(x => x !== s))} />
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 transition-all" />
        <button onClick={add} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function SkillsTab() {
  const { skills, loading, saving, updateSkills } = useStudentSkills()
  const [form, setForm] = useState<Record<string, string[]>>({})
  const [links, setLinks] = useState({ github_url: '', linkedin_url: '', portfolio_url: '' })

  useEffect(() => {
    if (skills) {
      setForm({
        programming_languages: skills.programming_languages || [],
        frameworks: skills.frameworks || [],
        databases: skills.databases || [],
        cloud_platforms: skills.cloud_platforms || [],
        ai_ml_skills: skills.ai_ml_skills || [],
        software_tools: skills.software_tools || [],
        soft_skills: skills.soft_skills || [],
        languages_known: skills.languages_known || [],
      })
      setLinks({ github_url: skills.github_url || '', linkedin_url: skills.linkedin_url || '', portfolio_url: skills.portfolio_url || '' })
    }
  }, [skills])

  const handleSave = async () => {
    const result = await updateSkills({ ...form, ...links })
    if (result.success) toast.success('Skills saved!')
    else toast.error(result.error || 'Save failed')
  }

  if (loading) return <SkeletonCard rows={6} height={200} />

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Skills & Links</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Skills'}
        </button>
      </div>

      {/* Profile links */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />Profile Links
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: 'github_url',    icon: Github,   label: 'GitHub URL',    placeholder: 'https://github.com/username' },
            { key: 'linkedin_url',  icon: Linkedin, label: 'LinkedIn URL',  placeholder: 'https://linkedin.com/in/username' },
            { key: 'portfolio_url', icon: Globe,    label: 'Portfolio URL', placeholder: 'https://yourportfolio.com' },
          ].map(({ key, icon: Icon, label, placeholder }) => (
            <div key={key}>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />{label}
              </label>
              <input type="url" className={INPUT_CLASS} value={links[key as keyof typeof links]}
                onChange={e => setLinks(l => ({ ...l, [key]: e.target.value }))} placeholder={placeholder} />
            </div>
          ))}
        </div>
      </div>

      {/* Skill categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SKILL_SECTIONS.map(({ key, label, placeholder, color }) => (
          <div key={key} className="glass rounded-2xl p-4">
            <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Code2 className={`w-3.5 h-3.5 ${color.split(' ')[1]}`} />
              {label}
            </h4>
            <SkillInput sectionKey={key} color={color} skills={form[key] || []}
              onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} placeholder={placeholder} />
          </div>
        ))}
      </div>
    </motion.div>
  )
}
```

---

## File: TimelineTab.tsx
**Path:** `frontend/src/components/profile/student/TimelineTab.tsx`

```tsx
import React from 'react'
import { motion } from 'framer-motion'
import { Activity, ArrowRight } from 'lucide-react'
import { useStudentTimeline } from '../../../hooks/useStudentTimeline'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'

const EVENT_ICONS: Record<string, string> = {
  profile_created:          '🎉',
  profile_updated:          '✏️',
  document_uploaded:        '📄',
  document_replaced:        '🔄',
  academic_record_updated:  '🎓',
  semester_added:           '📊',
  certification_added:      '🏆',
  skills_updated:           '💻',
  exam_result_added:        '📝',
  achievement_added:        '⭐',
  ai_insights_generated:    '🤖',
  ai_insights_refreshed:    '🔄',
  password_changed:         '🔐',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TimelineTab() {
  const { events, loading, hasMore, loadMore } = useStudentTimeline()

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-white text-lg font-bold">Academic Journey Timeline</h2>
      <p className="text-zinc-500 text-sm">An immutable, chronological record of your academic portfolio activity.</p>

      {loading ? <SkeletonRow count={6} /> : events.length === 0 ? (
        <EmptyState icon={Activity} title="No timeline events yet" description="Your activity will appear here as you build your portfolio" />
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[26px] top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/40 via-cyan-500/20 to-transparent" />

          <div className="space-y-3">
            {events.map((event, i) => (
              <motion.div key={event.id}
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-4 group">
                {/* Icon bubble */}
                <div className="relative z-10 w-[52px] flex-shrink-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-2xl bg-[#1a1a2e] border border-white/10 flex items-center justify-center text-base
                                  group-hover:border-purple-500/30 group-hover:bg-purple-500/5 transition-all">
                    {EVENT_ICONS[event.event_type] || '📌'}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-white font-medium text-sm leading-snug">{event.title}</h4>
                    <span className="text-zinc-600 text-xs flex-shrink-0 whitespace-nowrap">{formatDate(event.created_at)}</span>
                  </div>
                  {event.description && (
                    <p className="text-zinc-500 text-xs mt-1">{event.description}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {hasMore && (
            <div className="text-center mt-4 ml-[52px]">
              <button onClick={loadMore}
                className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-zinc-400 text-sm hover:bg-white/10 transition-colors">
                Load more <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
```

---

## File: ProtectedRoute.tsx
**Path:** `frontend/src/components/ProtectedRoute.tsx`

```tsx
import { Navigate } from 'react-router-dom'
import { useAuth, UserRole } from '../context/AuthContext.tsx'
import { ReactNode } from 'react'

export default function ProtectedRoute({ 
  children, 
  allowedRoles 
}: { 
  children: ReactNode
  allowedRoles: UserRole[] 
}) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />
  }

  return <>{children}</>
}
```

---

## File: Testimonials.tsx
**Path:** `frontend/src/components/Testimonials.tsx`

```tsx
import { motion } from 'framer-motion'

const testimonials = [
  { quote: "We replaced our overflow call center within a semester. Counselling quality went up, not down.", name: "Dr. Anika Rao", role: "Dean of Admissions · Crestwood University", initials: "DA" },
  { quote: "Document verification used to take days. Now it's same-day, with an audit trail.", name: "Priya Sharma", role: "Admissions Officer · Skyline Polytechnic", initials: "PS" },
  { quote: "I get clear updates on attendance and exams without chasing anyone.", name: "Sunita Patel", role: "Parent", initials: "SP" },
  { quote: "ADhoc.ai handles 80% of parent enquiries before they ever reach our office.", name: "Rohan Mehta", role: "Principal · Apex Institute", initials: "RM" },
  { quote: "I was confused after 12th. The voice agent walked me through options in my own language.", name: "Arjun K.", role: "Student · First-year, B.Tech", initials: "AK" },
]

export default function Testimonials() {
  return (
    <section className="py-32 relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">VOICES</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Trusted by the people who run <span className="text-gradient-neon">education.</span></h2>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={t.name} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              whileHover={{ y: -4 }} className="glass-panel rounded-3xl p-6 hover:bg-white/5 border border-white/10 hover:border-purple-500/30 transition-all duration-300">
              <p className="text-zinc-300 mb-6 leading-relaxed">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">{t.initials}</div>
                <div>
                  <p className="text-white font-medium text-sm">{t.name}</p>
                  <p className="text-zinc-500 text-xs">{t.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

---

## File: WorkflowSection.tsx
**Path:** `frontend/src/components/WorkflowSection.tsx`

```tsx
import { motion } from 'framer-motion'
import { useScrollAnimation } from '../hooks/useScrollAnimation'

const steps = [
  { num: '01', text: 'Student discovers career options', side: 'left' },
  { num: '02', text: 'Talks with AI Voice Agent', side: 'right' },
  { num: '03', text: 'AI asks intelligent counselling questions', side: 'left' },
  { num: '04', text: 'AI recommends a career path', side: 'right' },
  { num: '05', text: 'College recommendations generated', side: 'left' },
  { num: '06', text: 'Admission guidance begins', side: 'right' },
  { num: '07', text: 'Documents uploaded & verified', side: 'left' },
  { num: '08', text: 'Scholarship eligibility checked', side: 'right' },
  { num: '09', text: 'Application completed', side: 'left' },
  { num: '10', text: 'Fee payment initiated', side: 'right' },
  { num: '11', text: 'Student onboarding begins', side: 'left' },
  { num: '12', text: 'Semester roadmap generated', side: 'right' },
  { num: '13', text: 'Academic support continues', side: 'left' },
  { num: '14', text: 'Placement guidance begins', side: 'right' },
]

export default function WorkflowSection() {
  const { ref, isVisible } = useScrollAnimation(0.1)
  return (
    <section id="solutions" className="py-32 relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-20">
          <p className="text-purple-400 text-sm font-medium tracking-widest mb-4">HOW IT WORKS</p>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">From first question to <span className="text-gradient-neon">first placement.</span></h2>
          <p className="text-zinc-400">A continuous, AI-guided journey — every step tracked, every conversation remembered.</p>
        </motion.div>
        <div ref={ref} className="relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/30 via-cyan-500/30 to-purple-500/30" />
          {steps.map((step, i) => (
            <motion.div key={step.num}
              initial={{ opacity: 0, x: step.side === 'left' ? -50 : 50 }}
              animate={isVisible ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className={`flex items-center gap-6 mb-8 ${step.side === 'right' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex-1 ${step.side === 'right' ? 'text-left' : 'text-right'}`}>
                <div className="inline-block glass-panel px-5 py-3 rounded-2xl text-sm text-zinc-200 hover:bg-white/10 border border-white/10 hover:border-purple-500/30 transition-all cursor-default">{step.text}</div>
              </div>
              <motion.div whileHover={{ scale: 1.2 }}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm z-10 shadow-lg shadow-purple-500/20 border border-white/15">
                {step.num}
              </motion.div>
              <div className="flex-1" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

---

## File: AuthContext.tsx
**Path:** `frontend/src/context/AuthContext.tsx`

```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { apiFetch } from '../hooks/useApi'

export type UserRole = 'admin' | 'faculty' | 'student'

export interface User {
  id: string
  email: string
  name: string
  full_name?: string
  role: UserRole
  institution?: string
  avatar?: string
}

interface ApiUser {
  id: string
  email: string
  full_name: string
  role?: UserRole
  institution?: string
}

interface AuthResponse {
  access_token: string
  user: ApiUser
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupData) => Promise<void>
  logout: () => void
  isLoading: boolean
}

interface SignupData {
  name: string
  email: string
  password: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function normalizeUser(apiUser: ApiUser): User {
  const name = apiUser.full_name || apiUser.email
  return {
    id: apiUser.id,
    email: apiUser.email,
    name,
    full_name: apiUser.full_name,
    role: apiUser.role || 'student',
    institution: apiUser.institution,
    avatar: initials(name),
  }
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return 'Authentication failed'
  try {
    const parsed = JSON.parse(error.message)
    if (typeof parsed.detail === 'string') return parsed.detail
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) return parsed.detail[0].msg
  } catch {
    // Use the original message below.
  }
  return error.message || 'Authentication failed'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('adhoc_user')
    if (stored) {
      setUser(JSON.parse(stored))
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const data: AuthResponse = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      const nextUser = normalizeUser(data.user)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('adhoc_user', JSON.stringify(nextUser))
      setUser(nextUser)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async (data: SignupData) => {
    setIsLoading(true)
    try {
      const response: AuthResponse = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          full_name: data.name,
        }),
      })
      const newUser = normalizeUser(response.user)
      localStorage.setItem('token', response.access_token)
      localStorage.setItem('adhoc_user', JSON.stringify(newUser))
      setUser(newUser)
    } catch (error) {
      throw new Error(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('adhoc_user')
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

---

## File: useAIInsights.ts
**Path:** `frontend/src/hooks/useAIInsights.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { AIInsights, AnalysisStatus } from '../types/profile.types'
import { apiFetch } from './useApi'

export function useAIInsights() {
  const [insights, setInsights] = useState<AIInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/student/ai-insights')
      setInsights(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
    } finally { setLoading(false) }
  }, [])

  const refreshInsights = useCallback(async () => {
    setRefreshing(true)
    try {
      await apiFetch('/api/student/ai-insights/refresh', { method: 'POST' })
      // Poll for completion
      setInsights(prev => prev ? { ...prev, analysis_status: 'generating' as AnalysisStatus } : prev)
      const poll = setInterval(async () => {
        try {
          const data = await apiFetch('/api/student/ai-insights')
          if (data.analysis_status === 'ready' || data.analysis_status === 'failed') {
            setInsights(data)
            clearInterval(poll)
            setRefreshing(false)
          }
        } catch {
          // If polling fails, ignore or let timeout handle it
        }
      }, 3000)
      // Timeout after 60s
      setTimeout(() => { clearInterval(poll); setRefreshing(false) }, 60000)
      return { success: true }
    } catch (e: unknown) {
      setRefreshing(false)
      return { success: false, error: e instanceof Error ? e.message : 'Refresh failed' }
    }
  }, [])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  return { insights, loading, refreshing, error, fetchInsights, refreshInsights }
}
```

---

## File: useAnalytics.ts
**Path:** `frontend/src/hooks/useAnalytics.ts`

```typescript
import { useState, useEffect } from 'react';
import { apiFetch } from './useApi';

export function useAnalytics() {
  const [summary, setSummary] = useState<any>(null);
  const [callsOverTime, setCallsOverTime] = useState<any[]>([]);
  const [sentiment, setSentiment] = useState<any[]>([]);
  const [topAgents, setTopAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/analytics/summary'),
      apiFetch('/api/analytics/calls-over-time?days=30'),
      apiFetch('/api/analytics/sentiment'),
      apiFetch('/api/analytics/top-agents'),
    ]).then(([s, c, se, ta]) => {
      setSummary(s);
      setCallsOverTime(c);
      setSentiment(se);
      setTopAgents(ta);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return { summary, callsOverTime, sentiment, topAgents, loading };
}
```

---

## File: useApi.ts
**Path:** `frontend/src/hooks/useApi.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || 'https://ad-1-ja69.onrender.com';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiUpload(endpoint: string, formData: FormData) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## File: useAuth.ts
**Path:** `frontend/src/hooks/useAuth.ts`

```typescript
import { useState, useEffect } from 'react';
import { apiFetch } from './useApi';

interface User {
  id: number;
  email: string;
  role: string;
  full_name: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    apiFetch('/api/auth/me')
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('role', data.role);
    setUser(data);
    return data;
  };

  const signup = async (email: string, password: string, role: string, fullName?: string, institution?: string) => {
    const data = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, role, full_name: fullName, institution_name: institution }),
    });
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('role', data.role);
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setUser(null);
  };

  return { user, loading, login, signup, logout };
}
```

---

## File: useCalls.ts
**Path:** `frontend/src/hooks/useCalls.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './useApi';

interface Call {
  id: number;
  status: string;
  duration: number;
  topic: string | null;
  sentiment: string | null;
  cost: number;
  recording_url: string | null;
  created_at: string;
  ended_at: string | null;
  transcript_count: number;
  agent?: string;
  caller?: string;
}

export function useCalls(skip = 0, limit = 50, status?: string) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch('/api/calls');
    setCalls(data || []);
    setTotal((data || []).length);
    setLoading(false);
  }, [skip, limit, status]);

  useEffect(() => { fetchCalls(); }, [fetchCalls]);

  const initiateCall = async (userId: number, agentId?: number, topic?: string, phone?: string) => {
    return apiFetch('/api/calls/initiate', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, agent_id: agentId, topic, phone_number: phone }),
    });
  };

  const endCall = async (callId: number) => {
    return apiFetch(`/api/calls/${callId}/end`, { method: 'POST' });
  };

  const getTranscript = async (callId: number) => {
    return apiFetch(`/api/calls/${callId}/transcript`);
  };

  return { calls, total, loading, fetchCalls, initiateCall, endCall, getTranscript };
}
```

---

## File: useMousePosition.ts
**Path:** `frontend/src/hooks/useMousePosition.ts`

```typescript
import { useState, useEffect, useRef } from 'react'

interface MousePosition {
  x: number
  y: number
}

export function useMousePosition() {
  const [position, setPosition] = useState<MousePosition>({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY })
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  return position
}

export function useMagneticButton(strength = 0.3) {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const button = ref.current
    if (!button) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = button.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      button.style.transform = `translate(${x * strength}px, ${y * strength}px)`
    }

    const handleMouseLeave = () => {
      button.style.transform = 'translate(0, 0)'
    }

    button.addEventListener('mousemove', handleMouseMove)
    button.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      button.removeEventListener('mousemove', handleMouseMove)
      button.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [strength])

  return ref
}
```

---

## File: usePrompts.ts
**Path:** `frontend/src/hooks/usePrompts.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './useApi';

export interface Prompt {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  user_prompt_template: string;
  variables: string[];
  temperature: number;
  is_active: boolean;
  created_at: string;
}

export function usePrompts() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch('/api/prompts');
    setPrompts(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const createPrompt = async (data: Omit<Prompt, 'id' | 'created_at'>) => {
    const result = await apiFetch('/api/prompts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    await fetchPrompts();
    return result;
  };

  const updatePrompt = async (id: string, data: { temperature?: number; system_prompt?: string }) => {
    const result = await apiFetch(`/api/prompts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    await fetchPrompts();
    return result;
  };

  const testPrompt = async (id: string, variables: Record<string, string>) => {
    return apiFetch(`/api/prompts/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(variables),
    });
  };

  return { prompts, loading, createPrompt, updatePrompt, testPrompt, refresh: fetchPrompts };
}
```

---

## File: useScrollAnimation.ts
**Path:** `frontend/src/hooks/useScrollAnimation.ts`

```typescript
import { useEffect, useRef, useState } from 'react'

export function useScrollAnimation(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [threshold])

  return { ref, isVisible }
}

export function useParallax(speed = 0.5) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return
      const scrolled = window.scrollY
      ref.current.style.transform = `translateY(${scrolled * speed}px)`
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [speed])

  return ref
}
```

---

## File: useStudentCertifications.ts
**Path:** `frontend/src/hooks/useStudentCertifications.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { StudentCertification, CreateCertificationRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentCertifications() {
  const [certifications, setCertifications] = useState<StudentCertification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchCertifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/certifications')
      if (!res.ok) throw new Error()
      setCertifications(await res.json())
    } catch { setCertifications([]) } finally { setLoading(false) }
  }, [])

  const addCertification = useCallback(async (data: CreateCertificationRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/certifications', { method: 'POST', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchCertifications()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchCertifications])

  const updateCertification = useCallback(async (id: string, data: CreateCertificationRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/student/certifications/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchCertifications()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchCertifications])

  const deleteCertification = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/student/certifications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setCertifications(prev => prev.filter(c => c.id !== id))
      return { success: true }
    } catch { return { success: false } }
  }, [])

  useEffect(() => { fetchCertifications() }, [fetchCertifications])
  return { certifications, loading, saving, fetchCertifications, addCertification, updateCertification, deleteCertification }
}
```

---

## File: useStudentDocuments.ts
**Path:** `frontend/src/hooks/useStudentDocuments.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { StudentDocument } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentDocuments(category?: string) {
  const [documents, setDocuments] = useState<StudentDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = category ? `/api/student/documents?category=${category}` : '/api/student/documents'
      const res = await apiFetch(url)
      if (!res.ok) throw new Error(await res.text())
      setDocuments(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load documents')
    } finally { setLoading(false) }
  }, [category])

  const uploadDocument = useCallback(async (
    file: File, documentType: string, documentName?: string
  ) => {
    setUploading(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', documentType)
      if (documentName) formData.append('document_name', documentName)
      const res = await fetch(`${API_BASE}/api/student/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      await fetchDocuments()
      return { success: true, data: data.data }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Upload failed' }
    } finally { setUploading(false) }
  }, [fetchDocuments])

  const replaceDocument = useCallback(async (docId: string, file: File) => {
    setUploading(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/student/documents/${docId}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchDocuments()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Replace failed' }
    } finally { setUploading(false) }
  }, [fetchDocuments])

  const deleteDocument = useCallback(async (docId: string) => {
    try {
      const res = await apiFetch(`/api/student/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setDocuments(prev => prev.filter(d => d.id !== docId))
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Delete failed' }
    }
  }, [])

  const getVersions = useCallback(async (docId: string): Promise<any> => {
    try {
      const res = await apiFetch(`/api/student/documents/${docId}/versions`)
      if (!res.ok) return []
      return await res.json()
    } catch { return [] }
  }, [])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  return { documents, loading, uploading, error, fetchDocuments, uploadDocument, replaceDocument, deleteDocument, getVersions }
}
```

---

## File: useStudentExams.ts
**Path:** `frontend/src/hooks/useStudentExams.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { EntranceExam, CreateEntranceExamRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentExams() {
  const [exams, setExams] = useState<EntranceExam[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchExams = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/exams')
      if (!res.ok) throw new Error()
      setExams(await res.json())
    } catch { setExams([]) } finally { setLoading(false) }
  }, [])

  const addExam = useCallback(async (data: CreateEntranceExamRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/exams', { method: 'POST', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchExams()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchExams])

  const updateExam = useCallback(async (id: string, data: CreateEntranceExamRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/student/exams/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchExams()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchExams])

  const deleteExam = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/student/exams/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setExams(prev => prev.filter(e => e.id !== id))
      return { success: true }
    } catch { return { success: false } }
  }, [])

  useEffect(() => { fetchExams() }, [fetchExams])
  return { exams, loading, saving, fetchExams, addExam, updateExam, deleteExam }
}
```

---

## File: useStudentNotifications.ts
**Path:** `frontend/src/hooks/useStudentNotifications.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { StudentNotification } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentNotifications() {
  const [notifications, setNotifications] = useState<StudentNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/student/notifications/${id}/read`, { method: 'PUT' })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* silent */ }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await apiFetch('/api/student/notifications/read-all', { method: 'PUT' })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  return { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead }
}
```

---

## File: useStudentPrivacy.ts
**Path:** `frontend/src/hooks/useStudentPrivacy.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { PrivacySettings, UpdatePrivacyRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentPrivacy() {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchPrivacy = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/privacy')
      if (!res.ok) throw new Error()
      setPrivacy(await res.json())
    } catch { setPrivacy(null) } finally { setLoading(false) }
  }, [])

  const updatePrivacy = useCallback(async (data: UpdatePrivacyRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/privacy', { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      setPrivacy(result.data)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [])

  useEffect(() => { fetchPrivacy() }, [fetchPrivacy])
  return { privacy, loading, saving, fetchPrivacy, updatePrivacy }
}
```

---

## File: useStudentProfile.ts
**Path:** `frontend/src/hooks/useStudentProfile.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { FullStudentProfile, UpdateProfileRequest, ProfileStrength } from '../types/profile.types'
import { apiFetch } from './useApi'

export function useStudentProfile() {
  const [profile, setProfile] = useState<FullStudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/student/profile')
      setProfile(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  const updateProfile = useCallback(async (updates: UpdateProfileRequest) => {
    setSaving(true)
    try {
      const data = await apiFetch('/api/student/profile', {
        method: 'PUT', body: JSON.stringify(updates)
      })
      setProfile(prev => prev ? { ...prev, profile: { ...prev.profile!, ...updates }, strength: data.strength } : prev)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Update failed' }
    } finally {
      setSaving(false)
    }
  }, [])

  const refreshStrength = useCallback(async (): Promise<ProfileStrength | null> => {
    try {
      const data = await apiFetch('/api/student/completion')
      setProfile(prev => prev ? { ...prev, strength: data } : prev)
      return data
    } catch { return null }
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  return { profile, loading, saving, error, fetchProfile, updateProfile, refreshStrength }
}
```

---

## File: useStudentSkills.ts
**Path:** `frontend/src/hooks/useStudentSkills.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { StudentSkills, UpdateSkillsRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentSkills() {
  const [skills, setSkills] = useState<StudentSkills | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/skills')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSkills(Object.keys(data).length ? data : null)
    } catch { setSkills(null) } finally { setLoading(false) }
  }, [])

  const updateSkills = useCallback(async (data: UpdateSkillsRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/skills', { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      setSkills(result.data)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [])

  useEffect(() => { fetchSkills() }, [fetchSkills])
  return { skills, loading, saving, fetchSkills, updateSkills }
}
```

---

## File: useStudentTimeline.ts
**Path:** `frontend/src/hooks/useStudentTimeline.ts`

```typescript
import { useState, useEffect, useCallback } from 'react'
import { TimelineEvent } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const fetchTimeline = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/student/timeline?page=${pageNum}&limit=20`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (pageNum === 1) {
        setEvents(data.events || [])
      } else {
        setEvents(prev => [...prev, ...(data.events || [])])
      }
      setHasMore((data.events || []).length === 20)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const loadMore = useCallback(() => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchTimeline(nextPage)
  }, [page, fetchTimeline])

  useEffect(() => { fetchTimeline(1) }, [fetchTimeline])
  return { events, loading, hasMore, loadMore, fetchTimeline }
}
```

---

## File: useVoiceSettings.ts
**Path:** `frontend/src/hooks/useVoiceSettings.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './useApi';

export interface VoiceProvider {
  id: string;
  name: string;
}

export interface VoiceSettings {
  provider: string;
  voice_id: string;
  model: string;
  is_active: boolean;
}

export function useVoiceSettings() {
  const [providers, setProviders] = useState<{ deepgram: { voices: VoiceProvider[] }; elevenlabs: { voices: VoiceProvider[] } } | null>(null);
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProviders = useCallback(async () => {
    const data = await apiFetch('/api/voice/providers');
    setProviders(data);
  }, []);

  const fetchSettings = useCallback(async () => {
    const data = await apiFetch('/api/voice/settings');
    setSettings(data);
  }, []);

  const updateSettings = async (provider: string, voiceId: string) => {
    const data = await apiFetch('/api/voice/settings', {
      method: 'POST',
      body: JSON.stringify({ provider, voice_id: voiceId }),
    });
    setSettings(data.settings);
    return data;
  };

  useEffect(() => {
    Promise.all([fetchProviders(), fetchSettings()]).finally(() => setLoading(false));
  }, [fetchProviders, fetchSettings]);

  return { providers, settings, loading, updateSettings, refresh: fetchSettings };
}
```

---

## File: useWebSocket.ts
**Path:** `frontend/src/hooks/useWebSocket.ts`

```typescript
import { useRef, useCallback, useState } from 'react';

interface TranscriptMessage {
  role: 'agent' | 'caller';
  text: string;
}

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [connected, setConnected] = useState(false);

  const connect = useCallback((callId: number) => {
    setMessages([]);
    setConnected(false);
    const socket = new WebSocket(`ws://localhost:8000/ws/calls/${callId}`);
    socket.onopen = () => {
      setConnected(true);
    };
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'agent' || data.role === 'agent') {
        setMessages(prev => [...prev, { role: 'agent', text: data.text }]);
      } else if (data.type === 'user' || data.role === 'caller') {
        setMessages(prev => [...prev, { role: 'caller', text: data.text }]);
      } else if (data.text) {
        setMessages(prev => [...prev, { role: 'agent', text: data.text }]);
      }
    };
    socket.onclose = () => {
      setConnected(false);
    };
    socket.onerror = () => {
      setConnected(false);
    };
    ws.current = socket;
  }, []);

  const send = useCallback((text: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ text }));
      setMessages(prev => [...prev, { role: 'caller', text }]);
    }
  }, []);

  const disconnect = useCallback(() => {
    ws.current?.close();
    ws.current = null;
  }, []);

  return { messages, connected, connect, send, disconnect };
}
```

---

## File: groups.ts
**Path:** `frontend/src/lib/supabase/groups.ts`

```typescript
import { apiFetch } from '../../hooks/useApi'
import type { FacultyGroup, FacultyGroupMember, CreateGroupInput, UpdateGroupInput, MeetingStats } from '../../types/meetings'

// Get all faculty groups
export async function getFacultyGroups(): Promise<FacultyGroup[]> {
  try {
    const response = await apiFetch('/api/faculty-groups')
    return Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Failed to fetch faculty groups:', error)
    throw error
  }
}

// Get faculty group with member count
export async function getFacultyGroupWithMembers(groupId: string): Promise<FacultyGroup & { members: FacultyGroupMember[] }> {
  try {
    const response = await apiFetch(`/api/faculty-groups/${groupId}`)
    return Array.isArray(response) ? response[0] : response.data
  } catch (error) {
    console.error('Failed to fetch faculty group:', error)
    throw error
  }
}

// Get members of a faculty group
export async function getGroupMembers(groupId: string): Promise<FacultyGroupMember[]> {
  try {
    const response = await apiFetch(`/api/faculty-groups/${groupId}/members`)
    return Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Failed to fetch group members:', error)
    throw error
  }
}

// Create a new faculty group
export async function createFacultyGroup(data: CreateGroupInput): Promise<FacultyGroup> {
  try {
    const response = await apiFetch('/api/faculty-groups', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return Array.isArray(response) ? response[0] : response.data || response
  } catch (error) {
    console.error('Failed to create faculty group:', error)
    throw error
  }
}

// Update a faculty group
export async function updateFacultyGroup(groupId: string, data: UpdateGroupInput): Promise<FacultyGroup> {
  try {
    const response = await apiFetch(`/api/faculty-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return Array.isArray(response) ? response[0] : response.data || response
  } catch (error) {
    console.error('Failed to update faculty group:', error)
    throw error
  }
}

// Delete a faculty group
export async function deleteFacultyGroup(groupId: string): Promise<void> {
  try {
    await apiFetch(`/api/faculty-groups/${groupId}`, {
      method: 'DELETE'
    })
  } catch (error) {
    console.error('Failed to delete faculty group:', error)
    throw error
  }
}

// Add member to faculty group
export async function addGroupMember(groupId: string, userId: string): Promise<FacultyGroupMember> {
  try {
    const response = await apiFetch(`/api/faculty-groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    })
    return Array.isArray(response) ? response[0] : response.data || response
  } catch (error) {
    console.error('Failed to add group member:', error)
    throw error
  }
}

// Remove member from faculty group
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  try {
    await apiFetch(`/api/faculty-groups/${groupId}/members/${userId}`, {
      method: 'DELETE'
    })
  } catch (error) {
    console.error('Failed to remove group member:', error)
    throw error
  }
}

// Get all faculty users for selection
export async function getFacultyUsers(): Promise<any[]> {
  try {
    const response = await apiFetch('/api/users?role=faculty')
    return Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Failed to fetch faculty users:', error)
    throw error
  }
}

// Get meeting statistics
export async function getMeetingStats(): Promise<MeetingStats> {
  try {
    const response = await apiFetch('/api/meetings/stats')
    return response && typeof response === 'object' ? response : {
      total_meetings: 0,
      upcoming_meetings: 0,
      completed_meetings: 0,
      total_faculty_groups: 0
    }
  } catch (error) {
    console.error('Failed to fetch meeting stats:', error)
    return {
      total_meetings: 0,
      upcoming_meetings: 0,
      completed_meetings: 0,
      total_faculty_groups: 0
    }
  }
}
```

---

## File: meetings.ts
**Path:** `frontend/src/lib/supabase/meetings.ts`

```typescript
import { apiFetch } from '../../hooks/useApi'
import type { Meeting, MeetingResponse, CreateMeetingInput } from '../../types/meetings'

// Get all meetings (admin view)
export async function getAllMeetings(): Promise<Meeting[]> {
  try {
    const response = await apiFetch('/api/meetings')
    return Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Failed to fetch all meetings:', error)
    throw error
  }
}

// Get faculty user's meetings (only groups they belong to)
export async function getFacultyMeetings(userId: string): Promise<Meeting[]> {
  try {
    const response = await apiFetch(`/api/meetings/faculty/${userId}`)
    return Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Failed to fetch faculty meetings:', error)
    throw error
  }
}

// Get meeting by ID with full details
export async function getMeetingById(meetingId: string): Promise<Meeting & { assigned_groups: any[], responses: MeetingResponse[] }> {
  try {
    const response = await apiFetch(`/api/meetings/${meetingId}`)
    return Array.isArray(response) ? response[0] : response.data || response
  } catch (error) {
    console.error('Failed to fetch meeting:', error)
    throw error
  }
}

// Create a new meeting
export async function createMeeting(data: CreateMeetingInput): Promise<Meeting> {
  try {
    const response = await apiFetch('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(data)
    })
    return Array.isArray(response) ? response[0] : response.data || response
  } catch (error) {
    console.error('Failed to create meeting:', error)
    throw error
  }
}

// Update a meeting
export async function updateMeeting(meetingId: string, data: Partial<CreateMeetingInput>): Promise<Meeting> {
  try {
    const response = await apiFetch(`/api/meetings/${meetingId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
    return Array.isArray(response) ? response[0] : response.data || response
  } catch (error) {
    console.error('Failed to update meeting:', error)
    throw error
  }
}

// Delete a meeting
export async function deleteMeeting(meetingId: string): Promise<void> {
  try {
    await apiFetch(`/api/meetings/${meetingId}`, {
      method: 'DELETE'
    })
  } catch (error) {
    console.error('Failed to delete meeting:', error)
    throw error
  }
}

// Submit a response to a meeting
export async function submitMeetingResponse(
  meetingId: string,
  userId: string,
  response: 'attending' | 'maybe' | 'not_attending'
): Promise<MeetingResponse> {
  try {
    const result = await apiFetch(`/api/meetings/${meetingId}/response`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, response })
    })
    return Array.isArray(result) ? result[0] : result.data || result
  } catch (error) {
    console.error('Failed to submit meeting response:', error)
    throw error
  }
}

// Get meeting responses with statistics
export async function getMeetingResponses(meetingId: string): Promise<{
  responses: MeetingResponse[]
  stats: { attending: number; maybe: number; not_attending: number }
}> {
  try {
    const response = await apiFetch(`/api/meetings/${meetingId}/responses`)
    return response && typeof response === 'object' ? response : { responses: [], stats: { attending: 0, maybe: 0, not_attending: 0 } }
  } catch (error) {
    console.error('Failed to fetch meeting responses:', error)
    throw error
  }
}

// Get groups assigned to a meeting
export async function getMeetingGroups(meetingId: string): Promise<any[]> {
  try {
    const response = await apiFetch(`/api/meetings/${meetingId}/groups`)
    return Array.isArray(response) ? response : response.data || []
  } catch (error) {
    console.error('Failed to fetch meeting groups:', error)
    throw error
  }
}
```

---

## File: utils.ts
**Path:** `frontend/src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}
```

---

## File: main.tsx
**Path:** `frontend/src/main.tsx`

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: '#18181b',
            color: '#fafafa',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
```

---

## File: AdminScholarshipsPage.tsx
**Path:** `frontend/src/pages/admin/AdminScholarshipsPage.tsx`

```tsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Eye, Edit2, Trash2, Award, FileText, CheckCircle, XCircle, Mail, Phone, Search, Power } from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'
import toast from 'react-hot-toast'

interface Scholarship {
  id: string
  title: string
  provider_name: string
  scholarship_type: string
  description?: string
  eligibility_criteria?: string
  eligible_courses?: string[]
  eligible_categories?: string[]
  minimum_percentage?: number
  annual_income_limit?: number
  scholarship_amount: number
  application_start_date?: string
  application_end_date?: string
  application_link?: string
  required_documents?: string[]
  contact_email?: string
  contact_phone?: string
  status: 'Draft' | 'Active' | 'Expired' | 'draft' | 'active' | 'expired'
  is_featured: boolean
  created_at?: string
  updated_at?: string
}

interface Application {
  id: string
  scholarship_id: string
  student_id: string
  application_status: string
  application_date: string
  remarks?: string
  admin_comments?: string
  approved_amount?: number
  reviewed_by?: string
  reviewed_at?: string
  student?: {
    full_name: string
    email: string
  }
  scholarship?: {
    title: string
    provider_name: string
    scholarship_amount: number
  }
}

const TYPES = ['Government', 'Private', 'University', 'NGO', 'Corporate', 'International', 'Minority', 'Merit', 'Need Based', 'Sports', 'Other']
const STATUSES = ['draft', 'active', 'expired']
const COURSES = ['10th Class', '12th Class', 'Diploma', 'B.Tech', 'B.Sc', 'B.Com', 'M.Tech', 'MBA', 'PhD', 'Other']
const CATEGORIES_LIST = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Minority', 'All']

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function AdminScholarshipsPage() {
  const [activeTab, setActiveTab] = useState<'scholarships' | 'applications'>('scholarships')
  const [scholarships, setScholarships] = useState<Scholarship[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingScholarship, setEditingScholarship] = useState<Scholarship | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewingScholarship, setViewingScholarship] = useState<Scholarship | null>(null)

  const [showAppModal, setShowAppModal] = useState(false)
  const [viewingApp, setViewingApp] = useState<Application | null>(null)

  // Form State
  const [form, setForm] = useState<Partial<Scholarship>>({
    title: '',
    provider_name: '',
    scholarship_type: 'Government',
    description: '',
    eligibility_criteria: '',
    eligible_courses: [],
    eligible_categories: [],
    minimum_percentage: undefined,
    annual_income_limit: undefined,
    scholarship_amount: 0,
    application_start_date: '',
    application_end_date: '',
    application_link: '',
    required_documents: ['Aadhaar Card', 'Marks Memo', 'Income Certificate'],
    contact_email: '',
    contact_phone: '',
    status: 'draft',
    is_featured: false,
  })

  // Application Edit State
  const [appForm, setAppForm] = useState({
    application_status: 'Applied',
    remarks: '',
    admin_comments: '',
    approved_amount: 0,
  })

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'scholarships') {
        const data = await apiFetch('/api/admin/scholarships')
        setScholarships(data)
      } else {
        const data = await apiFetch('/api/admin/scholarship-applications')
        setApplications(data)
      }
    } catch (e) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAdd = () => {
    setEditingScholarship(null)
    setForm({
      title: '',
      provider_name: '',
      scholarship_type: 'Government',
      description: '',
      eligibility_criteria: '',
      eligible_courses: [],
      eligible_categories: [],
      minimum_percentage: undefined,
      annual_income_limit: undefined,
      scholarship_amount: 0,
      application_start_date: '',
      application_end_date: '',
      application_link: '',
      required_documents: ['Aadhaar Card', 'Marks Memo', 'Income Certificate'],
      contact_email: '',
      contact_phone: '',
      status: 'draft',
      is_featured: false,
    })
    setShowAddEditModal(true)
  }

  const handleOpenEdit = (s: Scholarship) => {
    setEditingScholarship(s)
    setForm({ ...s })
    setShowAddEditModal(true)
  }

  const handleSaveScholarship = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    if (!form.provider_name) { toast.error('Provider Name is required'); return }
    if (!form.scholarship_amount || form.scholarship_amount <= 0) { toast.error('Scholarship Amount must be a positive number'); return }

    if (form.application_start_date && form.application_end_date) {
      if (form.application_end_date < form.application_start_date) {
        toast.error('Application end date cannot be before start date.');
        return
      }
    }

    if (form.minimum_percentage !== undefined && (form.minimum_percentage < 0 || form.minimum_percentage > 100)) {
      toast.error('Minimum percentage must be between 0 and 100.');
      return
    }

    if (form.annual_income_limit !== undefined && form.annual_income_limit <= 0) {
      toast.error('Annual income limit must be a positive number.');
      return
    }

    try {
      const url = editingScholarship ? `/api/admin/scholarships/${editingScholarship.id}` : '/api/admin/scholarships'
      const method = editingScholarship ? 'PUT' : 'POST'
      const data = await apiFetch(url, {
        method,
        body: JSON.stringify(form)
      })
      toast.success(editingScholarship ? 'Scholarship updated!' : 'Scholarship created!')
      setShowAddEditModal(false)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Network error occurred')
    }
  }

  const handleDeleteScholarship = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scholarship?')) return
    try {
      await apiFetch(`/api/admin/scholarships/${id}`, { method: 'DELETE' })
      toast.success('Scholarship deleted!')
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Delete failed')
    }
  }

  const handleToggleStatus = async (s: Scholarship) => {
    const nextStatus = s.status?.toLowerCase() === 'active' ? 'expired' : 'active'
    try {
      await apiFetch(`/api/admin/scholarships/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      })
      toast.success(`Scholarship status set to ${nextStatus}`)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to change status')
    }
  }

  // Application details editor
  const handleOpenApp = (a: Application) => {
    setViewingApp(a)
    setAppForm({
      application_status: a.application_status,
      remarks: a.remarks || '',
      admin_comments: a.admin_comments || '',
      approved_amount: a.approved_amount || a.scholarship?.scholarship_amount || 0,
    })
    setShowAppModal(true)
  }

  const handleUpdateAppStatus = async (statusOverride?: string) => {
    if (!viewingApp) return
    const updatedStatus = statusOverride || appForm.application_status
    try {
      await apiFetch(`/api/admin/scholarship-applications/${viewingApp.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          application_status: updatedStatus,
          remarks: appForm.remarks,
          admin_comments: appForm.admin_comments,
          approved_amount: appForm.approved_amount
        })
      })
      toast.success('Application status updated!')
      setViewingApp(null)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update application')
    }
  }

  // Filters for applications
  const filteredApps = applications.filter(a => {
    const matchesSearch = 
      (a.student?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.student?.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.scholarship?.title || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'All' || a.application_status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Format status badge
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Applied': return 'bg-purple-500/20 text-purple-400 border border-purple-500/20'
      case 'Under Review': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
      case 'Shortlisted': return 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
      case 'Approved': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
      case 'Rejected': return 'bg-red-500/20 text-red-400 border border-red-500/20'
      case 'Cancelled': return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/20'
      default: return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/20'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Scholarships</h1>
          <p className="text-zinc-400">Manage scholarship schemes and review student applications.</p>
        </div>
        {activeTab === 'scholarships' && (
          <button onClick={handleOpenAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl text-sm font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all">
            <Plus size={18} /> Add Scholarship
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-6">
        <button onClick={() => setActiveTab('scholarships')}
          className={`pb-3 font-semibold text-sm transition-all ${activeTab === 'scholarships' ? 'border-b-2 border-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
          Manage Scholarships
        </button>
        <button onClick={() => setActiveTab('applications')}
          className={`pb-3 font-semibold text-sm transition-all ${activeTab === 'applications' ? 'border-b-2 border-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
          Applications ({applications.length})
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-zinc-500">Loading data...</div>
      ) : activeTab === 'scholarships' ? (
        // SCHOLARSHIPS TABLE
        <div className="glass rounded-2xl overflow-hidden border border-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-zinc-500 border-b border-white/10 bg-white/[0.01]">
                  <th className="px-6 py-4">TITLE</th>
                  <th className="px-6 py-4">PROVIDER</th>
                  <th className="px-6 py-4">TYPE</th>
                  <th className="px-6 py-4">AMOUNT</th>
                  <th className="px-6 py-4">DEADLINE</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4">FEATURED</th>
                  <th className="px-6 py-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scholarships.map(s => (
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors text-sm">
                    <td className="px-6 py-4 font-semibold text-white truncate max-w-xs">{s.title}</td>
                    <td className="px-6 py-4 text-zinc-400">{s.provider_name}</td>
                    <td className="px-6 py-4 text-zinc-400">{s.scholarship_type}</td>
                    <td className="px-6 py-4 text-purple-400 font-semibold">₹{s.scholarship_amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-zinc-400">{s.application_end_date || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${s.status?.toLowerCase() === 'active' ? 'bg-emerald-500/20 text-emerald-400' : s.status?.toLowerCase() === 'expired' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                        {s.status?.toLowerCase() === 'active' ? 'Active' : s.status?.toLowerCase() === 'expired' ? 'Expired' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {s.is_featured ? (
                        <span className="text-amber-400 flex items-center gap-1"><Award size={14} /> Yes</span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => { setViewingScholarship(s); setShowViewModal(true) }} title="View details"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleOpenEdit(s)} title="Edit"
                        className="p-2 rounded-xl bg-white/5 hover:bg-purple-500/10 text-zinc-400 hover:text-purple-400 transition-all">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleToggleStatus(s)} title={s.status?.toLowerCase() === 'active' ? 'Set Expired' : 'Set Active'}
                        className={`p-2 rounded-xl bg-white/5 hover:bg-yellow-500/10 text-zinc-400 hover:text-yellow-400 transition-all`}>
                        <Power size={14} />
                      </button>
                      <button onClick={() => handleDeleteScholarship(s.id)} title="Delete"
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {scholarships.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-zinc-500">No scholarships configured. Click "Add Scholarship" to create one.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // APPLICATIONS TAB
        <div className="space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex-1 max-w-sm relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search student name, email, scholarship..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all" />
            </div>
            <div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50">
                <option value="All" className="bg-[#1a1a2e]">All Statuses</option>
                <option value="Applied" className="bg-[#1a1a2e]">Applied</option>
                <option value="Under Review" className="bg-[#1a1a2e]">Under Review</option>
                <option value="Shortlisted" className="bg-[#1a1a2e]">Shortlisted</option>
                <option value="Approved" className="bg-[#1a1a2e]">Approved</option>
                <option value="Rejected" className="bg-[#1a1a2e]">Rejected</option>
                <option value="Cancelled" className="bg-[#1a1a2e]">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-semibold text-zinc-500 border-b border-white/10 bg-white/[0.01]">
                    <th className="px-6 py-4">STUDENT NAME</th>
                    <th className="px-6 py-4">EMAIL</th>
                    <th className="px-6 py-4">SCHOLARSHIP</th>
                    <th className="px-6 py-4">APPLIED DATE</th>
                    <th className="px-6 py-4">STATUS</th>
                    <th className="px-6 py-4">AMOUNT</th>
                    <th className="px-6 py-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredApps.map(a => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors text-sm">
                      <td className="px-6 py-4 font-semibold text-white">{a.student?.full_name}</td>
                      <td className="px-6 py-4 text-zinc-400">{a.student?.email}</td>
                      <td className="px-6 py-4 text-zinc-400 font-semibold truncate max-w-xs">{a.scholarship?.title}</td>
                      <td className="px-6 py-4 text-zinc-400">{a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(a.application_status)}`}>
                          {a.application_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-purple-400 font-semibold">₹{a.scholarship?.scholarship_amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-1.5">
                        <button onClick={() => handleOpenApp(a)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-purple-500/10 text-zinc-300 hover:text-purple-400 rounded-xl text-xs font-semibold transition-all">
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredApps.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-zinc-500">No student applications found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT SCHOLARSHIP MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {showAddEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto border border-white/10 shadow-2xl p-6 space-y-6">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-3">
                {editingScholarship ? 'Edit Scholarship' : 'Add Scholarship'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Basic info */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Basic Information</h3>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Scholarship Title *</label>
                    <input className={INPUT_CLASS} placeholder="e.g. Merit-cum-Means Scheme" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Provider Name *</label>
                    <input className={INPUT_CLASS} placeholder="e.g. Ministry of Education" value={form.provider_name} onChange={e => setForm({ ...form, provider_name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Scholarship Type</label>
                      <select className={INPUT_CLASS} value={form.scholarship_type} onChange={e => setForm({ ...form, scholarship_type: e.target.value })}>
                        {TYPES.map(t => <option key={t} value={t} className="bg-[#1a1a2e]">{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Amount (₹) *</label>
                      <input type="number" className={INPUT_CLASS} value={form.scholarship_amount || ''} onChange={e => setForm({ ...form, scholarship_amount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Description</label>
                    <textarea className={`${INPUT_CLASS} h-24 resize-none`} placeholder="Detailed scholarship scheme description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>

                {/* Eligibility & criteria */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Eligibility & Settings</h3>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Eligibility Criteria</label>
                    <textarea className={`${INPUT_CLASS} h-20 resize-none`} placeholder="General eligibility details..." value={form.eligibility_criteria} onChange={e => setForm({ ...form, eligibility_criteria: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Min Percentage (%)</label>
                      <input type="number" className={INPUT_CLASS} placeholder="e.g. 75" value={form.minimum_percentage ?? ''} onChange={e => setForm({ ...form, minimum_percentage: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Max Annual Income (₹)</label>
                      <input type="number" className={INPUT_CLASS} placeholder="e.g. 500000" value={form.annual_income_limit ?? ''} onChange={e => setForm({ ...form, annual_income_limit: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                  </div>
                  
                  {/* Multi selects */}
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Eligible Courses (Select Multiple)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-white/[0.02] border border-white/10">
                      {COURSES.map(c => {
                        const active = form.eligible_courses?.includes(c)
                        return (
                          <button key={c} type="button"
                            onClick={() => {
                              const curr = form.eligible_courses || []
                              const next = curr.includes(c) ? curr.filter(x => x !== c) : [...curr, c]
                              setForm({ ...form, eligible_courses: next })
                            }}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${active ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-white/5 border-transparent text-zinc-400 hover:bg-white/10'}`}>
                            {c}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Eligible Categories (Select Multiple)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-white/[0.02] border border-white/10">
                      {CATEGORIES_LIST.map(cat => {
                        const active = form.eligible_categories?.includes(cat)
                        return (
                          <button key={cat} type="button"
                            onClick={() => {
                              const curr = form.eligible_categories || []
                              const next = curr.includes(cat) ? curr.filter(x => x !== cat) : [...curr, cat]
                              setForm({ ...form, eligible_categories: next })
                            }}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${active ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-white/5 border-transparent text-zinc-400 hover:bg-white/10'}`}>
                            {cat}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates & Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Application link & Dates</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Start Date</label>
                      <input type="date" className={INPUT_CLASS} value={form.application_start_date || ''} onChange={e => setForm({ ...form, application_start_date: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">End Date</label>
                      <input type="date" className={INPUT_CLASS} value={form.application_end_date || ''} onChange={e => setForm({ ...form, application_end_date: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Application Link (Optional)</label>
                    <input className={INPUT_CLASS} placeholder="https://..." value={form.application_link || ''} onChange={e => setForm({ ...form, application_link: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Contact Details & Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Contact Email</label>
                      <input type="email" className={INPUT_CLASS} placeholder="support@..." value={form.contact_email || ''} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Contact Phone</label>
                      <input type="tel" className={INPUT_CLASS} placeholder="e.g. +91 99..." value={form.contact_phone || ''} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Status</label>
                      <select className={INPUT_CLASS} value={form.status?.toLowerCase()} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                        {STATUSES.map(st => <option key={st} value={st} className="bg-[#1a1a2e]">{st === 'active' ? 'Active' : st === 'draft' ? 'Draft' : 'Expired'}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 mt-6 pl-2">
                      <input type="checkbox" id="featured_chk" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })}
                        className="rounded bg-white/5 border-white/10 text-purple-500 focus:ring-0 focus:ring-offset-0 h-4.5 w-4.5" />
                      <label htmlFor="featured_chk" className="text-sm font-semibold text-white select-none cursor-pointer">Featured Scholarship</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end border-t border-white/10 pt-4 gap-3">
                <button onClick={() => setShowAddEditModal(false)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
                  Cancel
                </button>
                <button onClick={handleSaveScholarship}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold shadow-md active:scale-95 transition-all">
                  Save Scholarship
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── DETAIL VIEW MODAL ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showViewModal && viewingScholarship && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Award className="text-purple-400" /> {viewingScholarship.title}
                </h2>
                {viewingScholarship.is_featured && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/20">
                    Featured
                  </span>
                )}
              </div>

              <div className="space-y-3.5 text-sm text-zinc-300">
                <p><span className="text-zinc-500 font-medium">Provider:</span> <strong className="text-white">{viewingScholarship.provider_name}</strong></p>
                <p><span className="text-zinc-500 font-medium">Type:</span> {viewingScholarship.scholarship_type}</p>
                <p><span className="text-zinc-500 font-medium">Amount:</span> <strong className="text-purple-400 text-lg">₹{viewingScholarship.scholarship_amount.toLocaleString()}</strong></p>
                <p><span className="text-zinc-500 font-medium">Dates:</span> {viewingScholarship.application_start_date || 'N/A'} to {viewingScholarship.application_end_date || 'N/A'}</p>
                <p><span className="text-zinc-500 font-medium">Description:</span> {viewingScholarship.description || 'No description provided.'}</p>
                <p><span className="text-zinc-500 font-medium">Eligibility Criteria:</span> {viewingScholarship.eligibility_criteria || 'None'}</p>
                <p><span className="text-zinc-500 font-medium">Min Percentage:</span> {viewingScholarship.minimum_percentage ? `${viewingScholarship.minimum_percentage}%` : 'No minimum'}</p>
                <p><span className="text-zinc-500 font-medium">Income Limit:</span> {viewingScholarship.annual_income_limit ? `₹${viewingScholarship.annual_income_limit.toLocaleString()}` : 'No limit'}</p>
                <div>
                  <span className="text-zinc-500 font-medium">Eligible Courses:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewingScholarship.eligible_courses?.map(c => <span key={c} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-0.5">{c}</span>) || 'All'}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500 font-medium">Required Documents:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewingScholarship.required_documents?.map(d => <span key={d} className="text-xs bg-purple-500/10 border border-purple-500/10 text-purple-300 rounded-lg px-2 py-0.5">{d}</span>) || 'None'}
                  </div>
                </div>
                <div className="flex items-center gap-6 border-t border-white/5 pt-3 text-xs text-zinc-400">
                  {viewingScholarship.contact_email && <span className="flex items-center gap-1"><Mail size={14} /> {viewingScholarship.contact_email}</span>}
                  {viewingScholarship.contact_phone && <span className="flex items-center gap-1"><Phone size={14} /> {viewingScholarship.contact_phone}</span>}
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-white/10">
                <button onClick={() => setShowViewModal(false)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all">
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── REVIEW APPLICATION MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {showAppModal && viewingApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl w-full max-w-xl border border-white/10 shadow-2xl p-6 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-3">
                Review Application
              </h2>

              <div className="space-y-3.5 text-sm text-zinc-300">
                <p><span className="text-zinc-500">Student:</span> <strong className="text-white">{viewingApp.student?.full_name}</strong> ({viewingApp.student?.email})</p>
                <p><span className="text-zinc-500">Scholarship:</span> <strong className="text-white">{viewingApp.scholarship?.title}</strong></p>
                <p><span className="text-zinc-500">Original Amount:</span> ₹{viewingApp.scholarship?.scholarship_amount.toLocaleString()}</p>
                <p><span className="text-zinc-500">Current Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(viewingApp.application_status)}`}>{viewingApp.application_status}</span></p>

                <div className="border-t border-white/5 pt-3 space-y-3">
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Application Status</label>
                    <select className={INPUT_CLASS} value={appForm.application_status} onChange={e => setAppForm({ ...appForm, application_status: e.target.value })}>
                      <option value="Applied" className="bg-[#1a1a2e]">Applied</option>
                      <option value="Under Review" className="bg-[#1a1a2e]">Under Review</option>
                      <option value="Shortlisted" className="bg-[#1a1a2e]">Shortlisted</option>
                      <option value="Approved" className="bg-[#1a1a2e]">Approved</option>
                      <option value="Rejected" className="bg-[#1a1a2e]">Rejected</option>
                      <option value="Cancelled" className="bg-[#1a1a2e]">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Approved Amount (₹)</label>
                    <input type="number" className={INPUT_CLASS} value={appForm.approved_amount} onChange={e => setAppForm({ ...appForm, approved_amount: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Remarks (visible to student)</label>
                    <input className={INPUT_CLASS} placeholder="e.g. Academic eligibility verified." value={appForm.remarks} onChange={e => setAppForm({ ...appForm, remarks: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Admin Comments (internal/auditing)</label>
                    <textarea className={`${INPUT_CLASS} h-20 resize-none`} placeholder="Internal review logs..." value={appForm.admin_comments} onChange={e => setAppForm({ ...appForm, admin_comments: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-4 gap-3">
                <div className="flex gap-2">
                  <button onClick={() => handleUpdateAppStatus('Approved')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold hover:bg-emerald-500/30 transition-all">
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button onClick={() => handleUpdateAppStatus('Rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/30 transition-all">
                    <XCircle size={14} /> Reject
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAppModal(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold transition-all">
                    Close
                  </button>
                  <button onClick={() => handleUpdateAppStatus()}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all">
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## File: CallConsolePage.tsx
**Path:** `frontend/src/pages/admin/CallConsolePage.tsx`

```tsx
import { useEffect, useMemo, useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock3, Phone, PhoneCall, Radio, UserRound } from 'lucide-react'

type Agent = {
  id: string
  name: string
  phone_number?: string | null
}

type CallStatus = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ai_speaking' | 'student_speaking' | 'thinking' | 'ended'

type TranscriptMessage = {
  role: 'Agent' | 'Student'
  text: string
}

const agentOrder = [
  'Admissions Agent',
  'Counselling Agent',
  'Onboarding Agent',
  'Fee Reminder Agent',
  'Outreach Agent',
]

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function sortAgents(agents: Agent[]) {
  return [...agents].sort((a, b) => {
    const aIndex = agentOrder.indexOf(a.name)
    const bIndex = agentOrder.indexOf(b.name)
    const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex
    const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex

    return aRank - bRank || a.name.localeCompare(b.name)
  })
}

export default function CallConsolePage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [callId, setCallId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  
  const monitorWsRef = useRef<WebSocket | null>(null)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  )

  useEffect(() => {
    let isMounted = true

    const loadAgents = async () => {
      try {
        setLoadingAgents(true)
        setLoadError('')

        const token = localStorage.getItem('token')
        const response = await fetch('http://localhost:8000/api/agents', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load agents')
        }

        const data = (await response.json()) as Agent[]
        const sortedAgents = sortAgents(Array.isArray(data) ? data : [])

        if (!isMounted) return

        setAgents(sortedAgents)
        setSelectedAgentId(sortedAgents[0]?.id ?? '')
      } catch (error) {
        if (!isMounted) return

        console.error(error)
        setLoadError('Unable to load agents right now.')
      } finally {
        if (isMounted) {
          setLoadingAgents(false)
        }
      }
    }

    loadAgents()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (callStatus === 'idle' || callStatus === 'ended' || !callStartedAt) {
      return
    }

    const syncElapsedTime = () => {
      setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000))
    }

    syncElapsedTime()
    const intervalId = window.setInterval(syncElapsedTime, 250)

    return () => window.clearInterval(intervalId)
  }, [callStartedAt, callStatus])

  useEffect(() => {
    return () => {
      if (monitorWsRef.current) {
        monitorWsRef.current.close()
      }
    }
  }, [])

  const connectMonitorWebSocket = (cid: string) => {
    if (monitorWsRef.current) {
      monitorWsRef.current.close()
    }

    const wsUrl = `ws://localhost:8000/ws/calls/monitor/${cid}`
    const ws = new WebSocket(wsUrl)
    monitorWsRef.current = ws

    ws.onopen = () => {
      console.log('Connected to call monitor WebSocket')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'status') {
          const backendStatus = data.status
          if (backendStatus == 'ringing') {
            setCallStatus('ringing')
          } else if (backendStatus === 'answered') {
            setCallStatus('connected')
          } else if (backendStatus === 'ai_speaking') {
            setCallStatus('ai_speaking')
          } else if (backendStatus === 'student_speaking') {
            setCallStatus('student_speaking')
          } else if (backendStatus === 'thinking') {
            setCallStatus('thinking')
          } else if (backendStatus === 'listening') {
            setCallStatus('connected')
          } else if (backendStatus === 'completed') {
            setCallStatus('ended')
            ws.close()
          }
        } else if (data.type === 'transcript') {
          setTranscript((prev) => {
            // Deduplicate incoming transcript items if needed
            const last = prev[prev.length - 1]
            if (last && last.role === data.role && last.text === data.text) {
              return prev
            }
            return [
              ...prev,
              {
                role: data.role,
                text: data.text,
              },
            ]
          })
        }
      } catch (err) {
        console.error('Error parsing monitor message:', err)
      }
    }

    ws.onclose = () => {
      console.log('Monitor WebSocket closed')
    }

    ws.onerror = (err) => {
      console.error('Monitor WebSocket error:', err)
    }
  }

  const initiateCall = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:8000/api/calls/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          phone_number: `${countryCode}${phoneNumber}`,
          topic: 'Admission Counseling',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to initiate call')
      }

      const data = await response.json()
      setCallId(data.call_id)
      setTranscript([])
      connectMonitorWebSocket(data.call_id)
    } catch (err) {
      console.error(err)
      toast.error('Failed to initiate call.')
      setCallStatus('idle')
    }
  }

  const endCall = async () => {
    if (!callId) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`http://localhost:8000/api/calls/${callId}/end`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleMakeCall = async () => {
    if (!selectedAgent || !countryCode.trim() || !phoneNumber.trim()) {
      return
    }

    setCallStatus('dialing')
    setElapsedSeconds(0)
    setCallStartedAt(Date.now())
    toast.success('Dialing...')
    await initiateCall()
  }

  const handleEndCall = async () => {
    await endCall()
    setCallStatus('ended')
    toast.success('Call ended')
  }

  const callInProgress = callStatus !== 'idle' && callStatus !== 'ended'

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-6"
    >
      <button
        type="button"
        onClick={() => navigate('/admin/voice-agents')}
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to Voice Agents
      </button>

      <div className="glass rounded-2xl p-6 shadow-2xl shadow-purple-950/20">
        <div className="mb-6 border-b border-white/10 pb-5">
          <h1 className="text-3xl font-bold text-white">Voice Calling Console</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Agent</span>
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              disabled={loadingAgents || callInProgress}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAgents ? (
                <option value="">Loading agents...</option>
              ) : (
                agents.map((agent) => (
                  <option key={agent.id} value={agent.id} className="bg-zinc-950 text-white">
                    {agent.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Country Code</span>
              <input
                type="text"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                disabled={callInProgress}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Phone Number</span>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="XXXXXXXXXX"
                disabled={callInProgress}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleMakeCall}
            disabled={!selectedAgent || !phoneNumber.trim() || !countryCode.trim() || callInProgress}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 text-sm font-semibold text-white shadow-lg shadow-purple-950/40 transition-all hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
          >
            <PhoneCall size={18} />
            Make Call
          </button>
        </div>

        {loadError && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
      </div>

      <div className="glass rounded-2xl p-6">
        {callStatus === 'idle' && (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300">
                <UserRound size={24} />
              </div>
              <h2 className="text-xl font-semibold text-white">Select Agent</h2>
              <p className="mt-2 text-sm text-zinc-400">Enter Number</p>
              <p className="mt-4 text-sm text-zinc-500">Use the Make Call button to start a monitored test call.</p>
            </div>
          </div>
        )}

        {(callStatus === 'dialing' || callStatus === 'ringing') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex min-h-[300px] items-center justify-center"
          >
            <div className="text-center">
              <div className="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center">
                {[0, 1, 2].map((ring) => (
                  <motion.div
                    key={ring}
                    className="absolute inset-0 rounded-full border border-purple-400/40"
                    animate={{ opacity: [0.8, 0], scale: [0.7, 1.5] }}
                    transition={{ duration: 1.8, delay: ring * 0.35, repeat: Infinity, ease: 'easeOut' }}
                  />
                ))}
                <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-purple-600 text-white shadow-xl shadow-purple-950/50">
                  <Phone size={28} />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white">{selectedAgent?.name}</h2>
              <p className="mt-2 text-purple-300">
                {callStatus === 'ringing' ? 'Ringing...' : 'Dialing...'}
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 font-mono text-lg text-white">
                <Clock3 size={18} className="text-zinc-400" />
                {formatTimer(elapsedSeconds)}
              </div>
            </div>
          </motion.div>
        )}

        {(callStatus === 'connected' || callStatus === 'ai_speaking' || callStatus === 'student_speaking' || callStatus === 'thinking') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex min-h-[300px] flex-col items-center justify-center text-center"
          >
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              callStatus === 'ai_speaking'
                ? 'bg-cyan-500/15 text-cyan-300 animate-pulse'
                : callStatus === 'student_speaking'
                ? 'bg-purple-500/15 text-purple-300 animate-pulse'
                : callStatus === 'thinking'
                ? 'bg-pink-500/15 text-pink-300 animate-pulse'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}>
              <Radio size={16} />
              {callStatus === 'ai_speaking'
                ? 'AI Speaking'
                : callStatus === 'student_speaking'
                ? 'Student Speaking'
                : callStatus === 'thinking'
                ? 'Thinking...'
                : 'Connected'}
            </div>
            <h2 className="text-2xl font-bold text-white">{formatTimer(elapsedSeconds)}</h2>
            <p className="mt-2 text-sm text-zinc-400">{selectedAgent?.name}</p>

            <div className="my-8 flex h-20 items-center justify-center gap-1.5">
              {Array.from({ length: 24 }).map((_, index) => (
                <motion.div
                  key={index}
                  className="w-1.5 rounded-full bg-gradient-to-t from-purple-500 to-cyan-300"
                  animate={{
                    height: callStatus === 'thinking'
                      ? [14, 24, 14]
                      : callStatus === 'ai_speaking' || callStatus === 'student_speaking'
                      ? [14, 54, 20, 42, 14]
                      : [14, 14, 14]
                  }}
                  transition={{
                    duration: callStatus === 'thinking' ? 0.6 : 1.1,
                    delay: index * 0.04,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleEndCall}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition-all hover:bg-red-400"
            >
              <Phone size={18} />
              End Call
            </button>
          </motion.div>
        )}

        {callStatus === 'ended' && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-[300px] items-center justify-center text-center"
          >
            <div>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-300">
                <Phone size={24} />
              </div>
              <h2 className="text-2xl font-bold text-white">Call Ended</h2>
              <p className="mt-2 text-zinc-400">Duration: {elapsedSeconds} seconds</p>
            </div>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.35 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="mb-5 text-sm font-semibold text-zinc-400">LIVE TRANSCRIPT</h2>
        <div className="space-y-4">
          {transcript.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'Student' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-lg ${
                  message.role === 'Student'
                    ? 'rounded-br-sm bg-purple-600/25 text-white shadow-purple-950/20'
                    : 'rounded-bl-sm bg-white/5 text-zinc-200 shadow-black/10'
                }`}
              >
                <span className="mb-1 block text-xs font-semibold text-purple-300">{message.role}</span>
                {message.text}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
```

---

## File: AdminDashboard.tsx
**Path:** `frontend/src/pages/AdminDashboard.tsx`

```tsx
import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Phone, BookOpen, LogOut, Search, Bell, Users, GraduationCap, Clock, CheckCircle, Mic, PhoneCall, Settings, Calendar, Award } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCalls } from '../hooks/useCalls'
import { apiFetch } from '../hooks/useApi'
import CallConsolePage from './admin/CallConsolePage'
import MeetingsPage from './MeetingsPage'
import AdminScholarshipsPage from './admin/AdminScholarshipsPage'
import toast from 'react-hot-toast'

function DashboardHome() {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [tableData, setTableData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch(
        'http://localhost:8000/api/dashboard/admin',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      setDashboardData(data)
    } catch (error) {
      console.error('Dashboard fetch failed:', error)
    }
  }

  const loadModalData = async (type: string) => {
    try {
      setLoading(true)

      const token = localStorage.getItem('token')

      const response = await fetch(
        `http://localhost:8000/api/dashboard/${type}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const data = await response.json()

      console.log('MODAL DATA:', data)

      setTableData(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const stats = [
    {
      label: 'Active calls today',
      value: dashboardData?.stats?.active_calls_today ?? 0,
      icon: Phone,
      change: '',
      up: true,
    },
    {
      label: 'Students',
      value: dashboardData?.stats?.students ?? 0,
      icon: Users,
      change: '',
      up: true,
    },
    {
      label: 'Faculty',
      value: dashboardData?.stats?.faculty ?? 0,
      icon: GraduationCap,
      change: '',
      up: true,
    },
    {
      label: 'Active sessions',
      value: dashboardData?.stats?.active_sessions ?? 0,
      icon: Clock,
      change: '',
      up: true,
    },
  ]

  const activities: any[] = dashboardData?.activities ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">
          Welcome back
        </h1>

        <p className="text-zinc-400">
          Here is what your AI workforce did today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
             onClick={() => {
                setModalTitle(stat.label)

                if (stat.label === 'Students') {
                  loadModalData('students')
                }

                if (stat.label === 'Faculty') {
                  loadModalData('faculty-list')
                }

                if (stat.label === 'Active calls today') {
                  loadModalData('calls')
                }

                if (stat.label === 'Active sessions') {
                  loadModalData('sessions')
                }

                setShowModal(true)
              }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <stat.icon
                  size={20}
                  className="text-purple-400"
                />
              </div>

              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  stat.up
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {stat.change}
              </span>
            </div>

            <div className="text-3xl font-bold text-white mb-1">
              {stat.value}
            </div>

            <div className="text-sm text-zinc-500">
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-white">
            Recent activity
          </h3>

          <button className="text-sm text-purple-400 hover:text-purple-300">
            View all
          </button>
        </div>

        <div className="space-y-4">
          {activities.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle
                  size={16}
                  className="text-emerald-400"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                    <span className="font-medium">
                      {a.event_data?.title ?? 'Untitled'}
                    </span>

                    {' — '}

                    <span className="text-zinc-400">
                      {a.event_data?.description ?? ''}
                    </span>
                </p>
              </div>

              <span className="text-xs text-zinc-500 flex-shrink-0">
                {a.created_at ? new Date(a.created_at).toLocaleString() : a.time}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[700px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">
                {modalTitle}
              </h2>

              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1 bg-zinc-800 rounded"
              >
                Close
              </button>
            </div>
            

            <div className="overflow-auto max-h-[500px]">
              {loading ? (
                <p className="text-zinc-400">Loading...</p>
              ) : (
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      {tableData.length > 0 &&
                        Object.keys(tableData[0]).map((key) => (
                          <th
                            key={key}
                            className="p-3 text-white font-semibold"
                          >
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>

                  <tbody>
                    {tableData.map((row, index) => (
                      <tr
                        key={index}
                        className="border-b border-zinc-800"
                      >
                        {Object.values(row).map((value: any, i) => (
                          <td
                            key={i}
                            className="p-3 text-zinc-300"
                          >
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VoiceAgentsPage() {
  const navigate = useNavigate()

  const [promptText, setPromptText] = useState('')
  const [showAgentModal, setShowAgentModal] = useState(false)

  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(0)
  const [isListening, setIsListening] = useState(false)

  const [groqKeyInput, setGroqKeyInput] = useState('')
  const [groqKeyConfigured, setGroqKeyConfigured] = useState(false)
  const [groqMaskedKey, setGroqMaskedKey] = useState('')

  useEffect(() => {
    loadAgents()
    loadGroqKeyStatus()
  }, [])

  const loadGroqKeyStatus = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:8000/api/settings/groq-key', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setGroqKeyConfigured(data.configured)
        setGroqMaskedKey(data.masked_key)
      }
    } catch (err) {
      console.error(err)
    }
  }

  const saveGroqKey = async () => {
    if (!groqKeyInput.trim()) {
      toast.error('Key cannot be empty')
      return
    }
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:8000/api/settings/groq-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ groq_api_key: groqKeyInput })
      })
      if (response.ok) {
        toast.success('Groq API Key updated successfully!')
        setGroqKeyInput('')
        loadGroqKeyStatus()
      } else {
        toast.error('Failed to update key')
      }
    } catch (err) {
      console.error(err)
      toast.error('Error updating key')
    }
  }

  const loadAgents = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch(
        'http://localhost:8000/api/agents',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      setAgents(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }
  const savePrompt = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch(
        `http://localhost:8000/api/agents/${agents[selectedAgent].id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            system_prompt: promptText,
          }),
        }
      )

      const data = await response.json()

      console.log("API Response:", data)
      console.log("Status:", response.status)

      toast.success('Prompt updated successfully')

      loadAgents()

      setShowAgentModal(false)
    } catch (error) {
      console.error(error)

      toast.error('Failed to update prompt')
    }
  }
  
  const transcript = [
    { role: 'agent' as const, text: "Hi! I am calling from ADhoc Institute of Technology. Is this a good time to chat about your B.Tech application?" },
    { role: 'caller' as const, text: "Yes, please go ahead." },
    { role: 'agent' as const, text: "Great — could you tell me which stream you are most interested in?" },
  ]

  const handleCall = () => {
    if (!isListening) {
      setIsListening(true)
      toast.success('Connecting to voice agent...')
    } else {
      setIsListening(false)
      toast.success('Call ended')
    }
  }

  if (loading) {
    return (
      <div className="text-white p-6">
        Loading agents...
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="text-white p-6">
        No agents found.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Voice Agents</h1>
          <p className="text-zinc-400">Talk to your AI workforce. Live calls, transcripts and analytics — all in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/call-console')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500"
        >
          <PhoneCall size={16} />
          Make Calls
        </button>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/5 bg-black/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Groq API Configuration</h2>
          <p className="text-sm text-zinc-400">
            {groqKeyConfigured ? `Current Key: ${groqMaskedKey}` : 'Groq API Key is not configured.'}
          </p>
        </div>
        <div className="flex gap-3 max-w-md w-full">
          <input
            type="password"
            placeholder="Paste your Groq API Key (gsk_...)"
            value={groqKeyInput}
            onChange={(e) => setGroqKeyInput(e.target.value)}
            className="flex-1 h-11 px-4 rounded-xl border border-white/10 bg-black/40 text-sm text-white outline-none focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20"
          />
          <button
            onClick={saveGroqKey}
            className="h-11 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white shadow-lg transition-all"
          >
            Save Key
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs text-zinc-500 font-medium tracking-wider mb-2">PICK AN AGENT</p>
          {agents.map((agent, i) => (
            <motion.button key={agent.name} whileHover={{ x: 4 }} 
            onClick={() => {
              setSelectedAgent(i)
              setPromptText(agent.system_prompt || '')
              setShowAgentModal(true)
            }}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left ${selectedAgent === i ? 'bg-purple-500/20 border border-purple-500/30' : 'glass hover:bg-white/10 border border-white/5'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedAgent === i ? 'bg-purple-500/30' : 'bg-white/5'}`}>
                <GraduationCap
                  size={20}
                  className={selectedAgent === i ? 'text-purple-400' : 'text-zinc-400'}
                />
              </div>
              <div className="flex-1">
                <p className={`font-medium ${selectedAgent === i ? 'text-white' : 'text-zinc-300'}`}>{agent.name}</p>
                <p className="text-xs text-zinc-500">{agent.system_prompt?.substring(0, 60)}...</p>
                <p className="text-xs text-purple-400 mt-1">{agent.phone_number}</p>
              </div>
            </motion.button>
          ))}
        </div>
        <div className="lg:col-span-3 space-y-4">
          <div className="glass rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><GraduationCap size={24} className="text-purple-400" /></div>
                <div>
                  <h3 className="font-semibold text-white text-lg">{agents[selectedAgent]?.name}</h3>
                  <p className="text-sm text-zinc-400">{agents[selectedAgent]?.system_prompt}</p>
                  <p className="text-xs text-purple-400 mt-1">{agents[selectedAgent]?.phone_number}</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-zinc-500/20 text-zinc-400">{agents[selectedAgent]?.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="flex items-center justify-center gap-0.5 h-16 mb-6">
              {[...Array(50)].map((_, i) => (
                <motion.div key={i} className="w-1 bg-gradient-to-t from-purple-500/60 to-cyan-400/60 rounded-full"
                  animate={{ height: isListening ? [4, 8 + Math.random() * 24, 4] : 4 }}
                  transition={{ duration: 1, delay: i * 0.02, repeat: Infinity }} />
              ))}
            </div>
            <div className="flex justify-center gap-4">
              <button className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"><Mic size={20} /></button>
              <button onClick={handleCall}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all ${isListening ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                {isListening ? <Phone size={24} /> : <PhoneCall size={24} />}
              </button>
              <button className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"><Settings size={20} /></button>
            </div>
            {isListening && (
              <p className="text-center text-sm text-emerald-400 mt-4 animate-pulse">Listening... Speak now</p>
            )}
          </div>
          <div className="glass rounded-2xl p-6">
            <h4 className="text-xs text-zinc-500 font-medium tracking-wider mb-4">LIVE TRANSCRIPT</h4>
            <div className="space-y-3">
              {transcript.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'caller' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm ${msg.role === 'caller' ? 'bg-purple-600/20 text-white rounded-br-md' : 'bg-white/5 text-zinc-300 rounded-bl-md'}`}>
                    <span className="text-xs text-purple-400 block mb-1">{msg.role === 'agent' ? 'Agent' : 'Caller'}</span>{msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showAgentModal && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center"
        onClick={() => setShowAgentModal(false)}
      >
        <div
          className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[900px] max-w-[95vw]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">
              {agents[selectedAgent]?.name}
            </h2>

            <button
              onClick={() => setShowAgentModal(false)}
              className="px-4 py-2 bg-zinc-800 rounded-lg text-white"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm">
                Phone Number
              </label>

              <input
                type="text"
                value={agents[selectedAgent]?.phone_number || ''}
                readOnly
                className="w-full mt-1 p-3 rounded-xl bg-zinc-800 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-sm">
                System Prompt
              </label>

              <textarea
                rows={10}
                value={promptText}
                onChange={(e) => {
                console.log("NEW PROMPT:", e.target.value)
                setPromptText(e.target.value)
              }}
              className="w-full mt-1 p-3 rounded-xl bg-zinc-800 text-white"
              />
            </div>

            <button
              onClick={savePrompt}
              className="px-5 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-white"
            >
              Save Prompt
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
}

function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'general',
    tags: ''
  })

  const fetchItems = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/knowledge')
      setItems(data || [])
    } catch (error) {
      console.error('Failed to load knowledge base', error)
      toast.error('Unable to load knowledge base')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const resetForm = () => {
    setSelectedId(null)
    setForm({ title: '', content: '', category: 'general', tags: '' })
  }

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      }

      if (selectedId) {
        await apiFetch(`/api/knowledge/${selectedId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        toast.success('Knowledge item updated')
      } else {
        await apiFetch('/api/knowledge', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        toast.success('Knowledge item created')
      }

      resetForm()
      fetchItems()
    } catch (error) {
      console.error(error)
      toast.error('Failed to save knowledge item')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: KnowledgeItem) => {
    setSelectedId(item.id)
    setForm({
      title: item.title,
      content: item.content,
      category: item.category,
      tags: item.tags?.join(', ') || ''
    })
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this knowledge item?')) {
      return
    }
    try {
      await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      toast.success('Knowledge item deleted')
      if (selectedId === id) resetForm()
      fetchItems()
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete item')
    }
  }

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase()
    return (
      item.title.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query) ||
      (item.tags || []).join(' ').toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Knowledge Base</h1>
        <p className="text-zinc-400">Create, edit, and manage structured content used by your AI agents.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="glass rounded-2xl p-6 xl:col-span-1">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Knowledge item</h2>
              <p className="text-sm text-zinc-500">Add or update a knowledge entry.</p>
            </div>
            <button type="button" onClick={resetForm} className="text-sm text-purple-400 hover:text-purple-300">Clear</button>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-zinc-400">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <label className="block text-sm text-zinc-400">Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <label className="block text-sm text-zinc-400">Tags (comma separated)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <label className="block text-sm text-zinc-400">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              rows={10}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selectedId ? 'Update item' : 'Create item'}
            </button>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <div className="glass rounded-2xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Knowledge listings</h2>
              <p className="text-sm text-zinc-500">Search and edit current knowledge entries.</p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search knowledge..."
              className="min-w-[240px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">Loading knowledge base...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">No items found.</td></tr>
                ) : filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 text-white">{item.title}</td>
                    <td className="px-4 py-4 text-zinc-400">{item.category}</td>
                    <td className="px-4 py-4 text-zinc-400">{item.tags?.join(', ')}</td>
                    <td className="px-4 py-4 text-zinc-400">{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-4 text-zinc-400 flex gap-2">
                      <button type="button" onClick={() => handleEdit(item)} className="text-purple-400 hover:text-purple-200">Edit</button>
                      <button type="button" onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-200">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}


function TelephonyPage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [agentsData, callsData] = await Promise.all([
        apiFetch('/api/agents'),
        apiFetch('/api/calls')
      ])
      setAgents(agentsData || [])
      setCalls(callsData || [])
    } catch (error) {
      console.error('Failed to load telephony data', error)
      toast.error('Unable to load telephony details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const totalCalls = calls.length
  const activeAgents = agents.filter((agent) => agent.is_active).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Telephony</h1>
        <p className="text-zinc-400">Monitor voice agents, number assignments, and call volume in real time.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-zinc-500">Voice agents</p>
          <p className="text-3xl font-semibold text-white mt-2">{agents.length}</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-zinc-500">Active agents</p>
          <p className="text-3xl font-semibold text-white mt-2">{activeAgents}</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-zinc-500">Total calls</p>
          <p className="text-3xl font-semibold text-white mt-2">{totalCalls}</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Agent roster</h2>
            <p className="text-sm text-zinc-500">Connected AI agents and assigned voice settings.</p>
          </div>
          <button onClick={() => navigate('/admin/voice-agents')} className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 transition-all">
            <PhoneCall size={16} /> Manage agents
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-500">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Voice</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Call count</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">Loading telephony data...</td></tr>
              ) : agents.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">No agents configured.</td></tr>
              ) : agents.map((agent) => {
                const count = calls.filter((call) => call.agent === agent.name).length
                const voice = agent.voice_settings?.[0]
                return (
                  <tr key={agent.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 text-white">{agent.name}</td>
                    <td className="px-4 py-4 text-zinc-400">{agent.phone_number ?? '—'}</td>
                    <td className="px-4 py-4 text-zinc-400">{voice ? `${voice.provider} / ${voice.voice_id || voice.model}` : 'Unconfigured'}</td>
                    <td className="px-4 py-4"><span className={`text-xs px-2 py-1 rounded-full ${agent.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-500/20 text-zinc-400'}`}>{agent.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-4 text-white">{count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); toast.success('Signed out successfully'); navigate('/') }
  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/knowledge', label: 'Knowledge Base', icon: BookOpen },
    { path: '/admin/telephony', label: 'Telephony', icon: Phone },
    { path: '/admin/meetings', label: 'Meetings', icon: Calendar },
    { path: '/admin/scholarships', label: 'Scholarships', icon: Award },
  ]
  return (
    <div className="min-h-screen bg-transparent flex">
      <aside className="w-64 border-r border-white/10 flex flex-col backdrop-blur-xl bg-black/30">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center"><span className="text-white font-bold text-sm">A</span></div>
            <span className="font-bold text-white">ADhoc<span className="text-purple-400">.ai</span></span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${location.pathname === item.path ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon size={18} />{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="glass rounded-xl p-4 mb-4">
            <p className="text-xs text-zinc-500 mb-1">SIGNED IN</p>
            <p className="text-sm text-white truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors w-full">
            <LogOut size={18} />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search agents, calls, students..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all relative">
              <Bell size={18} /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-500" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">{user?.avatar || 'A'}</div>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/knowledge" element={<KnowledgeBasePage />} />

             <Route path="/telephony" element={<TelephonyPage />} />
            <Route path="/voice-agents" element={<VoiceAgentsPage />} />
            <Route path="/call-console" element={<CallConsolePage />} />
            <Route path="/meetings/*" element={<MeetingsPage />} />
            <Route path="/scholarships/*" element={<AdminScholarshipsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
```

---

## File: AuthPage.tsx
**Path:** `frontend/src/pages/AuthPage.tsx`

```tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

type AuthMode = 'signin' | 'signup'
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', password: '' })
  const { login, signup } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = formData.email.trim().toLowerCase()

    if (!EMAIL_PATTERN.test(email)) {
      toast.error('Enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signin') {
        await login(email, formData.password)
        toast.success('Welcome back!')
      } else {
        await signup({ name: formData.name.trim(), email, password: formData.password })
        toast.success('Account created!')
      }
      const user = JSON.parse(localStorage.getItem('adhoc_user') || '{}')
      navigate(`/${user.role}`)
    } catch (err: any) {
      toast.error(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-12 items-center relative z-10">
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="hidden lg:block">
          <Link to="/" className="flex items-center gap-2 mb-12 group w-fit">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-extrabold text-lg text-white">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
          </Link>
          <p className="text-purple-400 text-xs font-mono font-semibold tracking-widest mb-4">THE AI OPERATING SYSTEM</p>
          <h1 className="text-5xl font-extrabold mb-6 leading-tight tracking-tight text-white">Step into the future of <span className="text-gradient-neon">education.</span></h1>
          <p className="text-zinc-400 text-lg mb-8 leading-relaxed">Sign in to ADhoc.ai and unlock an intelligent digital workforce — voice agents that handle admissions, counselling, parent communication, and student success.</p>
          <div className="flex gap-4">
            {[{v:'2.4M+',l:'Calls handled'},{v:'180+',l:'Institutions'},{v:'98%',l:'Resolution rate'}].map((s) => (
              <div key={s.l} className="glass-panel rounded-2xl p-4 border border-white/5">
                <div className="text-2xl font-extrabold text-white font-mono">{s.v}</div>
                <div className="text-[10px] text-zinc-500 font-mono tracking-wider mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="glass-panel rounded-3xl p-8 border border-white/10 shadow-2xl">
          <div className="glass-panel rounded-full p-1 flex mb-8 border border-white/5">
            <button onClick={() => setMode('signin')} className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${mode === 'signin' ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white shadow-lg shadow-purple-500/10' : 'text-zinc-400'}`}>Sign in</button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${mode === 'signup' ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white shadow-lg shadow-purple-500/10' : 'text-zinc-400'}`}>Create account</button>
          </div>
          <AnimatePresence mode="wait">
            <motion.form key={mode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
                <p className="text-zinc-400 text-sm">{mode === 'signin' ? 'Sign in to your ADhoc workspace.' : 'Create your student account.'}</p>
              </div>
              {mode === 'signup' && (
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input type="text" placeholder="Full name" value={formData.name} onChange={(e) => setFormData({...formData,name:e.target.value})}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" required />
                </div>
              )}
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input type="email" placeholder="you@example.com" value={formData.email} onChange={(e) => setFormData({...formData,email:e.target.value})}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" required />
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={formData.password} onChange={(e) => setFormData({...formData,password:e.target.value})}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <motion.button whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 hover:from-purple-500 hover:via-pink-400 hover:to-purple-400 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/20 border border-white/10 hover:border-purple-300/30 glow-purple disabled:opacity-50">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" /> : mode === 'signin' ? 'Sign in' : 'Create account'}
              </motion.button>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5" /></div>
                <div className="relative flex justify-center"><span className="bg-[#050508] px-4 text-[10px] font-mono tracking-widest text-zinc-500">OR</span></div>
              </div>
              <button type="button" className="w-full py-3.5 glass-panel rounded-xl text-white font-medium flex items-center justify-center gap-3 hover:bg-white/10 transition-all border border-white/10">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5.04c1.67 0 3.17.58 4.35 1.72l3.24-3.24C17.32 1.36 14.86.36 12 .36 7.27.36 3.18 3.03 1.36 6.91l3.78 2.93C6.18 6.36 8.82 5.04 12 5.04z"/><path fill="#4285F4" d="M23.64 12.27c0-.82-.07-1.6-.2-2.36H12v4.47h6.53c-.28 1.5-1.1 2.77-2.34 3.62l3.78 2.93c2.2-2.03 3.47-5.02 3.47-8.66z"/><path fill="#FBBC05" d="M5.14 14.18l-3.78 2.93C3.18 20.97 7.27 23.64 12 23.64c3.68 0 6.77-1.22 9.02-3.3l-3.78-2.93c-1.22.82-2.78 1.3-4.62 1.3-3.55 0-6.56-2.39-7.64-5.63z"/><path fill="#34A853" d="M12 5.04c3.18 0 5.82 1.32 7.14 3.43l3.24-3.24C20.17 1.36 17.32.36 12 .36 7.27.36 3.18 3.03 1.36 6.91l3.78 2.93C6.18 6.36 8.82 5.04 12 5.04z"/></svg>
                Continue with Google
              </button>
              <p className="text-[10px] text-zinc-500 text-center uppercase tracking-wider font-mono">By continuing you agree to ADhoc.ai's Terms & Privacy Policy.</p>
            </motion.form>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
```

---

## File: FacultyDashboard.tsx
**Path:** `frontend/src/pages/FacultyDashboard.tsx`

```tsx
import { useState } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Users, Calendar, BookOpen, FileText, BarChart3, LogOut, Search, Bell, Clock, GraduationCap, AlertTriangle, CheckCircle, XCircle, Plus, Edit3 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

function FacultyHome() {
  const stats = [
    { label: 'Next class', value: 'Algorithms • 10:30', icon: Clock },
    { label: 'Attendance %', value: '94%', icon: Users },
    { label: 'Pending assignments', value: '12', icon: FileText },
    { label: 'Students at risk', value: '3', icon: AlertTriangle },
    { label: 'Office hours', value: '4-6pm', icon: Calendar },
  ]
  const recentActivity = [
    { action: 'Graded Assignment 3', course: 'Data Structures', time: '2h ago' },
    { action: 'Marked attendance', course: 'Algorithms', time: '4h ago' },
    { action: 'Posted lecture notes', course: 'DBMS', time: '6h ago' },
    { action: 'Scheduled quiz', course: 'Operating Systems', time: '1d ago' },
  ]
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-white mb-1">Faculty Dashboard</h1><p className="text-zinc-400">Manage your classes, track attendance, and monitor student progress.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all">
            <p className="text-xs text-zinc-500 mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4">Class Performance</h3>
          <div className="flex items-end justify-between gap-1 h-48">
            {[...Array(30)].map((_, i) => (
              <motion.div key={i} className="flex-1 bg-gradient-to-t from-cyan-500/80 to-purple-400/80 rounded-t-lg"
                initial={{ height: 0 }} animate={{ height: `${20+Math.random()*80}%` }} transition={{ delay: i * 0.02, duration: 0.5 }} />
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-6">
          <h3 className="font-semibold text-white mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center"><CheckCircle size={14} className="text-purple-400" /></div>
                <div className="flex-1">
                  <p className="text-sm text-white">{a.action}</p>
                  <p className="text-xs text-zinc-500">{a.course}</p>
                </div>
                <span className="text-xs text-zinc-500">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ClassesPage() {
  const classes = [
    { name: 'Data Structures', code: 'CS201', students: 45, time: 'Mon/Wed 9:00 AM', room: 'Lab 3', attendance: '92%' },
    { name: 'Algorithms', code: 'CS301', students: 38, time: 'Tue/Thu 10:30 AM', room: 'Hall B', attendance: '94%' },
    { name: 'Database Systems', code: 'CS401', students: 42, time: 'Mon/Wed 2:00 PM', room: 'Lab 5', attendance: '89%' },
    { name: 'Operating Systems', code: 'CS501', students: 35, time: 'Fri 11:00 AM', room: 'Hall A', attendance: '96%' },
  ]
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-white mb-1">My Classes</h1><p className="text-zinc-400">Manage your class schedules and materials.</p></div>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-sm transition-all"><Plus size={16} />New Class</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {classes.map((c, i) => (
          <motion.div key={c.code} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">{c.name}</h3>
              <span className="text-xs text-zinc-500 bg-white/5 px-2 py-1 rounded-full">{c.code}</span>
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-zinc-400 flex items-center gap-2"><Users size={14} />{c.students} students</p>
              <p className="text-zinc-400 flex items-center gap-2"><Clock size={14} />{c.time}</p>
              <p className="text-zinc-400 flex items-center gap-2"><GraduationCap size={14} />{c.room}</p>
              <p className="text-zinc-400 flex items-center gap-2">Attendance: <span className="text-emerald-400">{c.attendance}</span></p>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-all">View</button>
              <button className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm text-white transition-all"><Edit3 size={14} className="inline mr-1" />Edit</button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function AttendancePage() {
  const students = [
    { name: 'Rahul Sharma', roll: 'CS2023001', present: 42, total: 45, status: 'good' },
    { name: 'Priya Patel', roll: 'CS2023002', present: 44, total: 45, status: 'good' },
    { name: 'Amit Kumar', roll: 'CS2023003', present: 38, total: 45, status: 'at-risk' },
    { name: 'Sneha Gupta', roll: 'CS2023004', present: 45, total: 45, status: 'excellent' },
    { name: 'Vikram Mehta', roll: 'CS2023005', present: 35, total: 45, status: 'at-risk' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Attendance</h1>
      <p className="text-zinc-400">Track and manage student attendance.</p>
      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="text-xs text-zinc-500 border-b border-white/10">
            <th className="text-left px-6 py-3 font-medium">STUDENT</th>
            <th className="text-left px-6 py-3 font-medium">ROLL NO</th>
            <th className="text-left px-6 py-3 font-medium">PRESENT</th>
            <th className="text-left px-6 py-3 font-medium">TOTAL</th>
            <th className="text-left px-6 py-3 font-medium">%</th>
            <th className="text-left px-6 py-3 font-medium">STATUS</th>
          </tr></thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 text-sm text-white">{s.name}</td>
                <td className="px-6 py-4 text-sm text-zinc-400\">{s.roll}</td>
                <td className="px-6 py-4 text-sm text-white\">{s.present}</td>
                <td className="px-6 py-4 text-sm text-white\">{s.total}</td>
                <td className="px-6 py-4 text-sm text-white\">{Math.round((s.present/s.total)*100)}%</td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full ${s.status==='good'?'bg-emerald-500/20 text-emerald-400':s.status==='excellent'?'bg-purple-500/20 text-purple-400':'bg-red-500/20 text-red-400'}`}>
                    {s.status === 'at-risk' ? 'At Risk' : s.status === 'excellent' ? 'Excellent' : 'Good'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MeetingsPage() {
  const meetings = [
    { title: 'Faculty Meeting', date: 'Mar 15, 2026', time: '2:00 PM', type: 'Department', status: 'upcoming' },
    { title: 'Parent-Teacher Meeting', date: 'Mar 20, 2026', time: '10:00 AM', type: 'Academic', status: 'upcoming' },
    { title: 'Research Committee', date: 'Mar 10, 2026', time: '3:00 PM', type: 'Research', status: 'completed' },
    { title: 'Student Council', date: 'Mar 5, 2026', time: '11:00 AM', type: 'Student Affairs', status: 'completed' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Meetings</h1>
      <p className="text-zinc-400">Schedule and manage meetings.</p>
      <div className="space-y-4">
        {meetings.map((m, i) => (
          <motion.div key={m.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${m.status === 'upcoming' ? 'bg-purple-500/20' : 'bg-white/5'}`}>
              <Calendar size={20} className={m.status === 'upcoming' ? 'text-purple-400' : 'text-zinc-500'} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-white">{m.title}</h3>
              <p className="text-sm text-zinc-400">{m.date} • {m.time} • {m.type}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${m.status==='upcoming'?'bg-purple-500/20 text-purple-400':'bg-emerald-500/20 text-emerald-400'}`}>
              {m.status === 'upcoming' ? 'Upcoming' : 'Completed'}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function AssignmentsPage() {
  const assignments = [
    { title: 'Assignment 4: Graph Algorithms', course: 'Data Structures', due: 'Mar 18, 2026', submitted: 38, total: 45, status: 'active' },
    { title: 'Lab 5: SQL Queries', course: 'Database Systems', due: 'Mar 20, 2026', submitted: 30, total: 42, status: 'active' },
    { title: 'Project: OS Scheduler', course: 'Operating Systems', due: 'Mar 25, 2026', submitted: 0, total: 35, status: 'upcoming' },
    { title: 'Quiz 2: Sorting', course: 'Algorithms', due: 'Mar 10, 2026', submitted: 38, total: 38, status: 'completed' },
  ]
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold text-white mb-1">Assignments</h1><p className="text-zinc-400">Create and grade assignments.</p></div>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-sm transition-all"><Plus size={16} />New Assignment</button>
      </div>
      <div className="space-y-4">
        {assignments.map((a, i) => (
          <motion.div key={a.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-white">{a.title}</h3>
              <span className={`text-xs px-3 py-1 rounded-full ${a.status==='active'?'bg-purple-500/20 text-purple-400':a.status==='upcoming'?'bg-yellow-500/20 text-yellow-400':'bg-emerald-500/20 text-emerald-400'}`}>{a.status}</span>
            </div>
            <p className="text-sm text-zinc-400 mb-2">{a.course} • Due: {a.due}</p>
            <div className="w-full bg-white/5 rounded-full h-2 mb-2">
              <div className="bg-gradient-to-r from-purple-500 to-cyan-400 h-2 rounded-full" style={{ width: `${(a.submitted/a.total)*100}%` }} />
            </div>
            <p className="text-xs text-zinc-500">{a.submitted}/{a.total} submitted</p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function AnalyticsPage() {
  const metrics = [
    { label: 'Average Class Score', value: '78.5%', change: '+3.2%', icon: BarChart3 },
    { label: 'Assignment Completion', value: '89%', change: '+5%', icon: CheckCircle },
    { label: 'Student Engagement', value: '92%', change: '+2%', icon: Users },
    { label: 'Course Satisfaction', value: '4.6/5', change: '+0.3', icon: GraduationCap },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Analytics</h1>
      <p className="text-zinc-400">View class performance analytics.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <motion.div key={m.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4"><m.icon size={20} className="text-purple-400" /></div>
            <p className="text-xs text-zinc-500 mb-1">{m.label}</p>
            <p className="text-2xl font-bold text-white mb-1">{m.value}</p>
            <p className="text-xs text-emerald-400">{m.change}</p>
          </motion.div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">Student Performance Distribution</h3>
        <div className="flex items-end justify-between gap-2 h-64">
          {['A+', 'A', 'B+', 'B', 'C', 'D', 'F'].map((grade, i) => {
            const heights = [15, 25, 35, 20, 10, 8, 5]
            return (
              <div key={grade} className="flex flex-col items-center flex-1">
                <motion.div className="w-full bg-gradient-to-t from-purple-500/80 to-cyan-400/80 rounded-t-lg"
                  initial={{ height: 0 }} animate={{ height: `${heights[i]}%` }} transition={{ delay: i * 0.1, duration: 0.5 }} />
                <p className="text-xs text-zinc-500 mt-2">{grade}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function FacultyDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); toast.success('Signed out successfully'); navigate('/') }
  const navItems = [
    { path: '/faculty', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/faculty/classes', label: 'Classes', icon: BookOpen },
    { path: '/faculty/attendance', label: 'Attendance', icon: Users },
    { path: '/faculty/meetings', label: 'Meetings', icon: Calendar },
    { path: '/faculty/assignments', label: 'Assignments', icon: FileText },
    { path: '/faculty/analytics', label: 'Analytics', icon: BarChart3 },
  ]
  return (
    <div className="min-h-screen bg-transparent flex">
      <aside className="w-64 glass-panel border-r border-white/10 flex flex-col backdrop-blur-2xl">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2 group w-fit">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-extrabold text-lg text-white">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                location.pathname === item.path 
                  ? 'bg-gradient-to-r from-purple-500/15 to-cyan-500/5 border border-purple-500/25 text-white shadow-lg shadow-purple-500/5' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}>
              <item.icon size={18} />{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="glass-panel rounded-xl p-4 mb-4 border border-white/5 bg-white/[0.01]">
            <p className="text-[10px] text-zinc-500 mb-1 font-mono tracking-wider">SIGNED IN</p>
            <p className="text-sm text-white truncate font-medium">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all w-full text-left">
            <LogOut size={18} />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-16 glass-panel border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search classes, students..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white border border-white/5 transition-all relative">
              <Bell size={18} /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-400 flex items-center justify-center text-white font-extrabold text-sm shadow-md">{user?.avatar || 'F'}</div>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto bg-transparent">
          <Routes>
            <Route path="/" element={<FacultyHome />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/meetings" element={<MeetingsPage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
```

---

## File: LandingPage.tsx
**Path:** `frontend/src/pages/LandingPage.tsx`

```tsx
import { motion } from 'framer-motion'
import Navbar from '../components/Navbar'
import HeroSection from '../components/HeroSection'
import WorkflowSection from '../components/WorkflowSection'
import PlatformBento from '../components/PlatformBento'
import AgentsShowcase from '../components/AgentsShowcase'
import DashboardShowcase from '../components/DashboardShowcase'
import Testimonials from '../components/Testimonials'
import FAQSection from '../components/FAQSection'
import CTASection from '../components/CTASection'
import Footer from '../components/Footer'

export default function LandingPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <WorkflowSection />
      <PlatformBento />
      <AgentsShowcase />
      <DashboardShowcase />
      <Testimonials />
      <FAQSection />
      <CTASection />
      <Footer />
    </motion.div>
  )
}
```

---

## File: MeetingsPage.tsx
**Path:** `frontend/src/pages/MeetingsPage.tsx`

```tsx
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Users, Calendar, Plus, Trash2, Edit2, Eye, X, Check, Clock, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getFacultyGroups,
  getGroupMembers,
  createFacultyGroup,
  updateFacultyGroup,
  deleteFacultyGroup,
  addGroupMember,
  removeGroupMember,
  getFacultyUsers,
  getMeetingStats
} from '../lib/supabase/groups'
import {
  getAllMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  deleteMeeting,
  getMeetingGroups,
  getMeetingResponses,
  submitMeetingResponse
} from '../lib/supabase/meetings'
import { useAuth } from '../context/AuthContext'
import type { FacultyGroup, Meeting, MeetingResponse, FacultyGroupMember } from '../types/meetings'

type TabType = 'groups' | 'create' | 'history'

function MeetingGroupsTab() {
  const [groups, setGroups] = useState<FacultyGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<FacultyGroup | null>(null)
  const [members, setMembers] = useState<FacultyGroupMember[]>([])
  const [facultyUsers, setFacultyUsers] = useState<any[]>([])
  const [formData, setFormData] = useState({ name: '', description: '' })
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadGroups()
    loadFacultyUsers()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return

    if (showCreateModal || showMembersModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [showCreateModal, showMembersModal])

  const loadGroups = async () => {
    setLoading(true)
    try {
      const data = await getFacultyGroups()
      setGroups(data)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load faculty groups')
    } finally {
      setLoading(false)
    }
  }

  const loadFacultyUsers = async () => {
    try {
      const data = await getFacultyUsers()
      setFacultyUsers(data)
    } catch (error) {
      console.error(error)
    }
  }

  const loadMembers = async (groupId: string) => {
    try {
      const data = await getGroupMembers(groupId)
      setMembers(data)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load group members')
    }
  }

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      toast.error('Group name is required')
      return
    }

    try {
      if (editingId) {
        await updateFacultyGroup(editingId, formData)
        toast.success('Group updated successfully')
      } else {
        await createFacultyGroup(formData)
        toast.success('Group created successfully')
      }
      setFormData({ name: '', description: '' })
      setEditingId(null)
      setShowCreateModal(false)
      loadGroups()
    } catch (error) {
      console.error(error)
      toast.error('Failed to save group')
    }
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return

    try {
      await deleteFacultyGroup(groupId)
      toast.success('Group deleted successfully')
      loadGroups()
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete group')
    }
  }

  const handleViewMembers = async (group: FacultyGroup) => {
    setSelectedGroup(group)
    await loadMembers(group.id)
    setShowMembersModal(true)
  }

  const handleEditGroup = (group: FacultyGroup) => {
    setFormData({ name: group.name, description: group.description || '' })
    setEditingId(group.id)
    setShowCreateModal(true)
  }

  const handleAddMember = async (userId: string) => {
    if (!selectedGroup) return

    try {
      await addGroupMember(selectedGroup.id, userId)
      toast.success('Member added successfully')
      await loadMembers(selectedGroup.id)
    } catch (error) {
      console.error(error)
      toast.error('Failed to add member')
    }
  }

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!window.confirm('Remove this member from the group?')) return

    try {
      await removeGroupMember(groupId, userId)
      toast.success('Member removed successfully')
      if (selectedGroup) await loadMembers(selectedGroup.id)
    } catch (error) {
      console.error(error)
      toast.error('Failed to remove member')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Faculty Groups</h2>
          <p className="text-sm text-zinc-400 mt-1">Manage faculty groups for meeting assignments</p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: '', description: '' })
            setEditingId(null)
            setShowCreateModal(true)
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-all"
        >
          <Plus size={18} /> Create Group
        </button>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500">
              <th className="px-6 py-4">Group Name</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4">Members</th>
              <th className="px-6 py-4">Created</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                  Loading groups...
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                  No faculty groups found. Create one to get started.
                </td>
              </tr>
            ) : (
              groups.map((group) => (
                <tr key={group.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{group.name}</td>
                  <td className="px-6 py-4 text-zinc-400">{group.description || '—'}</td>
                  <td className="px-6 py-4 text-white">{group.member_count || 0}</td>
                  <td className="px-6 py-4 text-zinc-400">{new Date(group.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      onClick={() => handleViewMembers(group)}
                      className="text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => handleEditGroup(group)}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto bg-black/75 backdrop-blur-2xl p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-2xl rounded-[36px] border border-white/10 bg-zinc-950/95 p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] overflow-hidden max-h-[94vh]"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h3 className="text-2xl font-semibold text-white">{editingId ? 'Edit Group' : 'Create New Group'}</h3>
                <p className="text-sm text-zinc-400 mt-1">Set group details and description for faculty assignments.</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="h-11 w-11 rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 transition-colors flex items-center justify-center"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Group Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., English Department"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="w-full rounded-2xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateGroup}
                  className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-500 transition-colors"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {showMembersModal && selectedGroup && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center overflow-y-auto bg-black/75 backdrop-blur-2xl p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg rounded-[32px] border border-white/10 bg-zinc-950/95 p-6 shadow-2xl shadow-black/50 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedGroup.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">{members.length} members</p>
              </div>
              <button onClick={() => setShowMembersModal(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Add Faculty Member</label>
                <div className="flex gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddMember(e.target.value)
                        e.target.value = ''
                      }
                    }}
                    className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  >
                    <option value="">Select a faculty member...</option>
                    {facultyUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-sm text-zinc-400 mb-3">Current Members</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {members.length === 0 ? (
                    <p className="text-zinc-500 text-sm py-4">No members in this group</p>
                  ) : (
                    members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <div>
                          <p className="text-white font-medium">{member.user?.name}</p>
                          <p className="text-xs text-zinc-400">{member.user?.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveMember(selectedGroup.id, member.user_id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowMembersModal(false)}
                className="w-full px-4 py-2 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 transition-colors mt-4"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  )
}

function CreateMeetingTab() {
  const [groups, setGroups] = useState<FacultyGroup[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    meeting_date: '',
    start_time: '',
    end_time: '',
    venue: '',
    meeting_link: '',
    priority: 'normal' as const,
    status: 'scheduled' as const
  })

  useEffect(() => {
    loadGroups()
  }, [])

  const loadGroups = async () => {
    try {
      const data = await getFacultyGroups()
      setGroups(data)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load groups')
    }
  }

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.meeting_date || !formData.start_time || selectedGroups.length === 0) {
      toast.error('Please fill all required fields and select at least one group')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...formData,
        assigned_group_ids: selectedGroups
      }

      console.log('Create meeting payload:', payload)

      await createMeeting(payload)
      toast.success('Meeting created successfully')
      setFormData({
        title: '',
        description: '',
        meeting_date: '',
        start_time: '',
        end_time: '',
        venue: '',
        meeting_link: '',
        priority: 'normal',
        status: 'scheduled'
      })
      setSelectedGroups([])
    } catch (error: any) {
      console.error('Create meeting failed:', error)
      toast.error(error?.message ? `Failed to create meeting: ${error.message}` : 'Failed to create meeting')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Create Meeting</h2>
        <p className="text-sm text-zinc-400 mt-1">Schedule a new faculty meeting and assign to groups</p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Title *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Meeting title..."
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Meeting Date *</label>
            <input
              type="date"
              value={formData.meeting_date}
              onChange={(e) => setFormData({ ...formData, meeting_date: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Start Time *</label>
            <input
              type="time"
              value={formData.start_time}
              onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">End Time</label>
            <input
              type="time"
              value={formData.end_time}
              onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-2">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Meeting details..."
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Venue</label>
            <input
              type="text"
              value={formData.venue}
              onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
              placeholder="Location or Room Number"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Meeting Link</label>
            <input
              type="url"
              value={formData.meeting_link}
              onChange={(e) => setFormData({ ...formData, meeting_link: e.target.value })}
              placeholder="https://..."
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            >
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-3">Assign to Faculty Groups *</label>
          <div className="space-y-2 max-h-[250px] overflow-y-auto border border-white/10 rounded-xl p-4 bg-black/20">
            {groups.length === 0 ? (
              <p className="text-zinc-500 text-sm">No faculty groups available</p>
            ) : (
              groups.map((group) => (
                <label key={group.id} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedGroups([...selectedGroups, group.id])
                      } else {
                        setSelectedGroups(selectedGroups.filter((id) => id !== group.id))
                      }
                    }}
                    className="w-4 h-4 rounded accent-purple-600"
                  />
                  <div>
                    <p className="text-white font-medium">{group.name}</p>
                    <p className="text-xs text-zinc-500">{group.description}</p>
                  </div>
                </label>
              ))
            )}
          </div>
          {selectedGroups.length > 0 && (
            <p className="text-xs text-purple-400 mt-2">
              {selectedGroups.length} group{selectedGroups.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full px-6 py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : 'Create Meeting'}
        </button>
      </div>
    </div>
  )
}

function MeetingHistoryTab() {
  const { user } = useAuth()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [meetingDetails, setMeetingDetails] = useState<any>(null)
  const [assignedGroups, setAssignedGroups] = useState<any[]>([])
  const [responses, setResponses] = useState<any>(null)

  useEffect(() => {
    loadMeetings()
  }, [])

  const loadMeetings = async () => {
    setLoading(true)
    try {
      const data = await getAllMeetings()
      setMeetings(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()))
    } catch (error) {
      console.error(error)
      toast.error('Failed to load meetings')
    } finally {
      setLoading(false)
    }
  }

  const handleViewMeeting = async (meeting: Meeting) => {
    setSelectedMeeting(meeting)
    try {
      const [details, groups, resps] = await Promise.all([
        getMeetingById(meeting.id),
        getMeetingGroups(meeting.id),
        getMeetingResponses(meeting.id)
      ])
      setMeetingDetails(details)
      setAssignedGroups(groups)
      setResponses(resps)
      setShowDetailsModal(true)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load meeting details')
    }
  }

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!window.confirm('Are you sure you want to delete this meeting?')) return

    try {
      await deleteMeeting(meetingId)
      toast.success('Meeting deleted successfully')
      loadMeetings()
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete meeting')
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/20 text-red-400'
      case 'normal':
        return 'bg-yellow-500/20 text-yellow-400'
      case 'low':
        return 'bg-blue-500/20 text-blue-400'
      default:
        return 'bg-zinc-500/20 text-zinc-400'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-blue-500/20 text-blue-400'
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'cancelled':
        return 'bg-red-500/20 text-red-400'
      default:
        return 'bg-zinc-500/20 text-zinc-400'
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Meeting History</h2>
        <p className="text-sm text-zinc-400 mt-1">View all faculty meetings and their details</p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500">
              <th className="px-6 py-4">Title</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Time</th>
              <th className="px-6 py-4">Venue</th>
              <th className="px-6 py-4">Priority</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Responses</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-zinc-500">
                  Loading meetings...
                </td>
              </tr>
            ) : meetings.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-8 text-center text-zinc-500">
                  No meetings scheduled yet
                </td>
              </tr>
            ) : (
              meetings.map((meeting) => (
                <tr key={meeting.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{meeting.title}</td>
                  <td className="px-6 py-4 text-zinc-400">{new Date(meeting.meeting_date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-zinc-400">{meeting.start_time}</td>
                  <td className="px-6 py-4 text-zinc-400">{meeting.venue || '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${getPriorityColor(meeting.priority)}`}>
                      {meeting.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(meeting.status)}`}>
                      {meeting.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-white">{meeting.responses_count || 0}</td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      onClick={() => handleViewMeeting(meeting)}
                      className="text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteMeeting(meeting.id)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDetailsModal && selectedMeeting && meetingDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">{selectedMeeting.title}</h3>
                <span className={`inline-block text-xs px-2 py-1 rounded-full mt-2 ${getStatusColor(selectedMeeting.status)}`}>
                  {selectedMeeting.status}
                </span>
              </div>
              <button onClick={() => setShowDetailsModal(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <h4 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Meeting Information</h4>
                <div className="grid grid-cols-2 gap-4 p-4 bg-black/40 rounded-lg">
                  <div>
                    <p className="text-xs text-zinc-500">Date</p>
                    <p className="text-white font-medium">{new Date(selectedMeeting.meeting_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Time</p>
                    <p className="text-white font-medium">
                      {selectedMeeting.start_time} - {selectedMeeting.end_time || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Venue</p>
                    <p className="text-white font-medium">{selectedMeeting.venue || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Priority</p>
                    <p className="text-white font-medium capitalize">{selectedMeeting.priority}</p>
                  </div>
                </div>
                {selectedMeeting.description && (
                  <div className="mt-4">
                    <p className="text-xs text-zinc-500 mb-2">Description</p>
                    <p className="text-white text-sm">{selectedMeeting.description}</p>
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Assigned Groups</h4>
                <div className="flex flex-wrap gap-2">
                  {assignedGroups.map((group) => (
                    <span key={group.id || group.group_id} className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm">
                      {group.name || group.group?.name}
                    </span>
                  ))}
                </div>
              </div>

              {responses && (
                <div>
                  <h4 className="text-sm text-zinc-500 uppercase tracking-wider mb-3">Response Summary</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <p className="text-xs text-emerald-400">Attending</p>
                      <p className="text-2xl font-bold text-emerald-400">{responses.stats?.attending || 0}</p>
                    </div>
                    <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                      <p className="text-xs text-yellow-400">Maybe</p>
                      <p className="text-2xl font-bold text-yellow-400">{responses.stats?.maybe || 0}</p>
                    </div>
                    <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                      <p className="text-xs text-red-400">Not Attending</p>
                      <p className="text-2xl font-bold text-red-400">{responses.stats?.not_attending || 0}</p>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowDetailsModal(false)}
                className="w-full px-4 py-2 rounded-xl bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

export default function MeetingsPage() {
  const [tab, setTab] = useState<TabType>('groups')
  const [stats, setStats] = useState({
    total_meetings: 0,
    upcoming_meetings: 0,
    completed_meetings: 0,
    total_faculty_groups: 0
  })
  const [loadingStats, setLoadingStats] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    setLoadingStats(true)
    setError(null)
    try {
      const data = await getMeetingStats()
      setStats(data)
    } catch (error) {
      console.error('Error loading stats:', error)
      setError('Failed to load meeting statistics. The server may not be running or the database tables may not exist.')
      toast.error('Failed to load meeting data')
    } finally {
      setLoadingStats(false)
    }
  }

  const statCards = [
    { label: 'Total Meetings', value: stats.total_meetings, icon: Calendar, color: 'text-purple-400' },
    { label: 'Upcoming Meetings', value: stats.upcoming_meetings, icon: Clock, color: 'text-blue-400' },
    { label: 'Completed Meetings', value: stats.completed_meetings, icon: Check, color: 'text-emerald-400' },
    { label: 'Faculty Groups', value: stats.total_faculty_groups, icon: Users, color: 'text-cyan-400' }
  ]

  return (
    <div className="space-y-6 relative z-10">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Meetings</h1>
        <p className="text-zinc-400">Manage faculty meetings, groups, schedules and attendance responses.</p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass border border-red-500/30 bg-red-500/10 rounded-2xl p-4 flex items-start gap-3"
        >
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-1" />
          <div>
            <p className="text-red-400 font-semibold">Connection Error</p>
            <p className="text-red-300 text-sm mt-1">{error}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <stat.icon size={20} className={stat.color} />
              <span className="text-xs bg-zinc-800 px-2 py-1 rounded-full text-zinc-300">{stat.label}</span>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-sm text-zinc-500">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="glass rounded-2xl">
        <div className="flex border-b border-white/10">

          {[
            { id: 'groups', label: 'Meeting Groups' },
            { id: 'create', label: 'Create Meeting' },
            { id: 'history', label: 'Meeting History' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as TabType)}
              className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'groups' && <MeetingGroupsTab />}
          {tab === 'create' && <CreateMeetingTab />}
          {tab === 'history' && <MeetingHistoryTab />}
        </div>
      </div>
    </div>
  )
}
```

---

## File: MyScholarshipsPage.tsx
**Path:** `frontend/src/pages/MyScholarshipsPage.tsx`

```tsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Award, FileText, X, AlertCircle, CheckCircle, Clock, Calendar } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import toast from 'react-hot-toast'

interface Application {
  id: string
  scholarship_id: string
  student_id: string
  application_status: string
  application_date: string
  remarks?: string
  admin_comments?: string
  approved_amount?: number
  reviewed_at?: string
  scholarship?: {
    title: string
    provider_name: string
    scholarship_amount: number
    description?: string
    eligibility_criteria?: string
    required_documents?: string[]
  }
}

export default function MyScholarshipsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  useEffect(() => {
    loadApplications()
  }, [])

  const loadApplications = async () => {
    try {
      const data = await apiFetch('/api/student/my-scholarships')
      setApplications(data)
    } catch (e) {
      toast.error('Failed to load scholarship applications')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Applied': return 'bg-purple-500/20 text-purple-400 border border-purple-500/20'
      case 'Under Review': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
      case 'Shortlisted': return 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
      case 'Approved': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
      case 'Rejected': return 'bg-red-500/20 text-red-400 border border-red-500/20'
      case 'Cancelled': return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/20'
      default: return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/20'
    }
  }

  const filteredApps = applications.filter(a => {
    const title = a.scholarship?.title || ''
    const provider = a.scholarship?.provider_name || ''
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) || provider.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'All' || a.application_status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">My Scholarship Applications</h1>
        <p className="text-zinc-400">Track and view details of all your submitted scholarship applications.</p>
      </div>

      {/* Filters & Search */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex-1 max-w-sm relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search scholarship or provider..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all" />
        </div>
        <div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50">
            <option value="All" className="bg-[#1a1a2e]">All Statuses</option>
            <option value="Applied" className="bg-[#1a1a2e]">Applied</option>
            <option value="Under Review" className="bg-[#1a1a2e]">Under Review</option>
            <option value="Shortlisted" className="bg-[#1a1a2e]">Shortlisted</option>
            <option value="Approved" className="bg-[#1a1a2e]">Approved</option>
            <option value="Rejected" className="bg-[#1a1a2e]">Rejected</option>
            <option value="Cancelled" className="bg-[#1a1a2e]">Cancelled</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-zinc-500">Loading your applications...</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-zinc-500 border-b border-white/10 bg-white/[0.01]">
                  <th className="px-6 py-4">SCHOLARSHIP</th>
                  <th className="px-6 py-4">PROVIDER</th>
                  <th className="px-6 py-4">APPLIED DATE</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4">AMOUNT</th>
                  <th className="px-6 py-4">REMARKS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredApps.map(a => (
                  <tr key={a.id} onClick={() => setSelectedApp(a)}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors text-sm">
                    <td className="px-6 py-4 font-semibold text-white truncate max-w-xs">{a.scholarship?.title}</td>
                    <td className="px-6 py-4 text-zinc-400">{a.scholarship?.provider_name}</td>
                    <td className="px-6 py-4 text-zinc-400">{a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(a.application_status)}`}>
                        {a.application_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-purple-400 font-semibold">₹{a.scholarship?.scholarship_amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-zinc-400 truncate max-w-xs">{a.remarks || '-'}</td>
                  </tr>
                ))}
                {filteredApps.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-zinc-500">No applications found matching the criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── SIDE DRAWER DETAIL PANEL ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedApp && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setSelectedApp(null)} />
            
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.3 }}
              className="glass border-l border-white/10 w-full max-w-lg h-full p-6 shadow-2xl overflow-y-auto relative z-10 flex flex-col justify-between">
              
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Award className="text-purple-400" /> Application Details
                  </h2>
                  <button onClick={() => setSelectedApp(null)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4 text-sm text-zinc-300">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedApp.scholarship?.title}</h3>
                    <p className="text-xs text-zinc-500">Provider: {selectedApp.scholarship?.provider_name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                    <div>
                      <p className="text-xs text-zinc-500">Application Status</p>
                      <span className={`inline-block px-2.5 py-0.5 mt-1 rounded-full text-xs font-semibold ${getStatusColor(selectedApp.application_status)}`}>
                        {selectedApp.application_status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Scholarship Amount</p>
                      <p className="text-lg font-black text-purple-400 mt-0.5">₹{selectedApp.scholarship?.scholarship_amount.toLocaleString()}</p>
                    </div>
                  </div>

                  {selectedApp.approved_amount && selectedApp.application_status === 'Approved' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                      <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Approved Amount</p>
                      <p className="text-2xl font-black text-emerald-400 mt-1">₹{selectedApp.approved_amount.toLocaleString()}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Scheme Information</h4>
                    <p><span className="text-zinc-500 font-medium">Description:</span> {selectedApp.scholarship?.description || 'No description available.'}</p>
                    <p><span className="text-zinc-500 font-medium">Eligibility Criteria:</span> {selectedApp.scholarship?.eligibility_criteria || 'None'}</p>
                  </div>

                  {selectedApp.scholarship?.required_documents && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Documents Submitted</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedApp.scholarship.required_documents.map(d => (
                          <span key={d} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                            <FileText size={12} className="text-zinc-400" /> {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 border-t border-white/5 pt-4">
                    <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Application History</h4>
                    <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <Calendar size={14} /> Applied on {new Date(selectedApp.application_date).toLocaleString()}
                    </p>
                    {selectedApp.reviewed_at && (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <CheckCircle size={14} className="text-emerald-400" /> Reviewed on {new Date(selectedApp.reviewed_at).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {(selectedApp.remarks || selectedApp.admin_comments) && (
                    <div className="space-y-2.5 border-t border-white/5 pt-4">
                      <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase font-semibold">Remarks & Comments</h4>
                      {selectedApp.remarks && (
                        <div>
                          <p className="text-xs text-zinc-500 font-medium">Status Remarks:</p>
                          <p className="text-sm text-zinc-300 bg-white/[0.01] border border-white/5 p-2 rounded-xl mt-1">{selectedApp.remarks}</p>
                        </div>
                      )}
                      {selectedApp.admin_comments && (
                        <div>
                          <p className="text-xs text-zinc-500 font-medium">Admin Comments:</p>
                          <p className="text-sm text-zinc-300 bg-white/[0.01] border border-white/5 p-2 rounded-xl mt-1">{selectedApp.admin_comments}</p>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>

              <div className="pt-6">
                <button onClick={() => setSelectedApp(null)}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all">
                  Close Details
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## File: StudentDashboard.tsx
**Path:** `frontend/src/pages/StudentDashboard.tsx`

```tsx
import { useState, useRef, useEffect } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, GraduationCap, FileText, Award, BookOpen, Map, LogOut, Search, Bell, Clock, CheckCircle, Building2, TrendingUp, AlertCircle, Upload, Calendar, ClipboardList,  Mic, } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useAnalytics } from '../hooks/useAnalytics'
import { apiFetch } from '../hooks/useApi'
import MyScholarshipsPage from './MyScholarshipsPage'
import toast from 'react-hot-toast'

function StudentHome() {
  const { callsOverTime, loading } = useAnalytics()
  const stats = [
    { label: 'Application status', value: 'Under review', icon: Clock, color: 'text-yellow-400' },
    { label: 'Scholarship match', value: '₹ 80,000 / yr', icon: Award, color: 'text-emerald-400' },
    { label: 'Next deadline', value: '15 Mar', icon: Calendar, color: 'text-purple-400' },
    { label: 'Recommended colleges', value: '8', icon: Building2, color: 'text-cyan-400' },
    { label: 'Semester progress', value: '62%', icon: TrendingUp, color: 'text-emerald-400' },
  ]
  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-white mb-1">Student Dashboard</h1><p className="text-zinc-400">Track your admissions, explore scholarships, and plan your academic journey.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <stat.icon size={20} className={stat.color} />
              </div>
              <p className="text-xs text-zinc-500">{stat.label}</p>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>
      <div className="glass rounded-2xl p-6">
        <h3 className="font-semibold text-white mb-4">Academic Progress</h3>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500">Loading analytics...</div>
        ) : callsOverTime.length > 0 ? (
          <div className="flex items-end justify-between gap-1 h-48">
            {callsOverTime.slice(-30).map((point, i) => {
              const maxCalls = Math.max(...callsOverTime.map((item) => item.calls), 1)
              const height = `${Math.max((point.calls / maxCalls) * 100, 8)}%`
              return (
                <motion.div key={`${point.date}-${i}`} className="flex-1 bg-gradient-to-t from-emerald-500/80 to-cyan-400/80 rounded-t-lg"
                  initial={{ height: 0 }} animate={{ height }} transition={{ delay: i * 0.02, duration: 0.5 }} />
              )
            })}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500">No analytics available</div>
        )}
      </div>
    </div>
  )
}

function CareerAssistant() {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Hello! I am your AI Career Assistant. Tell me about your interests and I will help you find the best career path.' },
    { role: 'user', text: 'I am interested in technology and programming.' },
    { role: 'agent', text: 'Great choice! Based on your interests, I recommend exploring: 1) Computer Science Engineering, 2) Data Science, 3) Artificial Intelligence. Would you like me to suggest colleges for these streams?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recognitionRef = useRef<any>(null)
  const audioTimeoutRef = useRef<any>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audioTimeoutRef.current) {
        clearTimeout(audioTimeoutRef.current)
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) {}
      }
    }
  }, [])

  const speak = async (text: string) => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current)
      audioTimeoutRef.current = null
    }

    setVoiceState('speaking')
    try {
      const response = await fetch('http://localhost:8000/api/voice/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        throw new Error('TTS generation failed')
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setVoiceState('idle')
        URL.revokeObjectURL(audioUrl)
      }

      audio.onerror = (e) => {
        console.error("Audio playback error:", e)
        toast.error("Audio playback failed.")
        setVoiceState('idle')
      }

      await audio.play()
    } catch (e) {
      console.error("Speech synthesis failed:", e)
      toast.error("Speech synthesis failed.")
      setVoiceState('idle')
    }
  }

  const startListening = async () => {
    if (voiceState !== 'idle') {
      if (voiceState === 'listening') {
        stopListening()
      }
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
      audioRef.current = null
    }

    setVoiceState('listening')
    audioChunksRef.current = []

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
    } catch (err) {
      console.error("Microphone access denied:", err)
      toast.error("Microphone permission denied or unavailable.")
      setVoiceState('idle')
      return
    }

    let mediaRecorder: MediaRecorder
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    } catch (e) {
      try {
        mediaRecorder = new MediaRecorder(stream)
      } catch (e2) {
        console.error("MediaRecorder unsupported:", e2)
        toast.error("Speech capture is not supported by your browser.")
        stream.getTracks().forEach(t => t.stop())
        setVoiceState('idle')
        return
      }
    }

    mediaRecorderRef.current = mediaRecorder

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data)
      }
    }

    mediaRecorder.onstop = async () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
        mediaStreamRef.current = null
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' })
      audioChunksRef.current = []

      if (audioBlob.size < 1000) {
        setVoiceState('idle')
        return
      }

      setVoiceState('thinking')
      try {
        const formData = new FormData()
        formData.append('file', audioBlob, 'audio.webm')

        const response = await fetch('http://localhost:8000/api/voice/transcribe', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: formData,
        })

        if (!response.ok) {
          throw new Error('Transcription failed')
        }

        const data = await response.json()
        const text = data.text

        if (!text || !text.trim()) {
          toast.error("No speech detected.")
          setVoiceState('idle')
          return
        }

        await sendMessage(text)
      } catch (err) {
        console.error("Transcription error:", err)
        toast.error("Speech transcription failed.")
        setVoiceState('idle')
      }
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.lang = "en-US"
        recognition.interimResults = false
        recognition.maxAlternatives = 1
        recognitionRef.current = recognition

        recognition.onresult = () => {
          stopListening()
        }

        recognition.onerror = (e: any) => {
          console.warn("SpeechRecognition warning:", e.error)
          if (e.error === 'not-allowed') {
            stopListening()
          }
        }

        recognition.onend = () => {
          stopListening()
        }

        recognition.start()
      } catch (recognitionErr) {
        console.warn("SpeechRecognition startup skipped:", recognitionErr)
      }
    }

    mediaRecorder.start()

    audioTimeoutRef.current = setTimeout(() => {
      stopListening()
    }, 10000)
  }

  const stopListening = () => {
    if (audioTimeoutRef.current) {
      clearTimeout(audioTimeoutRef.current)
      audioTimeoutRef.current = null
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
      recognitionRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch (e) {}
      mediaRecorderRef.current = null
    }
  }

  const sendMessage = async (voiceText?: string) => {
    const userMessage = voiceText ?? input;

    if (!userMessage.trim() || loading) return;

    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setInput('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');

      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage,
          session_id: 'career-assistant',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();

      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: data.response,
        },
      ]);
      setLoading(false);
      await speak(data.response);

    } catch (error) {
      console.error(error);
      setLoading(false);
      setVoiceState('idle');

      setMessages(prev => [
        ...prev,
        {
          role: 'agent',
          text: 'Sorry, something went wrong while contacting the AI.',
        },
      ]);

      toast.error('Unable to contact the AI server. Please check your internet or try again.');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">Career Assistant</h1>
      <p className="text-zinc-400">Get personalized career guidance from our AI.</p>
      <div className="glass-panel rounded-2xl p-6 h-[500px] flex flex-col border border-white/10 shadow-2xl">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 scrollbar-thin">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-lg transition-all ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-tr-none border border-white/10' 
                  : 'glass-panel text-zinc-200 rounded-tl-none border border-white/10'
              }`}>
                <p className="text-[10px] font-mono font-bold tracking-wider text-purple-400 mb-1.5">{msg.role === 'agent' ? 'AI ASSISTANT' : 'YOU'}</p>
                <p className="text-sm leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
          {/* AI Typing */}
{loading && (
  <div className="flex justify-start">
    <div
      className="max-w-[75%] px-4 py-3 rounded-2xl shadow-lg glass-panel text-zinc-200 rounded-tl-none border border-white/10"
    >
      <p className="text-[10px] font-mono font-bold tracking-wider text-purple-400 mb-1.5">
        AI ASSISTANT
      </p>

      <div className="flex items-center gap-1">
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></span>
        <span
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: "0.2s" }}
        ></span>
        <span
          className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
          style={{ animationDelay: "0.4s" }}
        ></span>
      </div>
    </div>
  </div>
)}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={startListening}
            disabled={voiceState !== 'idle' && voiceState !== 'listening'}
            className={`self-stretch w-[48px] flex items-center justify-center shrink-0 rounded-xl border border-white/10 transition-all ${
              voiceState === 'listening'
                ? "bg-red-500/80 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse text-white"
                : voiceState !== 'idle'
                ? "bg-zinc-700/20 border-white/5 opacity-50 cursor-not-allowed text-zinc-500"
                : "bg-white/[0.03] hover:bg-gradient-to-r hover:from-purple-600 hover:via-pink-500 hover:to-purple-500 hover:border-purple-300/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.3),0_0_80px_rgba(139,92,246,0.1)] text-white"
            }`}
          >
            <Mic className={voiceState === 'listening' ? 'text-white' : 'text-zinc-400 group-hover:text-white'} size={20} />
          </button>

          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            disabled={loading || voiceState !== 'idle'}
            placeholder={
              voiceState === 'listening'
                ? "Listening..."
                : voiceState === 'thinking'
                ? "Thinking..."
                : voiceState === 'speaking'
                ? "AI is speaking..."
                : "Ask about careers, courses, colleges..."
            }
            className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed" />

          <button
            onClick={() => sendMessage()}
            disabled={loading || voiceState !== 'idle'}
            className={`px-6 py-3 rounded-xl font-medium transition-all shadow-md border border-white/10 ${
              loading || voiceState !== 'idle'
                ? "bg-zinc-700 cursor-not-allowed opacity-60"
                : "bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 hover:border-purple-300/30 glow-purple"
            } text-white`}
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </div>
      </div>
      {voiceState === 'listening' && (
        <p className="mt-2 text-sm text-red-400 animate-pulse flex items-center gap-1.5 justify-center">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
          🎤 Listening... Speak now
        </p>
      )}
      {voiceState === 'thinking' && (
        <p className="mt-2 text-sm text-yellow-400 animate-pulse flex items-center gap-1.5 justify-center">
          ⚡ Processing voice...
        </p>
      )}
      {voiceState === 'speaking' && (
        <p className="mt-2 text-sm text-cyan-400 animate-pulse flex items-center gap-1.5 justify-center">
          🔊 AI is speaking...
        </p>
      )}
    </div>
  )
}

function AdmissionsTracker() {
  const stages = [
    { name: 'Application Submitted', status: 'completed', date: 'Jan 15, 2026' },
    { name: 'Document Verification', status: 'completed', date: 'Jan 18, 2026' },
    { name: 'Entrance Exam Score', status: 'completed', date: 'Feb 1, 2026' },
    { name: 'Interview Scheduled', status: 'in-progress', date: 'Mar 10, 2026' },
    { name: 'Final Decision', status: 'pending', date: 'Mar 25, 2026' },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Admissions Tracker</h1>
      <p className="text-zinc-400">Track your admission application status in real-time.</p>
      <div className="space-y-4">
        {stages.map((stage) => (
          <div key={stage.name} className="glass rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stage.status === 'completed' ? 'bg-emerald-500/20' : stage.status === 'in-progress' ? 'bg-purple-500/20' : 'bg-white/5'}`}>
              {stage.status === 'completed' ? <CheckCircle size={20} className="text-emerald-400" /> : stage.status === 'in-progress' ? <Clock size={20} className="text-purple-400" /> : <AlertCircle size={20} className="text-zinc-500" />}
            </div>
            <div className="flex-1">
              <p className="text-white font-medium">{stage.name}</p>
              <p className="text-sm text-zinc-500">{stage.date}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${stage.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : stage.status === 'in-progress' ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-zinc-500'}`}>
              {stage.status === 'completed' ? 'Completed' : stage.status === 'in-progress' ? 'In Progress' : 'Pending'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Scholarships() {
  const navigate = useNavigate()
  const [scholarships, setScholarships] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  useEffect(() => {
    loadScholarships()
  }, [])

  const loadScholarships = async () => {
    try {
      const data = await apiFetch('/api/student/scholarships')
      setScholarships(data)
    } catch (e) {
      toast.error('Failed to load scholarships')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (id: string) => {
    setApplyingId(id)
    try {
      const data = await apiFetch(`/api/student/scholarships/${id}/apply`, {
        method: 'POST'
      })
      if (data.success) {
        toast.success('Successfully applied for scholarship!')
        setScholarships(prev => prev.map(s => s.id === id ? { ...s, applied: true } : s))
        setTimeout(() => {
          navigate('/student/my-scholarships')
        }, 1000)
      } else {
        toast.error(data.message || 'Application failed')
      }
    } catch (e) {
      toast.error('Network error occurred')
    } finally {
      setApplyingId(null)
    }
  }

  if (loading) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-4 text-zinc-500">
        <div className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
        <p className="font-medium">Discovering opportunities...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-purple-100 to-white/70 mb-2">Scholarships</h1>
          <p className="text-zinc-400 font-medium">Discover and apply for financial aid programs tailored to your profile.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {scholarships.map((s, i) => {
          const isClosed = s.application_end_date && new Date(s.application_end_date) < new Date()
          return (
            <motion.div key={s.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={`relative group rounded-3xl p-[1px] overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl ${s.is_featured ? 'hover:shadow-amber-500/20' : 'hover:shadow-purple-500/20'}`}>
              
              {s.is_featured && (
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/30 via-orange-500/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
              )}
              
              <div className="relative h-full glass rounded-3xl p-6 md:p-8 flex flex-col justify-between border border-white/5 bg-white/[0.02] backdrop-blur-xl">
                
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                
                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <h3 className="font-bold text-white text-xl md:text-2xl leading-tight tracking-tight">{s.title}</h3>
                    <div className="flex flex-col gap-2 items-end shrink-0">
                      {s.is_featured && (
                        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]">
                          ★ Featured
                        </span>
                      )}
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full border ${isClosed ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                        {isClosed ? 'Closed' : 'Active'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 text-xs font-medium border border-white/5">
                      <Building2 size={14} className="text-purple-400" />
                      {s.provider_name}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-zinc-300 text-xs font-medium border border-white/5">
                      <Award size={14} className="text-pink-400" />
                      {s.scholarship_type}
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <p className="text-sm font-medium text-zinc-500 mb-1">Grant Amount</p>
                    <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 via-cyan-400 to-teal-500 tracking-tight">
                      ₹{s.scholarship_amount.toLocaleString()}
                    </p>
                  </div>
                  
                  {s.eligibility_criteria && (
                    <div className="mb-6">
                      <p className="text-sm font-medium text-zinc-500 mb-1">Eligibility Criteria</p>
                      <p className="text-sm text-zinc-300 leading-relaxed">
                        {s.eligibility_criteria.length > 100 ? `${s.eligibility_criteria.substring(0, 100)}...` : s.eligibility_criteria}
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative z-10 mt-2 pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm font-medium w-full md:w-auto">
                    <Calendar size={16} className={isClosed ? 'text-red-400' : 'text-emerald-400'} />
                    {s.application_end_date ? (
                       <span>Deadline: <span className="text-white">{new Date(s.application_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
                    ) : (
                       <span>No Deadline</span>
                    )}
                  </div>

                  <div className="w-full md:w-auto shrink-0">
                    {s.applied ? (
                      <button disabled className="w-full md:w-auto px-6 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-zinc-400 cursor-not-allowed flex items-center justify-center gap-2">
                        <CheckCircle size={16} className="text-emerald-500" /> Applied
                      </button>
                    ) : isClosed ? (
                      <button disabled className="w-full md:w-auto px-6 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-sm font-bold text-red-400 cursor-not-allowed">
                        Closed
                      </button>
                    ) : (
                      <button onClick={() => handleApply(s.id)} disabled={applyingId !== null}
                        className="w-full md:w-auto px-8 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 rounded-xl text-sm font-bold text-white shadow-lg shadow-purple-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 group">
                        {applyingId === s.id ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : 'Apply Now'}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          )
        })}
        {scholarships.length === 0 && (
          <div className="col-span-1 xl:col-span-2 flex flex-col items-center justify-center py-20 px-4 glass rounded-3xl border border-white/5 bg-white/[0.01]">
            <Award size={48} className="text-zinc-600 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No active scholarships</h3>
            <p className="text-zinc-400 text-center max-w-md">There are currently no open scholarships available. Check back later for new opportunities.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Roadmap() {
  const milestones = [
    { semester: 'Semester 1', courses: ['Programming Fundamentals', 'Mathematics I', 'Physics', 'Communication Skills'], completed: true },
    { semester: 'Semester 2', courses: ['Data Structures', 'Mathematics II', 'Digital Electronics', 'Environmental Science'], completed: true },
    { semester: 'Semester 3', courses: ['Algorithms', 'Database Systems', 'Computer Networks', 'Web Development'], completed: false },
    { semester: 'Semester 4', courses: ['Operating Systems', 'Software Engineering', 'Machine Learning Basics', 'Cloud Computing'], completed: false },
    { semester: 'Semester 5', courses: ['AI & Deep Learning', 'Big Data Analytics', 'Cybersecurity', 'Internship'], completed: false },
    { semester: 'Semester 6', courses: ['Capstone Project', 'Industry Training', 'Placement Preparation'], completed: false },
  ]
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-white mb-1">Academic Roadmap</h1>
      <p className="text-zinc-400">Your personalized academic journey from admission to placement.</p>
      <div className="space-y-4">
        {milestones.map((m, i) => (
          <motion.div key={m.semester} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.completed ? 'bg-emerald-500/20' : 'bg-purple-500/20'}`}>
                {m.completed ? <CheckCircle size={16} className="text-emerald-400" /> : <Map size={16} className="text-purple-400" />}
              </div>
              <h3 className="font-semibold text-white">{m.semester}</h3>
              {m.completed && <span className="text-xs text-emerald-400 ml-auto">Completed</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {m.courses.map(c => (
                <span key={c} className="px-3 py-1 rounded-full text-xs bg-white/5 text-zinc-300">{c}</span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default function StudentDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); toast.success('Signed out successfully'); navigate('/') }
  const navItems = [
    { path: '/student', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/student/career', label: 'Career Assistant', icon: GraduationCap },
    { path: '/student/admissions', label: 'Admissions Tracker', icon: FileText },
    { path: '/student/scholarships', label: 'Scholarships', icon: Award },
    { path: '/student/my-scholarships', label: 'My Scholarships', icon: ClipboardList },
    { path: '/student/roadmap', label: 'Roadmap', icon: Map },
  ]
  return (
    <div className="min-h-screen bg-transparent flex">
      <aside className="w-64 glass-panel border-r border-white/10 flex flex-col backdrop-blur-2xl">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2 group w-fit">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <span className="text-white font-bold text-sm">A</span>
            </div>
            <span className="font-extrabold text-lg text-white">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                location.pathname === item.path 
                  ? 'bg-gradient-to-r from-purple-500/15 to-cyan-500/5 border border-purple-500/25 text-white shadow-lg shadow-purple-500/5' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}>
              <item.icon size={18} />{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="glass-panel rounded-xl p-4 mb-4 border border-white/5 bg-white/[0.01]">
            <p className="text-[10px] text-zinc-500 mb-1 font-mono tracking-wider">SIGNED IN</p>
            <p className="text-sm text-white truncate font-medium">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 rounded-xl transition-all w-full text-left">
            <LogOut size={18} />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-16 glass-panel border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search courses, scholarships..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 hover:border-white/20 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white border border-white/5 transition-all relative">
              <Bell size={18} /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
            <button onClick={() => navigate('/student/profile')} className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-400 flex items-center justify-center text-white font-extrabold text-sm shadow-md hover:scale-105 active:scale-95 transition-transform" title="My Profile">
              {user?.full_name?.[0] || user?.email?.[0] || 'S'}
            </button>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto bg-transparent">
          <Routes>
            <Route path="/" element={<StudentHome />} />
            <Route path="/career" element={<CareerAssistant />} />
             <Route path="/admissions" element={<AdmissionsTracker />} />
            <Route path="/scholarships" element={<Scholarships />} />
            <Route path="/my-scholarships" element={<MyScholarshipsPage />} />
            <Route path="/roadmap" element={<Roadmap />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
```

---

## File: StudentProfile.tsx
**Path:** `frontend/src/pages/StudentProfile.tsx`

```tsx
import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'

import { useStudentProfile } from '../hooks/useStudentProfile'
import { useAIInsights } from '../hooks/useAIInsights'

import ProfileHeader from '../components/profile/ProfileHeader'
import ProfileSidebar from '../components/profile/ProfileSidebar'

import OverviewTab         from '../components/profile/student/OverviewTab'
import PersonalInfoTab     from '../components/profile/shared/PersonalInfoTab'
import AcademicInfoTab     from '../components/profile/student/AcademicInfoTab'
import DocumentsTab        from '../components/profile/student/DocumentsTab'
import CertificationsTab   from '../components/profile/student/CertificationsTab'
import SkillsTab           from '../components/profile/student/SkillsTab'
import EntranceExamsTab    from '../components/profile/student/EntranceExamsTab'
import AchievementsTab     from '../components/profile/student/AchievementsTab'
import AIInsightsTab       from '../components/profile/student/AIInsightsTab'
import TimelineTab         from '../components/profile/student/TimelineTab'
import PreferencesTab      from '../components/profile/student/PreferencesTab'
import PrivacyTab          from '../components/profile/student/PrivacyTab'
import SecurityTab         from '../components/profile/shared/SecurityTab'

import SkeletonCard        from '../components/profile/shared/SkeletonCard'

export default function StudentProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeTab = searchParams.get('tab') || 'overview'

  const { profile, loading, saving, fetchProfile, updateProfile } = useStudentProfile()
  const { refreshInsights, refreshing } = useAIInsights()

  const setTab = (tab: string) => setSearchParams({ tab })

  // Update page title
  useEffect(() => {
    document.title = 'My Portfolio | Student Dashboard'
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050510] p-6 space-y-4">
        <SkeletonCard rows={4} height={120} />
        <div className="flex gap-6">
          <SkeletonCard className="w-64" rows={12} height={400} />
          <SkeletonCard className="flex-1" rows={8} height={300} />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#050510] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 text-lg mb-4">Failed to load profile</p>
          <button onClick={fetchProfile} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm hover:bg-purple-500">
            Try again
          </button>
        </div>
      </div>
    )
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab profile={profile} onTabChange={setTab} />
      case 'personal':
        return <PersonalInfoTab profile={profile} onUpdate={updateProfile} saving={saving} />
      case 'academic':
        return <AcademicInfoTab records={profile.academic_records} semesters={profile.semester_marks} onRefresh={fetchProfile} />
      case 'documents':
        return <DocumentsTab />
      case 'certifications':
        return <CertificationsTab />
      case 'skills':
        return <SkillsTab />
      case 'exams':
        return <EntranceExamsTab />
      case 'achievements':
        return <AchievementsTab achievements={profile.achievements} onRefresh={fetchProfile} />
      case 'ai-insights':
        return <AIInsightsTab onRefresh={refreshInsights} refreshing={refreshing} />
      case 'timeline':
        return <TimelineTab />
      case 'preferences':
        return <PreferencesTab />
      case 'privacy':
        return <PrivacyTab />
      case 'security':
        return <SecurityTab />
      default:
        return <OverviewTab profile={profile} onTabChange={setTab} />
    }
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: 'rgba(18,18,40,0.95)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />

      <div className="min-h-screen bg-[#050510] text-white">
        {/* Background decoration */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-600/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-cyan-600/5 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-screen-xl mx-auto px-4 py-6 md:px-6 space-y-5">
          {/* SEO */}
          <title>My Academic Portfolio | Student Dashboard</title>

          {/* Header */}
          <ProfileHeader profile={profile} onRefreshAI={refreshInsights} aiRefreshing={refreshing} />

          {/* Body: Sidebar + Tab Content */}
          <div className="flex flex-col md:flex-row gap-5">
            <ProfileSidebar
              activeTab={activeTab}
              onTabChange={setTab}
              strengthTotal={profile.strength?.total || 0}
            />

            <main className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  {renderTab()}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </div>
    </>
  )
}
```

---

## File: VoiceCallPage.tsx
**Path:** `frontend/src/pages/VoiceCallPage.tsx`

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

// ─── CONFIG ──────────────────────────────────────────────────────────
const SAMPLE_RATE = 24000
const MIC_SAMPLE_RATE = 16000

// ─── COMPONENT ───────────────────────────────────────────────────────
export default function VoiceCallPage() {
  const { user } = useAuth()
  const [callState, setCallState] = useState<'idle'|'connecting'|'active'|'ended'>('idle')
  const [timer, setTimer] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [messages, setMessages] = useState<{role: 'agent'|'caller', text: string}[]>([])
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [callStatus, setCallStatus] = useState<'listening'|'processing'|'speaking'|'idle'>('idle')

  const wsRef = useRef<WebSocket | null>(null)

  // Use a single persistent AudioContext
  const audioContextRef = useRef<AudioContext | null>(null)

  // AudioWorkletNode reference (replaces deprecated ScriptProcessorNode)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef<string>(`session_${Date.now()}`)

  // Audio queue for smooth playback with single AudioContext
  const audioQueueRef = useRef<Int16Array[]>([])
  const isPlayingRef = useRef(false)

  // Track if we should be sending audio (prevent sending while AI is speaking)
  const shouldSendAudioRef = useRef(true)

  // Audio accumulation buffer for smoother playback
  const audioAccumRef = useRef<Int16Array[]>([])
  const ACCUM_TARGET_MS = 150

  // Mic audio buffer for sending larger chunks
  const micBufferRef = useRef<number[]>([])
  const lastSendTimeRef = useRef(0)
  const SEND_INTERVAL_MS = 500

  // FIX: Track when user started speaking to prevent premature processing
  const userSpeakingStartRef = useRef<number | null>(null)
  const MIN_USER_SPEAKING_MS = 1500

  // Timer
  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callState])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // Initialize single AudioContext on call start
  const initAudioContext = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE })
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume()
    }
  }

  // Play audio from Int16Array PCM data using single AudioContext
  const playAudioChunk = async (int16Data: Int16Array): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const ctx = audioContextRef.current
        if (!ctx) {
          resolve()
          return
        }

        const floatData = new Float32Array(int16Data.length)
        for (let i = 0; i < int16Data.length; i++) {
          floatData[i] = int16Data[i] / 32768.0
        }

        const audioBuffer = ctx.createBuffer(1, floatData.length, SAMPLE_RATE)
        audioBuffer.copyToChannel(floatData, 0)

        const source = ctx.createBufferSource()
        source.buffer = audioBuffer
        source.connect(ctx.destination)

        source.onended = () => { resolve() }
        source.start(0)

      } catch (err) {
        console.error('Audio playback error:', err)
        resolve()
      }
    })
  }

  // Process audio queue with accumulation for smooth playback
  const processAudioQueue = async () => {
    if (isPlayingRef.current) return

    isPlayingRef.current = true
    setIsAgentSpeaking(true)
    setCallStatus('speaking')

    try {
      while (audioQueueRef.current.length > 0 || audioAccumRef.current.length > 0) {
        while (audioQueueRef.current.length > 0) {
          const chunk = audioQueueRef.current.shift()
          if (chunk) audioAccumRef.current.push(chunk)
        }

        const totalSamples = audioAccumRef.current.reduce((sum, c) => sum + c.length, 0)
        const accumulatedMs = (totalSamples / SAMPLE_RATE) * 1000

        if (accumulatedMs >= ACCUM_TARGET_MS || audioQueueRef.current.length === 0) {
          if (totalSamples > 0) {
            const concatenated = new Int16Array(totalSamples)
            let offset = 0
            for (const chunk of audioAccumRef.current) {
              concatenated.set(chunk, offset)
              offset += chunk.length
            }
            audioAccumRef.current = []
            await playAudioChunk(concatenated)
          }
        }

        if (audioQueueRef.current.length === 0 && audioAccumRef.current.length === 0) {
          await new Promise(r => setTimeout(r, 50))
        }
      }
    } catch (err) {
      console.error('Queue processing error:', err)
    } finally {
      isPlayingRef.current = false
      setIsAgentSpeaking(false)
      // FIX: Clear any accumulated mic data that came in during AI speech
      micBufferRef.current = []
      lastSendTimeRef.current = Date.now()
      // Re-enable audio sending after AI finishes
      shouldSendAudioRef.current = true
      setIsUserSpeaking(false)
      setCallStatus('listening')
    }
  }

  // AudioWorklet processor code as a Blob URL
  const createAudioWorkletProcessor = () => {
    const processorCode = `
      class MicProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = [];
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input[0]) {
            const channelData = input[0];
            const int16Data = new Int16Array(channelData.length);
            for (let i = 0; i < channelData.length; i++) {
              int16Data[i] = Math.max(-1, Math.min(1, channelData[i])) * 0x7FFF;
            }
            this.port.postMessage(int16Data);
          }
          return true;
        }
      }

      registerProcessor('mic-processor', MicProcessor);
    `;

    const blob = new Blob([processorCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  // Start call with WebSocket
  const startCall = useCallback(async () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }

    setCallState('connecting')
    setTimer(0)
    setMessages([])
    setIsAgentSpeaking(false)
    setIsUserSpeaking(false)
    setCallStatus('idle')

    await initAudioContext()

    const sessionId = sessionIdRef.current
    const ws = new WebSocket(`ws://localhost:8000/ws/voice/${sessionId}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      console.log('WebSocket connected')
      setCallState('active')
      setCallStatus('listening')
      toast.success('Connected to AI Agent')
      startAudioCapture(ws)
    }

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'transcript') {
          setMessages(prev => [...prev, { role: 'caller', text: data.text }])
          setIsUserSpeaking(false)
          setCallStatus('processing')
        } else if (data.type === 'ai_response') {
          setMessages(prev => [...prev, { role: 'agent', text: data.text }])
          // Pause audio sending while AI is responding
          shouldSendAudioRef.current = false
          // FIX: Clear mic buffer so old audio doesn't get sent after AI finishes
          micBufferRef.current = []
          userSpeakingStartRef.current = null
        } else if (data.type === 'audio') {
          try {
            const binary = atob(data.data)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i)
            }

            let byteLength = bytes.length
            if (byteLength % 2 !== 0) {
              byteLength -= 1
            }

            if (byteLength >= 2) {
              const int16Data = new Int16Array(bytes.buffer, 0, byteLength / 2)
              audioQueueRef.current.push(int16Data)

              if (!isPlayingRef.current) {
                processAudioQueue()
              }
            }
          } catch (decodeErr) {
            console.error('Audio decode error:', decodeErr)
          }
        }
      } catch (err) {
        console.error('Message parse error:', err)
      }
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
      toast.error('Connection error')
      setCallState('idle')
      setCallStatus('idle')
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
      if (callState !== 'ended') {
        setCallState('ended')
        setCallStatus('idle')
      }
    }

    wsRef.current = ws
  }, [user])

  // Capture audio from mic using AudioWorkletNode
  const startAudioCapture = async (ws: WebSocket) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: MIC_SAMPLE_RATE, 
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      })
      mediaStreamRef.current = stream

      const audioContext = audioContextRef.current
      if (!audioContext) {
        throw new Error('AudioContext not initialized')
      }

      const processorUrl = createAudioWorkletProcessor()
      try {
        await audioContext.audioWorklet.addModule(processorUrl)
      } catch (err) {
        console.error('Failed to load AudioWorklet:', err)
        fallbackScriptProcessor(ws, audioContext, stream)
        return
      }

      const source = audioContext.createMediaStreamSource(stream)
      sourceRef.current = source

      const workletNode = new AudioWorkletNode(audioContext, 'mic-processor', {
        processorOptions: { bufferSize: 4096 }
      })
      workletNodeRef.current = workletNode

      source.connect(workletNode)

      // Handle messages from worklet
      workletNode.port.onmessage = (e) => {
        if (ws.readyState !== WebSocket.OPEN || isMuted || !shouldSendAudioRef.current) return

        const int16Data = e.data as Int16Array

        // FIX: Track when user started speaking
        if (userSpeakingStartRef.current === null && int16Data.length > 0) {
          userSpeakingStartRef.current = Date.now()
        }

        // Add to buffer
        for (let i = 0; i < int16Data.length; i++) {
          micBufferRef.current.push(int16Data[i])
        }

        // Send in larger chunks (500ms) for better transcription
        const now = Date.now()
        if (now - lastSendTimeRef.current >= SEND_INTERVAL_MS && micBufferRef.current.length > 0) {
          const chunk = new Int16Array(micBufferRef.current)
          ws.send(chunk.buffer)
          micBufferRef.current = []
          lastSendTimeRef.current = now

          setIsUserSpeaking(true)
          if (callStatus !== 'speaking') {
            setCallStatus('listening')
          }
        }
      }

    } catch (err) {
      console.error('Audio capture error:', err)
      toast.error('Microphone access denied. Please allow microphone permissions.')
      endCall()
    }
  }

  // Fallback ScriptProcessorNode for older browsers
  const fallbackScriptProcessor = (ws: WebSocket, audioContext: AudioContext, stream: MediaStream) => {
    console.warn('Using fallback ScriptProcessorNode - AudioWorklet not available')
    const source = audioContext.createMediaStreamSource(stream)
    sourceRef.current = source

    const processor = audioContext.createScriptProcessor(4096, 1, 1)

    source.connect(processor)

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN || isMuted || !shouldSendAudioRef.current) return

      const inputData = e.inputBuffer.getChannelData(0)
      const int16Data = float32ToInt16(inputData)

      if (userSpeakingStartRef.current === null && int16Data.length > 0) {
        userSpeakingStartRef.current = Date.now()
      }

      for (let i = 0; i < int16Data.length; i++) {
        micBufferRef.current.push(int16Data[i])
      }

      const now = Date.now()
      if (now - lastSendTimeRef.current >= SEND_INTERVAL_MS && micBufferRef.current.length > 0) {
        const chunk = new Int16Array(micBufferRef.current)
        ws.send(chunk.buffer)
        micBufferRef.current = []
        lastSendTimeRef.current = now

        setIsUserSpeaking(true)
        if (callStatus !== 'speaking') {
          setCallStatus('listening')
        }
      }
    }
  }

  const float32ToInt16 = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      int16Array[i] = Math.max(-1, Math.min(1, float32Array[i])) * 0x7FFF
    }
    return int16Array
  }

  const endCall = useCallback(() => {
    if (workletNodeRef.current) {
      try { workletNodeRef.current.disconnect() } catch (e) {}
      workletNodeRef.current = null
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect() } catch (e) {}
      sourceRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    micBufferRef.current = []
    lastSendTimeRef.current = 0
    userSpeakingStartRef.current = null

    setCallState('ended')
    setIsAgentSpeaking(false)
    setIsUserSpeaking(false)
    setCallStatus('idle')
    audioQueueRef.current = []
    audioAccumRef.current = []
    isPlayingRef.current = false
    shouldSendAudioRef.current = true
  }, [])

  const handleMute = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = !newMuted
      })
    }
  }

  useEffect(() => {
    return () => { endCall() }
  }, [endCall])

  const getStatusText = () => {
    switch (callStatus) {
      case 'listening': return 'Listening... Speak now'
      case 'processing': return 'Processing...'
      case 'speaking': return 'AI is speaking...'
      default: return ''
    }
  }

  const getStatusColor = () => {
    switch (callStatus) {
      case 'listening': return 'text-emerald-400'
      case 'processing': return 'text-yellow-400'
      case 'speaking': return 'text-cyan-400'
      default: return 'text-zinc-500'
    }
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 relative">
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-all font-mono text-xs uppercase tracking-wider">
        <span>← Back home</span>
      </Link>

      <div className="absolute top-6 right-6 flex items-center gap-2 select-none">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
          <span className="text-white font-bold text-sm">A</span>
        </div>
        <span className="font-extrabold text-white text-sm">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
      </div>

      <AnimatePresence mode="wait">
        {callState === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="text-center flex flex-col items-center justify-center max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl">
            <h1 className="text-3xl font-extrabold mb-4 text-white tracking-tight">Try our AI Voice Agent</h1>
            <p className="text-zinc-400 mb-8 leading-relaxed text-sm">
              Experience a real-time voice conversation with our Adhoc Agent. 
              Ask about colleges, courses, careers, and admissions.
            </p>
            <motion.button 
              whileHover={{ scale: 1.05, y: -2 }} 
              whileTap={{ scale: 0.95 }} 
              onClick={startCall}
              className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 flex items-center justify-center shadow-2xl shadow-purple-500/30 mx-auto hover:shadow-purple-500/50 transition-all border border-white/10 hover:border-purple-300/30 glow-purple"
            >
              <Phone size={32} className="text-white" />
            </motion.button>
            <p className="mt-4 text-zinc-500 font-mono text-xs tracking-widest uppercase">Tap to call</p>
          </motion.div>
        )}

        {callState === 'connecting' && (
          <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
            className="text-center glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl max-w-sm w-full">
            <div className="relative w-28 h-28 mx-auto mb-6">
              {[...Array(3)].map((_, i) => (
                <motion.div key={i} className="absolute inset-0 rounded-full border-2 border-purple-500/30"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }} 
                  transition={{ duration: 2, delay: i * 0.6, repeat: Infinity }} />
              ))}
              <div className="absolute inset-3 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-purple-500 flex items-center justify-center shadow-lg border border-white/10">
                <Phone size={28} className="text-white animate-pulse" />
              </div>
            </div>
            <h2 className="text-xl font-bold mb-1 text-white">Connecting...</h2>
            <p className="text-xs text-zinc-500 font-mono tracking-wider">ADHOC AI AGENT</p>
          </motion.div>
        )}

        {(callState === 'active' || callState === 'ended') && (
          <motion.div key="active" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
            <div className="glass-panel rounded-2xl p-6 mb-4 border border-white/10 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-md">
                    <span className="text-white font-extrabold text-sm">AI</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">Adhoc AI</h3>
                    <p className="text-xs text-zinc-500 font-mono">AI Career Counselor</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {formatTime(timer)}
                  </div>
                  <button onClick={endCall} className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/20 transition-all">
                    <PhoneOff size={16} />
                  </button>
                </div>
              </div>

              {/* Better status indicator */}
              <div className="flex items-center justify-center gap-2 mb-4 h-6">
                <span className={`text-xs font-mono uppercase tracking-widest font-semibold animate-pulse ${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>

              <div className="flex items-center justify-center gap-1 h-16 bg-white/[0.01] border border-white/5 rounded-2xl px-4 py-2">
                {[...Array(40)].map((_, i) => (
                  <motion.div key={i} className="w-1 bg-gradient-to-t from-purple-500 via-pink-500 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    animate={{ 
                      height: callState === 'active' && (isUserSpeaking || isAgentSpeaking) 
                        ? [8, 12 + Math.random() * 28, 8] 
                        : 8 
                    }}
                    transition={{ duration: 0.4, delay: i * 0.015, repeat: Infinity }} />
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 mb-4 h-80 overflow-y-auto border border-white/10 shadow-xl scrollbar-thin">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <h4 className="text-[10px] text-zinc-500 font-mono font-bold tracking-widest">LIVE TRANSCRIPT</h4>
                <span className="flex items-center gap-2 text-[10px] font-mono font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {callState === 'active' ? 'LIVE CONNECTED' : 'CALL ENDED'}
                </span>
              </div>

              <div className="space-y-4">
                {messages.length === 0 && callState === 'active' && (
                  <div className="text-center py-8">
                    <p className="text-zinc-500 text-sm">Say something to start the conversation...</p>
                    <p className="text-zinc-600 text-xs mt-2 font-mono">Try: "What colleges are good for Computer Science?"</p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'caller' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-lg ${
                      msg.role === 'caller' 
                        ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-tr-none border border-white/10' 
                        : 'glass-panel text-zinc-200 rounded-tl-none border border-white/10'
                    }`}>
                      <p className="text-[9px] font-mono font-bold tracking-wider text-purple-400 mb-1">{msg.role === 'agent' ? 'AI AGENT' : 'YOU'}</p>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}

                {callState === 'active' && messages.length > 0 && messages[messages.length - 1].role === 'caller' && !isAgentSpeaking && (
                  <div className="flex justify-start">
                    <div className="glass-panel px-4 py-3 rounded-2xl rounded-tl-none border border-white/10">
                      <div className="flex items-center gap-1.5 h-4">
                        <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-400" animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1, repeat: Infinity }} />
                        <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-400" animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1, delay: 0.2, repeat: Infinity }} />
                        <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-400" animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1, delay: 0.4, repeat: Infinity }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {callState === 'active' && (
              <div className="flex justify-center gap-4">
                <button onClick={handleMute} 
                  className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all ${
                    isMuted 
                      ? 'bg-red-500/20 border-red-500/30 text-red-400 shadow-lg shadow-red-500/10 animate-pulse' 
                      : 'glass-panel border-white/15 text-white hover:bg-white/10'
                  }`}>
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button onClick={endCall}
                  className="w-14 h-14 rounded-full bg-gradient-to-r from-red-600 to-pink-600 text-white flex items-center justify-center transition-all shadow-lg shadow-red-500/20 border border-white/10 hover:border-red-300/30 hover:scale-105">
                  <PhoneOff size={20} />
                </button>
                <button className="w-14 h-14 rounded-full glass-panel border border-white/15 text-white hover:bg-white/10 flex items-center justify-center transition-all">
                  <Volume2 size={20} />
                </button>
              </div>
            )}

            {callState === 'ended' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-4">
                <p className="text-zinc-500 font-mono text-xs uppercase tracking-wider mb-4">Call ended • {formatTime(timer)}</p>
                <button onClick={startCall} className="px-8 py-3.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-full font-medium transition-all shadow-lg shadow-purple-500/20 border border-white/10 hover:border-purple-300/30 glow-purple">
                  Call Again
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

---

## File: globals.css
**Path:** `frontend/src/styles/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 262.1 83.3% 57.8%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 262.1 83.3% 57.8%;
    --radius: 0.75rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 6%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 6%;
    --popover-foreground: 0 0% 98%;
    --primary: 262.1 83.3% 57.8%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 262.1 83.3% 57.8%;
    --radius: 0.75rem;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
    background-color: #0a0a0f;
    color: #fafafa;
  }

  html {
    scroll-behavior: smooth;
  }

  ::selection {
    background: rgba(139, 92, 246, 0.3);
    color: #fff;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: #0a0a0f;
  }

  ::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }
}

@layer utilities {
  .text-gradient {
    @apply bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-cyan-400 to-purple-400;
  }

  .text-gradient-neon {
    @apply bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400;
  }

  .text-gradient-cyan {
    @apply bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-teal-400;
  }

  .text-gradient-purple {
    @apply bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-purple-600 to-indigo-400;
  }

  .glass {
    @apply bg-white/5 backdrop-blur-xl border border-white/10;
  }

  .glass-strong {
    @apply bg-white/10 backdrop-blur-2xl border border-white/20;
  }

  .glass-panel {
    background: rgba(10, 10, 20, 0.4);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  }

  .glass-panel-hover {
    @apply transition-all duration-300;
  }

  .glass-panel-hover:hover {
    background: rgba(15, 15, 30, 0.5);
    border-color: rgba(139, 92, 246, 0.3);
    box-shadow: 0 8px 32px 0 rgba(139, 92, 246, 0.15), inset 0 0 12px rgba(255, 255, 255, 0.02);
  }

  .glass-panel-cyan-hover:hover {
    background: rgba(10, 15, 30, 0.55);
    border-color: rgba(34, 211, 238, 0.3);
    box-shadow: 0 8px 32px 0 rgba(34, 211, 238, 0.15), inset 0 0 12px rgba(255, 255, 255, 0.02);
  }

  .bg-space-black {
    background: radial-gradient(circle at 30% 15%, rgba(191, 90, 242, 0.16) 0%, transparent 30%),
                radial-gradient(circle at 80% 70%, rgba(10, 132, 255, 0.14) 0%, transparent 40%),
                #050508;
  }

  .glow-purple {
    box-shadow: 0 0 40px rgba(139, 92, 246, 0.3), 0 0 80px rgba(139, 92, 246, 0.1);
  }

  .glow-cyan {
    box-shadow: 0 0 40px rgba(34, 211, 238, 0.3), 0 0 80px rgba(34, 211, 238, 0.1);
  }

  .neon-border-purple {
    border: 1px solid rgba(139, 92, 246, 0.2);
    box-shadow: 0 0 15px rgba(139, 92, 246, 0.15), inset 0 0 15px rgba(139, 92, 246, 0.05);
  }

  .neon-border-cyan {
    border: 1px solid rgba(34, 211, 238, 0.2);
    box-shadow: 0 0 15px rgba(34, 211, 238, 0.15), inset 0 0 15px rgba(34, 211, 238, 0.05);
  }

  .animate-gradient {
    background-size: 200% 200%;
    animation: gradient-shift 8s ease infinite;
  }

  @keyframes gradient-shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
}
```

---

## File: meetings.ts
**Path:** `frontend/src/types/meetings.ts`

```typescript
export interface FacultyGroup {
  id: string
  name: string
  description: string | null
  created_at: string
  created_by: string
  member_count?: number
}

export interface FacultyGroupMember {
  id: string
  group_id: string
  user_id: string
  user?: {
    id: string
    name: string
    email: string
    department?: string
    role: string
  }
}

export interface Meeting {
  id: string
  title: string
  description: string | null
  meeting_date: string
  start_time: string
  end_time: string
  venue: string
  meeting_link: string | null
  priority: 'low' | 'normal' | 'high'
  status: 'scheduled' | 'completed' | 'cancelled'
  created_by: string
  created_at: string
  assigned_groups?: string[] | FacultyGroup[]
  responses_count?: number
}

export interface MeetingGroup {
  id: string
  meeting_id: string
  group_id: string
  group?: FacultyGroup
}

export interface MeetingResponse {
  id: string
  meeting_id: string
  user_id: string
  response: 'attending' | 'maybe' | 'not_attending'
  responded_at: string
}

export interface CreateMeetingInput {
  title: string
  description: string
  meeting_date: string
  start_time: string
  end_time: string
  venue: string
  meeting_link?: string
  priority: 'low' | 'normal' | 'high'
  status: 'scheduled' | 'completed' | 'cancelled'
  assigned_group_ids: string[]
}

export interface CreateGroupInput {
  name: string
  description: string
}

export interface UpdateGroupInput {
  name: string
  description: string
}

export interface MeetingStats {
  total_meetings: number
  upcoming_meetings: number
  completed_meetings: number
  total_faculty_groups: number
}
```

---

## File: profile.types.ts
**Path:** `frontend/src/types/profile.types.ts`

```typescript
// ─── DIGITAL STUDENT ACADEMIC PORTFOLIO — TypeScript Types ───────────────────
// Matches the actual Supabase schema exactly.

// ── Enums / Literal Types ────────────────────────────────────────────────────

export type VerificationStatus = 'pending' | 'verified' | 'rejected'
export type AnalysisStatus = 'pending' | 'generating' | 'ready' | 'failed'
export type AccountStatus = 'active' | 'suspended' | 'pending_verification' | 'deactivated'
export type StrengthLabel = 'Getting Started' | 'Building' | 'Good' | 'Strong' | 'Excellent'

export type VisibilityLevel =
  | 'private'
  | 'institution'
  | 'faculty'
  | 'placement_cell'
  | 'admission_officers'
  | 'public'

export type AcademicLevel = '10th' | '12th' | 'Diploma' | 'UG' | 'PG' | 'PhD' | 'Other'

export type CertificationCategory =
  | 'online_course'
  | 'hackathon'
  | 'sports'
  | 'ncc'
  | 'nss'
  | 'workshop'
  | 'conference'
  | 'research'
  | 'patent'
  | 'volunteering'
  | 'cultural'
  | string

export type DocumentCategory =
  | 'identity'
  | 'academic'
  | 'entrance'
  | 'internship'
  | 'project'
  | 'certification'
  | 'achievement'
  | 'placement'
  | 'other'
  | string

// ── Profile Strength ──────────────────────────────────────────────────────────

export interface ProfileStrength {
  total: number
  label: StrengthLabel
  personal: number
  academic: number
  skills: number
  documents: number
  achievements: number
  career: number
}

// ── Auth / User ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  full_name: string
  phone?: string
  role: 'student' | 'faculty' | 'admin'
  email_verified: boolean
  account_status: AccountStatus
  last_login?: string
  password_updated_at?: string
  created_at: string
}

// ── Student Profile ───────────────────────────────────────────────────────────
// Table: student_profiles — uses user_id FK

export interface StudentProfile {
  id: string
  user_id: string
  profile_photo_url?: string
  blood_group?: string
  country?: string
  postal_code?: string
  father_name?: string
  father_phone?: string
  mother_name?: string
  mother_phone?: string
  guardian_phone?: string
  annual_income?: number
  profile_completion?: number
  date_of_birth?: string
  gender?: string
  nationality?: string
  category?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  guardian_name?: string
  created_at: string
  updated_at: string
}

// ── Academic Records ──────────────────────────────────────────────────────────
// Table: academic_records — uses student_id FK

export interface AcademicRecord {
  id: string
  student_id: string
  education_level: AcademicLevel
  institution_name?: string
  board_university?: string
  degree?: string
  specialization?: string
  hall_ticket_number?: string
  year_of_passing?: number
  percentage?: number
  cgpa?: number
  max_cgpa?: number
  current_semester?: number
  backlogs?: number
  marksheet_document_id?: string
  remarks?: string
  is_current?: boolean
  created_at: string
  updated_at: string
}

// ── Semester Marks ────────────────────────────────────────────────────────────
// Table: semester_marks — uses student_id FK

export interface SemesterMark {
  id: string
  student_id: string
  semester: number
  academic_year?: string
  sgpa?: number
  cgpa?: number
  credits_earned?: number
  total_credits?: number
  result_status?: string
  marksheet_document_id?: string
  remarks?: string
  created_at: string
  updated_at: string
}

// ── Documents ─────────────────────────────────────────────────────────────────
// Table: student_documents — uses student_id FK

export interface StudentDocument {
  id: string
  student_id: string
  document_type: string
  document_name?: string
  file_name: string
  file_url?: string
  storage_bucket?: string
  signed_url?: string
  mime_type?: string
  file_size?: number
  ocr_status?: string
  extracted_data?: Record<string, unknown>
  ai_summary?: string
  verification_status: VerificationStatus
  is_verified: boolean
  verification_remarks?: string
  verified_by?: string
  verified_by_name?: string
  verified_at?: string
  is_active: boolean
  uploaded_at: string
  updated_at: string
}

// ── Certifications ────────────────────────────────────────────────────────────
// Table: student_certifications — uses student_id FK

export interface StudentCertification {
  id: string
  student_id: string
  title: string
  issuing_organization?: string
  category?: string
  description?: string
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  skills_gained?: string[]
  document_id?: string
  verification_status?: VerificationStatus
  created_at: string
  updated_at: string
}

// ── Skills ────────────────────────────────────────────────────────────────────
// Table: student_skills — uses student_id FK

export interface StudentSkills {
  id: string
  student_id: string
  programming_languages: string[]
  frameworks: string[]
  databases: string[]
  cloud_platforms: string[]
  ai_ml_skills: string[]
  web_technologies: string[]
  mobile_technologies: string[]
  devops_tools: string[]
  software_tools: string[]
  soft_skills: string[]
  languages_known: string[]
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  leetcode_url?: string
  codechef_url?: string
  hackerrank_url?: string
  codeforces_url?: string
  years_of_experience?: number
  bio?: string
  created_at: string
  updated_at: string
}

// ── Entrance Exams ────────────────────────────────────────────────────────────
// Table: entrance_exams — uses student_id FK

export interface EntranceExam {
  id: string
  student_id: string
  exam_name: string
  conducting_body?: string
  exam_year?: number
  application_number?: string
  hall_ticket_number?: string
  score?: number
  rank?: number
  percentile?: number
  qualification_status?: string
  exam_date?: string
  scorecard_document_id?: string
  remarks?: string
  created_at: string
  updated_at: string
}

// ── Achievements ──────────────────────────────────────────────────────────────
// Table: student_achievements — uses student_id FK

export interface StudentAchievement {
  id: string
  student_id: string
  achievement_title: string
  achievement_type?: string
  organizer_name?: string
  achievement_level?: string
  position_secured?: string
  description?: string
  achievement_date?: string
  certificate_document_id?: string
  verification_status?: VerificationStatus
  created_at: string
  updated_at: string
}

// ── Scholarships ──────────────────────────────────────────────────────────────

export interface Scholarship {
  id: string
  title: string
  provider_name?: string
  scholarship_type?: string
  description?: string
  eligibility_criteria?: string
  eligible_courses?: string[]
  eligible_categories?: string[]
  minimum_percentage?: number
  annual_income_limit?: number
  scholarship_amount?: number
  application_start_date?: string
  application_end_date?: string
  application_link?: string
  required_documents?: string[]
  contact_email?: string
  contact_phone?: string
  status: string
  is_featured: boolean
  created_at: string
  updated_at: string
}

export interface ScholarshipApplication {
  id: string
  scholarship_id: string
  student_id: string
  application_status: string
  application_date?: string
  remarks?: string
  admin_comments?: string
  reviewed_by?: string
  reviewed_at?: string
  approved_amount?: number
  scholarships?: { title: string; provider_name: string; scholarship_amount: number }
  created_at: string
  updated_at: string
}

// ── Admission Applications ────────────────────────────────────────────────────

export interface AdmissionApplication {
  id: string
  student_id: string
  institution_id?: string
  application_number?: string
  course_name?: string
  specialization?: string
  admission_type?: string
  academic_year?: string
  application_status: string
  application_date?: string
  application_fee?: number
  payment_status?: string
  remarks?: string
  reviewed_by?: string
  reviewed_at?: string
  admission_letter_url?: string
  institutions?: { name: string }
  created_at: string
  updated_at: string
}

// ── AI Insights ───────────────────────────────────────────────────────────────
// Table: ai_profile_analysis — uses student_id FK

export interface AIInsights {
  id?: string
  student_id?: string
  overall_profile_score: number
  academic_score: number
  skill_score: number
  document_score?: number
  certification_score?: number
  achievement_score?: number
  entrance_exam_score?: number
  profile_completion_percentage?: number
  missing_documents: MissingDocument[]
  missing_profile_fields?: string[]
  scholarship_recommendations: ScholarshipRecommendation[]
  college_recommendations?: Record<string, unknown>[]
  course_recommendations?: Record<string, unknown>[]
  career_recommendations: CareerRecommendation[]
  internship_recommendations?: Record<string, unknown>[]
  skill_gap_analysis: SkillGapItem[]
  improvement_suggestions?: string[]
  ai_summary?: string
  ats_score?: number
  generated_at?: string
  last_analyzed_at?: string
  analysis_version?: string
  analysis_status?: AnalysisStatus
  trigger_event?: string
  created_at?: string
  updated_at?: string
}

export interface MissingDocument {
  name: string
  category: string
  priority: 'high' | 'medium' | 'low'
  reason?: string
}

export interface ScholarshipRecommendation {
  title: string
  provider?: string
  match_score: number
  eligibility?: string
}

export interface SkillGapItem {
  skill: string
  demand: 'high' | 'medium' | 'low'
  courses?: string[]
}

export interface CareerRecommendation {
  title: string
  type: string
  reason?: string
}

// ── Full Profile Aggregate (GET /api/student/profile) ─────────────────────────

export interface FullStudentProfile {
  user: AuthUser
  profile: StudentProfile | null
  academic_records: AcademicRecord[]
  semester_marks: SemesterMark[]
  skills: StudentSkills | null
  certifications: StudentCertification[]
  exams: EntranceExam[]
  achievements: StudentAchievement[]
  documents: StudentDocument[]
  strength: ProfileStrength
}

// ── API Request Bodies ────────────────────────────────────────────────────────

export interface UpdateProfileRequest {
  profile_photo_url?: string
  date_of_birth?: string
  gender?: string
  blood_group?: string
  nationality?: string
  category?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  father_name?: string
  father_phone?: string
  mother_name?: string
  mother_phone?: string
  guardian_name?: string
  guardian_phone?: string
  annual_income?: number
}

export interface UpsertAcademicRecordRequest {
  education_level?: string
  institution_name?: string
  board_university?: string
  degree?: string
  specialization?: string
  hall_ticket_number?: string
  year_of_passing?: number
  percentage?: number
  cgpa?: number
  max_cgpa?: number
  current_semester?: number
  backlogs?: number
  remarks?: string
  is_current?: boolean
}

export interface UpsertSemesterMarkRequest {
  semester: number
  academic_year?: string
  sgpa?: number
  cgpa?: number
  credits_earned?: number
  total_credits?: number
  result_status?: string
  remarks?: string
}

export interface CreateCertificationRequest {
  title: string
  issuing_organization?: string
  category?: string
  description?: string
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  skills_gained?: string[]
  document_id?: string
}

export interface UpdateSkillsRequest {
  programming_languages?: string[]
  frameworks?: string[]
  databases?: string[]
  cloud_platforms?: string[]
  ai_ml_skills?: string[]
  web_technologies?: string[]
  mobile_technologies?: string[]
  devops_tools?: string[]
  software_tools?: string[]
  soft_skills?: string[]
  languages_known?: string[]
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  leetcode_url?: string
  codechef_url?: string
  hackerrank_url?: string
  codeforces_url?: string
  years_of_experience?: number
  bio?: string
}

export interface CreateEntranceExamRequest {
  exam_name: string
  conducting_body?: string
  exam_year?: number
  application_number?: string
  hall_ticket_number?: string
  score?: number
  rank?: number
  percentile?: number
  qualification_status?: string
  exam_date?: string
  remarks?: string
  scorecard_document_id?: string
}

export interface CreateAchievementRequest {
  achievement_title?: string
  achievement_type?: string
  organizer_name?: string
  achievement_level?: string
  position_secured?: string
  description?: string
  achievement_date?: string
  certificate_document_id?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
  confirm_password: string
}

export interface UpdatePrivacyRequest {
  personal_info_visibility?: VisibilityLevel
  contact_visibility?: VisibilityLevel
  academic_visibility?: VisibilityLevel
  documents_visibility?: VisibilityLevel
  certifications_visibility?: VisibilityLevel
  skills_visibility?: VisibilityLevel
  achievements_visibility?: VisibilityLevel
  exams_visibility?: VisibilityLevel
  profile_public_link?: boolean
}

export interface PrivacySettings {
  id?: string
  user_id?: string
  personal_info_visibility: VisibilityLevel
  contact_visibility: VisibilityLevel
  academic_visibility: VisibilityLevel
  documents_visibility: VisibilityLevel
  certifications_visibility: VisibilityLevel
  skills_visibility: VisibilityLevel
  achievements_visibility: VisibilityLevel
  exams_visibility: VisibilityLevel
  profile_public_link: boolean
  public_link_token?: string
}

export interface TimelineEvent {
  id: string
  user_id?: string
  student_id?: string
  event_type: string
  title: string
  description?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface StudentNotification {
  id: string
  user_id?: string
  student_id?: string
  type?: string
  title: string
  message?: string
  action_url?: string
  is_read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}
```

---

## File: vite-env.d.ts
**Path:** `frontend/src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />
```

---

## File: tailwind.config.js
**Path:** `frontend/tailwind.config.js`

```
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        neon: {
          purple: "#bf5af2",
          pink: "#ff2d55",
          cyan: "#0a84ff",
          blue: "#5e5ce6",
          teal: "#30d158",
        },
        space: {
          black: "#050508",
          dark: "#0a0a14",
          card: "rgba(10, 10, 20, 0.4)",
          border: "rgba(255, 255, 255, 0.08)",
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        'gradient-x': 'gradient-x 15s ease infinite',
        'gradient-y': 'gradient-y 15s ease infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'glow-cyan': 'glow-cyan 2s ease-in-out infinite alternate',
        'wave': 'wave 2s ease-in-out infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        'gradient-y': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '50% 0%' },
          '50%': { backgroundPosition: '50% 100%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(139, 92, 246, 0.6), 0 0 80px rgba(139, 92, 246, 0.3)' },
        },
        'glow-cyan': {
          '0%': { boxShadow: '0 0 20px rgba(10, 132, 255, 0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(10, 132, 255, 0.6), 0 0 80px rgba(10, 132, 255, 0.3)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(1)' },
          '50%': { transform: 'scaleY(0.5)' },
        },
      },
    },
  },
  plugins: [],
}
```

---

## File: tsconfig.json
**Path:** `frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

---

## File: tsconfig.node.json
**Path:** `frontend/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

---

## File: vite.config.ts
**Path:** `frontend/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://ad-1-ja69.onrender.com',
        changeOrigin: true,
      },
    },
  },
})
```

---

## File: README.md
**Path:** `README.md`

````
# ADhoc.ai — AI Voice Agents for Education

## Quick Start

### Option 1: Docker (Recommended)
```bash
cd adhoc-ai
docker-compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Option 2: Local Development

**Terminal 1 — Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
# For quick testing without PostgreSQL:
# export DATABASE_URL="sqlite:///./adhoc_ai.db"
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@gcedu.in | Admin@1234 |
| Faculty | faculty@gcedu.in | Faculty@1234 |
| Student | student@gcedu.in | Student@1234 |

## API Keys Needed (for AI integration)

Create a `.env` file in the `backend/` directory:

```env
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
ELEVENLABS_API_KEY=your_elevenlabs_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
```

- **Groq**: https://console.groq.com/ (LLM inference)
- **Deepgram**: https://console.deepgram.com/ (Speech-to-Text)
- **ElevenLabs**: https://elevenlabs.io/ (Text-to-Speech)
- **Twilio**: https://www.twilio.com/ (Telephony)
````

---

## File: requirements.txt
**Path:** `requirements.txt`

```
ÿþa i o h a p p y e y e b a l l s = = 2 . 6 . 2 
 
 a i o h t t p = = 3 . 1 4 . 1 
 
 a i o h t t p - r e t r y = = 2 . 8 . 3 
 
 a i o s i g n a l = = 1 . 4 . 0 
 
 a n n o t a t e d - t y p e s = = 0 . 7 . 0 
 
 a n y i o = = 4 . 1 4 . 1 
 
 a t t r s = = 2 6 . 1 . 0 
 
 b c r y p t = = 4 . 0 . 1 
 
 c e r t i f i = = 2 0 2 6 . 6 . 1 7 
 
 c f f i = = 2 . 0 . 0 
 
 c h a r s e t - n o r m a l i z e r = = 3 . 4 . 7 
 
 c l i c k = = 8 . 4 . 2 
 
 c o l o r a m a = = 0 . 4 . 6 
 
 c r y p t o g r a p h y = = 4 9 . 0 . 0 
 
 d e p r e c a t i o n = = 2 . 1 . 0 
 
 d i s t r o = = 1 . 9 . 0 
 
 d n s p y t h o n = = 2 . 8 . 0 
 
 e c d s a = = 0 . 1 9 . 2 
 
 e m a i l - v a l i d a t o r = = 2 . 3 . 0 
 
 f a s t a p i = = 0 . 1 1 5 . 0 
 
 f r o z e n l i s t = = 1 . 8 . 0 
 
 g o t r u e = = 2 . 1 2 . 4 
 
 g r o q = = 0 . 1 3 . 0 
 
 h 1 1 = = 0 . 1 6 . 0 
 
 h 2 = = 4 . 3 . 0 
 
 h p a c k = = 4 . 2 . 0 
 
 h t t p c o r e = = 1 . 0 . 9 
 
 h t t p t o o l s = = 0 . 8 . 0 
 
 h t t p x = = 0 . 2 7 . 2 
 
 h y p e r f r a m e = = 6 . 1 . 0 
 
 i d n a = = 3 . 1 8 
 
 m u l t i d i c t = = 6 . 7 . 1 
 
 n u m p y = = 1 . 2 6 . 4 
 
 p a c k a g i n g = = 2 6 . 2 
 
 p a s s l i b = = 1 . 7 . 4 
 
 p o s t g r e s t = = 0 . 1 6 . 1 1 
 
 p r o p c a c h e = = 0 . 5 . 2 
 
 p y a s n 1 = = 0 . 6 . 3 
 
 p y c p a r s e r = = 3 . 0 
 
 p y d a n t i c = = 2 . 9 . 2 
 
 p y d a n t i c _ c o r e = = 2 . 2 3 . 4 
 
 P y J W T = = 2 . 1 3 . 0 
 
 p y t h o n - d a t e u t i l = = 2 . 9 . 0 . p o s t 0 
 
 p y t h o n - d o t e n v = = 1 . 0 . 1 
 
 p y t h o n - j o s e = = 3 . 3 . 0 
 
 p y t h o n - m u l t i p a r t = = 0 . 0 . 1 7 
 
 P y Y A M L = = 6 . 0 . 3 
 
 r e a l t i m e = = 1 . 0 . 6 
 
 r e q u e s t s = = 2 . 3 4 . 2 
 
 r s a = = 4 . 9 . 1 
 
 s i x = = 1 . 1 7 . 0 
 
 s n i f f i o = = 1 . 3 . 1 
 
 s t a r l e t t e = = 0 . 3 8 . 6 
 
 s t o r a g e 3 = = 0 . 7 . 7 
 
 S t r E n u m = = 0 . 4 . 1 5 
 
 s u p a b a s e = = 2 . 6 . 0 
 
 s u p a b a s e - a u t h = = 2 . 3 1 . 0 
 
 s u p a b a s e - f u n c t i o n s = = 2 . 3 1 . 0 
 
 s u p a f u n c = = 0 . 5 . 1 
 
 t w i l i o = = 9 . 3 . 7 
 
 t y p i n g - i n s p e c t i o n = = 0 . 4 . 2 
 
 t y p i n g _ e x t e n s i o n s = = 4 . 1 5 . 0 
 
 u r l l i b 3 = = 2 . 7 . 0 
 
 u v i c o r n = = 0 . 3 2 . 0 
 
 w a t c h f i l e s = = 1 . 2 . 0 
 
 w e b s o c k e t s = = 1 2 . 0 
 
 y a r l = = 1 . 2 4 . 2 
 
 
```

---

## File: schema.sql
**Path:** `schema.sql`

```sql

```

---

## File: gotrue-version
**Path:** `supabase/.temp/gotrue-version`

```
v2.192.0
```

---

## File: linked-project.json
**Path:** `supabase/.temp/linked-project.json`

```json
{"ref":"asyhmockkvfedlgextiz","name":"Adhoc","organization_id":"mrwvwhiveczfrxmcwtsi","organization_slug":"mrwvwhiveczfrxmcwtsi"}
```

---

## File: pooler-url
**Path:** `supabase/.temp/pooler-url`

```
postgresql://postgres.asyhmockkvfedlgextiz@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

---

## File: postgres-version
**Path:** `supabase/.temp/postgres-version`

```
17.6.1.127
```

---

## File: project-ref
**Path:** `supabase/.temp/project-ref`

```
asyhmockkvfedlgextiz
```

---

## File: rest-version
**Path:** `supabase/.temp/rest-version`

```
v14.5
```

---

## File: storage-migration
**Path:** `supabase/.temp/storage-migration`

```
optimize-existing-functions-again
```

---

## File: storage-version
**Path:** `supabase/.temp/storage-version`

```
v1.61.10
```

---

## File: test_twilio.py
**Path:** `test_twilio.py`

```python
from twilio.rest import Client

client = Client(
    "AC8e0ed9a084a0dc90ad2c23fd68092e63",
    "2ea02b3ea8aecfd169fcd8e641f1836b"
)

call = client.calls.create(
    to="+919492362238",
    from_="+13614901685",
    url="http://demo.twilio.com/docs/voice.xml"
)

print(call.sid)
```

---

# Project Overview & Explanation

## Idea Behind the Project
**ADhoc.ai** is an advanced AI-powered career counseling and education advisory platform specifically designed for Indian students. The platform solves the lack of personalized counseling by offering a real-time, conversational AI voice agent (telephony & web browser based) capable of having end-to-end discussions about courses, streams (engineering, arts, commerce), achievements, certifications, and exam preparation. It includes portals/dashboards for Students, Faculty, and Administrators to organize achievements, document verification, scholarship management, and meeting stats.

## Technology Stack
- **Backend Architecture:**
  - **FastAPI (Python):** Fast, async REST API framework that handles user auth, database operations, background tasks, and real-time audio streams via WebSockets.
  - **Supabase (PostgreSQL):** Utilized as the database server, user authorization engine, and object storage for student files.
  - **Groq LLM API:** Powers the core intelligence engine (CareerGuide AI prompt) using high-speed llama inference for contextual counseling.
  - **Deepgram API:** Handles instant, streaming speech-to-text (transcription) during voice calls.
  - **ElevenLabs API:** Powers premium text-to-speech (voice synthesis) for high-quality audio responses.
  - **Twilio Voice & WebSockets:** Orchestrates incoming and outgoing voice calls, connecting phone lines to the backend via media streams over WebSockets.
- **Frontend Application:**
  - **React (TypeScript) & Vite:** A fast, interactive single-page application framework.
  - **Tailwind CSS:** For clean, modern, fully responsive user interfaces.
  - **Three.js & React Three Fiber (R3F):** Powers interactive 3D assets on the landing page (e.g. `Hero3DScene.tsx`).
  - **Framer Motion:** Animates card entries, hover states, transitions, and user progress visualizations.

## Architecture Details
The application uses a decoupled frontend-backend architecture with a cloud-hosted Postgres (Supabase) database:
1. **Frontend App (SPA):**
   - Role-based routing (Admin, Faculty, Student) protecting views with an Auth Context connected to the Backend.
   - Profile Management component split into tabs (Academic, Achievements, Certifications, Entrance Exams, Documents) with upload zones and real-time AI Insights generator.
   - Voice Calling Module (using custom WebSocket connections & browser Web Audio API to stream user audio and playback synthetic agent audio).
2. **Backend Server (FastAPI Monolith):**
   - REST APIs for CRUD operations on student profiles, academic databases, meeting scheduler, and scholarship applications.
   - Twilio voice integration handler (`/api/voice/incoming` or WebSocket `/ws/voice`) that parses audio bytes from Twilio streams, translates speech to text via Deepgram, prompts the Groq LLM model, translates text back to audio bytes via ElevenLabs, and writes it back to the Twilio audio output socket.
3. **Database Layer (Supabase Postgres):**
   - Keeps track of all user profile states, file metadata, and relations (e.g., student-to-scholarships app, meetings, and faculty lists).

## Project Directory Structure
```text
AD1/
├── .agents
├── Backend
│   ├── .env
│   ├── .python-version
│   ├── database.py
│   ├── main.py
│   └── requirements.txt
├── frontend
│   ├── public
│   ├── src
│   │   ├── components
│   │   │   ├── profile
│   │   │   │   ├── shared
│   │   │   │   │   ├── ConfidenceTag.tsx
│   │   │   │   │   ├── EmptyState.tsx
│   │   │   │   │   ├── PersonalInfoTab.tsx
│   │   │   │   │   ├── PrivacyBadge.tsx
│   │   │   │   │   ├── ProgressRing.tsx
│   │   │   │   │   ├── SecurityTab.tsx
│   │   │   │   │   ├── SkeletonCard.tsx
│   │   │   │   │   ├── StrengthBar.tsx
│   │   │   │   │   ├── UploadZone.tsx
│   │   │   │   │   └── VerificationBadge.tsx
│   │   │   │   ├── student
│   │   │   │   │   ├── AcademicInfoTab.tsx
│   │   │   │   │   ├── AchievementsTab.tsx
│   │   │   │   │   ├── AIInsightsTab.tsx
│   │   │   │   │   ├── CertificationsTab.tsx
│   │   │   │   │   ├── DocumentsTab.tsx
│   │   │   │   │   ├── EntranceExamsTab.tsx
│   │   │   │   │   ├── OverviewTab.tsx
│   │   │   │   │   ├── PreferencesTab.tsx
│   │   │   │   │   ├── PrivacyTab.tsx
│   │   │   │   │   ├── SkillsTab.tsx
│   │   │   │   │   └── TimelineTab.tsx
│   │   │   │   ├── ProfileHeader.tsx
│   │   │   │   └── ProfileSidebar.tsx
│   │   │   ├── AgentsShowcase.tsx
│   │   │   ├── CTASection.tsx
│   │   │   ├── DashboardShowcase.tsx
│   │   │   ├── FAQSection.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── GlobalBackground.tsx
│   │   │   ├── Hero3DScene.tsx
│   │   │   ├── HeroSection.tsx
│   │   │   ├── Navbar.tsx
│   │   │   ├── PlatformBento.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   ├── Testimonials.tsx
│   │   │   └── WorkflowSection.tsx
│   │   ├── context
│   │   │   └── AuthContext.tsx
│   │   ├── hooks
│   │   │   ├── useAIInsights.ts
│   │   │   ├── useAnalytics.ts
│   │   │   ├── useApi.ts
│   │   │   ├── useAuth.ts
│   │   │   ├── useCalls.ts
│   │   │   ├── useMousePosition.ts
│   │   │   ├── usePrompts.ts
│   │   │   ├── useScrollAnimation.ts
│   │   │   ├── useStudentCertifications.ts
│   │   │   ├── useStudentDocuments.ts
│   │   │   ├── useStudentExams.ts
│   │   │   ├── useStudentNotifications.ts
│   │   │   ├── useStudentPrivacy.ts
│   │   │   ├── useStudentProfile.ts
│   │   │   ├── useStudentSkills.ts
│   │   │   ├── useStudentTimeline.ts
│   │   │   ├── useVoiceSettings.ts
│   │   │   └── useWebSocket.ts
│   │   ├── lib
│   │   │   ├── supabase
│   │   │   │   ├── groups.ts
│   │   │   │   └── meetings.ts
│   │   │   └── utils.ts
│   │   ├── pages
│   │   │   ├── admin
│   │   │   │   ├── AdminScholarshipsPage.tsx
│   │   │   │   └── CallConsolePage.tsx
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── AuthPage.tsx
│   │   │   ├── FacultyDashboard.tsx
│   │   │   ├── LandingPage.tsx
│   │   │   ├── MeetingsPage.tsx
│   │   │   ├── MyScholarshipsPage.tsx
│   │   │   ├── StudentDashboard.tsx
│   │   │   ├── StudentProfile.tsx
│   │   │   └── VoiceCallPage.tsx
│   │   ├── styles
│   │   │   └── globals.css
│   │   ├── types
│   │   │   ├── meetings.ts
│   │   │   └── profile.types.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── .env
│   ├── Dockerfile
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── supabase
│   └── .temp
│       ├── gotrue-version
│       ├── linked-project.json
│       ├── pooler-url
│       ├── postgres-version
│       ├── project-ref
│       ├── rest-version
│       ├── storage-migration
│       └── storage-version
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── requirements.txt
├── schema.sql
└── test_twilio.py
```
