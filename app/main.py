from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Form
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta
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
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store active connections and broadcasters
active_connections: Dict[str, WebSocket] = {}
broadcasters: Dict[str, str] = {}  # username -> connection_id

class ConnectionManager:
    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()
        active_connections[username] = websocket

    def disconnect(self, username: str):
        if username in active_connections:
            del active_connections[username]
        if username in broadcasters:
            del broadcasters[username]

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
async def websocket_endpoint(websocket: WebSocket, token: str):
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
                broadcasters[username] = username
                await manager.broadcast(json.dumps({
                    "type": "broadcast_started",
                    "broadcaster": username
                }))
            
            elif message["type"] == "stop_broadcast":
                if username in broadcasters:
                    del broadcasters[username]
                await manager.broadcast(json.dumps({
                    "type": "broadcast_stopped",
                    "broadcaster": username
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
            await manager.broadcast(json.dumps({
                "type": "broadcast_stopped",
                "broadcaster": username
            })) 