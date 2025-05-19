import React, { useState, useEffect } from 'react';
import { Box, Button, TextField, Typography, Paper, Avatar, Alert, CircularProgress, Tabs, Tab } from '@mui/material';
import { Person as PersonIcon } from '@mui/icons-material';

interface ProfileProps {
    username: string;
    onBack: () => void;
    onUsernameChange?: (newUsername: string) => void;
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
            id={`profile-tabpanel-${index}`}
            aria-labelledby={`profile-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export const Profile: React.FC<ProfileProps> = ({ username, onBack, onUsernameChange }) => {
    const [activeTab, setActiveTab] = useState(0);
    const [isEditing, setIsEditing] = useState(false);

    // Password change state
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Username change state
    const [newUsername, setNewUsername] = useState('');
    const [passwordForUsername, setPasswordForUsername] = useState('');

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);

    const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTab(newValue);
        setError('');
        setSuccess('');
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validate passwords
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const formData = new URLSearchParams();
            formData.append('old_password', oldPassword);
            formData.append('new_password', newPassword);

            const apiUrl = process.env.NODE_ENV === 'production'
                ? `/api/users/change-password`
                : `http://localhost:8000/users/change-password`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess('Password changed successfully');
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
            } else {
                setError(data.detail || 'Failed to update password');
            }
        } catch (error) {
            console.error('Error:', error);
            setError(`Failed to update password: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleUsernameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!newUsername.trim()) {
            setError('Username cannot be empty');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const formData = new URLSearchParams();
            formData.append('new_username', newUsername);
            formData.append('password', passwordForUsername);

            const apiUrl = process.env.NODE_ENV === 'production'
                ? `/api/users/change-username`
                : `http://localhost:8000/users/change-username`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess('Username changed successfully');
                
                // Store the new token
                if (data.access_token) {
                    localStorage.setItem('token', data.access_token);
                }
                
                // Update the UI with new username
                if (onUsernameChange && data.username) {
                    onUsernameChange(data.username);
                }
                
                setNewUsername('');
                setPasswordForUsername('');
            } else {
                setError(data.detail || 'Failed to update username');
            }
        } catch (error) {
            console.error('Error:', error);
            setError(`Failed to update username: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 3 }}>
                <Box display="flex" alignItems="center" mb={3}>
                    <Avatar sx={{ bgcolor: 'primary.main', width: 64, height: 64, mr: 2 }}>
                        <PersonIcon fontSize="large" />
                    </Avatar>
                    <Typography variant="h4" component="h1">
                        {username}
                    </Typography>
                </Box>

                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={activeTab} onChange={handleTabChange} aria-label="profile settings tabs">
                        <Tab label="Profile" id="profile-tab-0" />
                        <Tab label="Change Username" id="profile-tab-1" />
                        <Tab label="Change Password" id="profile-tab-2" />
                    </Tabs>
                </Box>

                <TabPanel value={activeTab} index={0}>
                    <Box>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                            Your profile information
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Username: {username}
                        </Typography>
                        <Button 
                            variant="outlined" 
                            onClick={onBack}
                        >
                            Back to Streaming
                        </Button>
                    </Box>
                </TabPanel>

                <TabPanel value={activeTab} index={1}>
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            Change Username
                        </Typography>
                        <form onSubmit={handleUsernameSubmit}>
                            <TextField
                                fullWidth
                                label="New Username"
                                value={newUsername}
                                onChange={(e) => setNewUsername(e.target.value)}
                                margin="normal"
                                required
                            />
                            <TextField
                                fullWidth
                                label="Confirm with Password"
                                type="password"
                                value={passwordForUsername}
                                onChange={(e) => setPasswordForUsername(e.target.value)}
                                margin="normal"
                                required
                            />
                            
                            {error && (
                                <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                                    {error}
                                </Alert>
                            )}
                            
                            {success && (
                                <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
                                    {success}
                                </Alert>
                            )}
                            
                            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    color="primary"
                                    disabled={loading}
                                    fullWidth
                                >
                                    {loading ? <CircularProgress size={24} /> : 'Update Username'}
                                </Button>
                            </Box>
                        </form>
                    </Box>
                </TabPanel>

                <TabPanel value={activeTab} index={2}>
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            Change Password
                        </Typography>
                        <form onSubmit={handlePasswordSubmit}>
                            <TextField
                                fullWidth
                                label="Current Password"
                                type="password"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                margin="normal"
                                required
                            />
                            <TextField
                                fullWidth
                                label="New Password"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                margin="normal"
                                required
                            />
                            <TextField
                                fullWidth
                                label="Confirm New Password"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                margin="normal"
                                required
                            />
                            
                            {error && (
                                <Alert severity="error" sx={{ mt: 2, mb: 2 }}>
                                    {error}
                                </Alert>
                            )}
                            
                            {success && (
                                <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
                                    {success}
                                </Alert>
                            )}
                            
                            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    color="primary"
                                    disabled={loading}
                                    fullWidth
                                >
                                    {loading ? <CircularProgress size={24} /> : 'Update Password'}
                                </Button>
                            </Box>
                        </form>
                    </Box>
                </TabPanel>
            </Paper>
        </Box>
    );
}; 