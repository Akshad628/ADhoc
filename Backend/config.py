import os
from typing import Optional, Dict, List
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from fastapi import WebSocket
from passlib.context import CryptContext
from fastapi.security import HTTPBearer
from groq import Groq

# Cryptography and Auth Defaults
SECRET_KEY = os.getenv("SECRET_KEY", "change-this-in-production-min-32-chars")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

# API Keys and External Configurations
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
TWILIO_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE = os.getenv("TWILIO_PHONE_NUMBER")
BACKEND_URL = os.getenv("BACKEND_URL", "https://ad-1-ja69.onrender.com")

# Groq Client Initialization
groq_client: Optional[Groq] = None
if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)

# Shared Active WebSockets for Call Monitoring
active_monitors: Dict[str, List[WebSocket]] = {}

# FastRTC support flag
try:
    from fastrtc import Stream, ReplyOnPause, AlgoOptions
    FASTRTC_AVAILABLE = True
except Exception:
    FASTRTC_AVAILABLE = False

# AI counselor prompt details
CAREER_SYSTEM_PROMPT = """You are CareerGuide AI, an expert career counselor and college admission advisor for Indian students. 

CRITICAL RULES:
1. ALWAYS respond in the SAME language the user used. If they speak English, respond in English. If they speak Hindi, respond in Hindi. If they mix (Hinglish), respond in Hinglish.
2. NEVER switch languages on your own. Do not "helpfully" translate to Hindi if the user is speaking English.
3. Keep responses concise but informative (2-4 sentences max for voice). 
4. Be empathetic, encouraging, and data-driven. Ask clarifying questions to give better advice.
5. Help with: college admissions, entrance exams (JEE, NEET, CAT, etc.), scholarships, course selection, job market trends in India.
6. If you don't know specific current data, be honest and guide the student on where to find it.

Current context: You are speaking with a student who needs guidance. Be conversational and natural."""

def reload_groq_client(api_key: str):
    """Dynamically updates the Groq client instance when key is changed"""
    global groq_client, GROQ_API_KEY
    GROQ_API_KEY = api_key
    if api_key:
        groq_client = Groq(api_key=api_key)
    else:
        groq_client = None
