import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "student_portfolio.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 1. student_profiles
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        photo_url TEXT,
        date_of_birth TEXT,
        gender TEXT,
        nationality TEXT,
        category TEXT,
        aadhaar_number TEXT,
        pan_number TEXT,
        passport_number TEXT,
        address_line1 TEXT,
        address_line2 TEXT,
        city TEXT,
        state TEXT,
        district TEXT,
        pincode TEXT,
        alternate_phone TEXT,
        parent_name TEXT,
        parent_phone TEXT,
        parent_email TEXT,
        guardian_name TEXT,
        current_institution TEXT,
        department TEXT,
        current_year INTEGER,
        current_semester INTEGER,
        strength_total INTEGER DEFAULT 0,
        strength_label TEXT DEFAULT 'Getting Started',
        strength_personal INTEGER DEFAULT 0,
        strength_academic INTEGER DEFAULT 0,
        strength_skills INTEGER DEFAULT 0,
        strength_documents INTEGER DEFAULT 0,
        strength_achievements INTEGER DEFAULT 0,
        strength_career INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 2. student_privacy_settings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_privacy_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        personal_info_visibility TEXT DEFAULT 'institution',
        contact_visibility TEXT DEFAULT 'institution',
        academic_visibility TEXT DEFAULT 'institution',
        documents_visibility TEXT DEFAULT 'faculty',
        certifications_visibility TEXT DEFAULT 'institution',
        skills_visibility TEXT DEFAULT 'placement_cell',
        achievements_visibility TEXT DEFAULT 'institution',
        exams_visibility TEXT DEFAULT 'admission_officers',
        profile_public_link BOOLEAN DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 3. academic_records
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS academic_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        level TEXT NOT NULL,
        institution_name TEXT,
        board_university TEXT,
        degree TEXT,
        branch_stream TEXT,
        hall_ticket TEXT,
        year_of_passing INTEGER,
        percentage REAL,
        cgpa REAL,
        current_semester INTEGER,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 4. semester_marks
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS semester_marks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        semester INTEGER NOT NULL,
        year INTEGER,
        sgpa REAL,
        cgpa REAL,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 5. student_skills
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_skills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        programming_langs TEXT,
        frameworks TEXT,
        databases TEXT,
        cloud_technologies TEXT,
        ai_ml_skills TEXT,
        tools TEXT,
        soft_skills TEXT,
        languages_known TEXT,
        github_url TEXT,
        linkedin_url TEXT,
        portfolio_url TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 6. student_certifications
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_certifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        issuing_org TEXT,
        category TEXT,
        issue_date TEXT,
        expiry_date TEXT,
        credential_id TEXT,
        credential_url TEXT,
        document_id TEXT,
        created_at TEXT
    )
    """)
    
    # 7. entrance_exams
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS entrance_exams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        exam_name TEXT NOT NULL,
        year INTEGER,
        score REAL,
        rank INTEGER,
        percentile REAL,
        document_id TEXT,
        created_at TEXT
    )
    """)
    
    # 8. student_achievements
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT,
        description TEXT,
        date TEXT,
        document_id TEXT,
        created_at TEXT
    )
    """)
    
    # 9. student_preferences
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        target_colleges TEXT,
        preferred_courses TEXT,
        preferred_locations TEXT,
        career_interests TEXT,
        notification_email BOOLEAN DEFAULT 1,
        notification_sms BOOLEAN DEFAULT 1,
        notification_app BOOLEAN DEFAULT 1,
        settings TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 10. ai_profile_analysis
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_profile_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        profile_strength INTEGER DEFAULT 0,
        profile_strength_label TEXT DEFAULT 'Getting Started',
        missing_documents TEXT,
        scholarship_suggestions TEXT,
        skill_gaps TEXT,
        career_suggestions TEXT,
        college_recommendations TEXT,
        ats_score INTEGER,
        analysis_summary TEXT,
        analysis_status TEXT DEFAULT 'pending',
        generated_at TEXT,
        trigger_hash TEXT,
        trigger_event TEXT
    )
    """)
    
    # 11. student_timeline
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        metadata TEXT,
        created_at TEXT
    )
    """)
    
    # 12. student_notifications
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT,
        title TEXT NOT NULL,
        message TEXT,
        action_url TEXT,
        is_read BOOLEAN DEFAULT 0,
        created_at TEXT
    )
    """)
    
    # 13. student_documents
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        file_name TEXT,
        file_path TEXT,
        file_size INTEGER,
        mime_type TEXT,
        category TEXT,
        status TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """)
    
    # 14. student_document_versions
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS student_document_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        version INTEGER NOT NULL,
        file_path TEXT,
        file_size INTEGER,
        created_at TEXT
    )
    """)
    
    conn.commit()
    conn.close()

# Initialize DB on module import
init_db()

class SupabaseResponseMock:
    def __init__(self, data):
        self.data = data

class SQLiteTableWrapper:
    def __init__(self, table_name):
        self.table_name = table_name
        self.filters = []
        self.order_by = None
        self.limit_val = None
        self.offset_val = None
        self.action = ('select', None)

    def select(self, columns="*"):
        return self

    def eq(self, column, value):
        self.filters.append((column, "=", value))
        return self

    def order(self, column, desc=False):
        self.order_by = (column, "DESC" if desc else "ASC")
        return self

    def range(self, start, end):
        self.limit_val = end - start + 1
        self.offset_val = start
        return self

    def limit(self, limit):
        self.limit_val = limit
        return self

    def insert(self, data):
        self.action = ('insert', data)
        return self

    def update(self, data):
        self.action = ('update', data)
        return self

    def upsert(self, data):
        self.action = ('upsert', data)
        return self

    def delete(self):
        self.action = ('delete', None)
        return self

    def execute(self):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        action_type = self.action[0]
        result_data = []
        
        try:
            if action_type == "select":
                query = f"SELECT * FROM {self.table_name}"
                params = []
                if self.filters:
                    where_clauses = []
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        params.append(val)
                    query += " WHERE " + " AND ".join(where_clauses)
                if self.order_by:
                    col, direction = self.order_by
                    query += f" ORDER BY {col} {direction}"
                if self.limit_val is not None:
                    query += f" LIMIT {self.limit_val}"
                if self.offset_val is not None:
                    query += f" OFFSET {self.offset_val}"
                    
                cursor.execute(query, params)
                rows = cursor.fetchall()
                result_data = [self._process_row_out(dict(row)) for row in rows]
                
            elif action_type == "insert":
                data = self.action[1]
                if isinstance(data, dict):
                    inserted_rows = [self._insert_row(cursor, data)]
                elif isinstance(data, list):
                    inserted_rows = [self._insert_row(cursor, item) for item in data]
                else:
                    inserted_rows = []
                conn.commit()
                result_data = inserted_rows
                
            elif action_type == "update":
                data = self.action[1]
                set_clauses = []
                params = []
                for k, v in data.items():
                    set_clauses.append(f"{k} = ?")
                    params.append(self._process_val_in(v))
                    
                query = f"UPDATE {self.table_name} SET " + ", ".join(set_clauses)
                
                if self.filters:
                    where_clauses = []
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        params.append(val)
                    query += " WHERE " + " AND ".join(where_clauses)
                    
                cursor.execute(query, params)
                conn.commit()
                
                # Fetch matching rows to return them
                query_select = f"SELECT * FROM {self.table_name}"
                select_params = []
                if self.filters:
                    where_clauses = []
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        select_params.append(val)
                    query_select += " WHERE " + " AND ".join(where_clauses)
                cursor.execute(query_select, select_params)
                rows = cursor.fetchall()
                result_data = [self._process_row_out(dict(row)) for row in rows]
                
            elif action_type == "upsert":
                data = self.action[1]
                if isinstance(data, dict):
                    upserted_rows = [self._upsert_row(cursor, data)]
                elif isinstance(data, list):
                    upserted_rows = [self._upsert_row(cursor, item) for item in data]
                else:
                    upserted_rows = []
                conn.commit()
                result_data = upserted_rows
                
            elif action_type == "delete":
                query = f"DELETE FROM {self.table_name}"
                params = []
                if self.filters:
                    where_clauses = []
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        params.append(val)
                    query += " WHERE " + " AND ".join(where_clauses)
                    
                # Fetch before delete
                query_select = f"SELECT * FROM {self.table_name}"
                cursor.execute(query_select, params)
                rows = cursor.fetchall()
                result_data = [self._process_row_out(dict(row)) for row in rows]
                
                cursor.execute(query, params)
                conn.commit()
                
        except Exception as e:
            conn.rollback()
            conn.close()
            raise e
        finally:
            conn.close()
            
        return SupabaseResponseMock(result_data)

    def _insert_row(self, cursor, data):
        processed_data = {k: self._process_val_in(v) for k, v in data.items()}
        cols = list(processed_data.keys())
        vals = list(processed_data.values())
        placeholders = ", ".join(["?"] * len(cols))
        query = f"INSERT INTO {self.table_name} ({', '.join(cols)}) VALUES ({placeholders})"
        cursor.execute(query, vals)
        row_id = cursor.lastrowid
        
        cursor.execute(f"SELECT * FROM {self.table_name} WHERE rowid = ?", (row_id,))
        row = cursor.fetchone()
        return self._process_row_out(dict(row)) if row else {}

    def _upsert_row(self, cursor, data):
        processed_data = {k: self._process_val_in(v) for k, v in data.items()}
        cols = list(processed_data.keys())
        vals = list(processed_data.values())
        placeholders = ", ".join(["?"] * len(cols))
        
        query = f"INSERT OR REPLACE INTO {self.table_name} ({', '.join(cols)}) VALUES ({placeholders})"
        cursor.execute(query, vals)
        row_id = cursor.lastrowid
        
        if "user_id" in data:
            cursor.execute(f"SELECT * FROM {self.table_name} WHERE user_id = ?", (data["user_id"],))
        elif "id" in data:
            cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (data["id"],))
        else:
            cursor.execute(f"SELECT * FROM {self.table_name} WHERE rowid = ?", (row_id,))
            
        row = cursor.fetchone()
        return self._process_row_out(dict(row)) if row else {}

    def _process_val_in(self, val):
        if isinstance(val, (list, dict)):
            return json.dumps(val)
        return val

    def _process_row_out(self, row_dict):
        res = {}
        for k, v in row_dict.items():
            if isinstance(v, str):
                if (v.startswith("[") and v.endswith("]")) or (v.startswith("{") and v.endswith("}")):
                    try:
                        res[k] = json.loads(v)
                    except Exception:
                        res[k] = v
                else:
                    res[k] = v
            else:
                res[k] = v
        return res

class SupabaseOfflineWrapper:
    def __init__(self, real_client):
        self.real_client = real_client
        self.missing_tables = {
            "student_profiles",
            "student_privacy_settings",
            "academic_records",
            "semester_marks",
            "student_skills",
            "student_certifications",
            "entrance_exams",
            "student_achievements",
            "student_preferences",
            "ai_profile_analysis",
            "student_timeline",
            "student_notifications",
            "student_documents",
            "student_document_versions"
        }

    def table(self, table_name: str):
        if table_name in self.missing_tables:
            return SQLiteTableWrapper(table_name)
        return self.real_client.table(table_name)

    def __getattr__(self, name):
        return getattr(self.real_client, name)
