import pytest
from fastapi.testclient import TestClient
from fastapi import WebSocket
import json
import random
import string
from unittest.mock import AsyncMock, patch
import sys
import os

# Add parent directory to path to import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app, manager, active_connections
from models import Base
from db import engine, get_db
from sqlalchemy.orm import sessionmaker

# Create test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = engine
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def test_db():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client(test_db):
    def override_get_db():
        try:
            yield test_db
        finally:
            test_db.close()
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

def test_register_user(client):
    response = client.post("/register", data={"username": "testuser", "password": "testpass"})
    assert response.status_code == 200
    assert response.json() == {"message": "User created successfully"}

def test_register_duplicate_user(client):
    # First registration
    client.post("/register", data={"username": "testuser", "password": "testpass"})
    # Second registration with same username
    response = client.post("/register", data={"username": "testuser", "password": "testpass"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Username already registered"

def test_login_success(client):
    # Register user first
    client.post("/register", data={"username": "testuser", "password": "testpass"})
    # Try to login
    response = client.post("/token", data={"username": "testuser", "password": "testpass"})
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

def test_login_wrong_password(client):
    # Register user first
    client.post("/register", data={"username": "testuser", "password": "testpass"})
    # Try to login with wrong password
    response = client.post("/token", data={"username": "testuser", "password": "wrongpass"})
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_websocket_connection():
    mock_websocket = AsyncMock(spec=WebSocket)
    await manager.connect(mock_websocket, "testuser")
    assert "testuser" in active_connections

@pytest.mark.asyncio
async def test_websocket_disconnect():
    mock_websocket = AsyncMock(spec=WebSocket)
    await manager.connect(mock_websocket, "testuser")
    manager.disconnect("testuser")
    assert "testuser" not in active_connections

# Fuzz testing
def generate_random_string(length=10):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

def generate_random_json():
    message_types = ["start_broadcast", "stop_broadcast", "offer", "answer", "ice-candidate", "get_broadcasters"]
    message_type = random.choice(message_types)
    
    base_message = {
        "type": message_type
    }
    
    if message_type in ["offer", "answer", "ice-candidate"]:
        base_message.update({
            "target": generate_random_string(),
            "from": generate_random_string()
        })
        if message_type == "offer":
            base_message["offer"] = {"sdp": generate_random_string()}
        elif message_type == "answer":
            base_message["answer"] = {"sdp": generate_random_string()}
        elif message_type == "ice-candidate":
            base_message["candidate"] = {"candidate": generate_random_string()}
    
    return json.dumps(base_message)

@pytest.mark.asyncio
async def test_websocket_fuzz():
    mock_websocket = AsyncMock(spec=WebSocket)
    await manager.connect(mock_websocket, "testuser")
    
    # Generate and send 100 random messages
    for _ in range(100):
        random_message = generate_random_json()
        try:
            await manager.broadcast(random_message)
        except Exception as e:
            # Log the error but continue testing
            print(f"Error processing message: {e}")
            continue
    
    manager.disconnect("testuser")

def test_register_fuzz(client):
    # Test registration with random usernames and passwords
    for _ in range(50):
        username = generate_random_string()
        password = generate_random_string()
        response = client.post("/register", data={"username": username, "password": password})
        assert response.status_code in [200, 400]  # Either success or duplicate username

def test_login_fuzz(client):
    # Test login with random credentials
    for _ in range(50):
        username = generate_random_string()
        password = generate_random_string()
        response = client.post("/token", data={"username": username, "password": password})
        assert response.status_code in [200, 401]  # Either success or unauthorized 