from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import supabase
from auth_utils import get_current_user

router = APIRouter(prefix="/api/agents", tags=["agents"])

class AgentUpdate(BaseModel):
    system_prompt: str

@router.get("")
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

@router.put("/{agent_id}")
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
