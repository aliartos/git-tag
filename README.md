# Git Tag Management Tool

A universal bash script for batch tagging multiple Git repositories across **Azure DevOps**, **GitHub**, **GitLab**, and any Git hosting platform, with comprehensive logging and error handling.

## Features

- ✅ **Multi-platform support** - Azure DevOps, GitHub, GitLab, Bitbucket, self-hosted Git
- ✅ Configuration-driven - Works with any repository structure
- ✅ Batch processing with progress tracking
- ✅ Lightweight clones (shallow, single-branch)
- ✅ Git credential caching (password entered once)
- ✅ Detailed logging at each step
- ✅ Error tracking and summary reporting
- ✅ Optional tag override via command line

## Prerequisites

- `bash` (version 4.0+)
- `git` (version 2.0+)
- `jq` (for JSON parsing)

### Installing jq

```bash
# Debian/Ubuntu
sudo apt-get install jq

# macOS
brew install jq

# RHEL/CentOS
sudo yum install jq
```

## Configuration

Create or edit `config.json5` (or `config.json`):

```json5
// Git Tag Management Configuration
// Supports Azure DevOps, GitHub, GitLab, and any Git repository
{
  // Default base URL (can be Azure DevOps, GitHub, GitLab, etc.)
  // Can be overridden per repository
  baseUrl: "https://your-org.visualstudio.com",
  
  // Default tag to apply if not specified on command line
  defaultTag: "dev-v0.17",
  
  // Temporary directory for cloning repositories
  tmpDir: "/tmp/git-repos",
  
  // List of repositories to manage
  repositories: [
    {
      name: "My Azure Repo",
      repo: "my-repo"
    },
    {
      name: "GitHub Repository",
      repo: "my-project",
      baseUrl: "https://github.com/username/my-project.git"
    }
  ]
}
```

**Note:** The configuration file supports JSON5 format (with comments and unquoted keys) or standard JSON.

### Configuration Fields

| Field | Description | Example | Required |
|-------|-------------|---------|----------|
| `baseUrl` | Default base URL for repositories | `"https://your-org.visualstudio.com"` or `"https://github.com/user/repo.git"` | Yes |
| `defaultTag` | Default tag if not provided as argument | `"dev-v0.17"` | Yes |
| `tmpDir` | Temporary directory for clones | `"/tmp/git-repos"` | Yes |
| `repositories` | Array of repository objects | See below | Yes |
| `gitUsername` | Git username or email (optional) | `"user@example.com"` | No |
| `gitToken` | Personal access token (optional) | `"your-pat-token"` | No |

### Repository Object

| Field | Description | Example | Required |
|-------|-------------|---------|----------|
| `name` | Display name for the repository | `"My Repository"` | Yes |
| `repo` | Repository name (Azure DevOps) or full Git URL | `"my-repo"` or `"https://github.com/user/repo.git"` | Yes |
| `baseUrl` | Base URL for Azure DevOps or full Git URL (overrides global) | `"https://org.visualstudio.com"` or `"https://github.com/user/repo.git"` | No |

### Supported Repository Types

The tool automatically detects and supports multiple Git hosting platforms:

#### Azure DevOps

**visualstudio.com format:**
```
https://your-org.visualstudio.com/project/_git/repo-name
```

**dev.azure.com format:**
```
https://dev.azure.com/your-org/project/_git/repo-name
```

#### GitHub, GitLab, and Other Git Platforms

For any Git repository, set `baseUrl` to the full repository URL:

```json5
{
  baseUrl: "https://your-org.visualstudio.com",  // Default for Azure repos
  defaultTag: "v1.0.0",
  tmpDir: "/tmp/git-repos",
  repositories: [
    // Azure DevOps repository
    {
      name: "Azure Repo",
      project: "MyProject",
      repo: "my-azure-repo"
    },
    // GitHub repository (baseUrl override with full Git URL)
    {
      name: "GitHub Project",
      repo: "git-tag",
      baseUrl: "https://github.com/aliartos/git-tag.git"
    },
    // GitLab repository
    {
      name: "GitLab Project",
      repo: "my-project",
      baseUrl: "https://gitlab.com/username/project.git"
    },
    // Bitbucket repository
    {
      name: "Bitbucket Repo",
      repo: "bitbucket-repo",
      baseUrl: "https://bitbucket.org/username/repo.git"
    },
    // Self-hosted Git
    {
      name: "Internal Git Server",
      repo: "internal-repo",
      baseUrl: "https://git.company.com/team/project.git"
    }
  ]
}
```

**How it works:**
- Full Git URLs (containing `.git`, `github.com`, `gitlab.com`) → used directly
- Azure DevOps URLs → constructed from `baseUrl` + `project` + `repo`
- Supports authentication via config or Git credential cache

## Usage

### Basic Usage (uses defaultTag from config)

```bash
./run-script.sh
```

### Specify Custom Tag

```bash
./run-script.sh dev-v0.18
```

### Use Custom Configuration File

```bash
CONFIG_FILE=production-config.json ./run-script.sh release-v1.0
```

## How It Works

For each repository:

1. **Clone** - Shallow clone of `dev` branch only (`--depth 1 --single-branch`)
2. **Fetch Tags** - Retrieve existing tags
3. **Delete** - Remove existing tag (local and remote) if it exists
4. **Create** - Create new tag on HEAD of dev branch
5. **Push** - Push the tag to remote

## Authentication

The script and viewer support multiple authentication methods:

### Git Credential Caching (Default)

The script uses HTTPS with Git credential caching:

- On first git operation, you'll be prompted for credentials
- Credentials are cached for 1 hour (3600 seconds)
- All subsequent operations reuse cached credentials

To use a Personal Access Token (PAT):
- Username: (your Azure DevOps username or email)
- Password: (your PAT token)

### Configuration-Based Authentication

You can add authentication credentials directly to `config.json5`:

```json5
{
  baseUrl: "https://your-org.visualstudio.com",
  
  // Optional: Git authentication credentials
  // If provided, will be used instead of cached credentials
  gitUsername: "your-email@example.com",  // Can be email or username
  gitToken: "your-pat-token-here",
  
  defaultTag: "dev-v0.17",
  tmpDir: "/tmp/git-repos",
  repositories: [ /* ... */ ]
}
```

**Benefits:**
- No password prompts during batch operations
- Works with the viewer's bulk tagging feature
- Email addresses are properly URL-encoded (@ symbol handled correctly)
- Can specify just username, just token, or both

**Security Note:** Keep `config.json5` secure and don't commit tokens to version control. Consider using environment variables or a separate credentials file.

## Output

The script provides detailed logging:

```
===========================================
Starting tagging process for version: dev-v0.17
===========================================
[INFO] Base URL: https://your-org.visualstudio.com

[INFO] Found 42 repositories to process

===========================================
[PROGRESS] Processing repository 1/42
[INFO] Repository: my-repo
===========================================
[STEP 1/5] Cloning repository...
[SUCCESS] Repository cloned successfully
[STEP 2/5] Fetching tags...
[SUCCESS] Tags fetched successfully
...
```

### Final Summary

```
===========================================
TAGGING PROCESS COMPLETED
===========================================
Total repositories processed: 42
Successful: 40
Failed: 2

Failed repositories:
  - repo-name-1 (clone)
  - repo-name-2 (push)
===========================================
```

## Migration from Old Format

If you have `repos.txt`, convert it to JSON5 or JSON:

**Old format (repos.txt):**
```
ProjectA   Web%20Portal    my-repo
ProjectB   DevOps          another-repo
```

**New format (config.json5):**
```json5
{
  baseUrl: "https://your-org.visualstudio.com",
  defaultTag: "dev-v0.17",
  tmpDir: "/tmp/git-repos",
  repositories: [
    {
      name: "My Repository",
      project: "ProjectA",
      repo: "my-repo"
    },
    {
      name: "Another Repository",
      project: "ProjectB",
      repo: "another-repo"

### Server Port Already in Use

If you see `OSError: [Errno 98] Address already in use`:

```bash
# Kill existing server process:
pkill -9 -f "python3 server.py"

# Or find and kill by PID:
lsof -i :8000  # Note the PID
kill -9 <PID>

# Then restart:
python3 server.py
```

### Email Address in gitUsername

Email addresses (like `user@example.com`) are automatically URL-encoded, so the `@` symbol won't cause issues. No special escaping needed in the config file.
    }
  ]
}
```

Note: The new format is simplified - project names are no longer needed in the configuration.

## Troubleshooting

### "jq: command not found"

Install jq (see Prerequisites section).

### Authentication Fails

- Verify your Git credentials (username/password or PAT)
- For Azure DevOps: Ensure your PAT has `Code (Read & Write)` permissions
- For GitHub: Use a personal access token with `repo` scope
- For GitLab: Use a personal access token with `write_repository` scope
- Check that `baseUrl` points to the correct Git hosting platform

### Clone Fails for Specific Repo

- Verify repository URL is correct and accessible
- Check project/repo name spelling (case-sensitive)
- Ensure you have access permissions to the repository
- For Azure DevOps: Verify project name matches exactly
- For GitHub/GitLab: Ensure the full URL is correct

### Tag Already Exists Error

The script automatically deletes existing tags before creating new ones. If this fails:
- Verify you have permissions to delete tags
- Check if the tag is protected

## Advanced Usage

### Repository Tag Viewer

A web-based viewer is included to visualize all repositories and their tags:

1. **Start the local server:**
   ```bash
   python3 server.py
   # Or with custom port:
   python3 server.py 3000
   ```

2. **Open in browser:**
   ```
   http://localhost:8000/viewer.html
   ```

3. **Stop the server:**
   ```bash
   # Press Ctrl+C in the terminal running the server
   # Or kill from another terminal:
   pkill -f "python3 server.py"
   ```

4. **If port 8000 is already in use:**
   `**Bulk tag from branch** - Tag multiple repos at once based on a branch name
- ✅ **Branch availability check** - Warns which repos don't have the specified branch
- ✅ ``bash
   # Check what's using the port:
   lsof -i :8000
   # Or on some systems:
   netstat -tulpn | grep :8000
   
   # Kill the process using the port:
   pkill -9 -f "python3 server.py"
   
   # Or use a different port:
   python3 server.py 8001
   ```

5. **Configuration auto-loads:**
   - The viewer automatically loads `config.json5` from the server
   - No manual file selection needed
   - Tags are fetched using Git commands (bypasses Azure DevOps Enhanced Security)

**Features:**
- ✅ Auto-loads configuration from backend
- ✅ Git-based tag fetching (no API restrictions)
- ✅ Real-time search/filter across repos and tags
- ✅ Sort by name or commit hash
- ✅ Commit hash tooltips on hover
- ✅ Statistics dashboard (total repos, tags)
- ✅ Refresh button to reload tags
- ✅ Responsive design works on mobile and desktop
- ✅ Supports Azure DevOps, GitHub, GitLab, and any Git platform

**How it works:**
- Python server reads config.json and uses `git ls-remote` to fetch tags
- No CORS issues, no Enhanced Security Configuration blocks
- Uses your cached Git credentials from the tagging script

### Dry Run (Test Without Changes)

Modify the script to skip push operations - comment out the push commands.

### Parallel Processing

For faster processing of many repositories, consider GNU Parallel:

```bash
# Install GNU parallel
sudo apt-get install parallel

# Modify script to process single repo, then:
jq -c '.repositories[]' config.json | parallel -j 4 ./process-single-repo.sh {}
```

## License

This tool is provided as-is for internal use.
