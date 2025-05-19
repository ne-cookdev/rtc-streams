import React, { useEffect, useState } from 'react';
import { CssBaseline, Container } from '@mui/material';
import { Auth } from './components/Auth';
import { Streaming } from './components/Streaming';
import { Profile } from './components/Profile';
import { websocketService } from './services/websocket';

function App() {
  const [username, setUsername] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'streaming' | 'profile'>('streaming');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUsername(payload.sub);
        websocketService.connect();
      } catch (error) {
        console.error('Error decoding token:', error);
        localStorage.removeItem('token');
      }
    }
  }, []);

  const handleLogin = (username: string) => {
    setUsername(username);
  };

  const handleLogout = () => {
    setUsername(null);
  };

  const handleUsernameChange = (newUsername: string) => {
    setUsername(newUsername);
  };

  const navigateToProfile = () => {
    setCurrentView('profile');
  };

  const navigateToStreaming = () => {
    setCurrentView('streaming');
  };

  return (
    <>
      <CssBaseline />
      <Container>
        {username ? (
          currentView === 'streaming' ? (
            <Streaming 
              username={username} 
              onLogout={handleLogout} 
              onProfileClick={navigateToProfile} 
            />
          ) : (
            <Profile 
              username={username} 
              onBack={navigateToStreaming}
              onUsernameChange={handleUsernameChange}
            />
          )
        ) : (
          <Auth onLogin={handleLogin} />
        )}
      </Container>
    </>
  );
}

export default App;
