import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Paper } from '@mui/material';
import { websocketService } from '../services/websocket';

interface AuthProps {
    onLogin: (username: string) => void;
}

export const Auth: React.FC<AuthProps> = ({ onLogin }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const apiUrl = process.env.NODE_ENV === 'production'
                ? `/api/${isRegistering ? 'register' : 'token'}`
                : `http://localhost:8000/${isRegistering ? 'register' : 'token'}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                if (isRegistering) {
                    setIsRegistering(false);
                    setError('Registration successful! Please login.');
                } else {
                    websocketService.setToken(data.access_token);
                    onLogin(username);
                }
            } else {
                setError(data.detail || `${isRegistering ? 'Registration' : 'Login'} failed`);
            }
        } catch (error) {
            console.error('Error:', error);
            setError(`${isRegistering ? 'Registration' : 'Login'} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    return (
        <Box sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 3 }}>
                <Typography variant="h5" component="h1" gutterBottom>
                    {isRegistering ? 'Register' : 'Login'}
                </Typography>
                <form onSubmit={handleSubmit}>
                    <TextField
                        fullWidth
                        label="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        margin="normal"
                        required
                    />
                    <TextField
                        fullWidth
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        margin="normal"
                        required
                    />
                    {error && (
                        <Typography color="error" sx={{ mt: 2 }}>
                            {error}
                        </Typography>
                    )}
                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                        <Button
                            type="submit"
                            variant="contained"
                            color="primary"
                            fullWidth
                        >
                            {isRegistering ? 'Register' : 'Login'}
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={() => setIsRegistering(!isRegistering)}
                            fullWidth
                        >
                            {isRegistering ? 'Back to Login' : 'Register'}
                        </Button>
                    </Box>
                </form>
            </Paper>
        </Box>
    );
}; 