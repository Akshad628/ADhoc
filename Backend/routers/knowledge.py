from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel
from database import supabase
from auth_utils import get_current_user

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

class KnowledgeUpload(BaseModel):
    title: str
    content: str
    category: str
    tags: List[str] = []

@router.post("")
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

@router.get("")
async def get_knowledge(category: Optional[str] = None, search: Optional[str] = None):
    query = supabase.table("knowledge_base").select("*")
    if category:
        query = query.eq("category", category)
    if search:
        query = query.or_(f"title.ilike.%{search}%,content.ilike.%{search}%")
    result = query.execute()
    return result.data or []

@router.post("/upload")
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

@router.put("/{knowledge_id}")
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

@router.delete("/{knowledge_id}")
async def delete_knowledge(
    knowledge_id: str,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] not in ["admin", "faculty"]:
        raise HTTPException(status_code=403, detail="Admin/Faculty access required")

    supabase.table("knowledge_base").delete().eq("id", knowledge_id).execute()
    return {"success": True}
