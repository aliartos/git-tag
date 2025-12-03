#!/bin/bash

set -eo pipefail

CONFIG_FILE="${CONFIG_FILE:-config.json}"
VERSION="${1:-}"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "ERROR: jq is required but not installed."
    echo "Install it with: sudo apt-get install jq (Debian/Ubuntu) or brew install jq (macOS)"
    exit 1
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "ERROR: Configuration file '$CONFIG_FILE' not found"
    echo "Usage: $0 [version]"
    echo "Or set CONFIG_FILE environment variable: CONFIG_FILE=custom-config.json $0"
    exit 1
fi

# Load configuration
ORGANIZATION=$(jq -r '.organization // ""' "$CONFIG_FILE")
BASE_URL=$(jq -r '.baseUrl' "$CONFIG_FILE")
DEFAULT_TAG=$(jq -r '.defaultTag' "$CONFIG_FILE")
TMP_DIR=$(jq -r '.tmpDir' "$CONFIG_FILE")
GIT_USERNAME=$(jq -r '.gitUsername // ""' "$CONFIG_FILE")
GIT_TOKEN=$(jq -r '.gitToken // ""' "$CONFIG_FILE")

# Use provided version or default from config
if [ -z "$VERSION" ]; then
    VERSION="$DEFAULT_TAG"
    echo "[INFO] No version provided, using default from config: $VERSION"
fi

if [ -z "$VERSION" ]; then
    echo "ERROR: Version must be provided as argument or set as defaultTag in config"
    echo "Usage: $0 <version>"
    exit 1
fi

# Configure git credential caching for this script
export GIT_TERMINAL_PROMPT=1
git config --global credential.helper cache
git config --global credential.helper 'cache --timeout=3600'

echo "==========================================="
echo "Starting tagging process for version: $VERSION"
echo "==========================================="
if [ -n "$ORGANIZATION" ]; then
    echo "[INFO] Organization: $ORGANIZATION"
fi
echo "[INFO] Base URL: $BASE_URL"
echo ""

echo "[INFO] Cleaning up temporary directory: $TMP_DIR"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

# Count repositories
total_repos=$(jq '.repositories | length' "$CONFIG_FILE")
current_repo=0
success_count=0
declare -a failed_repos

echo "[INFO] Found $total_repos repositories to process"
echo ""

# Process each repository
jq -c '.repositories[]' "$CONFIG_FILE" | while read -r repo_json; do
    current_repo=$((current_repo + 1))
    
 
    name=$(echo "$repo_json" | jq -r '.name')
    project=$(echo "$repo_json" | jq -r '.project // .repo')  # Default to repo if project not specified
    repo_name=$(echo "$repo_json" | jq -r '.repo')
    
    # URL encode the project name
    project_encoded=$(echo "$project" | jq -sRr @uri)
    
    echo "==========================================="
    echo "[PROGRESS] Processing repository $current_repo/$total_repos"  
    echo "[INFO] Name: $name"
    echo "[INFO] Project: $project"
    echo "[INFO] Repo: $repo_name"
    echo "==========================================="
    # Support both full Git URLs (GitHub, GitLab, etc.) and Azure DevOps URLs
    base_url_clean="${BASE_URL#https://}"
    base_url_clean="${base_url_clean#http://}"
    
    # Check if baseUrl is a full Git URL (contains .git or common Git hosting patterns)
    if [[ "$BASE_URL" == *".git"* ]] || [[ "$BASE_URL" == *"github.com"* ]] || [[ "$BASE_URL" == *"gitlab.com"* ]]; then
        # Full Git URL - use directly
        if [ -n "$GIT_TOKEN" ] && [ "$GIT_TOKEN" != "null" ]; then
            if [ -n "$GIT_USERNAME" ] && [ "$GIT_USERNAME" != "null" ]; then
                encoded_username=$(echo "$GIT_USERNAME" | jq -sRr @uri)
                encoded_token=$(echo "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_username}:${encoded_token}@"
                echo "[INFO] Using username:token authentication"
            else
                encoded_token=$(echo "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_token}@"
                echo "[INFO] Using token authentication"
            fi
            repo_url="https://${auth_part}${base_url_clean}"
        elif [ -n "$GIT_USERNAME" ] && [ "$GIT_USERNAME" != "null" ]; then
            encoded_username=$(echo "$GIT_USERNAME" | jq -sRr @uri)
            repo_url="https://${encoded_username}@${base_url_clean}"
            echo "[INFO] Using username authentication (will prompt for password)"
        else
            repo_url="$BASE_URL"
            echo "[INFO] Using credential cache authentication"
        fi
    else
        # Azure DevOps URL - construct from parts
        # Format: {baseUrl}/{project}/_git/{repo} for visualstudio.com
        # Format: {baseUrl}/{org}/{project}/_git/{repo} for dev.azure.com
        
        if [[ "$base_url_clean" == *"visualstudio.com"* ]]; then
            # visualstudio.com format - organization already in domain
            url_path="${project_encoded}/_git/${repo_name}"
        elif [ -n "$ORGANIZATION" ]; then
            # dev.azure.com format - need organization in path
            url_path="${ORGANIZATION}/${project_encoded}/_git/${repo_name}"
        else
            echo "[ERROR] Organization is required for dev.azure.com URLs"
            failed_repos+=("$repo_name (missing organization)")
            continue
        fi
        
        if [ -n "$GIT_TOKEN" ] && [ "$GIT_TOKEN" != "null" ]; then
            if [ -n "$GIT_USERNAME" ] && [ "$GIT_USERNAME" != "null" ]; then
                encoded_username=$(echo "$GIT_USERNAME" | jq -sRr @uri)
                encoded_token=$(echo "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_username}:${encoded_token}@"
                echo "[INFO] Using username:token authentication"
            else
                encoded_token=$(echo "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_token}@"
                echo "[INFO] Using token authentication"
            fi
            repo_url="https://${auth_part}${base_url_clean}/${url_path}"
        elif [ -n "$GIT_USERNAME" ] && [ "$GIT_USERNAME" != "null" ]; then
            encoded_username=$(echo "$GIT_USERNAME" | jq -sRr @uri)
            repo_url="https://${encoded_username}@${base_url_clean}/${url_path}"
            echo "[INFO] Using username authentication (will prompt for password)"
        else
            if [ -n "$ORGANIZATION" ]; then
                repo_url="https://${ORGANIZATION}@${base_url_clean}/${url_path}"
            else
                repo_url="https://${base_url_clean}/${url_path}"
            fi
            echo "[INFO] Using credential cache authentication"
        fi
        repo_url="https://$ORGANIZATION@${BASE_URL#https://}/$ORGANIZATION/$project_encoded/_git/$repo_name"
        echo "[INFO] Using credential cache authentication"
    fi
    
    # Clone
    echo "[STEP 1/5] Cloning repository..."
    cd "$TMP_DIR"
    if git clone --depth 1 --single-branch --branch dev "$repo_url"; then
        echo "[SUCCESS] Repository cloned successfully"
    else
        echo "[ERROR] Failed to clone repository: $repo_name"
        failed_repos+=("$repo_name (clone)")
        continue
    fi
    
    cd "$repo_name"
    
    # Fetch tags
    echo "[STEP 2/5] Fetching tags..."
    if git fetch --tags; then
        echo "[SUCCESS] Tags fetched successfully"
    else
        echo "[ERROR] Failed to fetch tags: $repo_name"
        failed_repos+=("$repo_name (fetch-tags)")
        continue
    fi
    
    # Delete existing tag
    echo "[STEP 3/5] Deleting existing tag '$VERSION' (if exists)..."
    if git tag -d "$VERSION" 2>/dev/null; then
        echo "[INFO] Local tag deleted"
    else
        echo "[INFO] No local tag to delete"
    fi
    
    if git push --delete origin "$VERSION" 2>/dev/null; then
        echo "[INFO] Remote tag deleted"
    else
        echo "[INFO] No remote tag to delete"
    fi
    
    # Create new tag
    echo "[STEP 4/5] Creating new tag '$VERSION'..."
    if git tag "$VERSION" HEAD; then
        echo "[SUCCESS] Tag created successfully"
    else
        echo "[ERROR] Failed to create tag: $repo_name"
        failed_repos+=("$repo_name (tag)")
        continue
    fi
    
    # Push tag
    echo "[STEP 5/5] Pushing tag to remote..."
    if git push origin "$VERSION"; then
        echo "[SUCCESS] Tag pushed successfully"
        success_count=$((success_count + 1))
    else
        echo "[ERROR] Failed to push tag: $repo_name"
        failed_repos+=("$repo_name (push)")
        continue
    fi
    
    echo "[COMPLETE] Repository $repo_name processed successfully"
    echo ""
done

echo "==========================================="
echo "TAGGING PROCESS COMPLETED"
echo "==========================================="
echo "Total repositories processed: $total_repos"
echo "Successful: $success_count"
echo "Failed: ${#failed_repos[@]}"
if [ "${#failed_repos[@]}" -gt 0 ]; then
    echo ""
    echo "Failed repositories:"
    printf '  - %s\n' "${failed_repos[@]}"
fi
echo "==========================================="
