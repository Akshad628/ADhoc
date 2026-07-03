// ─── DIGITAL STUDENT ACADEMIC PORTFOLIO — TypeScript Types ───────────────────
// Matches the actual Supabase schema exactly.

// ── Enums / Literal Types ────────────────────────────────────────────────────

export type VerificationStatus = 'pending' | 'verified' | 'rejected'
export type AnalysisStatus = 'pending' | 'generating' | 'ready' | 'failed'
export type AccountStatus = 'active' | 'suspended' | 'pending_verification' | 'deactivated'
export type StrengthLabel = 'Getting Started' | 'Building' | 'Good' | 'Strong' | 'Excellent'

export type VisibilityLevel =
  | 'private'
  | 'institution'
  | 'faculty'
  | 'placement_cell'
  | 'admission_officers'
  | 'public'

export type AcademicLevel = '10th' | '12th' | 'Diploma' | 'UG' | 'PG' | 'PhD' | 'Other'

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
  | string

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
  | string

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
// Table: student_profiles — uses user_id FK

export interface StudentProfile {
  id: string
  user_id: string
  profile_photo_url?: string
  blood_group?: string
  country?: string
  postal_code?: string
  father_name?: string
  father_phone?: string
  mother_name?: string
  mother_phone?: string
  guardian_phone?: string
  annual_income?: number
  profile_completion?: number
  date_of_birth?: string
  gender?: string
  nationality?: string
  category?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  guardian_name?: string
  created_at: string
  updated_at: string
}

// ── Academic Records ──────────────────────────────────────────────────────────
// Table: academic_records — uses student_id FK

export interface AcademicRecord {
  id: string
  student_id: string
  education_level: AcademicLevel
  institution_name?: string
  board_university?: string
  degree?: string
  specialization?: string
  hall_ticket_number?: string
  year_of_passing?: number
  percentage?: number
  cgpa?: number
  max_cgpa?: number
  current_semester?: number
  backlogs?: number
  marksheet_document_id?: string
  remarks?: string
  is_current?: boolean
  created_at: string
  updated_at: string
}

// ── Semester Marks ────────────────────────────────────────────────────────────
// Table: semester_marks — uses student_id FK

export interface SemesterMark {
  id: string
  student_id: string
  semester: number
  academic_year?: string
  sgpa?: number
  cgpa?: number
  credits_earned?: number
  total_credits?: number
  result_status?: string
  marksheet_document_id?: string
  remarks?: string
  created_at: string
  updated_at: string
}

// ── Documents ─────────────────────────────────────────────────────────────────
// Table: student_documents — uses student_id FK

export interface StudentDocument {
  id: string
  student_id: string
  document_type: string
  document_name?: string
  file_name: string
  file_url?: string
  storage_bucket?: string
  signed_url?: string
  mime_type?: string
  file_size?: number
  ocr_status?: string
  extracted_data?: Record<string, unknown>
  ai_summary?: string
  verification_status: VerificationStatus
  is_verified: boolean
  verification_remarks?: string
  verified_by?: string
  verified_by_name?: string
  verified_at?: string
  is_active: boolean
  uploaded_at: string
  updated_at: string
}

// ── Certifications ────────────────────────────────────────────────────────────
// Table: student_certifications — uses student_id FK

export interface StudentCertification {
  id: string
  student_id: string
  title: string
  issuing_organization?: string
  category?: string
  description?: string
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  skills_gained?: string[]
  document_id?: string
  verification_status?: VerificationStatus
  created_at: string
  updated_at: string
}

// ── Skills ────────────────────────────────────────────────────────────────────
// Table: student_skills — uses student_id FK

export interface StudentSkills {
  id: string
  student_id: string
  programming_languages: string[]
  frameworks: string[]
  databases: string[]
  cloud_platforms: string[]
  ai_ml_skills: string[]
  web_technologies: string[]
  mobile_technologies: string[]
  devops_tools: string[]
  software_tools: string[]
  soft_skills: string[]
  languages_known: string[]
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  leetcode_url?: string
  codechef_url?: string
  hackerrank_url?: string
  codeforces_url?: string
  years_of_experience?: number
  bio?: string
  created_at: string
  updated_at: string
}

// ── Entrance Exams ────────────────────────────────────────────────────────────
// Table: entrance_exams — uses student_id FK

export interface EntranceExam {
  id: string
  student_id: string
  exam_name: string
  conducting_body?: string
  exam_year?: number
  application_number?: string
  hall_ticket_number?: string
  score?: number
  rank?: number
  percentile?: number
  qualification_status?: string
  exam_date?: string
  scorecard_document_id?: string
  remarks?: string
  created_at: string
  updated_at: string
}

// ── Achievements ──────────────────────────────────────────────────────────────
// Table: student_achievements — uses student_id FK

export interface StudentAchievement {
  id: string
  student_id: string
  achievement_title: string
  achievement_type?: string
  organizer_name?: string
  achievement_level?: string
  position_secured?: string
  description?: string
  achievement_date?: string
  certificate_document_id?: string
  verification_status?: VerificationStatus
  created_at: string
  updated_at: string
}

// ── Scholarships ──────────────────────────────────────────────────────────────

export interface Scholarship {
  id: string
  title: string
  provider_name?: string
  scholarship_type?: string
  description?: string
  eligibility_criteria?: string
  eligible_courses?: string[]
  eligible_categories?: string[]
  minimum_percentage?: number
  annual_income_limit?: number
  scholarship_amount?: number
  application_start_date?: string
  application_end_date?: string
  application_link?: string
  required_documents?: string[]
  contact_email?: string
  contact_phone?: string
  status: string
  is_featured: boolean
  created_at: string
  updated_at: string
}

export interface ScholarshipApplication {
  id: string
  scholarship_id: string
  student_id: string
  application_status: string
  application_date?: string
  remarks?: string
  admin_comments?: string
  reviewed_by?: string
  reviewed_at?: string
  approved_amount?: number
  scholarships?: { title: string; provider_name: string; scholarship_amount: number }
  created_at: string
  updated_at: string
}

// ── Admission Applications ────────────────────────────────────────────────────

export interface AdmissionApplication {
  id: string
  student_id: string
  institution_id?: string
  application_number?: string
  course_name?: string
  specialization?: string
  admission_type?: string
  academic_year?: string
  application_status: string
  application_date?: string
  application_fee?: number
  payment_status?: string
  remarks?: string
  reviewed_by?: string
  reviewed_at?: string
  admission_letter_url?: string
  institutions?: { name: string }
  created_at: string
  updated_at: string
}

// ── AI Insights ───────────────────────────────────────────────────────────────
// Table: ai_profile_analysis — uses student_id FK

export interface AIInsights {
  id?: string
  student_id?: string
  overall_profile_score: number
  academic_score: number
  skill_score: number
  document_score?: number
  certification_score?: number
  achievement_score?: number
  entrance_exam_score?: number
  profile_completion_percentage?: number
  missing_documents: MissingDocument[]
  missing_profile_fields?: string[]
  scholarship_recommendations: ScholarshipRecommendation[]
  college_recommendations?: Record<string, unknown>[]
  course_recommendations?: Record<string, unknown>[]
  career_recommendations: CareerRecommendation[]
  internship_recommendations?: Record<string, unknown>[]
  skill_gap_analysis: SkillGapItem[]
  improvement_suggestions?: string[]
  ai_summary?: string
  ats_score?: number
  generated_at?: string
  last_analyzed_at?: string
  analysis_version?: string
  analysis_status?: AnalysisStatus
  trigger_event?: string
  created_at?: string
  updated_at?: string
}

export interface MissingDocument {
  name: string
  category: string
  priority: 'high' | 'medium' | 'low'
  reason?: string
}

export interface ScholarshipRecommendation {
  title: string
  provider?: string
  match_score: number
  eligibility?: string
}

export interface SkillGapItem {
  skill: string
  demand: 'high' | 'medium' | 'low'
  courses?: string[]
}

export interface CareerRecommendation {
  title: string
  type: string
  reason?: string
}

// ── Full Profile Aggregate (GET /api/student/profile) ─────────────────────────

export interface FullStudentProfile {
  user: AuthUser
  profile: StudentProfile | null
  academic_records: AcademicRecord[]
  semester_marks: SemesterMark[]
  skills: StudentSkills | null
  certifications: StudentCertification[]
  exams: EntranceExam[]
  achievements: StudentAchievement[]
  documents: StudentDocument[]
  strength: ProfileStrength
}

// ── API Request Bodies ────────────────────────────────────────────────────────

export interface UpdateProfileRequest {
  profile_photo_url?: string
  date_of_birth?: string
  gender?: string
  blood_group?: string
  nationality?: string
  category?: string
  address_line1?: string
  address_line2?: string
  city?: string
  state?: string
  country?: string
  postal_code?: string
  father_name?: string
  father_phone?: string
  mother_name?: string
  mother_phone?: string
  guardian_name?: string
  guardian_phone?: string
  annual_income?: number
}

export interface UpsertAcademicRecordRequest {
  education_level?: string
  institution_name?: string
  board_university?: string
  degree?: string
  specialization?: string
  hall_ticket_number?: string
  year_of_passing?: number
  percentage?: number
  cgpa?: number
  max_cgpa?: number
  current_semester?: number
  backlogs?: number
  remarks?: string
  is_current?: boolean
}

export interface UpsertSemesterMarkRequest {
  semester: number
  academic_year?: string
  sgpa?: number
  cgpa?: number
  credits_earned?: number
  total_credits?: number
  result_status?: string
  remarks?: string
}

export interface CreateCertificationRequest {
  title: string
  issuing_organization?: string
  category?: string
  description?: string
  issue_date?: string
  expiry_date?: string
  credential_id?: string
  credential_url?: string
  skills_gained?: string[]
  document_id?: string
}

export interface UpdateSkillsRequest {
  programming_languages?: string[]
  frameworks?: string[]
  databases?: string[]
  cloud_platforms?: string[]
  ai_ml_skills?: string[]
  web_technologies?: string[]
  mobile_technologies?: string[]
  devops_tools?: string[]
  software_tools?: string[]
  soft_skills?: string[]
  languages_known?: string[]
  github_url?: string
  linkedin_url?: string
  portfolio_url?: string
  leetcode_url?: string
  codechef_url?: string
  hackerrank_url?: string
  codeforces_url?: string
  years_of_experience?: number
  bio?: string
}

export interface CreateEntranceExamRequest {
  exam_name: string
  conducting_body?: string
  exam_year?: number
  application_number?: string
  hall_ticket_number?: string
  score?: number
  rank?: number
  percentile?: number
  qualification_status?: string
  exam_date?: string
  remarks?: string
  scorecard_document_id?: string
}

export interface CreateAchievementRequest {
  achievement_title?: string
  achievement_type?: string
  organizer_name?: string
  achievement_level?: string
  position_secured?: string
  description?: string
  achievement_date?: string
  certificate_document_id?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
  confirm_password: string
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

export interface PrivacySettings {
  id?: string
  user_id?: string
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

export interface TimelineEvent {
  id: string
  user_id?: string
  student_id?: string
  event_type: string
  title: string
  description?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface StudentNotification {
  id: string
  user_id?: string
  student_id?: string
  type?: string
  title: string
  message?: string
  action_url?: string
  is_read: boolean
  metadata?: Record<string, unknown>
  created_at: string
}
