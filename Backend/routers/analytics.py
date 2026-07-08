from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException
from database import supabase
from auth_utils import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("")
async def get_analytics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    calls = supabase.table("calls").select("*").execute().data or []
    users = supabase.table("users").select("*").execute().data or []

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

@router.get("/summary")
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

@router.get("/calls-over-time")
async def get_calls_over_time(days: int = 30, current_user: dict = Depends(get_current_user)):
    role = current_user["role"]
    uid = current_user["id"]
    
    query = supabase.table("calls").select("created_at, duration")
    if role == "student":
        query = query.eq("user_id", uid)
    calls = query.execute().data or []
    
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

@router.get("/sentiment")
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

@router.get("/top-agents")
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
