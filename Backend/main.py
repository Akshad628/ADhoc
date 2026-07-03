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
from pydantic import BaseModel, Field, EmailStr
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
    photo_url: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    category: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pan_number: Optional[str] = None
    passport_number: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    alternate_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    parent_email: Optional[str] = None
    guardian_name: Optional[str] = None
    current_institution: Optional[str] = None
    department: Optional[str] = None
    current_year: Optional[int] = None
    current_semester: Optional[int] = None

class AcademicRecordUpsert(BaseModel):
    level: str
    institution_name: Optional[str] = None
    board_university: Optional[str] = None
    degree: Optional[str] = None
    branch_stream: Optional[str] = None
    hall_ticket: Optional[str] = None
    year_of_passing: Optional[int] = None
    percentage: Optional[float] = None
    cgpa: Optional[float] = None
    current_semester: Optional[int] = None

class SemesterMarkUpsert(BaseModel):
    semester: int
    year: Optional[int] = None
    sgpa: Optional[float] = None
    cgpa: Optional[float] = None

class CertificationCreate(BaseModel):
    title: str
    issuing_org: Optional[str] = None
    category: Optional[str] = None
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    credential_id: Optional[str] = None
    credential_url: Optional[str] = None
    document_id: Optional[str] = None

class SkillsUpdate(BaseModel):
    programming_langs: Optional[List[str]] = None
    frameworks: Optional[List[str]] = None
    databases: Optional[List[str]] = None
    cloud_technologies: Optional[List[str]] = None
    ai_ml_skills: Optional[List[str]] = None
    tools: Optional[List[str]] = None
    soft_skills: Optional[List[str]] = None
    languages_known: Optional[List[str]] = None
    github_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None

class EntranceExamCreate(BaseModel):
    exam_name: str
    year: Optional[int] = None
    score: Optional[float] = None
    rank: Optional[int] = None
    percentile: Optional[float] = None
    document_id: Optional[str] = None

class AchievementCreate(BaseModel):
    title: str
    category: Optional[str] = None
    description: Optional[str] = None
    date: Optional[str] = None
    document_id: Optional[str] = None

class PreferencesUpdate(BaseModel):
    target_colleges: Optional[List[str]] = None
    preferred_courses: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    career_interests: Optional[List[str]] = None
    notification_email: Optional[bool] = None
    notification_sms: Optional[bool] = None
    notification_app: Optional[bool] = None
    settings: Optional[Dict[str, Any]] = None

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

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str

# ─── PORTFOLIO HELPER FUNCTIONS ────────────────────────────────────────────────

def portfolio_log_timeline(user_id: str, event_type: str, title: str,
                           description: str = None, metadata: dict = None):
    """Log an immutable event to the student timeline."""
    try:
        supabase.table("student_timeline").insert({
            "user_id": user_id,
            "event_type": event_type,
            "title": title,
            "description": description,
            "metadata": metadata or {},
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Timeline] Error: {e}")

def portfolio_create_notification(user_id: str, ntype: str, title: str,
                                  message: str, action_url: str = None):
    """Create a notification that feeds the dashboard notification bell."""
    try:
        supabase.table("student_notifications").insert({
            "user_id": user_id,
            "type": ntype,
            "title": title,
            "message": message,
            "action_url": action_url,
            "is_read": False,
            "created_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"[Notification] Error: {e}")

def calculate_profile_strength(user_id: str) -> dict:
    """Calculate and persist 6-dimensional profile strength. Returns breakdown dict."""
    try:
        # 1. Personal (max 25)
        profile_res = supabase.table("student_profiles").select("*").eq("user_id", user_id).execute()
        profile = profile_res.data[0] if profile_res.data else {}
        personal_fields = ["date_of_birth", "gender", "state", "pincode",
                           "parent_name", "parent_phone", "photo_url"]
        filled = sum(1 for f in personal_fields if profile.get(f))
        personal = int((filled / len(personal_fields)) * 25)

        # 2. Academic (max 25)
        records = supabase.table("academic_records").select("level").eq("user_id", user_id).execute().data or []
        semesters = supabase.table("semester_marks").select("id").eq("user_id", user_id).execute().data or []
        academic = min(int((len(records) / 3) * 20) + min(len(semesters), 5), 25)

        # 3. Skills (max 15)
        skills_res = supabase.table("student_skills").select("*").eq("user_id", user_id).execute()
        skills = skills_res.data[0] if skills_res.data else {}
        skill_arrays = ["programming_langs", "frameworks", "soft_skills", "languages_known", "tools"]
        non_empty = sum(1 for k in skill_arrays if skills.get(k))
        links = sum(1 for k in ["github_url", "linkedin_url", "portfolio_url"] if skills.get(k))
        skills_score = min(int((non_empty / 5) * 10) + min(links * 2, 5), 15)

        # 4. Documents (max 15)
        docs = supabase.table("student_documents").select("id").eq("user_id", user_id).execute().data or []
        documents = min(len(docs) * 2, 15)

        # 5. Achievements (max 10)
        certs = supabase.table("student_certifications").select("id").eq("user_id", user_id).execute().data or []
        achievements = supabase.table("student_achievements").select("id").eq("user_id", user_id).execute().data or []
        achieve = min((len(certs) + len(achievements)) * 2, 10)

        # 6. Career Readiness (max 10)
        exams = supabase.table("entrance_exams").select("id").eq("user_id", user_id).execute().data or []
        prefs_res = supabase.table("student_preferences").select("career_interests").eq("user_id", user_id).execute()
        prefs = prefs_res.data[0] if prefs_res.data else {}
        career = min(min(len(exams) * 3, 6) + (4 if prefs.get("career_interests") else 0), 10)

        total = min(personal + academic + skills_score + documents + achieve + career, 100)
        label = ("Excellent" if total >= 85 else "Strong" if total >= 70 else
                 "Good" if total >= 50 else "Building" if total >= 30 else "Getting Started")

        strength = {"total": total, "label": label, "personal": personal,
                    "academic": academic, "skills": skills_score,
                    "documents": documents, "achievements": achieve, "career": career}

        # Persist to student_profiles
        if profile_res.data:
            supabase.table("student_profiles").update({
                "strength_total": total, "strength_label": label,
                "strength_personal": personal, "strength_academic": academic,
                "strength_skills": skills_score, "strength_documents": documents,
                "strength_achievements": achieve, "strength_career": career,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("user_id", user_id).execute()
        return strength
    except Exception as e:
        print(f"[Strength] Error: {e}")
        return {"total": 0, "label": "Getting Started", "personal": 0, "academic": 0,
                "skills": 0, "documents": 0, "achievements": 0, "career": 0}

async def maybe_refresh_ai_insights(user_id: str, force: bool = False,
                                     trigger_event: str = "profile_update"):
    """Generate and cache AI profile insights. Skips if profile unchanged (hash match)."""
    if not groq_client:
        return
    try:
        import json as json_mod
        # Gather profile data for hash
        records = supabase.table("academic_records").select("*").eq("user_id", user_id).execute().data or []
        skills_r = supabase.table("student_skills").select("*").eq("user_id", user_id).execute().data or []
        exams = supabase.table("entrance_exams").select("*").eq("user_id", user_id).execute().data or []
        docs_count = len(supabase.table("student_documents").select("id").eq("user_id", user_id).execute().data or [])
        certs_count = len(supabase.table("student_certifications").select("id").eq("user_id", user_id).execute().data or [])
        profile_r = supabase.table("student_profiles").select("*").eq("user_id", user_id).execute().data or []

        summary_str = json_mod.dumps({
            "records": len(records), "skills": skills_r, "exams": exams,
            "docs": docs_count, "certs": certs_count
        }, sort_keys=True, default=str)
        profile_hash = hashlib.md5(summary_str.encode()).hexdigest()

        existing = supabase.table("ai_profile_analysis").select(
            "trigger_hash,analysis_status").eq("user_id", user_id).execute()
        if existing.data and not force:
            if existing.data[0].get("trigger_hash") == profile_hash:
                return  # No change, skip

        # Set status = generating
        supabase.table("ai_profile_analysis").upsert({
            "user_id": user_id, "analysis_status": "generating",
            "trigger_hash": profile_hash, "trigger_event": trigger_event
        }).execute()

        profile = profile_r[0] if profile_r else {}
        skills = skills_r[0] if skills_r else {}

        prompt = f"""You are an AI academic advisor. Analyze this student profile and return ONLY valid JSON.

Profile:
- Academic levels completed: {[r.get('level') for r in records]}
- Current semester: {profile.get('current_semester', 'Unknown')}
- Skills: {skills.get('programming_langs', [])} programming, {skills.get('frameworks', [])} frameworks
- Entrance exams: {[{{'name': e.get('exam_name'), 'score': e.get('score'), 'rank': e.get('rank')}} for e in exams]}
- Documents uploaded: {docs_count}
- Certifications: {certs_count}

Return this JSON structure exactly:
{{
  "profile_strength": <int 0-100>,
  "profile_strength_label": "<Getting Started|Building|Good|Strong|Excellent>",
  "missing_documents": [{{"name": "...", "category": "...", "priority": "high|medium|low", "reason": "..."}}],
  "scholarship_suggestions": [{{"name": "...", "amount": "...", "eligibility": "...", "match_score": <int>}}],
  "skill_gaps": [{{"skill": "...", "demand": "high|medium", "suggested_courses": ["..."]}}],
  "career_suggestions": [{{"title": "...", "type": "certification|course|internship|project", "reason": "..."}}],
  "ats_score": <int 0-100>,
  "analysis_summary": "<2-3 sentence personalized summary>"
}}"""

        resp = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200, temperature=0.3
        )
        ai_text = resp.choices[0].message.content or "{}"
        # Strip markdown fences if present
        if "```" in ai_text:
            parts = ai_text.split("```")
            for p in parts:
                p = p.strip().lstrip("json").strip()
                if p.startswith("{"):
                    ai_text = p
                    break

        try:
            insights = json_mod.loads(ai_text)
        except Exception:
            insights = {"profile_strength": 0, "profile_strength_label": "Getting Started",
                        "missing_documents": [], "scholarship_suggestions": [],
                        "skill_gaps": [], "career_suggestions": [], "ats_score": 0,
                        "analysis_summary": "Analysis could not be completed. Please update your profile."}

        supabase.table("ai_profile_analysis").upsert({
            "user_id": user_id,
            "profile_strength": insights.get("profile_strength", 0),
            "profile_strength_label": insights.get("profile_strength_label", "Getting Started"),
            "missing_documents": insights.get("missing_documents", []),
            "scholarship_suggestions": insights.get("scholarship_suggestions", []),
            "skill_gaps": insights.get("skill_gaps", []),
            "career_suggestions": insights.get("career_suggestions", []),
            "ats_score": insights.get("ats_score"),
            "analysis_summary": insights.get("analysis_summary", ""),
            "analysis_status": "ready",
            "generated_at": datetime.utcnow().isoformat(),
            "trigger_hash": profile_hash,
            "trigger_event": trigger_event
        }).execute()

        portfolio_create_notification(user_id, "ai_analysis_complete",
            "AI Insights Updated", "Your profile analysis is ready.",
            "/student/profile?tab=ai-insights")
        portfolio_log_timeline(user_id, "ai_insights_generated",
            "AI Profile Analysis Updated", f"Triggered by: {trigger_event}")

    except Exception as e:
        print(f"[AI Insights] Error: {e}")
        try:
            supabase.table("ai_profile_analysis").upsert(
                {"user_id": user_id, "analysis_status": "failed"}).execute()
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
        profile = (supabase.table("student_profiles").select("*").eq("user_id", uid).execute().data or [None])[0]
        privacy = (supabase.table("student_privacy_settings").select("*").eq("user_id", uid).execute().data or [None])[0]
        academic = supabase.table("academic_records").select("*").eq("user_id", uid).execute().data or []
        semesters = supabase.table("semester_marks").select("*").eq("user_id", uid).order("semester").execute().data or []
        skills = (supabase.table("student_skills").select("*").eq("user_id", uid).execute().data or [None])[0]
        certifications = supabase.table("student_certifications").select("*").eq("user_id", uid).order("created_at", desc=True).execute().data or []
        exams = supabase.table("entrance_exams").select("*").eq("user_id", uid).order("year", desc=True).execute().data or []
        achievements = supabase.table("student_achievements").select("*").eq("user_id", uid).order("date", desc=True).execute().data or []
        preferences = (supabase.table("student_preferences").select("*").eq("user_id", uid).execute().data or [None])[0]
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
            "profile": profile, "privacy": privacy,
            "academic_records": academic, "semester_marks": semesters,
            "skills": skills, "certifications": certifications,
            "exams": exams, "achievements": achievements,
            "preferences": preferences, "strength": strength
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/student/profile")
async def update_student_profile(
    data: StudentProfileUpdate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    try:
        ensure_student_profile(uid)
        result = supabase.table("student_profiles").update(update_data).eq("user_id", uid).execute()
        portfolio_log_timeline(uid, "profile_updated", "Profile Updated",
                               f"Updated {len(update_data)-1} field(s)")
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
    data = supabase.table("academic_records").select("*").eq("user_id", current_user["id"]).execute().data or []
    return data

@app.put("/api/student/academic")
async def upsert_academic_record(
    data: AcademicRecordUpsert,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record["user_id"] = uid
    record["updated_at"] = datetime.utcnow().isoformat()
    try:
        existing = supabase.table("academic_records").select("id").eq("user_id", uid).eq("level", data.level).execute()
        if existing.data:
            result = supabase.table("academic_records").update(record).eq("user_id", uid).eq("level", data.level).execute()
        else:
            record["created_at"] = datetime.utcnow().isoformat()
            result = supabase.table("academic_records").insert(record).execute()
            portfolio_log_timeline(uid, "academic_record_updated",
                                   f"{data.level.upper()} Academic Record Added",
                                   f"Added {data.level} record")
        calculate_profile_strength(uid)
        background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "academic_update")
        return {"success": True, "data": result.data[0] if result.data else {}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── SEMESTER MARKS ───────────────────────────────────────────────────────────

@app.get("/api/student/semesters")
async def get_semester_marks(current_user: dict = Depends(get_current_user)):
    return supabase.table("semester_marks").select("*").eq("user_id", current_user["id"]).order("semester").execute().data or []

@app.post("/api/student/semesters")
async def add_semester_mark(data: SemesterMarkUpsert, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("semester_marks").select("id").eq("user_id", uid).eq("semester", data.semester).execute()
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record["user_id"] = uid
    record["updated_at"] = datetime.utcnow().isoformat()
    if existing.data:
        result = supabase.table("semester_marks").update(record).eq("user_id", uid).eq("semester", data.semester).execute()
    else:
        record["created_at"] = datetime.utcnow().isoformat()
        result = supabase.table("semester_marks").insert(record).execute()
        portfolio_log_timeline(uid, "semester_added", f"Semester {data.semester} Marks Added",
                               f"SGPA: {data.sgpa}, CGPA: {data.cgpa}")
    calculate_profile_strength(uid)
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/semesters/{semester_id}")
async def delete_semester_mark(semester_id: str, current_user: dict = Depends(get_current_user)):
    record = supabase.table("semester_marks").select("*").eq("id", semester_id).execute().data
    if not record or record[0]["user_id"] != current_user["id"]:
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
        query = query.eq("category", category)
    docs = query.order("uploaded_at", desc=True).execute().data or []
    # Generate signed URLs for each document
    for doc in docs:
        try:
            url_res = supabase.storage.from_("student-documents").create_signed_url(
                doc["storage_path"], 3600)
            doc["signed_url"] = url_res.get("signedURL") or url_res.get("signedUrl", "")
        except Exception:
            doc["signed_url"] = ""
    return docs

@app.post("/api/student/documents")
async def upload_student_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form(...),
    sub_category: str = Form(None),
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg",
                     "application/msword",
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    MAX_SIZE = 10 * 1024 * 1024  # 10MB

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Invalid file type. Allowed: PDF, JPG, PNG, DOC, DOCX")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(400, "File size exceeds 10MB limit")

    import uuid as uuid_mod
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    unique_id = str(uuid_mod.uuid4())
    storage_path = f"{uid}/{category}/{unique_id}.{ext}"
    file_name = f"{unique_id}.{ext}"

    try:
        supabase.storage.from_("student-documents").upload(
            path=storage_path, file=file_bytes,
            file_options={"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {str(e)}. Ensure 'student-documents' bucket exists in Supabase.")

    doc_data = {
        "user_id": uid, "category": category, "sub_category": sub_category,
        "file_name": file_name, "original_file_name": file.filename,
        "storage_path": storage_path, "mime_type": file.content_type,
        "file_size_bytes": len(file_bytes), "version_number": 1,
        "verification_status": "pending", "ocr_metadata": {}, "ai_metadata": {},
        "uploaded_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("student_documents").insert(doc_data).execute()
    doc = result.data[0]

    portfolio_log_timeline(uid, "document_uploaded", f"Document Uploaded: {file.filename}",
                           f"Category: {category}", {"doc_id": doc["id"]})
    portfolio_create_notification(uid, "document_uploaded", "Document Uploaded",
        f"{file.filename} uploaded successfully and pending verification.",
        f"/student/profile?tab=documents")

    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "document_upload")
    return {"success": True, "data": doc}

@app.put("/api/student/documents/{doc_id}")
async def replace_student_document(
    doc_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    uid = current_user["id"]
    existing_res = supabase.table("student_documents").select("*").eq("id", doc_id).execute()
    if not existing_res.data:
        raise HTTPException(404, "Document not found")
    old_doc = existing_res.data[0]
    if old_doc["user_id"] != uid:
        raise HTTPException(403, "Access denied")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(400, "File size exceeds 10MB limit")

    # Archive old version
    supabase.table("student_document_versions").insert({
        "document_id": doc_id, "user_id": uid,
        "version_number": old_doc["version_number"],
        "file_name": old_doc["file_name"],
        "original_file_name": old_doc["original_file_name"],
        "storage_path": old_doc["storage_path"],
        "mime_type": old_doc.get("mime_type"),
        "file_size_bytes": old_doc.get("file_size_bytes"),
        "ocr_metadata": old_doc.get("ocr_metadata", {}),
        "archived_at": datetime.utcnow().isoformat(),
        "archived_reason": "replaced"
    }).execute()

    # Upload new version
    import uuid as uuid_mod
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    unique_id = str(uuid_mod.uuid4())
    storage_path = f"{uid}/{old_doc['category']}/{unique_id}.{ext}"
    try:
        supabase.storage.from_("student-documents").upload(
            path=storage_path, file=file_bytes,
            file_options={"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(500, f"Storage upload failed: {str(e)}")

    new_version = old_doc["version_number"] + 1
    update_data = {
        "file_name": f"{unique_id}.{ext}",
        "original_file_name": file.filename,
        "storage_path": storage_path,
        "mime_type": file.content_type,
        "file_size_bytes": len(file_bytes),
        "version_number": new_version,
        "verification_status": "pending",
        "ocr_metadata": {}, "ai_metadata": {},
        "updated_at": datetime.utcnow().isoformat()
    }
    result = supabase.table("student_documents").update(update_data).eq("id", doc_id).execute()
    portfolio_log_timeline(uid, "document_replaced", f"Document Replaced: {file.filename}",
                           f"Version {new_version}", {"doc_id": doc_id})
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "document_replace")
    return {"success": True, "data": result.data[0] if result.data else {}}

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
        supabase.storage.from_("student-documents").remove([doc["storage_path"]])
    except Exception as e:
        print(f"[Storage] Delete warning: {e}")
    supabase.table("student_documents").delete().eq("id", doc_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

@app.get("/api/student/documents/{doc_id}/versions")
async def get_document_versions(doc_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    doc = supabase.table("student_documents").select("user_id").eq("id", doc_id).execute().data
    if not doc or doc[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    versions = supabase.table("student_document_versions").select("*").eq(
        "document_id", doc_id).order("version_number", desc=True).execute().data or []
    return versions

# ─── CERTIFICATIONS ───────────────────────────────────────────────────────────

@app.get("/api/student/certifications")
async def get_certifications(current_user: dict = Depends(get_current_user)):
    return supabase.table("student_certifications").select("*").eq(
        "user_id", current_user["id"]).order("issue_date", desc=True).execute().data or []

@app.post("/api/student/certifications")
async def add_certification(data: CertificationCreate, background_tasks: BackgroundTasks,
                             current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record.update({"user_id": uid, "created_at": datetime.utcnow().isoformat(),
                   "updated_at": datetime.utcnow().isoformat()})
    result = supabase.table("student_certifications").insert(record).execute()
    portfolio_log_timeline(uid, "certification_added", f"Certification Added: {data.title}",
                           f"Issued by: {data.issuing_org or 'Unknown'}")
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "cert_added")
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.put("/api/student/certifications/{cert_id}")
async def update_certification(cert_id: str, data: CertificationCreate,
                                current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_certifications").select("user_id").eq("id", cert_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("student_certifications").update(record).eq("id", cert_id).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/certifications/{cert_id}")
async def delete_certification(cert_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_certifications").select("user_id").eq("id", cert_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("student_certifications").delete().eq("id", cert_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── SKILLS ───────────────────────────────────────────────────────────────────

@app.get("/api/student/skills")
async def get_skills(current_user: dict = Depends(get_current_user)):
    data = supabase.table("student_skills").select("*").eq("user_id", current_user["id"]).execute().data
    return data[0] if data else {}

@app.put("/api/student/skills")
async def update_skills(data: SkillsUpdate, background_tasks: BackgroundTasks,
                         current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    existing = supabase.table("student_skills").select("id").eq("user_id", uid).execute().data
    if existing:
        result = supabase.table("student_skills").update(update_data).eq("user_id", uid).execute()
    else:
        update_data.update({"user_id": uid, "created_at": datetime.utcnow().isoformat()})
        result = supabase.table("student_skills").insert(update_data).execute()
    calculate_profile_strength(uid)
    portfolio_log_timeline(uid, "skills_updated", "Skills Updated")
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "skills_update")
    return {"success": True, "data": result.data[0] if result.data else {}}

# ─── ENTRANCE EXAMS ───────────────────────────────────────────────────────────

@app.get("/api/student/exams")
async def get_exams(current_user: dict = Depends(get_current_user)):
    return supabase.table("entrance_exams").select("*").eq(
        "user_id", current_user["id"]).order("year", desc=True).execute().data or []

@app.post("/api/student/exams")
async def add_exam(data: EntranceExamCreate, background_tasks: BackgroundTasks,
                   current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record.update({"user_id": uid, "created_at": datetime.utcnow().isoformat(),
                   "updated_at": datetime.utcnow().isoformat()})
    result = supabase.table("entrance_exams").insert(record).execute()
    portfolio_log_timeline(uid, "exam_result_added", f"{data.exam_name} Result Added",
                           f"Score: {data.score}, Rank: {data.rank}")
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "exam_added")
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.put("/api/student/exams/{exam_id}")
async def update_exam(exam_id: str, data: EntranceExamCreate,
                       current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("entrance_exams").select("user_id").eq("id", exam_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("entrance_exams").update(record).eq("id", exam_id).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/exams/{exam_id}")
async def delete_exam(exam_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("entrance_exams").select("user_id").eq("id", exam_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("entrance_exams").delete().eq("id", exam_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

@app.get("/api/student/achievements")
async def get_achievements(current_user: dict = Depends(get_current_user)):
    return supabase.table("student_achievements").select("*").eq(
        "user_id", current_user["id"]).order("date", desc=True).execute().data or []

@app.post("/api/student/achievements")
async def add_achievement(data: AchievementCreate, background_tasks: BackgroundTasks,
                           current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record.update({"user_id": uid, "created_at": datetime.utcnow().isoformat(),
                   "updated_at": datetime.utcnow().isoformat()})
    result = supabase.table("student_achievements").insert(record).execute()
    portfolio_log_timeline(uid, "achievement_added", f"Achievement Added: {data.title}",
                           f"Category: {data.category}")
    calculate_profile_strength(uid)
    background_tasks.add_task(maybe_refresh_ai_insights, uid, False, "achievement_added")
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.put("/api/student/achievements/{ach_id}")
async def update_achievement(ach_id: str, data: AchievementCreate,
                              current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_achievements").select("user_id").eq("id", ach_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    record = {k: v for k, v in data.model_dump().items() if v is not None}
    record["updated_at"] = datetime.utcnow().isoformat()
    result = supabase.table("student_achievements").update(record).eq("id", ach_id).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

@app.delete("/api/student/achievements/{ach_id}")
async def delete_achievement(ach_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_achievements").select("user_id").eq("id", ach_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("student_achievements").delete().eq("id", ach_id).execute()
    calculate_profile_strength(uid)
    return {"success": True}

# ─── PREFERENCES ──────────────────────────────────────────────────────────────

@app.get("/api/student/preferences")
async def get_preferences(current_user: dict = Depends(get_current_user)):
    data = supabase.table("student_preferences").select("*").eq("user_id", current_user["id"]).execute().data
    return data[0] if data else {}

@app.put("/api/student/preferences")
async def update_preferences(data: PreferencesUpdate, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    existing = supabase.table("student_preferences").select("id").eq("user_id", uid).execute().data
    if existing:
        result = supabase.table("student_preferences").update(update_data).eq("user_id", uid).execute()
    else:
        update_data.update({"user_id": uid, "created_at": datetime.utcnow().isoformat()})
        result = supabase.table("student_preferences").insert(update_data).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

# ─── PRIVACY SETTINGS ─────────────────────────────────────────────────────────

@app.get("/api/student/privacy")
async def get_privacy_settings(current_user: dict = Depends(get_current_user)):
    data = supabase.table("student_privacy_settings").select("*").eq("user_id", current_user["id"]).execute().data
    return data[0] if data else {
        "personal_info_visibility": "institution", "contact_visibility": "institution",
        "academic_visibility": "institution", "documents_visibility": "faculty",
        "certifications_visibility": "institution", "skills_visibility": "placement_cell",
        "achievements_visibility": "institution", "exams_visibility": "admission_officers",
        "profile_public_link": False
    }

@app.put("/api/student/privacy")
async def update_privacy_settings(data: PrivacySettingsUpdate,
                                   current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    existing = supabase.table("student_privacy_settings").select("id").eq("user_id", uid).execute().data
    if existing:
        result = supabase.table("student_privacy_settings").update(update_data).eq("user_id", uid).execute()
    else:
        update_data.update({"user_id": uid, "created_at": datetime.utcnow().isoformat()})
        result = supabase.table("student_privacy_settings").insert(update_data).execute()
    return {"success": True, "data": result.data[0] if result.data else {}}

# ─── TIMELINE ─────────────────────────────────────────────────────────────────

@app.get("/api/student/timeline")
async def get_timeline(page: int = 1, limit: int = 20,
                        current_user: dict = Depends(get_current_user)):
    offset = (page - 1) * limit
    data = supabase.table("student_timeline").select("*").eq(
        "user_id", current_user["id"]).order("created_at", desc=True).range(
        offset, offset + limit - 1).execute().data or []
    return {"events": data, "page": page, "limit": limit}

# ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

@app.get("/api/student/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    data = supabase.table("student_notifications").select("*").eq(
        "user_id", current_user["id"]).order("created_at", desc=True).limit(50).execute().data or []
    unread_count = sum(1 for n in data if not n.get("is_read"))
    return {"notifications": data, "unread_count": unread_count}

@app.put("/api/student/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    existing = supabase.table("student_notifications").select("user_id").eq("id", notif_id).execute().data
    if not existing or existing[0]["user_id"] != uid:
        raise HTTPException(403, "Access denied")
    supabase.table("student_notifications").update({"is_read": True}).eq("id", notif_id).execute()
    return {"success": True}

@app.put("/api/student/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(get_current_user)):
    supabase.table("student_notifications").update({"is_read": True}).eq(
        "user_id", current_user["id"]).eq("is_read", False).execute()
    return {"success": True}

# ─── AI INSIGHTS ──────────────────────────────────────────────────────────────

@app.get("/api/student/ai-insights")
async def get_ai_insights(current_user: dict = Depends(get_current_user)):
    try:
        data = supabase.table("ai_profile_analysis").select("*").eq(
            "user_id", current_user["id"]).execute().data
        if not data:
            return {
                "profile_strength": 0, "profile_strength_label": "Getting Started",
                "missing_documents": [], "scholarship_suggestions": [],
                "skill_gaps": [], "career_suggestions": [], "college_recommendations": [],
                "ats_score": None, "analysis_summary": None,
                "analysis_status": "pending", "generated_at": None
            }
        return data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error fetching AI insights: {str(e)}")

@app.post("/api/student/ai-insights/refresh")
async def refresh_ai_insights(background_tasks: BackgroundTasks,
                               current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    try:
        # Set status to generating immediately for UI feedback
        supabase.table("ai_profile_analysis").upsert(
            {"user_id": uid, "analysis_status": "generating"}).execute()
        background_tasks.add_task(maybe_refresh_ai_insights, uid, True, "manual_refresh")
        portfolio_log_timeline(uid, "ai_insights_refreshed", "AI Insights Refresh Requested")
        return {"success": True, "message": "AI analysis started. Check back shortly."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error starting AI refresh: {str(e)}")

# ─── PASSWORD CHANGE ──────────────────────────────────────────────────────────

@app.put("/api/student/password")
async def change_student_password(data: PasswordChange,
                                   current_user: dict = Depends(get_current_user)):
    uid = current_user["id"]
    # 1. Verify current password
    if not verify_password(data.current_password, current_user["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect")
    # 2. New password must differ from current
    if data.current_password == data.new_password:
        raise HTTPException(400, "New password must be different from your current password")
    # 3. Confirm match
    if data.new_password != data.confirm_password:
        raise HTTPException(400, "New passwords do not match")
    # 4. Basic strength: min 8 chars (Field already handles this), at least 1 digit
    if not any(c.isdigit() for c in data.new_password):
        raise HTTPException(400, "Password must contain at least one number")
    # 5. Hash and update
    new_hash = get_password_hash(data.new_password)
    supabase.table("users").update({
        "hashed_password": new_hash,
        "password_updated_at": datetime.utcnow().isoformat()
    }).eq("id", uid).execute()
    # 6. Log + notify
    portfolio_log_timeline(uid, "password_changed", "Password Changed",
                           "Your account password was updated successfully.")
    portfolio_create_notification(uid, "security", "Password Changed",
        "Your password was updated. If this wasn't you, contact support immediately.")
    return {"success": True, "message": "Password updated successfully"}
