"""
ADhoc.ai Backend v2 - Fixed Voice WebSocket
FastAPI + Supabase + Groq + Deepgram + ElevenLabs
Real-time voice AI for career guidance & college admissions
"""

import os
import traceback
from datetime import datetime
from typing import Optional, Dict, List, Any
from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from database import supabase
from auth_utils import get_current_user
from routers import (
    auth,
    dashboard,
    agents,
    sessions,
    calls,
    knowledge,
    prompts,
    analytics,
    voice,
    student,
    admin
)

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

# Mount all routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(agents.router)
app.include_router(sessions.router)
app.include_router(calls.router)
app.include_router(knowledge.router)
app.include_router(prompts.router)
app.include_router(analytics.router)
app.include_router(voice.router)
app.include_router(student.router)
app.include_router(admin.router)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("GLOBAL EXCEPTION TRIGGERED:")
    print(tb)
    try:
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

@app.on_event("startup")
async def startup_event():
    if config.FASTRTC_AVAILABLE:
        try:
            # We import here to lazy load and avoid circular import
            from routers.voice import get_fastrtc_stream
            stream = get_fastrtc_stream()
            if stream:
                stream.mount(app, path="/fastrtc")
                print("FastRTC primary voice layer mounted at /fastrtc")
                print("   - WebRTC endpoint: /fastrtc")
                print("   - WebSocket fallback: /fastrtc/ws")
                print("   - Manual WebSocket (failsafe): /ws/voice/{session_id}")
            else:
                print("FastRTC stream creation failed. Using manual WebSocket only.")
        except Exception as e:
            print(f"FastRTC mount failed: {e}. Using manual WebSocket only.")
    else:
        print("FastRTC not installed. Manual WebSocket is the only voice path.")
        print("   Install: pip install 'fastrtc[vad,tts]'")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up FastRTC sessions on shutdown"""
    if config.FASTRTC_AVAILABLE:
        try:
            from fastrtc_handler import cleanup_all_sessions
            cleanup_all_sessions()
        except Exception as e:
            print(f"Failed to cleanup FastRTC sessions on shutdown: {e}")

# ─── FACULTY GROUPS MANAGEMENT ENDPOINTS ──────────────────────────────────────────
@app.get("/api/faculty-groups")
async def get_faculty_groups(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = supabase.table("faculty_groups").select("*").execute()
    groups = result.data or []
    
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
    
    supabase.table("meeting_groups").delete().eq("group_id", group_id).execute()
    supabase.table("faculty_group_members").delete().eq("group_id", group_id).execute()
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
    
    for meeting in meetings:
        groups_result = supabase.table("meeting_groups").select("*, faculty_groups(id, name, description)").eq("meeting_id", meeting["id"]).execute()
        meeting["assigned_groups"] = groups_result.data or []
        
        responses = supabase.table("meeting_responses").select("id").eq("meeting_id", meeting["id"]).execute()
        meeting["responses_count"] = len(responses.data or [])
    
    return meetings

@app.get("/api/meetings/faculty/{user_id}")
async def get_faculty_meetings(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    user_groups_result = supabase.table("faculty_group_members").select("group_id").eq("user_id", user_id).execute()
    user_group_ids = [gm["group_id"] for gm in (user_groups_result.data or [])]
    
    if not user_group_ids:
        return []
    
    meetings_result = supabase.table("meeting_groups").select("meeting_id").in_("group_id", user_group_ids).execute()
    meeting_ids = list(set([mg["meeting_id"] for mg in (meetings_result.data or [])]))
    
    if not meeting_ids:
        return []
    
    result = supabase.table("meetings").select("*").in_("id", meeting_ids).order("meeting_date", desc=True).execute()
    meetings = result.data or []
    
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
    
    groups_result = supabase.table("meeting_groups").select("*, faculty_groups(id, name, description)").eq("meeting_id", meeting_id).execute()
    meeting["assigned_groups"] = groups_result.data or []
    
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
    
    supabase.table("meeting_responses").delete().eq("meeting_id", meeting_id).execute()
    supabase.table("meeting_groups").delete().eq("meeting_id", meeting_id).execute()
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
    response = data.get("response")
    
    if response not in ["attending", "maybe", "not_attending"]:
        raise HTTPException(status_code=400, detail="Invalid response")
    
    existing = supabase.table("meeting_responses").select("*").eq("meeting_id", meeting_id).eq("user_id", user_id).execute()
    
    response_data = {
        "meeting_id": meeting_id,
        "user_id": user_id,
        "response": response,
        "responded_at": datetime.utcnow().isoformat()
    }
    
    if existing.data:
        result = supabase.table("meeting_responses").update(response_data).eq("meeting_id", meeting_id).eq("user_id", user_id).execute()
    else:
        result = supabase.table("meeting_responses").insert(response_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to submit response")
    
    return result.data[0]

@app.get("/")
async def root():
    return {
        "message": "ADhoc.ai Backend API is running.",
        "docs": "/docs",
        "health": "/health"
    }
