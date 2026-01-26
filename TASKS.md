# Oblak Cloud Dashboard - Implementation Tasks

> **Project:** Private Cloud Management Dashboard  
> **Start Date:** January 25, 2026  
> **Status:** In Progress

---

## 🤖 AI Implementation Instructions

> **MANDATORY FOR AI ASSISTANT**: Before implementing ANY task, you MUST:
>
> 1. **Read SPECIFICATION.md** - Review the relevant sections for context, architecture, and design decisions
> 2. **Read TASKS.md** - Check the current task requirements and dependencies
> 3. **Check completed tasks** - Understand what has already been implemented
> 4. **Update documentation** - If implementation differs from spec or new decisions are made:
>    - Update SPECIFICATION.md with any architectural changes
>    - Update TASKS.md if task scope changes or new tasks are identified
>    - Add notes to the task about any deviations or decisions made
> 5. **Cross-reference** - Ensure consistency between specification and implementation
>
> **After completing a task:**
> - Mark the task as complete with ✅
> - Update the progress tracking table
> - Document any learnings or changes in the Notes section

---

## ⚠️ Important Guidelines

### Testing Requirements

> **MANDATORY**: Every task must include unit tests. A task is **NOT considered complete** until:
> 1. All relevant unit tests are written
> 2. All tests pass successfully
> 3. Test coverage is adequate for the implemented feature
> 4. Tests are committed alongside the implementation code

### Task Workflow

1. Read and understand the task requirements
2. Implement the feature/component
3. Write unit tests for the implementation
4. Run tests and ensure all pass
5. Fix any failing tests
6. Mark task as complete with ✅

---

## Phase 1: Project Setup & Foundation

### 1.1 Backend Setup (Strapi)

- [x] **Task 1.1.1**: Initialize Strapi project with TypeScript ✅
  - Created `backend-dashboard` directory
  - Initialized Strapi v5 with TypeScript configuration
  - Configured for PostgreSQL database
  - Created Dockerfile and Dockerfile.dev
  - Created health check endpoint at `/api/health`
  - Set up Vitest for testing (Jest incompatible with Node.js v25)
  - **Tests**: 7 tests passing (health endpoint, route config, database config, server config, middlewares)
  - **Completed**: January 25, 2026

- [x] **Task 1.1.2**: Configure PostgreSQL database connection ✅
  - Database configuration in `config/database.ts`
  - Support for environment variables and DATABASE_URL
  - Connection pool configuration
  - SSL support
  - Created docker-compose.yml with PostgreSQL service
  - Created docker-compose.override.yml for development
  - **Tests**: 9 database configuration tests passing
  - **Completed**: January 25, 2026

- [x] **Task 1.1.3**: Configure environment and secrets ✅
  - Created `.env.example` with all required variables
  - Configured `config/server.ts`, `config/admin.ts`, `config/plugins.ts`
  - CORS configuration in `config/middlewares.ts`
  - **Tests**: Covered in config tests (4 tests)
  - **Completed**: January 25, 2026

### 1.2 Frontend Setup (React)

- [x] **Task 1.2.1**: Initialize React project with Vite ✅
  - Created `frontend-dashboard` directory
  - Initialized with Vite + React + TypeScript template
  - Configured path aliases in `tsconfig.json` (@/ alias)
  - Created Dockerfile (multi-stage build with nginx) and Dockerfile.dev
  - Created nginx.conf for production serving
  - **Tests**: Build succeeds, dev server starts
  - **Completed**: January 26, 2026

- [x] **Task 1.2.2**: Configure Tailwind CSS ✅
  - Installed and configured Tailwind CSS v3.4
  - Set up `tailwind.config.js` with custom theme (colors, animations)
  - Created CSS variables for black/white theme in index.css
  - Configured dark mode support (class-based)
  - Added tailwindcss-animate plugin
  - **Tests**: Tailwind classes compile correctly
  - **Completed**: January 26, 2026

- [x] **Task 1.2.3**: Install and configure shadcn/ui ✅
  - Initialized shadcn/ui with components.json configuration
  - Installed 15 base components (button, card, input, dialog, dropdown-menu, avatar, badge, label, scroll-area, separator, spinner, table, tabs, tooltip)
  - Configured component aliases (@/components, @/lib/utils, @/hooks)
  - **Tests**: 19 component tests passing
  - **Completed**: January 26, 2026

- [x] **Task 1.2.4**: Set up React Router ✅
  - Installed react-router-dom v6.28
  - Created comprehensive route configuration with lazy loading
  - Set up AuthLayout and DashboardLayout with route guards
  - Configured routes for auth, dashboard, impuls, izvor, spomen, and settings
  - **Tests**: 6 router tests passing
  - **Completed**: January 26, 2026

- [x] **Task 1.2.5**: Set up TanStack Query ✅
  - Installed @tanstack/react-query v5.62 and devtools
  - Configured QueryClient with sensible defaults (staleTime, gcTime, retry logic)
  - Set up QueryProvider with ReactQueryDevtools for development
  - **Tests**: 19 hook tests passing (includes query hooks)
  - **Completed**: January 26, 2026

### 1.3 Docker & Infrastructure

- [ ] **Task 1.3.1**: Create root docker-compose.yml
  - Orchestrate all services (dashboard-db, backend, frontend)
  - Configure networks for inter-service communication
  - Set up volumes for data persistence
  - Include existing services (impuls, izvor, spomen)
  - **Tests**: All containers start and communicate

- [ ] **Task 1.3.2**: Create development docker-compose.override.yml
  - Hot-reload for frontend and backend
  - Volume mounts for source code
  - Debug configurations
  - **Tests**: Hot-reload works correctly

- [ ] **Task 1.3.3**: Create Makefile for common operations
  - `make dev` - Start development environment
  - `make build` - Build all containers
  - `make test` - Run all tests
  - `make clean` - Clean up containers and volumes
  - **Tests**: All make targets work

---

## Phase 2: Authentication & User Management

### 2.1 Backend Authentication

- [ ] **Task 2.1.1**: Configure Strapi users-permissions plugin
  - Enable and configure the plugin
  - Set up JWT settings (expiration, secret)
  - Configure email settings for password reset
  - **Tests**: Plugin configuration tests

- [ ] **Task 2.1.2**: Extend User content type
  - Add custom fields (displayName, organization, avatar)
  - Create Quota component
  - Add relations to resources (functions, VMs, buckets)
  - **Tests**: User CRUD tests, validation tests

- [ ] **Task 2.1.3**: Create user registration customization
  - Custom registration controller with quota initialization
  - Email verification flow (optional)
  - **Tests**: Registration flow tests

- [ ] **Task 2.1.4**: Implement authentication middleware
  - JWT validation middleware
  - Rate limiting for auth endpoints
  - **Tests**: Middleware tests, rate limit tests

### 2.2 Frontend Authentication

- [ ] **Task 2.2.1**: Create authentication store (Zustand)
  - User state management
  - JWT token handling
  - Login/logout actions
  - **Tests**: Store action tests

- [ ] **Task 2.2.2**: Create API client with auth interceptors
  - Axios instance configuration
  - Request interceptor for JWT
  - Response interceptor for token refresh
  - **Tests**: Interceptor tests

- [ ] **Task 2.2.3**: Create Login page
  - Login form with validation
  - Error handling and display
  - Remember me functionality
  - **Tests**: Form validation tests, submission tests

- [ ] **Task 2.2.4**: Create Registration page
  - Registration form with validation
  - Password strength indicator
  - Terms acceptance
  - **Tests**: Form validation tests, submission tests

- [ ] **Task 2.2.5**: Create Forgot Password page
  - Email input form
  - Success/error states
  - **Tests**: Form tests

- [ ] **Task 2.2.6**: Create AuthLayout component
  - Centered card layout
  - Logo and branding
  - **Tests**: Render tests

---

## Phase 3: Core Layout & Navigation

### 3.1 Layout Components

- [ ] **Task 3.1.1**: Create RootLayout component
  - Sidebar + main content structure
  - Header with user menu
  - Responsive design
  - **Tests**: Layout render tests, responsive tests

- [ ] **Task 3.1.2**: Create Sidebar component
  - Navigation items with icons
  - Active state highlighting
  - Collapsible on mobile
  - **Tests**: Navigation tests, collapse tests

- [ ] **Task 3.1.3**: Create Header component
  - Search bar (global search)
  - Notifications dropdown
  - User avatar and menu
  - **Tests**: Render tests, interaction tests

- [ ] **Task 3.1.4**: Create Breadcrumb component
  - Auto-generate from route
  - Clickable navigation
  - **Tests**: Breadcrumb generation tests

### 3.2 Dashboard Page

- [ ] **Task 3.2.1**: Create Dashboard page layout
  - Welcome message with user name
  - Grid layout for widgets
  - **Tests**: Render tests

- [ ] **Task 3.2.2**: Create ResourceCard widget
  - Icon, count, trend indicator
  - Click to navigate
  - **Tests**: Render tests, click tests

- [ ] **Task 3.2.3**: Create QuotaWidget
  - Progress bars for each quota
  - Usage percentages
  - **Tests**: Calculation tests, render tests

- [ ] **Task 3.2.4**: Create RecentActivity widget
  - Activity list with icons
  - Relative timestamps
  - **Tests**: Render tests, time format tests

- [ ] **Task 3.2.5**: Create QuickActions widget
  - Buttons for common actions
  - Navigate to create pages
  - **Tests**: Click navigation tests

- [ ] **Task 3.2.6**: Implement Dashboard API hooks
  - Fetch dashboard summary data
  - Fetch recent activities
  - **Tests**: Hook tests with mocked API

---

## Phase 4: Functions Module (Impuls Integration)

### 4.1 Backend - Functions

- [ ] **Task 4.1.1**: Create Function content type
  - Define schema with all fields
  - Set up validations
  - Configure relations
  - **Tests**: Schema validation tests

- [ ] **Task 4.1.2**: Create Impuls service client
  - HTTP client for Impuls API
  - Error handling and retries
  - **Tests**: Client tests with mocked responses

- [ ] **Task 4.1.3**: Implement Function service
  - Create function (with Impuls sync)
  - Update function
  - Delete function
  - List functions (filtered by owner)
  - **Tests**: Service tests with mocked Impuls client

- [ ] **Task 4.1.4**: Implement Function invoke endpoint
  - Proxy invocation to Impuls
  - Track invocation count
  - Log activity
  - **Tests**: Invocation tests

- [ ] **Task 4.1.5**: Implement Function controller
  - CRUD endpoints
  - Owner-based filtering
  - Quota enforcement
  - **Tests**: Controller tests, authorization tests

### 4.2 Frontend - Functions

- [ ] **Task 4.2.1**: Create Functions API client
  - CRUD operations
  - Invoke function
  - **Tests**: API client tests

- [ ] **Task 4.2.2**: Create Functions list hooks
  - useFunctions hook
  - useFunction hook
  - useCreateFunction mutation
  - useUpdateFunction mutation
  - useDeleteFunction mutation
  - **Tests**: Hook tests

- [ ] **Task 4.2.3**: Create FunctionsList page
  - Data table with sorting/filtering
  - Search functionality
  - Status badges
  - Actions dropdown
  - **Tests**: Render tests, filter tests

- [ ] **Task 4.2.4**: Create CreateFunction page
  - Multi-step form wizard
  - Step 1: Basic info
  - Step 2: Configuration
  - Step 3: Environment variables
  - Step 4: Code editor
  - **Tests**: Form validation tests, step navigation tests

- [ ] **Task 4.2.5**: Create FunctionDetail page
  - Overview section
  - Quick stats
  - Test invoke panel
  - **Tests**: Render tests

- [ ] **Task 4.2.6**: Create FunctionCodeEditor component
  - Monaco editor integration
  - Syntax highlighting by runtime
  - **Tests**: Editor initialization tests

- [ ] **Task 4.2.7**: Create FunctionTestPanel component
  - JSON payload input
  - Invoke button
  - Response display
  - **Tests**: Invocation tests

- [ ] **Task 4.2.8**: Create EditFunction page
  - Pre-populated form
  - Save changes
  - **Tests**: Form tests, update tests

---

## Phase 5: Virtual Machines Module (Izvor Integration)

### 5.1 Backend - Virtual Machines

- [ ] **Task 5.1.1**: Create VirtualMachine content type
  - Define schema with all fields
  - Set up validations
  - Configure relations
  - **Tests**: Schema validation tests

- [ ] **Task 5.1.2**: Create Izvor service client
  - HTTP client for Izvor API
  - Error handling
  - **Tests**: Client tests

- [ ] **Task 5.1.3**: Implement VirtualMachine service
  - Create VM (with Izvor sync)
  - Delete VM
  - Perform actions (start, stop, reboot)
  - Get console URL
  - List VMs (filtered by owner)
  - **Tests**: Service tests

- [ ] **Task 5.1.4**: Implement VM templates endpoint
  - Fetch available templates from Izvor
  - Cache templates
  - **Tests**: Endpoint tests

- [ ] **Task 5.1.5**: Implement VM sizes endpoint
  - Return predefined sizes
  - **Tests**: Endpoint tests

- [ ] **Task 5.1.6**: Implement VM snapshots endpoints
  - List snapshots
  - Create snapshot
  - Restore snapshot
  - Delete snapshot
  - **Tests**: Snapshot tests

- [ ] **Task 5.1.7**: Implement VirtualMachine controller
  - CRUD endpoints
  - Actions endpoint
  - Quota enforcement
  - **Tests**: Controller tests

### 5.2 Frontend - Virtual Machines

- [ ] **Task 5.2.1**: Create VMs API client
  - CRUD operations
  - Actions
  - Console access
  - Snapshots
  - **Tests**: API client tests

- [ ] **Task 5.2.2**: Create VMs hooks
  - useVMs, useVM hooks
  - useCreateVM, useDeleteVM mutations
  - useVMAction mutation
  - useTemplates, useSizes hooks
  - **Tests**: Hook tests

- [ ] **Task 5.2.3**: Create VMsList page
  - Data table/grid view toggle
  - Status indicators with colors
  - Quick actions
  - **Tests**: Render tests

- [ ] **Task 5.2.4**: Create CreateVM page
  - Template selection (visual cards)
  - Size selection
  - Cloud-init configuration
  - Network and tags
  - **Tests**: Form tests

- [ ] **Task 5.2.5**: Create VMDetail page
  - Overview with status
  - Resource metrics
  - Action buttons
  - **Tests**: Render tests

- [ ] **Task 5.2.6**: Create VMActions component
  - Start/Stop/Reboot buttons
  - Confirmation dialogs
  - **Tests**: Action tests

- [ ] **Task 5.2.7**: Create VMConsole page
  - noVNC integration (iframe or component)
  - Fullscreen option
  - **Tests**: Console loading tests

- [ ] **Task 5.2.8**: Create VMSnapshots page
  - Snapshots list
  - Create/restore/delete actions
  - **Tests**: Snapshot action tests

---

## Phase 6: Storage Module (Spomen Integration)

### 6.1 Backend - Storage

- [ ] **Task 6.1.1**: Create Bucket content type
  - Define schema
  - Set up validations
  - Configure relations
  - **Tests**: Schema validation tests

- [ ] **Task 6.1.2**: Create Spomen service client
  - HTTP client for Spomen API
  - Error handling
  - **Tests**: Client tests

- [ ] **Task 6.1.3**: Implement Bucket service
  - Create bucket (with Spomen sync)
  - Update bucket settings
  - Delete bucket
  - List buckets (filtered by owner)
  - **Tests**: Service tests

- [ ] **Task 6.1.4**: Implement Objects endpoints
  - List objects (proxied to Spomen)
  - Delete object
  - Get presigned URL (upload/download)
  - **Tests**: Endpoint tests

- [ ] **Task 6.1.5**: Implement Bucket controller
  - CRUD endpoints
  - Objects listing
  - Presigned URL generation
  - Quota enforcement
  - **Tests**: Controller tests

### 6.2 Frontend - Storage

- [ ] **Task 6.2.1**: Create Storage API client
  - Bucket CRUD
  - Object listing
  - Presigned URLs
  - **Tests**: API client tests

- [ ] **Task 6.2.2**: Create Storage hooks
  - useBuckets, useBucket hooks
  - useCreateBucket, useDeleteBucket mutations
  - useObjects hook
  - usePresignedUrl mutation
  - **Tests**: Hook tests

- [ ] **Task 6.2.3**: Create BucketsList page
  - Card grid layout
  - Storage stats per bucket
  - Policy badges
  - **Tests**: Render tests

- [ ] **Task 6.2.4**: Create CreateBucket page
  - Name input with validation
  - Policy selection
  - Versioning toggle
  - **Tests**: Form tests

- [ ] **Task 6.2.5**: Create BucketDetail page
  - Settings overview
  - Usage statistics
  - Edit settings
  - **Tests**: Render tests

- [ ] **Task 6.2.6**: Create ObjectBrowser page
  - File explorer interface
  - Breadcrumb navigation
  - Grid/list view toggle
  - Multi-select support
  - **Tests**: Navigation tests, selection tests

- [ ] **Task 6.2.7**: Create ObjectUpload component
  - Drag and drop zone
  - Progress indicators
  - Multiple file support
  - **Tests**: Upload flow tests

- [ ] **Task 6.2.8**: Create ObjectPreview component
  - Preview images
  - Display text/JSON
  - Download option
  - **Tests**: Preview render tests

- [ ] **Task 6.2.9**: Create PresignedUrlDialog component
  - Generate shareable links
  - Expiration selection
  - Copy to clipboard
  - **Tests**: Dialog tests

---

## Phase 7: Activity & Settings

### 7.1 Backend - Activity & Settings

- [ ] **Task 7.1.1**: Create ActivityLog content type
  - Define schema
  - Configure relations
  - **Tests**: Schema tests

- [ ] **Task 7.1.2**: Implement ActivityLog service
  - Log activity helper
  - Query activities by user
  - **Tests**: Service tests

- [ ] **Task 7.1.3**: Implement activity logging middleware
  - Auto-log CRUD operations
  - Capture IP and user agent
  - **Tests**: Middleware tests

- [ ] **Task 7.1.4**: Implement quota endpoints
  - Get current usage
  - Calculate remaining quota
  - **Tests**: Quota calculation tests

### 7.2 Frontend - Activity & Settings

- [ ] **Task 7.2.1**: Create ActivityLog page
  - Paginated activity list
  - Filter by action type
  - Filter by resource type
  - Date range filter
  - **Tests**: Filter tests

- [ ] **Task 7.2.2**: Create Settings page
  - Settings navigation
  - **Tests**: Render tests

- [ ] **Task 7.2.3**: Create Profile page
  - Edit display name
  - Change password
  - Avatar upload
  - **Tests**: Form tests

- [ ] **Task 7.2.4**: Create QuotaUsage page
  - Visual quota breakdown
  - Usage by resource type
  - **Tests**: Render tests

---

## Phase 8: Polish & Optimization

### 8.1 UI/UX Improvements

- [ ] **Task 8.1.1**: Implement dark mode toggle
  - Theme store
  - Persist preference
  - Smooth transition
  - **Tests**: Theme toggle tests

- [ ] **Task 8.1.2**: Implement global search
  - Search across all resources
  - Keyboard shortcut (Cmd+K)
  - Results dropdown
  - **Tests**: Search tests

- [ ] **Task 8.1.3**: Implement toast notifications
  - Success/error/info toasts
  - Auto-dismiss
  - **Tests**: Toast display tests

- [ ] **Task 8.1.4**: Implement loading states
  - Skeleton loaders
  - Spinners for actions
  - **Tests**: Loading state tests

- [ ] **Task 8.1.5**: Implement error boundaries
  - Catch React errors
  - Fallback UI
  - Error reporting
  - **Tests**: Error boundary tests

- [ ] **Task 8.1.6**: Responsive design audit
  - Test all pages on mobile/tablet
  - Fix any layout issues
  - **Tests**: Responsive layout tests

### 8.2 Performance

- [ ] **Task 8.2.1**: Implement lazy loading for routes
  - Code splitting
  - Suspense fallbacks
  - **Tests**: Lazy loading tests

- [ ] **Task 8.2.2**: Optimize API calls
  - Debounce search inputs
  - Cache invalidation strategy
  - **Tests**: Caching tests

- [ ] **Task 8.2.3**: Implement resource status sync
  - Background polling for status updates
  - WebSocket for real-time updates (optional)
  - **Tests**: Sync tests

---

## Phase 9: Testing & Documentation

### 9.1 Testing

- [ ] **Task 9.1.1**: Backend unit test suite
  - Services tests
  - Controllers tests
  - Middleware tests
  - Minimum 80% coverage
  - **Tests**: Coverage report

- [ ] **Task 9.1.2**: Frontend unit test suite
  - Component tests
  - Hook tests
  - Store tests
  - Minimum 80% coverage
  - **Tests**: Coverage report

- [ ] **Task 9.1.3**: Integration tests
  - API endpoint tests
  - Auth flow tests
  - Service integration tests
  - **Tests**: Integration test suite

- [ ] **Task 9.1.4**: E2E tests with Playwright
  - Login/logout flow
  - Create/delete resources
  - Navigation tests
  - **Tests**: E2E test suite

### 9.2 Documentation

- [ ] **Task 9.2.1**: API documentation
  - OpenAPI/Swagger spec
  - Endpoint descriptions
  - Request/response examples

- [ ] **Task 9.2.2**: Developer setup guide
  - Prerequisites
  - Installation steps
  - Development workflow

- [ ] **Task 9.2.3**: User guide
  - Feature documentation
  - Screenshots
  - FAQ

---

## Phase 10: Deployment

### 10.1 Production Setup

- [ ] **Task 10.1.1**: Create production Dockerfiles
  - Optimized multi-stage builds
  - Security hardening
  - **Tests**: Docker build tests

- [ ] **Task 10.1.2**: Create production docker-compose.yml
  - Production environment variables
  - Resource limits
  - Health checks
  - **Tests**: Container orchestration tests

- [ ] **Task 10.1.3**: Configure nginx reverse proxy
  - SSL termination
  - Gzip compression
  - Cache headers
  - **Tests**: Nginx configuration tests

- [ ] **Task 10.1.4**: Set up CI/CD pipeline
  - Build on push
  - Run tests
  - Deploy on merge to main
  - **Tests**: Pipeline runs successfully

- [ ] **Task 10.1.5**: Database backup strategy
  - Automated PostgreSQL backups
  - Backup verification
  - **Tests**: Backup/restore tests

---

## Progress Tracking

| Phase | Total Tasks | Completed | Progress |
|-------|-------------|-----------|----------|
| Phase 1: Setup | 11 | 3 | 27% |
| Phase 2: Auth | 9 | 0 | 0% |
| Phase 3: Layout | 11 | 0 | 0% |
| Phase 4: Functions | 13 | 0 | 0% |
| Phase 5: VMs | 15 | 0 | 0% |
| Phase 6: Storage | 14 | 0 | 0% |
| Phase 7: Activity | 6 | 0 | 0% |
| Phase 8: Polish | 9 | 0 | 0% |
| Phase 9: Testing | 7 | 0 | 0% |
| Phase 10: Deploy | 5 | 0 | 0% |
| **Total** | **100** | **3** | **3%** |

---

## Notes

- Each task should be completed in a feature branch
- Pull requests require passing tests before merge
- Update this document as tasks are completed
- Add new tasks as requirements evolve
