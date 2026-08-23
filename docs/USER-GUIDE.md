# Oblak Cloud Dashboard - User Guide

Welcome to Oblak Cloud Dashboard! This guide will help you manage your private cloud infrastructure including serverless functions, virtual machines, and object storage.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Functions (Impuls)](#functions-impuls)
4. [Virtual Machines (Izvor)](#virtual-machines-izvor)
5. [Storage (Spomen)](#storage-spomen)
6. [Containers (Brod)](#containers-brod)
7. [Databases (Tefter)](#databases-tefter)
8. [Gateway (Vrata)](#gateway-vrata)
9. [Observability](#observability)
10. [Settings & Profile](#settings--profile)
11. [FAQ](#faq)

---

## Getting Started

### Creating an Account

1. Navigate to the Oblak Cloud Dashboard login page
2. Click **Create account** or **Register**
3. Fill in your details:
   - Username (3-30 characters)
   - Email address
   - Password (minimum 8 characters)
   - Organization (optional)
4. Click **Register**
5. You'll be automatically logged in

### Logging In

1. Enter your email or username
2. Enter your password
3. Click **Sign In**

### Forgot Password

1. Click **Forgot password?** on the login page
2. Enter your email address
3. Check your email for reset instructions
4. Click the reset link and create a new password

---

## Dashboard Overview

The dashboard gives you a quick overview of your cloud resources.

### Stats Cards

At the top, you'll see cards showing:
- **Functions**: Total number of deployed functions
- **Virtual Machines**: Total VMs and running count
- **Storage Buckets**: Number of storage buckets
- **Storage Used**: Total storage consumption

### Quick Actions

Quick shortcuts to common tasks:
- Create Function
- Create VM
- Create Bucket

### Recent Activity

View your recent actions and resource changes. Click any item to see details.

### Quota Overview

See your resource usage compared to limits:
- Functions used vs. limit
- VMs used vs. limit
- Storage used vs. limit

---

## Functions (Impuls)

Impuls is our serverless functions platform, allowing you to run code without managing servers.

### Viewing Functions

1. Click **Functions** in the sidebar
2. See all your functions with:
   - Name
   - Runtime (Node.js, Python, .NET)
   - Status (Active, Inactive, Deploying)
   - Last invoked time

### Creating a Function

1. Click **Create Function**
2. Fill in the details:
   - **Name**: Unique function name (lowercase, hyphens allowed)
   - **Runtime**: Choose from:
     - Node.js 20
     - Python 3.12
     - .NET 8
   - **Memory**: 128-1024 MB
   - **Timeout**: 1-300 seconds
   - **Entry Point**: Handler function name
3. Add your code or upload a ZIP file
4. (Optional) Add environment variables
5. Click **Create**

### Editing a Function

1. Click on a function name
2. Click **Edit**
3. Modify settings or code
4. Click **Save Changes**

Note: Changes will trigger a redeployment.

### Invoking a Function

1. Go to function details
2. Click **Invoke**
3. Enter a JSON payload (or leave empty)
4. Click **Run**
5. View the result and execution logs

### Viewing Logs

1. Go to function details
2. Click the **Logs** tab
3. Filter by:
   - Time range
   - Log level (info, warn, error)
4. Click **Refresh** to get latest logs

Your function's own output is also searchable platform-wide. Everything a
function prints (`console.log`, `console.warn`/`console.error`, `print`, and so
on) and any error it throws is sent to observability, tagged with the function
name. Open **Observability → Logs**, filter by service **impuls**, and search or
filter by level to see one function's output across all its invocations - a
thrown error shows up as an ERROR record with the message. Each log line links
to the trace of the exact invocation that produced it.

### Viewing Metrics

1. Go to function details
2. Click the **Metrics** tab
3. View:
   - Invocation count
   - Error rate
   - Average duration
   - Memory usage

### Deleting a Function

1. Go to function details
2. Click **Delete**
3. Confirm deletion

⚠️ This action cannot be undone.

---

## Virtual Machines (Izvor)

Izvor is our VM platform for running full virtual machines.

### Viewing VMs

1. Click **Virtual Machines** in the sidebar
2. See all VMs with:
   - Name
   - Status (Running, Stopped, Creating)
   - OS
   - Resources (CPU, Memory, Disk)
   - IP Address

### Creating a VM

1. Click **Create VM**
2. Fill in the details:
   - **Name**: VM name
   - **Operating System**: Choose from:
     - Ubuntu 22.04 LTS
     - Debian 12
     - Rocky Linux 9
   - **CPU Cores**: 1-32
   - **Memory**: 512 MB - 64 GB
   - **Disk**: 10 GB - 2 TB
3. (Optional) Add SSH public key
4. (Optional) Add cloud-init user data
5. Click **Create**

The VM will take a few minutes to provision.

### Managing VM State

#### Starting a VM
1. Go to VM details
2. Click **Start**
3. Wait for status to change to "Running"

#### Stopping a VM
1. Go to VM details
2. Click **Stop**
3. Wait for status to change to "Stopped"

#### Restarting a VM
1. Go to VM details
2. Click **Restart**

### Accessing VM Console

1. Go to VM details (VM must be running)
2. Click **Console**
3. A browser-based terminal will open
4. Log in with your credentials

### Resizing a VM

1. Stop the VM first
2. Go to VM details
3. Click **Resize**
4. Adjust CPU, Memory, or Disk
5. Click **Apply Changes**
6. Start the VM

Note: Disk size can only be increased.

### Creating Snapshots

1. Go to VM details
2. Click **Snapshots** tab
3. Click **Create Snapshot**
4. Enter a name and description
5. Click **Create**

### Restoring from Snapshot

1. Stop the VM
2. Go to Snapshots tab
3. Find your snapshot
4. Click **Restore**
5. Confirm restoration

⚠️ Current state will be overwritten.

### Deleting a VM

1. Stop the VM first
2. Go to VM details
3. Click **Delete**
4. Confirm deletion

⚠️ All data on the VM will be lost.

---

## Storage (Spomen)

Spomen is our S3-compatible object storage service.

### Viewing Buckets

1. Click **Storage** in the sidebar
2. See all buckets with:
   - Name
   - Access Policy
   - Object count
   - Total size

### Creating a Bucket

1. Click **Create Bucket**
2. Fill in the details:
   - **Name**: Unique bucket name (3-63 characters, lowercase)
   - **Access Policy**:
     - Private: Only you can access
     - Public Read: Anyone can read
     - Authenticated Read: Logged-in users can read
   - **Versioning**: Enable to keep file versions
   - **Encryption**: Enable server-side encryption
3. Click **Create**

### Uploading Files

1. Go to bucket details
2. Click **Upload**
3. Select files or drag and drop
4. (Optional) Set a prefix/folder path
5. Click **Upload**

### Downloading Files

1. Go to bucket details
2. Find the file
3. Click the download icon or **Download**

### Creating Folders

Folders are virtual in object storage. To create one:
1. When uploading, use a path like `folder/file.txt`
2. Or click **New Folder** and enter a name

### Deleting Files

1. Select the file(s)
2. Click **Delete**
3. Confirm deletion

For versioned buckets, you can also delete specific versions.

### Changing Bucket Policy

1. Go to bucket details
2. Click **Settings** or the gear icon
3. Select new access policy
4. Click **Save**

### Deleting a Bucket

1. Delete all objects first (bucket must be empty)
2. Go to bucket details
3. Click **Delete Bucket**
4. Confirm deletion

---

## Containers (Brod)

Brod is our container service: an image registry and a container runtime, in the
shape of ECR and ECS.

### Image Repositories

1. Click **Brod Images** in the sidebar
2. See every repository with its image count and total size
3. Push images with the standard Docker CLI to the address shown on the page:
   ```bash
   docker tag my-app:v1 <registry>/my-app:v1
   docker push <registry>/my-app:v1
   ```
4. Expand a repository to see its tags, digests, sizes and push times, or delete
   a tag or a whole repository

### Running Containers

1. Click **Brod** in the sidebar
2. Click **Run Container** and provide:
   - **Name** and **Image** (an image you pushed, or any public image)
   - **Ports**: map a container port to a host port
   - **Environment variables**, **volumes**, and CPU/memory limits
3. Start, stop, restart or remove a container, and view its logs and live
   resource usage from the same page

> To see HTTP request logs for a running container, put it behind the Vrata
> gateway (see below). Brod manages the container's lifecycle; Vrata makes its
> traffic observable.

---

## Databases (Tefter)

Tefter is our managed-database service: PostgreSQL and MySQL, in the shape of
Amazon RDS.

### Provisioning a Database

1. Click **Tefter** in the sidebar
2. Click **New Database** and choose:
   - **Name**
   - **Engine**: PostgreSQL or MySQL
   - **Version** and **Size** (micro, small, medium, large)
3. On creation you are shown the password **once**. Copy it now; it cannot be
   recovered later. The dialog also shows the host, port and a ready-made
   connection string.

### Read Replicas

1. Open a database and go to the **Replicas** tab
2. Click **Add Replica** to create a read-only copy that streams changes from
   the primary; its live lag is shown per replica
3. **Promote** a replica from its **Replication** tab to turn it into a
   standalone primary (this is one-way)

### Backups & Restore

1. Open a database and go to the **Backups** tab
2. Click **Back up now** (an optional note helps you find it later)
3. To restore, click the restore icon next to a backup and confirm. A safety
   backup of the current data is taken automatically first
4. Backups outlive the database they came from, so a backup of a deleted
   instance is kept but is clearly marked

---

## Gateway (Vrata)

Vrata is the observability gateway. HTTP traffic sent straight to a container or
VM is invisible to the platform, because those run your own images with no
built-in telemetry. Route that traffic through Vrata instead and every request
is traced and logged, and appears in Observability like any other service.

### Viewing Routes

Click **Vrata** in the sidebar to see every route in one table: its kind
(container, VM or custom), how to reach it (a hostname, or `/name` on the proxy
port), its upstream, and its **source**. A route marked *Manual* was created by
hand; one marked *Auto (Brod)* was discovered automatically from a running Brod
container, so containers you deploy through Brod show up here on their own.

### Adding a Route

1. Click **New route** and fill in:
   - **Name**: used for path routing (`/my-app/...`) and as the route's key
   - **Kind**: container, VM or custom (descriptive; it tags the telemetry)
   - **Upstream**: where requests go, e.g. `http://192.168.1.100:8080`
   - **Host** (optional): match by this hostname and forward the path untouched
     (best for web apps); leave blank to match by the `/name` path prefix
2. A route maps an incoming request to a Brod container's published port or an
   Izvor VM's address.

### Seeing the Traffic

Once a route exists, send traffic to the gateway rather than to the workload
directly, and open **Observability → Logs** or **Traces** to see each request,
its status and its latency. A request to a stopped container or a down VM is
recorded as a `502`, so a broken workload is visible instead of silent.

To remove a route, use the delete control in its row. An auto-discovered route
reappears on the next poll while its container is still running; to stop routing
it for good, stop or remove the container in Brod.

---

## Observability

Every Oblak service reports traces, logs and metrics to a shared telemetry
stack. The monitoring pages in the sidebar read from it:

- **Observability** — the platform-wide overview: request rate, error rate and
  latency across all services
- **Logs** — structured log search across every service, filterable by service
  and level; database and workload logs appear here too
- **Traces** — end-to-end request traces; open one to see every span, including
  calls that crossed from one service to another
- **Metrics** — a searchable catalogue of every metric, including host, per
  container, per database (`tefter.db.*`), Redis, MinIO and ClickHouse internals
- **Service Map** — how services call each other, with call counts and latency
- **Alerts** — rules that watch the telemetry and fire when something is wrong
  (a service stops reporting, error rate climbs, a disk fills, a database goes
  down, a replica lags). New installs come with a sensible default set.

Nothing needs to be enabled per service; instrumentation is built in.

---

## Settings & Profile

### Profile Settings

1. Click your avatar in the top right
2. Click **Profile** or **Settings**
3. Update your information:
   - Username
   - Email
   - Organization

### Changing Password

1. Go to Settings > Security
2. Enter current password
3. Enter new password
4. Confirm new password
5. Click **Update Password**

### Viewing Activity Log

1. Go to Settings > Activity
2. View your recent actions
3. Filter by:
   - Resource type (Function, VM, Bucket)
   - Action (Create, Update, Delete)
   - Time range

### Viewing Quota Usage

1. Go to Settings > Quota
2. See your usage:
   - Functions: X of Y
   - VMs: X of Y
   - Storage: X GB of Y GB

### Theme Settings

1. Click the theme toggle in the header
2. Choose:
   - Light mode
   - Dark mode
   - System (follows OS preference)

---

## FAQ

### General

**Q: How do I contact support?**
A: Email support@oblak.cloud or use the in-app feedback form.

**Q: What happens if I reach my quota limit?**
A: You won't be able to create new resources. Delete unused resources or contact us to increase limits.

**Q: Is my data backed up?**
A: VMs have snapshot capabilities. Storage buckets with versioning enabled keep file history. We recommend regular backups.

### Functions

**Q: What languages are supported?**
A: Node.js 20, Python 3.12, and .NET 8.

**Q: What's the maximum function execution time?**
A: 300 seconds (5 minutes).

**Q: How do I access environment variables in my function?**
A: They're available as standard environment variables:
- Node.js: `process.env.VAR_NAME`
- Python: `os.environ['VAR_NAME']`
- .NET: `Environment.GetEnvironmentVariable("VAR_NAME")`

### Virtual Machines

**Q: How do I connect via SSH?**
A: Use the IP address shown on the VM detail page:
```bash
ssh user@<ip-address>
```
Default usernames: ubuntu (Ubuntu), debian (Debian), rocky (Rocky Linux)

**Q: Can I resize a running VM?**
A: No, the VM must be stopped first.

**Q: How do I install software?**
A: Connect via SSH and use the package manager:
- Ubuntu/Debian: `apt install package-name`
- Rocky Linux: `dnf install package-name`

### Storage

**Q: What's the maximum file size?**
A: 5 GB per single upload. For larger files, use multipart upload.

**Q: Can I make a single file public?**
A: Bucket-level policies apply to all objects. For fine-grained control, use signed URLs.

**Q: Is there a file type restriction?**
A: No, all file types are allowed.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` / `Cmd+K` | Open global search |
| `Escape` | Close dialogs/modals |
| `G then D` | Go to Dashboard |
| `G then F` | Go to Functions |
| `G then V` | Go to VMs |
| `G then S` | Go to Storage |

---

## Need More Help?

- **Documentation**: Check our full docs at docs.oblak.cloud
- **Community**: Join our Discord server
- **Support**: Email support@oblak.cloud
- **Status**: Check system status at status.oblak.cloud
