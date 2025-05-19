import { websocketService } from './websocket';
import { PeerConnection } from '../types';

class WebRTCService {
    private peerConnections: PeerConnection = {};
    private localStream: MediaStream | null = null;
    private isBroadcasting: boolean = false;

    async startBroadcast(onStream: (stream: MediaStream) => void) {
        try {
            this.localStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            this.isBroadcasting = true;
            websocketService.send({ type: 'start_broadcast' });
            onStream(this.localStream);

            this.localStream.getVideoTracks()[0].onended = () => {
                this.stopBroadcast();
            };
        } catch (error) {
            console.error('Failed to start broadcast:', error);
            throw error;
        }
    }

    stopBroadcast() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.isBroadcasting = false;
        websocketService.send({ type: 'stop_broadcast' });

        Object.values(this.peerConnections).forEach(pc => pc.close());
        this.peerConnections = {};
    }

    async watchBroadcast(broadcaster: string, onStream: (stream: MediaStream) => void) {
        if (this.peerConnections[broadcaster]) {
            console.log('Already watching this broadcast');
            return;
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnections[broadcaster] = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                websocketService.send({
                    type: 'ice-candidate',
                    target: broadcaster,
                    candidate: event.candidate
                });
            }
        };

        pc.ontrack = (event) => {
            onStream(event.streams[0]);
        };

        try {
            const offer = await pc.createOffer({
                offerToReceiveVideo: true,
                offerToReceiveAudio: true
            });
            await pc.setLocalDescription(offer);

            websocketService.send({
                type: 'offer',
                target: broadcaster,
                offer: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
            throw error;
        }
    }

    async handleOffer(from: string, offer: RTCSessionDescriptionInit) {
        if (!this.isBroadcasting) {
            console.log('Not broadcasting, ignoring offer');
            return;
        }

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        this.peerConnections[from] = pc;

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                websocketService.send({
                    type: 'ice-candidate',
                    target: from,
                    candidate: event.candidate
                });
            }
        };

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            websocketService.send({
                type: 'answer',
                target: from,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
            throw error;
        }
    }

    async handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
        const pc = this.peerConnections[from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Error handling answer:', error);
                throw error;
            }
        }
    }

    async handleIceCandidate(from: string, candidate: RTCIceCandidateInit) {
        const pc = this.peerConnections[from];
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Error handling ICE candidate:', error);
                throw error;
            }
        }
    }

    isCurrentlyBroadcasting() {
        return this.isBroadcasting;
    }

    handleUsernameChange(oldUsername: string, newUsername: string) {
        // Update peer connections if user changed their username
        if (this.peerConnections[oldUsername]) {
            this.peerConnections[newUsername] = this.peerConnections[oldUsername];
            delete this.peerConnections[oldUsername];
        }
    }
}

export const webrtcService = new WebRTCService(); 