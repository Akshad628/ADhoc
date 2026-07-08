import requests
import uuid

BACKEND_URL = "http://127.0.0.1:8000"

def test_root():
    print("Testing root endpoint...")
    try:
        r = requests.get(f"{BACKEND_URL}/", timeout=5)
        print("Status code:", r.status_code)
        if r.status_code == 200:
            print("Response:", r.json())
        else:
            print("Response text:", r.text)
    except Exception as e:
        print("Root check failed:", e)

def test_auth_and_endpoints():
    print("\nTesting authentication and refactored endpoints...")
    test_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    test_password = "password123"
    test_fullname = "Test Student Integration"
    
    # 1. Sign Up
    signup_payload = {
        "email": test_email,
        "password": test_password,
        "full_name": test_fullname,
        "phone": "+1234567890"
    }
    print(f"1. Attempting sign up for {test_email}...")
    try:
        r = requests.post(f"{BACKEND_URL}/api/auth/signup", json=signup_payload, timeout=5)
        print("Signup status:", r.status_code)
        if r.status_code != 200:
            print("Signup failed:", r.text)
            return
        signup_data = r.json()
        print("Signup success! Token type:", signup_data.get("token_type"))
    except Exception as e:
        print("Signup exception:", e)
        return

    # 2. Login
    login_payload = {
        "email": test_email,
        "password": test_password
    }
    print(f"\n2. Attempting login for {test_email}...")
    try:
        r = requests.post(f"{BACKEND_URL}/api/auth/login", json=login_payload, timeout=5)
        print("Login status:", r.status_code)
        if r.status_code != 200:
            print("Login failed:", r.text)
            return
        login_data = r.json()
        token = login_data.get("access_token")
        print("Login success! Token retrieved.")
    except Exception as e:
        print("Login exception:", e)
        return

    # Authenticated Headers
    headers = {
        "Authorization": f"Bearer {token}"
    }

    # 3. Test GET /api/auth/me
    print("\n3. Testing /api/auth/me...")
    try:
        r = requests.get(f"{BACKEND_URL}/api/auth/me", headers=headers, timeout=5)
        print("Me status:", r.status_code)
        print("User details:", r.json())
    except Exception as e:
        print("Me check exception:", e)

    # 4. Test GET /api/dashboard/student
    print("\n4. Testing /api/dashboard/student...")
    try:
        r = requests.get(f"{BACKEND_URL}/api/dashboard/student", headers=headers, timeout=5)
        print("Student dashboard status:", r.status_code)
        print("Dashboard response summary:", list(r.json().keys()))
    except Exception as e:
        print("Dashboard check exception:", e)

    # 5. Test GET /api/student/profile
    print("\n5. Testing /api/student/profile...")
    try:
        r = requests.get(f"{BACKEND_URL}/api/student/profile", headers=headers, timeout=5)
        print("Student profile status:", r.status_code)
        print("Profile response summary:", list(r.json().keys()))
    except Exception as e:
        print("Profile check exception:", e)

    # 6. Test GET /api/voice/fastrtc-status
    print("\n6. Testing /api/voice/fastrtc-status...")
    try:
        r = requests.get(f"{BACKEND_URL}/api/voice/fastrtc-status", timeout=5)
        print("FastRTC status endpoint code:", r.status_code)
        print("FastRTC status details:", r.json())
    except Exception as e:
        print("FastRTC status check exception:", e)

if __name__ == "__main__":
    test_root()
    test_auth_and_endpoints()
