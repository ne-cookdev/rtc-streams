import { WebSocketMessage } from '../types';
import { webrtcService } from './webrtc';

class WebSocketService {
    private ws: WebSocket | null = null;
    private token: string | null = null;
    private messageHandlers: ((message: WebSocketMessage) => void)[] = [];

    constructor() {
        this.token = localStorage.getItem('token');
    }

    connect() {
        if (this.ws) {
            this.ws.close();
        }

        if (!this.token) return;

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = process.env.NODE_ENV === 'production' 
            ? `${wsProtocol}//${window.location.host}/ws/${this.token}`
            : `ws://localhost:8000/ws/${this.token}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.requestBroadcastersList();
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data) as WebSocketMessage;
            
            // Handle username changes in the webrtc service
            if (message.type === 'username_changed' && message.old_username && message.new_username) {
                webrtcService.handleUsernameChange(message.old_username, message.new_username);
            }
            
            this.messageHandlers.forEach(handler => handler(message));
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, reconnecting...');
            setTimeout(() => this.connect(), 1000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    setToken(token: string) {
        this.token = token;
        localStorage.setItem('token', token);
        this.connect();
    }

    removeToken() {
        this.token = null;
        localStorage.removeItem('token');
        this.disconnect();
    }

    addMessageHandler(handler: (message: WebSocketMessage) => void) {
        this.messageHandlers.push(handler);
    }

    removeMessageHandler(handler: (message: WebSocketMessage) => void) {
        this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    }

    send(message: WebSocketMessage) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    requestBroadcastersList() {
        this.send({ type: 'get_broadcasters' });
    }
}

export const websocketService = new WebSocketService(); 