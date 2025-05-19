export interface User {
    username: string;
    email?: string;  // Optional, can be added later
    display_name?: string;  // Optional, can be added later
}

export interface WebSocketMessage {
    type: 'broadcasters_list' | 'broadcast_started' | 'broadcast_stopped' | 'offer' | 'answer' | 'ice-candidate' | 'start_broadcast' | 'stop_broadcast' | 'get_broadcasters' | 'username_changed' | 'viewer_joined' | 'viewer_left' | 'viewer_count_update';
    broadcasters?: string[];
    broadcaster?: string;
    target?: string;
    from?: string;
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    old_username?: string;
    new_username?: string;
    title?: string;
    stream_id?: number;
    count?: number;
}

export interface PeerConnection {
    [key: string]: RTCPeerConnection;
}

export interface ProfileUpdateResponse {
    success: boolean;
    message: string;
} 