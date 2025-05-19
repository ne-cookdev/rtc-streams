import React, { useEffect, useState, useRef } from 'react';
import { Box, Button, Typography, Paper, List, ListItem, ListItemText, IconButton, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Tabs, Tab, CircularProgress } from '@mui/material';
import { Logout as LogoutIcon, Person as PersonIcon, History as HistoryIcon } from '@mui/icons-material';
import { websocketService } from '../services/websocket';
import { webrtcService } from '../services/webrtc';
import { WebSocketMessage } from '../types';

interface StreamingProps {
    username: string;
    onLogout: () => void;
    onProfileClick: () => void;
}

interface Stream {
    id: number;
    title: string;
    broadcaster_id: number;
    started_at: string;
    ended_at: string;
    viewer_count: number;
    broadcaster: {
        username: string;
    };
}

interface StreamsResponse {
    streams: Stream[];
    total: number;
}

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`stream-tabpanel-${index}`}
            aria-labelledby={`stream-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ pt: 2 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export const Streaming: React.FC<StreamingProps> = ({ username, onLogout, onProfileClick }) => {
    const [broadcasters, setBroadcasters] = useState<string[]>([]);
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [showStartDialog, setShowStartDialog] = useState(false);
    const [streamTitle, setStreamTitle] = useState('');
    const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});
    const [viewerCounts, setViewerCounts] = useState<{ [key: string]: number }>({});
    const [activeTab, setActiveTab] = useState(0);
    const [endedStreams, setEndedStreams] = useState<Stream[]>([]);
    const [loadingEndedStreams, setLoadingEndedStreams] = useState(false);
    const [totalStreams, setTotalStreams] = useState(0);
    const endedStreamsPage = useRef(0);

    const requestBroadcastersList = () => {
        websocketService.send({ type: 'get_broadcasters' });
    };

    // Load initial data
    useEffect(() => {
        requestBroadcastersList();
        loadEndedStreams(true);
    }, []);

    // Load data when tab changes
    useEffect(() => {
        if (activeTab === 0) {
            requestBroadcastersList();
        } else if (activeTab === 1) {
            loadEndedStreams(true);
        }
    }, [activeTab]);

    const loadEndedStreams = async (reset = false) => {
        if (reset) {
            endedStreamsPage.current = 0;
            setEndedStreams([]);
        }
        
        setLoadingEndedStreams(true);
        try {
            const response = await fetch(
                `${process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:8000'}/streams/ended?skip=${endedStreamsPage.current * 10}&limit=10`
            );
            const data: StreamsResponse = await response.json();
            setTotalStreams(data.total);
            
            if (reset) {
                setEndedStreams(data.streams);
            } else {
                // Use Set to remove duplicates based on stream ID
                const uniqueStreams = Array.from(
                    new Map([...endedStreams, ...data.streams].map(stream => [stream.id, stream])).values()
                );
                setEndedStreams(uniqueStreams);
            }
            endedStreamsPage.current += 1;
        } catch (error) {
            console.error('Failed to load ended streams:', error);
        } finally {
            setLoadingEndedStreams(false);
        }
    };

    useEffect(() => {
        const handleMessage = (message: WebSocketMessage) => {
            switch (message.type) {
                case 'broadcasters_list':
                    setBroadcasters(message.broadcasters || []);
                    break;
                case 'broadcast_started':
                    setBroadcasters(prev => {
                        if (!prev.includes(message.broadcaster!)) {
                            return [...prev, message.broadcaster!];
                        }
                        return prev;
                    });
                    break;
                case 'broadcast_stopped':
                    setBroadcasters(prev => prev.filter(b => b !== message.broadcaster));
                    if (videoRefs.current[message.broadcaster!]) {
                        delete videoRefs.current[message.broadcaster!];
                    }
                    setViewerCounts(prev => {
                        const newCounts = { ...prev };
                        delete newCounts[message.broadcaster!];
                        return newCounts;
                    });
                    // Reload ended streams when a broadcast ends
                    loadEndedStreams(true);
                    break;
                case 'viewer_count_update':
                    if (message.count !== undefined) {
                        setViewerCounts(prev => ({
                            ...prev,
                            [username]: message.count!
                        }));
                    }
                    break;
                case 'username_changed':
                    if (message.old_username && message.new_username) {
                        setBroadcasters(prev => 
                            prev.map(b => b === message.old_username ? message.new_username! : b)
                        );
                        if (videoRefs.current[message.old_username]) {
                            const video = videoRefs.current[message.old_username];
                            videoRefs.current[message.new_username!] = video;
                            delete videoRefs.current[message.old_username];
                        }
                        setViewerCounts(prev => {
                            const newCounts = { ...prev };
                            if (newCounts[message.old_username!]) {
                                newCounts[message.new_username!] = newCounts[message.old_username!];
                                delete newCounts[message.old_username!];
                            }
                            return newCounts;
                        });
                    }
                    break;
                case 'offer':
                    if (message.from && message.offer) {
                        webrtcService.handleOffer(message.from, message.offer);
                    }
                    break;
                case 'answer':
                    if (message.from && message.answer) {
                        webrtcService.handleAnswer(message.from, message.answer);
                    }
                    break;
                case 'ice-candidate':
                    if (message.from && message.candidate) {
                        webrtcService.handleIceCandidate(message.from, message.candidate);
                    }
                    break;
            }
        };

        websocketService.addMessageHandler(handleMessage);
        return () => websocketService.removeMessageHandler(handleMessage);
    }, [username]);

    const handleStartBroadcast = async () => {
        try {
            await webrtcService.startBroadcast((stream) => {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.autoplay = true;
                video.muted = true;
                videoRefs.current[username] = video;
                document.getElementById('videoContainer')?.appendChild(video);
            });
            setIsBroadcasting(true);
            websocketService.send({ 
                type: 'start_broadcast',
                title: streamTitle || 'Untitled Stream'
            });
            setShowStartDialog(false);
            setStreamTitle('');
        } catch (error) {
            console.error('Failed to start broadcast:', error);
        }
    };

    const handleStopBroadcast = () => {
        webrtcService.stopBroadcast();
        setIsBroadcasting(false);
        if (videoRefs.current[username]) {
            videoRefs.current[username].remove();
            delete videoRefs.current[username];
        }
        websocketService.send({ type: 'stop_broadcast' });
    };

    const handleWatchBroadcast = async (broadcaster: string) => {
        try {
            await webrtcService.watchBroadcast(broadcaster, (stream) => {
                const video = document.createElement('video');
                video.srcObject = stream;
                video.autoplay = true;
                video.controls = true;
                videoRefs.current[broadcaster] = video;
                document.getElementById('videoContainer')?.appendChild(video);
                
                // Notify server that we joined as viewer
                websocketService.send({
                    type: 'viewer_joined',
                    target: broadcaster
                });
                
                // Update viewer count
                setViewerCounts(prev => ({
                    ...prev,
                    [broadcaster]: (prev[broadcaster] || 0) + 1
                }));
                
                // Cleanup when video is removed
                video.onended = () => {
                    websocketService.send({
                        type: 'viewer_left',
                        target: broadcaster
                    });
                    setViewerCounts(prev => ({
                        ...prev,
                        [broadcaster]: Math.max(0, (prev[broadcaster] || 0) - 1)
                    }));
                };
            });
        } catch (error) {
            console.error('Failed to watch broadcast:', error);
        }
    };

    const handleLogout = () => {
        if (isBroadcasting) {
            handleStopBroadcast();
        }
        websocketService.removeToken();
        onLogout();
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
    };

    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', mt: 4, p: 2 }}>
            <Paper sx={{ p: 2, mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">
                    Logged in as: <strong>{username}</strong>
                </Typography>
                <Box display="flex">
                    <IconButton color="primary" onClick={onProfileClick} sx={{ mr: 1 }}>
                        <PersonIcon />
                    </IconButton>
                    <IconButton color="error" onClick={handleLogout}>
                        <LogoutIcon />
                    </IconButton>
                </Box>
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="h6" gutterBottom>
                    Screen Streaming
                </Typography>
                <Button
                    variant="contained"
                    color={isBroadcasting ? 'error' : 'primary'}
                    onClick={isBroadcasting ? handleStopBroadcast : () => setShowStartDialog(true)}
                >
                    {isBroadcasting ? 'Stop Broadcasting' : 'Start Broadcasting'}
                </Button>
            </Paper>

            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={activeTab} onChange={handleTabChange}>
                        <Tab label="Active Streams" />
                        <Tab label="Stream History" />
                    </Tabs>
                </Box>

                <TabPanel value={activeTab} index={0}>
                    <List>
                        {broadcasters.map((broadcaster) => (
                            <ListItem
                                key={broadcaster}
                                sx={{
                                    cursor: broadcaster === username ? 'default' : 'pointer',
                                    opacity: broadcaster === username ? 0.5 : 1,
                                    '&:hover': {
                                        backgroundColor: broadcaster === username ? 'inherit' : 'action.hover'
                                    }
                                }}
                                onClick={() => broadcaster !== username && handleWatchBroadcast(broadcaster)}
                            >
                                <ListItemText 
                                    primary={`Watch ${broadcaster}'s broadcast`}
                                    secondary={
                                        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                {viewerCounts[broadcaster] ? `${viewerCounts[broadcaster]} viewers` : 'No viewers'}
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </ListItem>
                        ))}
                        {broadcasters.length === 0 && (
                            <ListItem>
                                <ListItemText primary="No active streams" />
                            </ListItem>
                        )}
                    </List>
                </TabPanel>

                <TabPanel value={activeTab} index={1}>
                    <List>
                        {endedStreams.map((stream) => (
                            <ListItem key={stream.id}>
                                <ListItemText
                                    primary={stream.title || 'Untitled Stream'}
                                    secondary={
                                        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                            <Typography variant="body2" color="text.secondary">
                                                Broadcaster: {stream.broadcaster.username}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Started: {formatDate(stream.started_at)}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Ended: {formatDate(stream.ended_at)}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Peak viewers: {stream.viewer_count}
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </ListItem>
                        ))}
                        {loadingEndedStreams && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                <CircularProgress size={24} />
                            </Box>
                        )}
                        {!loadingEndedStreams && endedStreams.length < totalStreams && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                                <Button onClick={() => loadEndedStreams()}>
                                    Load More ({endedStreams.length} of {totalStreams})
                                </Button>
                            </Box>
                        )}
                        {!loadingEndedStreams && endedStreams.length === 0 && (
                            <ListItem>
                                <ListItemText primary="No stream history" />
                            </ListItem>
                        )}
                    </List>
                </TabPanel>
            </Paper>

            <Box 
                id="videoContainer" 
                sx={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
                    gap: 2,
                    maxWidth: '1280px',
                    margin: '0 auto',
                    '& video': {
                        width: '100%',
                        maxHeight: '720px',
                        objectFit: 'contain',
                        backgroundColor: '#000',
                        borderRadius: '4px'
                    }
                }} 
            />

            <Dialog open={showStartDialog} onClose={() => setShowStartDialog(false)}>
                <DialogTitle>Start Broadcasting</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Stream Title"
                        type="text"
                        fullWidth
                        value={streamTitle}
                        onChange={(e) => setStreamTitle(e.target.value)}
                        placeholder="Enter a title for your stream"
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowStartDialog(false)}>Cancel</Button>
                    <Button onClick={handleStartBroadcast} variant="contained" color="primary">
                        Start Stream
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}; 