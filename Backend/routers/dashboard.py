from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from database import supabase
from auth_utils import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/admin")
async def admin_dashboard(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    users = supabase.table("users").select("*").execute().data or []
    calls = supabase.table("calls").select("*").execute().data or []
    sessions = supabase.table("guidance_sessions").select("*").execute().data or []

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

    activities = (
        supabase.table("analytics_events")
        .select("event_type,event_data,created_at")
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

@router.get("/student")
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

@router.get("/faculty")
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

@router.get("/students")
async def dashboard_students(current_user: dict = Depends(get_current_user)):
    result = (
        supabase.table("users")
        .select("full_name,email,phone")
        .eq("role", "student")
        .execute()
    )
    return result.data

@router.get("/faculty-list")
async def dashboard_faculty_list(current_user: dict = Depends(get_current_user)):
    result = (
        supabase.table("users")
        .select("full_name,email,phone")
        .eq("role", "faculty")
        .execute()
    )
    return result.data

@router.get("/calls")
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

@router.get("/sessions")
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
