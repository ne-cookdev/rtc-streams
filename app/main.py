from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Form
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
import json
from typing import Dict, List

import models
import db
import auth
from db import engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections and broadcasters
active_connections: Dict[str, WebSocket] = {}
broadcasters: Dict[str, str] = {}  # username -> connection_id
active_streams: Dict[str, models.Stream] = {}  # username -> Stream object

class ConnectionManager:
    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in active_connections:
            del active_connections[username]
        if username in broadcasters:
            del broadcasters[username]
        if username in active_streams:
            stream = active_streams[username]
            stream.ended_at = datetime.utcnow()
            stream.is_active = False
            db.SessionLocal().commit()
            del active_streams[username]

    async def broadcast(self, message: str, exclude: str = None):
        for username, connection in active_connections.items():
            if username != exclude:
                await connection.send_text(message)

manager = ConnectionManager()

@app.post("/register")
async def register(username: str = Form(...), password: str = Form(...), db: Session = Depends(db.get_db)):
    db_user = db.query(models.User).filter(models.User.username == username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(password)
    db_user = models.User(username=username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return {"message": "User created successfully"}

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(db.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str, db: Session = Depends(db.get_db)):
    try:
        payload = auth.jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        username = payload.get("sub")
        if not username:
            await websocket.close(code=4001)
            return
    except:
        await websocket.close(code=4001)
        return

    await manager.connect(websocket, username)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message["type"] == "start_broadcast":
                # Create new stream record
                user = db.query(models.User).filter(models.User.username == username).first()
                stream = models.Stream(
                    broadcaster_id=user.id,
                    title=message.get("title", "Untitled Stream"),
                    is_active=True
                )
                db.add(stream)
                db.commit()
                db.refresh(stream)
                
                broadcasters[username] = username
                active_streams[username] = stream
                
                # Broadcast to all clients including the sender
                await manager.broadcast(json.dumps({
                    "type": "broadcast_started",
                    "broadcaster": username,
                    "stream_id": stream.id
                }), None)  # Remove exclude parameter to include sender
                
                # Also send broadcasters list to all clients
                await manager.broadcast(json.dumps({
                    "type": "broadcasters_list",
                    "broadcasters": list(broadcasters.keys())
                }))
            
            elif message["type"] == "stop_broadcast":
                if username in broadcasters:
                    del broadcasters[username]
                if username in active_streams:
                    stream = active_streams[username]
                    stream.ended_at = datetime.utcnow()
                    stream.is_active = False
                    db.commit()
                    del active_streams[username]
                
                # Broadcast to all clients including the sender
                await manager.broadcast(json.dumps({
                    "type": "broadcast_stopped",
                    "broadcaster": username
                }), None)  # Remove exclude parameter to include sender
                
                # Also send updated broadcasters list to all clients
                await manager.broadcast(json.dumps({
                    "type": "broadcasters_list",
                    "broadcasters": list(broadcasters.keys())
                }))
            
            elif message["type"] == "viewer_joined":
                if message["target"] in active_streams:
                    stream = active_streams[message["target"]]
                    stream.viewer_count += 1
                    db.commit()
                    # Notify the broadcaster about the viewer count update
                    if message["target"] in active_connections:
                        await active_connections[message["target"]].send_text(json.dumps({
                            "type": "viewer_count_update",
                            "count": stream.viewer_count
                        }))
            
            elif message["type"] == "viewer_left":
                if message["target"] in active_streams:
                    stream = active_streams[message["target"]]
                    stream.viewer_count = max(0, stream.viewer_count - 1)
                    db.commit()
                    # Notify the broadcaster about the viewer count update
                    if message["target"] in active_connections:
                        await active_connections[message["target"]].send_text(json.dumps({
                            "type": "viewer_count_update",
                            "count": stream.viewer_count
                        }))
            
            elif message["type"] == "offer":
                if message["target"] in active_connections:
                    await active_connections[message["target"]].send_text(json.dumps({
                        "type": "offer",
                        "offer": message["offer"],
                        "from": username
                    }))
            
            elif message["type"] == "answer":
                if message["target"] in active_connections:
                    await active_connections[message["target"]].send_text(json.dumps({
                        "type": "answer",
                        "answer": message["answer"],
                        "from": username
                    }))
            
            elif message["type"] == "ice-candidate":
                if message["target"] in active_connections:
                    await active_connections[message["target"]].send_text(json.dumps({
                        "type": "ice-candidate",
                        "candidate": message["candidate"],
                        "from": username
                    }))
            
            elif message["type"] == "get_broadcasters":
                await websocket.send_text(json.dumps({
                    "type": "broadcasters_list",
                    "broadcasters": list(broadcasters.keys())
                }))

    except WebSocketDisconnect:
        manager.disconnect(username)
        if username in broadcasters:
            del broadcasters[username]
            if username in active_streams:
                stream = active_streams[username]
                stream.ended_at = datetime.utcnow()
                stream.is_active = False
                db.commit()
                del active_streams[username]
            # Broadcast to all clients including the sender
            await manager.broadcast(json.dumps({
                "type": "broadcast_stopped",
                "broadcaster": username
            }), None)  # Remove exclude parameter to include sender
            
            # Also send updated broadcasters list to all clients
            await manager.broadcast(json.dumps({
                "type": "broadcasters_list",
                "broadcasters": list(broadcasters.keys())
            }))

@app.post("/users/change-password")
async def change_password(
    old_password: str = Form(...),
    new_password: str = Form(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(db.get_db)
):
    # Verify old password
    if not auth.verify_password(old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect current password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Update password
    current_user.hashed_password = auth.get_password_hash(new_password)
    db.commit()
    
    return {"message": "Password changed successfully"}

@app.post("/users/change-username")
async def change_username(
    new_username: str = Form(...),
    password: str = Form(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(db.get_db)
):
    # Verify password
    if not auth.verify_password(password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if username is already taken
    existing_user = db.query(models.User).filter(models.User.username == new_username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )
    
    # Update username
    old_username = current_user.username
    current_user.username = new_username
    db.commit()
    
    # Generate new token with updated username
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": new_username}, expires_delta=access_token_expires
    )
    
    # If user is currently connected via websocket, update their connection
    if old_username in active_connections:
        active_connections[new_username] = active_connections[old_username]
        del active_connections[old_username]
    
    # If user is currently broadcasting, update the broadcaster list
    if old_username in broadcasters:
        broadcasters[new_username] = broadcasters[old_username]
        del broadcasters[old_username]
        
        # Notify all clients of the name change
        await manager.broadcast(json.dumps({
            "type": "username_changed",
            "old_username": old_username,
            "new_username": new_username
        }))
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": new_username
    }

@app.get("/streams/ended")
async def get_ended_streams(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(db.get_db)
):
    # Get total count
    total_count = db.query(models.Stream)\
        .filter(models.Stream.is_active == False)\
        .count()
    
    # Get paginated streams
    streams = db.query(models.Stream)\
        .filter(models.Stream.is_active == False)\
        .order_by(models.Stream.ended_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    
    # Convert to dict and include broadcaster info
    return {
        "streams": [
            {
                "id": stream.id,
                "title": stream.title,
                "broadcaster_id": stream.broadcaster_id,
                "started_at": stream.started_at,
                "ended_at": stream.ended_at,
                "viewer_count": stream.viewer_count,
                "broadcaster": {
                    "username": stream.broadcaster.username
                }
            }
            for stream in streams
        ],
        "total": total_count
    }

@app.get("/streams/active")
async def get_active_streams(
    db: Session = Depends(db.get_db)
):
    streams = db.query(models.Stream)\
        .filter(models.Stream.is_active == True)\
        .all()
    
    # Convert to dict and include broadcaster info
    return [
        {
            "id": stream.id,
            "title": stream.title,
            "broadcaster_id": stream.broadcaster_id,
            "started_at": stream.started_at,
            "ended_at": stream.ended_at,
            "viewer_count": stream.viewer_count,
            "broadcaster": {
                "username": stream.broadcaster.username
            }
        }
        for stream in streams
    ] 