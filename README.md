# Azure Speech-to-Text with Diarization

This project provides a web application for audio transcription with speaker diarization using Azure Speech Services. It includes a Vue.js frontend and a Node.js backend, containerized for easy deployment.

## Features

- Audio file upload
- Speaker diarization using Azure Speech Services
- Real-time transcription display
- Speaker identification and separation
- Docker containerization
- CI/CD pipeline for Azure Container Instances

## Prerequisites

- Node.js (v16 or higher)
- Docker
- Azure account with Speech Services enabled
- Azure Container Registry
- GitHub account
- FFmpeg (required for local audio transcoding; install via Homebrew or package manager)

## Required Azure Resources

### 1. Azure Container Registry (ACR)
- Create an ACR instance in your Azure subscription
- Enable admin user access
- Note down these values for GitHub Actions:
  - Login server (e.g., `craistuff.azurecr.io`)
  - Username (admin username)
  - Password (admin password)

### 2. Azure AI Services
- Create a Speech Service resource
- Note down these values for GitHub Actions:
  - Key (from Keys and Endpoint section)
  - Region (e.g., `eastus`)
- Enable the following features:
  - Speech-to-text
  - Speaker diarization
  - Language detection

### 3. Azure Container Instances (ACI)
- Create a resource group for your containers
- Note down the resource group name for GitHub Actions
- The container group will be created automatically by the GitHub Actions workflow
- Ensure the resource group has permissions to:
  - Pull images from ACR
  - Access the Speech Service

## Project Structure

```
.
├── src/
│   ├── frontend/     # Vue.js frontend application
│   └── backend/      # Node.js backend service
├── Dockerfile        # Docker configuration
├── docker-compose.yml # Local development setup
└── .github/          # GitHub Actions workflow
```

## Environment Configuration

### Backend Configuration

The backend requires a `.env` file with Azure service credentials. A template is provided in `src/backend/.env.template`:

To set up:
1. Copy `src/backend/.env.template` to `src/backend/.env`
2. Fill in your Azure Speech Service credentials
3. Adjust the port if needed

### Frontend Configuration (Optional)

The frontend can be configured using environment variables. A template is provided in `src/frontend/.env.template`:

To set up:
1. Copy `src/frontend/.env.template` to `src/frontend/.env`
2. Adjust the API URL if your backend runs on a different port
3. Configure optional features as needed

**Note**: All frontend environment variables must be prefixed with `VITE_` to be accessible in the Vue application.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   # Install all dependencies (frontend and backend)
   npm run install:all

   # Or install separately:
   # Frontend
   cd src/frontend
   npm install

   # Backend
   cd src/backend
   npm install
   ```

3. Configure environment variables:
   - Create `.env` files in both frontend and backend directories
   - Add your Azure Speech Services credentials

## Development

### FFmpeg (Local Development)
Before running the app locally, ensure FFmpeg is installed on your machine:
- macOS (Homebrew): `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y ffmpeg`

### Running with npm
```bash
# Start both frontend and backend concurrently
npm start

# Or start separately:
# Frontend
cd src/frontend
npm run dev

# Backend
cd src/backend
npm run dev
```

### Running with Docker
1. Build and start the containers:
   ```bash
   # For Docker Compose v2 (Docker Desktop 2.10+)
   docker compose up --build

   # For older Docker versions
   docker-compose up --build
   ```

2. Access the application:
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:3000

3. To stop the containers:
   ```bash
   # For Docker Compose v2
   docker compose down

   # For older Docker versions
   docker-compose down
   ```

4. To view logs:
   ```bash
   # For Docker Compose v2
   docker compose logs -f

   # For older Docker versions
   docker-compose logs -f
   ```

## GitHub Actions Configuration

### Required Secrets
Add these secrets in your GitHub repository (Settings > Secrets and variables > Actions > Secrets):

#### AZURE_CREDENTIALS
This is a JSON string containing your Azure service principal credentials. Create it in the Azure Portal and add it as a secret with the following structure:
```json
{
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "tenantId": "your-tenant-id",
  "subscriptionId": "your-subscription-id"
}
```

#### Other Secrets
- `ACR_PASSWORD`: Your Azure Container Registry password
- `AZURE_SPEECH_KEY`: Your Azure Speech Service key

### Required Variables
Add these variables in your GitHub repository (Settings > Secrets and variables > Actions > Variables):
- `ACR_LOGIN_SERVER`: Your Azure Container Registry server (e.g., craistuff.azurecr.io)
- `ACR_USERNAME`: Your Azure Container Registry username
- `RESOURCE_GROUP`: Your Azure resource group name
- `CONTAINER_GROUP_NAME`: Name for your container group
- `DNS_NAME_LABEL`: DNS label for your container group
- `LOCATION`: Azure region (e.g., eastus)
- `AZURE_SPEECH_REGION`: Azure Speech Service region

## Deployment

The application is automatically deployed to Azure Container Instances through GitHub Actions when changes are pushed to the main branch.

## License

MIT
