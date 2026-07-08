import json
from datetime import datetime
from typing import Optional, Dict, List, Any
from fastapi import APIRouter, Depends, HTTPException, Request, Response, WebSocket
from database import supabase
from auth_utils import get_current_user
import config

router = APIRouter(prefix="/api/calls", tags=["calls"])

from pydantic import BaseModel


class CallInitiateInput(BaseModel):
    phone_number: Optional[str] = None
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    topic: Optional[str] = None

async def broadcast_call_status(call_id: str, status: str):
    """Helper to broadcast call status changes to monitoring WebSockets"""
    if call_id in config.active_monitors:
        disconnected = []
        for ws in config.active_monitors[call_id]:
            try:
                await ws.send_json({
                    "type": "status",
                    "status": status
                })
            except Exception:
                disconnected.append(ws)
        for ws in disconnected:
            try:
                config.active_monitors[call_id].remove(ws)
            except ValueError:
                pass

@router.post("/initiate")
async def initiate_call(data: CallInitiateInput, current_user: dict = Depends(get_current_user)):
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

    if data.phone_number and config.TWILIO_SID and config.TWILIO_PHONE:
        try:
            from twilio.rest import Client
            twilio = Client(config.TWILIO_SID, config.TWILIO_TOKEN)
            callback_url = f"{config.BACKEND_URL.rstrip('/')}/api/calls/webhook?call_id={call['id']}"
            if not callback_url.lower().startswith("https://"):
                raise RuntimeError("Twilio callback_url must be HTTPS and publicly accessible")
            twilio_call = twilio.calls.create(
                to=data.phone_number,
                from_=config.TWILIO_PHONE,
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

@router.post("/webhook")
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
        
        await broadcast_call_status(call["id"], call_status)

    from twilio.twiml.voice_response import VoiceResponse, Connect
    resp = VoiceResponse()
    
    if call and call_status not in ["completed", "failed", "busy", "no-answer"]:
        ws_url = config.BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://")
        connect = Connect()
        connect.stream(url=f"{ws_url.rstrip('/')}/ws/voice/{call['id']}")
        resp.append(connect)
    else:
        resp.hangup()

    return Response(content=str(resp), media_type="application/xml")

@router.get("")
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

@router.post("/{call_id}/end")
async def end_twilio_call(call_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
        
    result = supabase.table("calls").select("*").eq("id", call_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")
        
    call = result.data[0]
    twilio_sid = call.get("twilio_sid")
    if twilio_sid and config.TWILIO_SID and config.TWILIO_PHONE:
        try:
            from twilio.rest import Client
            twilio = Client(config.TWILIO_SID, config.TWILIO_TOKEN)
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

@router.get("/{call_id}/transcript")
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
