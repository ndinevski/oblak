# Oblak Cloud Dashboard - Developer Setup Guide

This guide will help you set up the Oblak Cloud Dashboard for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 20.x or later
- **npm** 8.x or later (comes with Node.js)
- **Docker** and **Docker Compose** for running services
- **Git** for version control
- **VS Code** (recommended) or your preferred IDE

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/oblak.git
cd oblak
```

### 2. Install Dependencies

Install dependencies for both frontend and backend:

```bash
# Backend
cd backend-dashboard
npm install

# Frontend
cd ../frontend-dashboard
npm install
```

### 3. Environment Configuration

#### Backend (.env)

Create `backend-dashboard/.env`:

```env
# Server
HOST=0.0.0.0
PORT=1337

# App Keys (generate with `openssl rand -base64 32`)
APP_KEYS=key1,key2,key3,key4
API_TOKEN_SALT=your-api-token-salt
ADMIN_JWT_SECRET=your-admin-jwt-secret
TRANSFER_TOKEN_SALT=your-transfer-token-salt
JWT_SECRET=your-jwt-secret

# Database (PostgreSQL)
DATABASE_CLIENT=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=oblak
DATABASE_USERNAME=oblak
DATABASE_PASSWORD=oblak_password

# External Services
IMPULS_URL=http://localhost:8080
IMPULS_API_KEY=your-impuls-key
IZVOR_URL=http://localhost:8081
IZVOR_API_KEY=your-izvor-key
SPOMEN_URL=http://localhost:9000
SPOMEN_ACCESS_KEY=minioadmin
SPOMEN_SECRET_KEY=minioadmin
```

#### Frontend (.env)

Create `frontend-dashboard/.env`:

```env
VITE_API_URL=http://localhost:1337
VITE_APP_NAME=Oblak Cloud
```

### 4. Start Development Databases

Use Docker Compose to start PostgreSQL:

```bash
docker compose -f docker-compose.dev.yml up -d postgres
```

Or create manually:

```bash
docker run -d \
  --name oblak-postgres \
  -e POSTGRES_DB=oblak \
  -e POSTGRES_USER=oblak \
  -e POSTGRES_PASSWORD=oblak_password \
  -p 5432:5432 \
  postgres:16-alpine
```

### 5. Start Development Servers

#### Backend

```bash
cd backend-dashboard
npm run develop
```

The backend will be available at `http://localhost:1337`.

Strapi Admin Panel: `http://localhost:1337/admin`

#### Frontend

```bash
cd frontend-dashboard
npm run dev
```

The frontend will be available at `http://localhost:5173`.

## Project Structure

```
oblak/
├── backend-dashboard/     # Strapi backend
│   ├── config/           # Strapi configuration
│   ├── src/
│   │   ├── api/          # API endpoints
│   │   │   ├── function/
│   │   │   ├── virtual-machine/
│   │   │   ├── bucket/
│   │   │   ├── activity-log/
│   │   │   └── quota/
│   │   ├── extensions/   # Strapi extensions
│   │   └── types/        # TypeScript types
│   └── tests/            # Backend tests
│
├── frontend-dashboard/    # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── hooks/        # React hooks
│   │   ├── layouts/      # Page layouts
│   │   ├── lib/          # Utilities & API
│   │   ├── pages/        # Page components
│   │   ├── providers/    # Context providers
│   │   ├── router/       # React Router config
│   │   ├── stores/       # Zustand stores
│   │   └── types/        # TypeScript types
│   ├── tests/            # Frontend tests
│   └── e2e/              # E2E tests
│
├── impuls/               # Serverless functions service
├── izvor/                # VM management service
├── spomen/               # Object storage service
│
├── docs/                 # Documentation
└── docker-compose.yml    # Production compose
```

## Development Workflow

### Creating a New Feature

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes**

3. **Run tests:**
   ```bash
   # Backend
   cd backend-dashboard
   npm test
   
   # Frontend
   cd frontend-dashboard
   npm test
   ```

4. **Commit with conventional commits:**
   ```bash
   git commit -m "feat: add new feature description"
   ```

5. **Push and create PR:**
   ```bash
   git push origin feature/my-feature
   ```

### Commit Message Format

We use conventional commits:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style (formatting)
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance

## Testing

### Backend Tests

```bash
cd backend-dashboard

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/api/function.test.ts

# Watch mode
npm run test:watch
```

### Frontend Tests

```bash
cd frontend-dashboard

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/hooks.test.tsx

# Watch mode
npm run test:watch
```

### E2E Tests

```bash
cd frontend-dashboard

# Install Playwright browsers (first time)
npx playwright install

# Run E2E tests
npm run test:e2e

# Run with UI
npx playwright test --ui

# Run specific test
npx playwright test auth.spec.ts
```

## Common Tasks

### Adding a New API Endpoint (Backend)

1. Create content type:
   ```bash
   cd backend-dashboard
   npm run strapi generate content-type
   ```

2. Implement service in `src/api/<name>/services/`
3. Implement controller in `src/api/<name>/controllers/`
4. Define routes in `src/api/<name>/routes/`
5. Add tests in `tests/api/<name>.test.ts`

### Adding a New Page (Frontend)

1. Create page component in `src/pages/`
2. Add route in `src/router/index.tsx`
3. Create necessary hooks in `src/hooks/`
4. Add API methods in `src/lib/api/`
5. Add tests in `tests/pages/`

### Adding a New Component

1. Create component in `src/components/ui/` or `src/components/<feature>/`
2. Export from component index
3. Add component tests
4. Document props with TypeScript interfaces

### Database Migrations

Strapi handles migrations automatically. For manual migrations:

```bash
cd backend-dashboard
npm run strapi generate migration migration-name
```

## Debugging

### Backend Debugging

1. Add breakpoints in VS Code
2. Use the "Debug Strapi" launch configuration
3. Or add `console.log` statements

### Frontend Debugging

1. Use React DevTools browser extension
2. Use TanStack Query DevTools (built-in)
3. Use VS Code debugger with Chrome

### Debugging API Requests

1. Check Network tab in browser DevTools
2. Check backend console for errors
3. Use Postman or curl to test endpoints directly

## Code Style

### TypeScript

- Use strict TypeScript
- Define interfaces for all props and data
- Avoid `any` type

### React

- Use functional components with hooks
- Follow React best practices
- Use proper error boundaries

### CSS/Tailwind

- Use Tailwind utility classes
- Extract common patterns to components
- Follow responsive-first approach

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Find and kill process
lsof -i :1337
kill -9 <PID>
```

**Database connection failed:**
- Check PostgreSQL is running
- Verify connection string in .env
- Check firewall rules

**Frontend build errors:**
- Clear node_modules and reinstall
- Check for circular dependencies
- Verify all imports exist

**API requests failing:**
- Check CORS configuration
- Verify API URL in frontend .env
- Check authentication token

### Reset Development Environment

```bash
# Stop all containers
docker compose -f docker-compose.dev.yml down -v

# Remove node_modules
rm -rf backend-dashboard/node_modules frontend-dashboard/node_modules

# Reinstall
cd backend-dashboard && npm install
cd ../frontend-dashboard && npm install

# Restart databases
docker compose -f docker-compose.dev.yml up -d

# Start servers
```

## IDE Setup

### VS Code Extensions

Recommended extensions:

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- Thunder Client (API testing)
- GitLens

### VS Code Settings

Add to `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Getting Help

- Check existing documentation in `/docs`
- Review SPECIFICATION.md for architecture decisions
- Open an issue for bugs
- Ask in the team chat for questions

## Next Steps

1. Read SPECIFICATION.md for architecture overview
2. Review TASKS.md for current progress
3. Check API.md for endpoint documentation
4. Start with a small task to get familiar with the codebase
