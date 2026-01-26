# Oblak Cloud Dashboard - User Guide

Welcome to Oblak Cloud Dashboard! This guide will help you manage your private cloud infrastructure including serverless functions, virtual machines, and object storage.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard Overview](#dashboard-overview)
3. [Functions (Impuls)](#functions-impuls)
4. [Virtual Machines (Izvor)](#virtual-machines-izvor)
5. [Storage (Spomen)](#storage-spomen)
6. [Settings & Profile](#settings--profile)
7. [FAQ](#faq)

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
