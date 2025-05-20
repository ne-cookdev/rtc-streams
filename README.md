# RTC Streams

A real-time streaming platform built with WebRTC technology. This application allows users to broadcast their screen/camera and watch other users' streams.

## Live Demo

The application is live at: [http://51.250.84.238/](http://51.250.84.238/)

## Features

- User authentication
- Live streaming with WebRTC
- Real-time chat during streams
- View active broadcasters
- View count for each stream
- Screen sharing capability (requires HTTPS or localhost)

## Tech Stack

- **Frontend**: React, TypeScript
- **Backend**: Python (FastAPI)
- **Database**: SQLAlchemy with SQLite
- **Real-time Communication**: WebRTC, WebSockets

## Development Setup

### Prerequisites

- Node.js and npm
- Python 3.8+
- Git

### Installation

1. Clone the repository
   ```
   git clone <repository-url>
   cd rtc-streams
   ```

2. Backend Setup
   ```
   # Create a virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Run the server
   uvicorn app.main:app --reload
   ```

3. Frontend Setup
   ```
   cd frontend-react
   npm install
   npm start
   ```

## Usage Notes

- Screen sharing requires a secure context (HTTPS or localhost)
- For development testing with screen sharing, use `localhost` instead of an IP address
- When running in production, HTTPS is recommended for full functionality

## License

MIT

## Contact

For questions or feedback, please open an issue in the repository. 