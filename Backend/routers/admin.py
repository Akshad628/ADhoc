from datetime import datetime
from typing import Optional, List, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, model_validator
from database import supabase
from auth_utils import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])

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

@router.get("/scholarships")
async def admin_get_scholarships(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
    res = supabase.table("scholarships").select("*").order("created_at", desc=True).execute()
    return res.data or []

@router.post("/scholarships")
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

@router.put("/scholarships/{sch_id}")
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

@router.delete("/scholarships/{sch_id}")
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

@router.get("/scholarship-applications")
async def admin_get_applications(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Access denied. Admin only.")
        
    res = supabase.table("scholarship_applications").select(
        "*, student:student_id(full_name, email), scholarship:scholarship_id(title, provider_name, scholarship_amount)"
    ).order("created_at", desc=True).execute()
    return res.data or []

@router.put("/scholarship-applications/{app_id}")
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
