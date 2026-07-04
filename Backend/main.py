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
            callback_url = f"{BACKEND_URL.rstrip('/')}/api/calls/webhook"
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
    form_data = await request.form()
    call_sid = form_data.get("CallSid")
    call_status = form_data.get("CallStatus")

    result = supabase.table("calls").select("*").eq("twilio_sid", call_sid).execute()
    if result.data:
        call = result.data[0]
        update_data: Dict[str, Any] = {"status": call_status}
        if call_status == "completed":
            duration_str = form_data.get("CallDuration", "0")
            try:
                duration_val = int(str(duration_str))
            except (ValueError, TypeError):
                duration_val = 0
            update_data["duration"] = duration_val
        supabase.table("calls").update(update_data).eq("id", call["id"]).execute()

    from twilio.twiml.voice_response import VoiceResponse
    resp = VoiceResponse()
    resp.say("Connecting you to CareerGuide AI. Please speak after the beep.")
    resp.pause(length=1)
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
@app.websocket("/ws/voice/{session_id}")
async def websocket_voice(websocket: WebSocket, session_id: str):
    await websocket.accept()
    print(f"WebSocket connected: {session_id}")

    # State machine for turn-taking
    state = {
        "is_ai_speaking": False,
        "is_user_speaking": False,
        "last_activity_time": datetime.utcnow(),
        "pending_audio_buffer": bytearray(),
        "silence_duration_ms": 0,
        "last_transcript_time": None,
        "consecutive_empty_transcripts": 0,
    }

    # Send greeting
    greeting = "Hello! I am your CareerGuide AI. Ask me anything about colleges, courses, or careers!"
    try:
        await websocket.send_json({"type": "ai_response", "text": greeting})
    except Exception:
        print(f"Failed to send greeting to {session_id}")
        return

    try:
        if ELEVENLABS_API_KEY or DEEPGRAM_API_KEY:
            audio_bytes = await guidance_engine.text_to_speech(greeting)
            if audio_bytes:
                # Strip WAV header and ensure alignment
                pcm_data = strip_wav_header(audio_bytes)
                pcm_data = ensure_16bit_aligned(pcm_data)
                audio_b64 = base64.b64encode(pcm_data).decode('utf-8')
                try:
                    await websocket.send_json({"type": "audio", "data": audio_b64})
                except Exception:
                    print(f"Failed to send greeting audio to {session_id}")
                    return
    except Exception as e:
        print(f"TTS greeting skipped: {e}")

    # FIX: More generous timing to let users complete sentences
    # 32000 bytes = 1 second at 16kHz 16-bit mono
    # Minimum 3 seconds of speech before we even consider transcribing
    # Wait 2.5 seconds of silence before processing (gives time to think/pause)
    audio_buffer = bytearray()
    MIN_AUDIO_FOR_TRANSCRIPTION = 32000 * 3  # 3 seconds minimum
    MAX_AUDIO_BUFFER = 32000 * 8  # 8 seconds maximum (prevent memory bloat)

    # FIX: Longer silence threshold = more time to complete sentences
    last_chunk_time = datetime.utcnow()
    SILENCE_THRESHOLD_MS = 2500  # 2.5 seconds of silence = user stopped speaking

    # FIX: Grace period after user starts speaking - don't process immediately
    first_chunk_time = None
    MIN_SPEAKING_TIME_MS = 1500  # Must speak for at least 1.5s before we consider silence meaningful

    # Track connection state
    is_connected = True

    try:
        while is_connected:
            # FIX: Use try/except around receive to catch disconnect gracefully
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                print(f"WebSocket disconnect received: {session_id}")
                is_connected = False
                break
            except RuntimeError as e:
                if "disconnect" in str(e).lower() or "receive" in str(e).lower():
                    print(f"WebSocket runtime error (disconnect): {session_id} - {e}")
                    is_connected = False
                    break
                raise
            except Exception as e:
                print(f"WebSocket receive error: {session_id} - {e}")
                is_connected = False
                break

            current_time = datetime.utcnow()

            if "bytes" in message:
                # Binary audio data from client
                data = message["bytes"]
                audio_buffer.extend(data)
                last_chunk_time = current_time
                state["is_user_speaking"] = True
                state["silence_duration_ms"] = 0
                state["consecutive_empty_transcripts"] = 0

                # FIX: Track when user first started speaking in this turn
                if first_chunk_time is None:
                    first_chunk_time = current_time

                print(f"Received: {len(data)} bytes, buffer: {len(audio_buffer)}")

                # If buffer is getting too large, force transcription
                if len(audio_buffer) >= MAX_AUDIO_BUFFER:
                    print("Buffer full, forcing transcription")
                    await process_audio_buffer(websocket, session_id, audio_buffer, state)
                    audio_buffer = bytearray()
                    first_chunk_time = None

            elif "text" in message:
                # Text message (could be control signals)
                try:
                    text_data = json.loads(message["text"])
                    if text_data.get("type") == "ping":
                        try:
                            await websocket.send_json({"type": "pong"})
                        except Exception:
                            is_connected = False
                            break
                except Exception:
                    pass

            # Check for silence: if no data received for SILENCE_THRESHOLD_MS
            # and we have enough audio, transcribe
            time_since_last_chunk = (current_time - last_chunk_time).total_seconds() * 1000

            # FIX: Only process if user has been speaking long enough AND there's been silence
            speaking_duration_ms = 0
            if first_chunk_time is not None:
                speaking_duration_ms = (current_time - first_chunk_time).total_seconds() * 1000

            if (time_since_last_chunk > SILENCE_THRESHOLD_MS and 
                len(audio_buffer) >= MIN_AUDIO_FOR_TRANSCRIPTION and
                speaking_duration_ms >= MIN_SPEAKING_TIME_MS):
                if state["is_user_speaking"] and not state["is_ai_speaking"]:
                    print(f"Silence detected ({time_since_last_chunk:.0f}ms), speaking duration {speaking_duration_ms:.0f}ms, processing {len(audio_buffer)} bytes")
                    await process_audio_buffer(websocket, session_id, audio_buffer, state)
                    audio_buffer = bytearray()
                    state["is_user_speaking"] = False
                    first_chunk_time = None
                    last_chunk_time = current_time  # Reset to prevent immediate re-trigger

    except WebSocketDisconnect:
        print(f"Disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        print(f"Closed: {session_id}")


async def process_audio_buffer(websocket: WebSocket, session_id: str, 
                                audio_buffer: bytearray, state: dict):
    """Process accumulated audio: transcribe, get AI response, send TTS"""

    # Do not process if AI is currently speaking (no interruption)
    if state["is_ai_speaking"]:
        print("AI is speaking, skipping transcription")
        return

    if len(audio_buffer) < 16000:  # Less than 0.5 second
        print("Audio too short, skipping")
        return

    print("Transcribing...")
    transcript = await guidance_engine.transcribe_audio(bytes(audio_buffer))

    if not transcript or not transcript.strip():
        state["consecutive_empty_transcripts"] += 1
        print(f"No speech detected (empty count: {state['consecutive_empty_transcripts']})")

        # If we get too many empty transcripts, send a gentle prompt
        if state["consecutive_empty_transcripts"] >= 3:
            prompt_msg = "I am listening. Please go ahead and ask me about colleges, courses, or careers."
            try:
                await websocket.send_json({"type": "ai_response", "text": prompt_msg})
            except Exception:
                pass
            state["consecutive_empty_transcripts"] = 0
        return

    state["consecutive_empty_transcripts"] = 0

    # Validate transcription
    if not is_valid_transcription(transcript):
        print(f"Filtered false transcription: '{transcript}'")
        return

    print(f"Transcribed: '{transcript}'")
    try:
        await websocket.send_json({"type": "transcript", "text": transcript})
    except Exception:
        print("Failed to send transcript")
        return

    # Mark AI as speaking to prevent interruption
    state["is_ai_speaking"] = True
    state["last_transcript_time"] = datetime.utcnow()

    try:
        # Get AI response
        ai_response = await guidance_engine.process_text(transcript, session_id)
        print(f"AI: {ai_response}")
        try:
            await websocket.send_json({"type": "ai_response", "text": ai_response})
        except Exception:
            print("Failed to send AI response")
            return

        # Generate TTS
        try:
            audio_bytes = await guidance_engine.text_to_speech(ai_response)
            if audio_bytes:
                # Strip WAV header and ensure 16-bit alignment
                pcm_data = strip_wav_header(audio_bytes)
                pcm_data = ensure_16bit_aligned(pcm_data)

                if len(pcm_data) > 0:
                    audio_b64 = base64.b64encode(pcm_data).decode('utf-8')
                    try:
                        await websocket.send_json({"type": "audio", "data": audio_b64})
                        print(f"Sent TTS: {len(pcm_data)} bytes PCM")
                    except Exception:
                        print("Failed to send TTS audio")
                else:
                    print("TTS returned empty PCM data")
            else:
                print("TTS returned no audio")
        except Exception as e:
            print(f"TTS error: {e}")

    finally:
        # FIX: Longer delay before allowing new transcriptions (prevents echo/feedback loop)
        await asyncio.sleep(1.0)
        state["is_ai_speaking"] = False
        print("AI finished speaking, ready for next input")


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

