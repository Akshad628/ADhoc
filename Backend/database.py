"""Supabase database client for ADhoc.ai"""
import os
from supabase import create_client, Client
from dotenv import load_dotenv

from sqlite_fallback import SupabaseOfflineWrapper

load_dotenv()

supabase_url: str = os.getenv("SUPABASE_URL") or ""
supabase_key: str = os.getenv("SUPABASE_SERVICE_KEY") or ""

_real_supabase: Client = create_client(supabase_url, supabase_key)
supabase = SupabaseOfflineWrapper(_real_supabase)

def get_db():
    """Returns Supabase client"""
    return supabase