#!/bin/bash

set -eo pipefail

CONFIG_FILE="${CONFIG_FILE:-config.json5}"
VERSION="${1:-}"

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "ERROR: jq is required but not installed."
    echo "Install it with: sudo apt-get install jq (Debian/Ubuntu) or brew install jq (macOS)"
    exit 1
fi

# Check if config file exists - try .json5 first, then .json
if [ ! -f "$CONFIG_FILE" ]; then
    if [ "$CONFIG_FILE" = "config.json5" ] && [ -f "config.json" ]; then
        CONFIG_FILE="config.json"
        echo "[INFO] Using config.json instead of config.json5"
    else
        echo "ERROR: Configuration file '$CONFIG_FILE' not found"
        echo "Usage: $0 [version]"
        echo "Or set CONFIG_FILE environment variable: CONFIG_FILE=custom-config.json $0"
        exit 1
    fi
fi

# Function to convert JSON5 to JSON
convert_json5_to_json() {
    local input_file="$1"

    # Try using the Python helper script first (most reliable)
    if [ -f "./json5_to_json.py" ] && command -v python3 &> /dev/null; then
        python3 ./json5_to_json.py "$input_file"
        return $?
    fi

    # Fallback: inline Python conversion
    if command -v python3 &> /dev/null; then
        python3 -c "
import re
import json

with open('$input_file', 'r') as f:
    content = f.read()

# Remove single-line comments (but not URLs with //)
lines = content.split('\n')
cleaned_lines = []
for line in lines:
    in_string = False
    quote_char = None
    comment_start = -1

    for i, char in enumerate(line):
        if char in ('\"', \"'\") and (i == 0 or line[i-1] != '\\\\'):
            if not in_string:
                in_string = True
                quote_char = char
            elif char == quote_char:
                in_string = False
                quote_char = None
        elif char == '/' and i < len(line) - 1 and line[i+1] == '/' and not in_string:
            comment_start = i
            break

    if comment_start >= 0:
        cleaned_lines.append(line[:comment_start])
    else:
        cleaned_lines.append(line)

content = '\n'.join(cleaned_lines)
content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
content = re.sub(r'(\n\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1\"\2\":', content)
content = re.sub(r',(\s*[}\]])', r'\1', content)

print(content)
" 2>/dev/null
        return $?
    fi

    # Last resort: sed-based conversion (limited but no dependencies)
    echo "[WARN] Python not available, using basic sed conversion (may not handle all JSON5 features)" >&2
    sed -e 's|//.*$||g' \
        -e 's|/\*.*\*/||g' \
        -e ':a' -e 'N' -e '$!ba' \
        -e 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/||g' \
        -e 's|,\s*\([\]}]\)|\1|g' \
        "$input_file" | \
    sed -E 's/^([[:space:]]*)([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*:/\1"\2":/g'
}

# Detect file format and convert if needed
TEMP_CONFIG=""
if [[ "$CONFIG_FILE" == *.json5 ]]; then
    echo "[INFO] Detected JSON5 format, converting to JSON..."
    TEMP_CONFIG=$(mktemp)
    if convert_json5_to_json "$CONFIG_FILE" > "$TEMP_CONFIG"; then
        # Validate the converted JSON
        if jq empty "$TEMP_CONFIG" 2>/dev/null; then
            echo "[INFO] ✓ JSON5 converted successfully"
            CONFIG_FILE="$TEMP_CONFIG"
        else
            echo "[ERROR] Failed to convert JSON5 to valid JSON"
            rm -f "$TEMP_CONFIG"
            exit 1
        fi
    else
        echo "[ERROR] Failed to process JSON5 file"
        rm -f "$TEMP_CONFIG"
        exit 1
    fi
fi

# Cleanup function to remove temp file on exit
cleanup() {
    if [ -n "$TEMP_CONFIG" ] && [ -f "$TEMP_CONFIG" ]; then
        rm -f "$TEMP_CONFIG"
    fi
}
trap cleanup EXIT

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
    
    # URL encode the project name (remove any trailing newlines)
    project_encoded=$(printf '%s' "$project" | jq -sRr @uri)

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
                encoded_username=$(printf '%s' "$GIT_USERNAME" | jq -sRr @uri)
                encoded_token=$(printf '%s' "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_username}:${encoded_token}@"
                echo "[INFO] Using username:token authentication"
            else
                encoded_token=$(printf '%s' "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_token}@"
                echo "[INFO] Using token authentication"
            fi
            repo_url="https://${auth_part}${base_url_clean}"
        elif [ -n "$GIT_USERNAME" ] && [ "$GIT_USERNAME" != "null" ]; then
            encoded_username=$(printf '%s' "$GIT_USERNAME" | jq -sRr @uri)
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
                encoded_username=$(printf '%s' "$GIT_USERNAME" | jq -sRr @uri)
                encoded_token=$(printf '%s' "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_username}:${encoded_token}@"
                echo "[INFO] Using username:token authentication"
            else
                encoded_token=$(printf '%s' "$GIT_TOKEN" | jq -sRr @uri)
                auth_part="${encoded_token}@"
                echo "[INFO] Using token authentication"
            fi
            repo_url="https://${auth_part}${base_url_clean}/${url_path}"
        elif [ -n "$GIT_USERNAME" ] && [ "$GIT_USERNAME" != "null" ]; then
            encoded_username=$(printf '%s' "$GIT_USERNAME" | jq -sRr @uri)
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
    fi
    
    # Clone
    echo "[STEP 1/5] Cloning repository..."
    cd "$TMP_DIR"

    # Try to clone - first attempt with dev branch, then try without specifying branch
    if git clone --depth 1 --single-branch --branch dev "$repo_url" 2>/dev/null; then
        echo "[SUCCESS] Repository cloned successfully (dev branch)"
    elif git clone --depth 1 --single-branch --branch main "$repo_url" 2>/dev/null; then
        echo "[SUCCESS] Repository cloned successfully (main branch)"
    elif git clone --depth 1 --single-branch --branch master "$repo_url" 2>/dev/null; then
        echo "[SUCCESS] Repository cloned successfully (master branch)"
    elif git clone --depth 1 "$repo_url" 2>/dev/null; then
        echo "[SUCCESS] Repository cloned successfully (default branch)"
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
