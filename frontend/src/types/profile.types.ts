// ─── DIGITAL STUDENT ACADEMIC PORTFOLIO — TypeScript Types ───────────────────
// All interfaces for the profile module. Matches the normalized DB schema exactly.

// ── Enums / Literal Types ────────────────────────────────────────────────────

export type VisibilityLevel =
  | 'private'
  | 'institution'
  | 'faculty'
  | 'placement_cell'
  | 'admission_officers'
  | 'public'

export type VerificationStatus = 'pending' | 'verified' | 'rejected'
export type AnalysisStatus = 'pending' | 'generating' | 'ready' | 'failed'
export type AccountStatus = 'active' | 'suspended' | 'pending_verification' | 'deactivated'
export type StrengthLabel = 'Getting Started' | 'Building' | 'Good' | 'Strong' | 'Excellent'

export type AcademicLevel = '10th' | 'intermediate' | 'diploma' | 'ug' | 'pg'

export type DocumentCategory =
  | 'identity'
  | 'academic'
  | 'entrance'
  | 'internship'
  | 'project'
  | 'certification'
  | 'achievement'
  | 'placement'
  | 'other'

export type CertificationCategory =
  | 'online_course'
  | 'hackathon'
  | 'sports'
  | 'ncc'
  | 'nss'
  | 'workshop'
  | 'conference'
  | 'research'
  | 'patent'
  | 'volunteering'
  | 'cultural'

export type ExamName =
  | 'EAMCET'
  | 'JEE_MAIN'
  | 'JEE_ADVANCED'
  | 'NEET'
  | 'CUET'
  | 'GATE'
  | 'CAT'
  | 'GRE'
  | 'IELTS'
  | 'TOEFL'
  | string  // allow custom

// ── OCR Types ────────────────────────────────────────────────────────────────

export interface OCRField {
  value: string
  confidence: number   // 0.0 – 1.0. Flag < 0.85 for manual review
}

export interface OCRMetadata {
  extracted: Record<string, OCRField>
  low_confidence_threshold: number
  processed_at: string
  ocr_engine: string
}

// ── Profile Strength ──────────────────────────────────────────────────────────

export interface ProfileStrength {
  total: number
  label: StrengthLabel
  personal: number
  academic: number
  skills: number
  documents: number
  achievements: number
  career: number
}

// ── Auth / User ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
  full_name: string
  phone?: string
  role: 'student' | 'faculty' | 'admin'
  email_verified: boolean
  account_status: AccountStatus
  last_login?: string
  password_updated_at?: string
  created_at: string
}

// ── Student Profile ───────────────────────────────────────────────────────────

export interface StudentProfile {
  id: string
  user_id: string
  student_id?: string          // null until admission approved
  photo_url?: string
  date_of_birth?: string
  gender?: string
  nationality?: string
  category?: string
  aadhaar_number?: string
  pan_number?: string
  passport_number?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  district?: string
  pincode?: string
  alternate_phone?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  guardian_name?: string
  current_institution?: string
  department?: string
  current_year?: number
  current_semester?: number
  // Strength sub-scores (backend-calculated)
  strength_total: number
  strength_personal: number
  strength_academic: number
  strength_skills: number
  strength_documents: number
  strength_achievements: number
  strength_career: number
  strength_label: StrengthLabel
  created_at: string
  updated_at: string
}

// ── Privacy Settings ──────────────────────────────────────────────────────────

export interface PrivacySettings {
  id: string
  user_id: string
  personal_info_visibility: VisibilityLevel
  contact_visibility: VisibilityLevel
  academic_visibility: VisibilityLevel
  documents_visibility: VisibilityLevel
  certifications_visibility: VisibilityLevel
  skills_visibility: VisibilityLevel
  achievements_visibility: VisibilityLevel
  exams_visibility: VisibilityLevel
  profile_public_link: boolean
  public_link_token?: string
}

// ── Academic Records ──────────────────────────────────────────────────────────

export interface AcademicRecord {
  id: string
  user_id: string
  level: AcademicLevel
  institution_name?: string
  board_university?: string
  degree?: string
  branch_stream?: string
  hall_ticket?: string
  year_of_passing?: number
  percentage?: number
  cgpa?: number
  current_semester?: number
  document_id?: string
  created_at: string
  updated_at: string
}

// ── Semester Marks ────────────────────────────────────────────────────────────

export interface SemesterMark {
  id: string
  user_id: string
  semester: number
  year?: number
  sgpa?: number
  cgpa?: number
  document_id?: string
  created_at: string
  updated_at: string
}

// ── Documents ─────────────────────────────────────────────────────────────────

export interface StudentDocument {
  id: string
  user_id: string
  category: DocumentCategory
  sub_category?: string
  file_name: string
  original_file_name: string
  storage_path: string
  signed_url?: string          // generated on fetch, not stored
  mime_type?: string
  file_size_bytes?: number
  version_number: number
  visibility: VisibilityLevel
  verification_status: VerificationStatus
  verified_by?: string
  verified_at?: string
  review_comments?: string
  rejection_reason?: string
  ocr_metadata: OCRMetadata | Record<string, never>
  ai_metadata: Record<string, unknown>
  uploaded_at: string
  updated_at: string
}

export interface DocumentVersion {
  id: string
  document_id: string
  user_id: string
  version_number: number
  file_name: string
  original_file_name: string
  storage_path: string
  mime_type?: string
  file_size_bytes?: number
  ocr_metadata: OCRMetadata | Record<string, never>
  archived_at: string
  archived_reason: string
}

// ── Certifications ────────────────────────────────────────────────────────────

export interface StudentCertification {
  id: string
  user_id: string
  title: string
  issuing_org?: string
  category?: CertificationCategory
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  document_id?: string
  created_at: string
  updated_at: string
}

// ── Skills ────────────────────────────────────────────────────────────────────

export interface StudentSkills {
  id: string
  user_id: string
  programming_langs: string[]
  frameworks: string[]
  databases: string[]
  cloud_technologies: string[]
  ai_ml_skills: string[]
  tools: string[]
  soft_skills: string[]
  languages_known: string[]
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  created_at: string
  updated_at: string
}

// ── Entrance Exams ────────────────────────────────────────────────────────────

export interface EntranceExam {
  id: string
  user_id: string
  exam_name: ExamName
  year?: number
  score?: number
  rank?: number
  percentile?: number
  document_id?: string
  created_at: string
  updated_at: string
}

// ── Achievements ──────────────────────────────────────────────────────────────

export interface StudentAchievement {
  id: string
  user_id: string
  title: string
  category?: string
  description?: string
  date?: string
  document_id?: string
  created_at: string
  updated_at: string
}

// ── Preferences ───────────────────────────────────────────────────────────────

export interface StudentPreferences {
  id: string
  user_id: string
  target_colleges: string[]
  preferred_courses: string[]
  preferred_locations: string[]
  career_interests: string[]
  notification_email: boolean
  notification_sms: boolean
  notification_app: boolean
  settings: Record<string, unknown>
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string
  user_id: string
  event_type: string
  title: string
  description?: string
  metadata: Record<string, unknown>
  created_at: string
}

// ── Notifications ─────────────────────────────────────────────────────────────

export interface StudentNotification {
  id: string
  user_id: string
  type: string
  title: string
  message: string
  action_url?: string
  is_read: boolean
  metadata: Record<string, unknown>
  created_at: string
}

// ── AI Insights ───────────────────────────────────────────────────────────────

export interface MissingDocument {
  name: string
  category: string
  priority: 'high' | 'medium' | 'low'
  reason: string
}

export interface ScholarshipSuggestion {
  name: string
  amount: string
  eligibility: string
  match_score: number
}

export interface SkillGap {
  skill: string
  demand: 'high' | 'medium' | 'low'
  suggested_courses: string[]
}

export interface CareerSuggestion {
  title: string
  type: 'certification' | 'course' | 'internship' | 'project'
  reason: string
}

export interface AIInsights {
  id: string
  user_id: string
  profile_strength: number
  profile_strength_label: StrengthLabel
  missing_documents: MissingDocument[]
  scholarship_suggestions: ScholarshipSuggestion[]
  college_recommendations: Record<string, unknown>[]
  skill_gaps: SkillGap[]
  career_suggestions: CareerSuggestion[]
  ats_score?: number
  analysis_summary?: string
  analysis_status: AnalysisStatus
  generated_at?: string
  trigger_event?: string
}

// ── Full Profile Aggregate (GET /api/student/profile) ─────────────────────────

export interface FullStudentProfile {
  user: AuthUser
  profile: StudentProfile | null
  privacy: PrivacySettings | null
  academic_records: AcademicRecord[]
  semester_marks: SemesterMark[]
  skills: StudentSkills | null
  certifications: StudentCertification[]
  exams: EntranceExam[]
  achievements: StudentAchievement[]
  preferences: StudentPreferences | null
  strength: ProfileStrength
}

// ── API Request Bodies ────────────────────────────────────────────────────────

export interface UpdateProfileRequest {
  photo_url?: string
  date_of_birth?: string
  gender?: string
  nationality?: string
  category?: string
  aadhaar_number?: string
  pan_number?: string
  passport_number?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  district?: string
  pincode?: string
  alternate_phone?: string
  parent_name?: string
  parent_phone?: string
  parent_email?: string
  guardian_name?: string
  current_institution?: string
  department?: string
  current_year?: number
  current_semester?: number
}

export interface UpsertAcademicRecordRequest {
  level: AcademicLevel
  institution_name?: string
  board_university?: string
  degree?: string
  branch_stream?: string
  hall_ticket?: string
  year_of_passing?: number
  percentage?: number
  cgpa?: number
  current_semester?: number
}

export interface UpsertSemesterMarkRequest {
  semester: number
  year?: number
  sgpa?: number
  cgpa?: number
}

export interface CreateCertificationRequest {
  title: string
  issuing_org?: string
  category?: CertificationCategory
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  document_id?: string
}

export interface UpdateSkillsRequest {
  programming_langs?: string[]
  frameworks?: string[]
  databases?: string[]
  cloud_technologies?: string[]
  ai_ml_skills?: string[]
  tools?: string[]
  soft_skills?: string[]
  languages_known?: string[]
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
}

export interface CreateEntranceExamRequest {
  exam_name: ExamName
  year?: number
  score?: number
  rank?: number
  percentile?: number
  document_id?: string
}

export interface CreateAchievementRequest {
  title: string
  category?: string
  description?: string
  date?: string
  document_id?: string
}

export interface UpdatePreferencesRequest {
  target_colleges?: string[]
  preferred_courses?: string[]
  preferred_locations?: string[]
  career_interests?: string[]
  notification_email?: boolean
  notification_sms?: boolean
  notification_app?: boolean
  settings?: Record<string, unknown>
}

export interface UpdatePrivacyRequest {
  personal_info_visibility?: VisibilityLevel
  contact_visibility?: VisibilityLevel
  academic_visibility?: VisibilityLevel
  documents_visibility?: VisibilityLevel
  certifications_visibility?: VisibilityLevel
  skills_visibility?: VisibilityLevel
  achievements_visibility?: VisibilityLevel
  exams_visibility?: VisibilityLevel
  profile_public_link?: boolean
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
  confirm_password: string
}
