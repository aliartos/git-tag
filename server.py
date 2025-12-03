#!/usr/bin/env python3
"""
Simple HTTP server with Git-based tag fetching
Serves static files and uses Git commands to fetch repository tags
Automatically reloads config when config.json5 changes
"""

from http.server import HTTPServer, SimpleHTTPRequestHandler
import subprocess
import json
import sys
import os
import tempfile
import shutil
import re
import time
from urllib.parse import urlparse, parse_qs, quote

class GitTagHandler(SimpleHTTPRequestHandler):
    """HTTP handler with CORS support and Git-based tag fetching"""
    
    # Class-level variables for config caching
    _config_cache = None
    _config_mtime = 0
    _config_file = None
    
    @classmethod
    def get_config(cls):
        """Get config with automatic reload on file change"""
        config_file = 'config.json5' if os.path.exists('config.json5') else 'config.json'
        
        if not os.path.exists(config_file):
            return None
        
        current_mtime = os.path.getmtime(config_file)
        
        # Check if we need to reload
        if cls._config_cache is None or cls._config_file != config_file or current_mtime > cls._config_mtime:
            print(f"[CONFIG] Loading/Reloading {config_file}...")
            try:
                with open(config_file, 'r') as f:
                    content = f.read()
                
                if config_file.endswith('.json5'):
                    cls._config_cache = cls.parse_json5(content)
                else:
                    cls._config_cache = json.loads(content)
                
                cls._config_mtime = current_mtime
                cls._config_file = config_file
                print(f"[CONFIG] ✓ Loaded successfully ({len(cls._config_cache.get('repositories', []))} repositories)")
            except Exception as e:
                print(f"[CONFIG] ✗ Error loading config: {e}")
                return None
        
        return cls._config_cache
    
    @staticmethod
    def parse_json5(content):
        """Parse JSON5 content by converting it to valid JSON"""
        result = []
        in_string = False
        escape_next = False
        i = 0
        
        while i < len(content):
            if escape_next:
                result.append(content[i])
                escape_next = False
                i += 1
                continue
            
            char = content[i]
            
            # Handle escape sequences
            if char == '\\' and in_string:
                result.append(char)
                escape_next = True
                i += 1
                continue
            
            # Handle strings
            if char == '"':
                in_string = not in_string
                result.append(char)
                i += 1
                continue
            
            # Skip comments when not in string
            if not in_string:
                # Single-line comments
                if i < len(content) - 1 and content[i:i+2] == '//':
                    # Skip until end of line
                    while i < len(content) and content[i] != '\n':
                        i += 1
                    continue
                
                # Multi-line comments
                if i < len(content) - 1 and content[i:i+2] == '/*':
                    # Skip until */
                    i += 2
                    while i < len(content) - 1:
                        if content[i:i+2] == '*/':
                            i += 2
                            break
                        i += 1
                    continue
            
            result.append(char)
            i += 1
        
        content = ''.join(result)
        
        # Now handle unquoted keys - find patterns like: word:
        # But only at the start of a line or after { or ,
        lines = []
        for line in content.split('\n'):
            # Match unquoted keys: optional whitespace + word + optional whitespace + colon
            line = re.sub(r'^(\s*)([a-zA-Z_]\w*)(\s*):', r'\1"\2"\3:', line)
            line = re.sub(r'([{,]\s*)([a-zA-Z_]\w*)(\s*):', r'\1"\2"\3:', line)
            lines.append(line)
        
        content = '\n'.join(lines)
        
        # Remove trailing commas before } or ]
        content = re.sub(r',(\s*[}\]])', r'\1', content)
        
        return json.loads(content)
    
    def serve_config(self):
        """Serve the config.json5 file with automatic reload"""
        try:
            config = self.get_config()
            
            if config is None:
                self.send_error(404, 'config.json5 or config.json not found')
                return
            
            config_json = json.dumps(config)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(config_json.encode())
            print(f"[API] Served {self._config_file}")
            
        except Exception as e:
            print(f"[API] Error serving config: {str(e)}")
            self.send_error(500, f'Error reading config: {str(e)}')
    
    def do_GET(self):
        """Handle GET requests - serve API endpoints or static files"""
        
        if self.path == '/api/config':
            self.serve_config()
        elif self.path.startswith('/api/tags'):
            self.fetch_repo_tags()
        elif self.path.startswith('/api/branches'):
            self.fetch_repo_branches()
        elif self.path.startswith('/api/commits'):
            self.fetch_repo_commits()
        elif self.path == '/' or self.path == '/index.html':
            # Serve the new modular index.html
            self.serve_file('viewer-app/public/index.html', 'text/html')
        elif self.path.startswith('/styles.css'):
            self.serve_file('viewer-app/public/styles.css', 'text/css')
        elif self.path.startswith('/js/'):
            # Serve JavaScript files from viewer-app/public/js/
            js_file = 'viewer-app/public' + self.path
            self.serve_file(js_file, 'application/javascript')
        else:
            # Serve static files (HTML, JS, CSS, JSON)
            super().do_GET()
    
    def serve_file(self, filepath, content_type):
        """Serve a static file"""
        try:
            with open(filepath, 'rb') as f:
                content = f.read()

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404, f'File not found: {filepath}')
        except Exception as e:
            print(f"[ERROR] Error serving file {filepath}: {e}")
            self.send_error(500, f'Error serving file: {str(e)}')

    def do_POST(self):
        """Handle POST requests for bulk operations"""
        if self.path == '/api/bulk-tag':
            self.bulk_tag_repos()
        else:
            self.send_error(404, 'Endpoint not found')
    
    def serve_config(self):
        """Serve the config.json5 file"""
        try:
            # Try JSON5 first, fallback to JSON
            config_file = 'config.json5' if os.path.exists('config.json5') else 'config.json'
            
            with open(config_file, 'r') as f:
                content = f.read()
            
            # Parse JSON5 and convert to JSON for response
            if config_file.endswith('.json5'):
                config_data = self.parse_json5(content)
                config_json = json.dumps(config_data)
            else:
                config_json = content
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(config_json.encode())
            print(f"[API] Served {config_file}")
            
        except FileNotFoundError:
            self.send_error(404, 'config.json5 or config.json not found')
        except Exception as e:
            print(f"[API] Error serving config: {str(e)}")
            self.send_error(500, f'Error reading config: {str(e)}')
    
    def fetch_repo_branches(self):
        """Fetch branches for a repository using Git"""
        try:
            # Parse query parameters
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            
            if 'repo' not in query_params:
                self.send_error(400, 'Missing required parameter: repo')
                return
            
            repo_name = query_params['repo'][0]
            project_name = query_params.get('project', [repo_name])[0]  # Default to repo name if not provided
            
            # Load config
            config = self.get_config()
            if config is None:
                self.send_error(500, 'Failed to load config')
                return
            
            org = config.get('organization', '')
            default_base_url = config.get('baseUrl', 'https://dev.azure.com')
            git_username = config.get('gitUsername', '')
            git_token = config.get('gitToken', '')
            
            # Get repository-specific baseUrl if provided
            base_url = query_params.get('baseUrl', [default_base_url])[0]
            
            # Check if baseUrl is a full Git URL
            if '.git' in base_url or 'github.com' in base_url or 'gitlab.com' in base_url:
                # Full Git URL - use directly
                base_url_clean = base_url.replace('https://', '').replace('http://', '')
                auth_part = ''
                if git_token:
                    if git_username:
                        auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                    else:
                        auth_part = f"{quote(git_token, safe='')}@"
                elif git_username:
                    auth_part = f"{quote(git_username, safe='')}@"
                
                repo_url = f"https://{auth_part}{base_url_clean}" if auth_part else base_url
            else:
                # Azure DevOps URL - construct from parts
                base_url_clean = base_url.replace('https://', '').replace('http://', '')
                
                # Prepare authentication part of URL (URL-encode credentials)
                auth_part = ''
                if git_token:
                    if git_username:
                        auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                    else:
                        auth_part = f"{quote(git_token, safe='')}@"
                elif git_username:
                    auth_part = f"{quote(git_username, safe='')}@"
                
                if 'visualstudio.com' in base_url_clean:
                    # Format: https://{org}.visualstudio.com/{project}/_git/{repo}
                    if auth_part:
                        repo_url = f"https://{auth_part}{base_url_clean}/{project_name}/_git/{repo_name}"
                    else:
                        repo_url = f"https://{base_url_clean}/{project_name}/_git/{repo_name}"
                else:
                    # Format: https://dev.azure.com/{org}/{project}/_git/{repo}
                    if not org:
                        print(f"[GIT] Error: organization required for dev.azure.com")
                        self.send_error(400, 'organization required for dev.azure.com URLs')
                        return
                    
                    if auth_part:
                        repo_url = f"https://{auth_part}{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
                    else:
                        repo_url = f"https://{org}@{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
            
            print(f"[GIT] Fetching branches for: {repo_name}")
            print(f"[GIT] URL: {repo_url}")
            
            # Create temporary directory
            temp_dir = tempfile.mkdtemp(prefix='git-branches-')
            
            try:
                # Use git ls-remote to fetch branches without cloning
                result = subprocess.run(
                    ['git', 'ls-remote', '--heads', '--refs', repo_url],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=temp_dir
                )
                
                if result.returncode != 0:
                    print(f"[GIT] Error: {result.stderr}")
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'branches': [], 'error': result.stderr}).encode())
                    return
                
                # Parse branches from output
                branches = []
                for line in result.stdout.strip().split('\n'):
                    if line and 'refs/heads/' in line:
                        parts = line.split()
                        if len(parts) >= 2:
                            commit_hash = parts[0]
                            branch_name = parts[1].split('refs/heads/')[1].strip()
                            branches.append({
                                'name': branch_name,
                                'commit': commit_hash,
                                'shortCommit': commit_hash[:7]
                            })
                
                print(f"[GIT] Found {len(branches)} branches for {repo_name}")
                
                # Send response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'branches': branches}).encode())
                
            finally:
                # Clean up temp directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except subprocess.TimeoutExpired:
            print(f"[GIT] Timeout fetching branches for {repo_name}")
            self.send_error(504, 'Git operation timed out')
        except Exception as e:
            print(f"[GIT] Error: {str(e)}")
            self.send_error(500, f'Internal Server Error: {str(e)}')
    
    def fetch_repo_commits(self):
        """Fetch recent commits for a repository using Git"""
        try:
            # Parse query parameters
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            
            if 'repo' not in query_params:
                self.send_error(400, 'Missing required parameter: repo')
                return
            
            repo_name = query_params['repo'][0]
            project_name = query_params.get('project', [repo_name])[0]
            branch = query_params.get('branch', ['dev'])[0]  # Default to 'dev' branch
            limit = int(query_params.get('limit', ['10'])[0])  # Default to 10 commits
            
            # Load config
            config = self.get_config()
            if config is None:
                self.send_error(500, 'Failed to load config')
                return
            
            org = config.get('organization', '')
            default_base_url = config.get('baseUrl', 'https://dev.azure.com')
            git_username = config.get('gitUsername', '')
            git_token = config.get('gitToken', '')
            
            # Get repository-specific baseUrl if provided
            base_url = query_params.get('baseUrl', [default_base_url])[0]
            
            # Check if baseUrl is a full Git URL
            if '.git' in base_url or 'github.com' in base_url or 'gitlab.com' in base_url:
                # Full Git URL - use directly
                base_url_clean = base_url.replace('https://', '').replace('http://', '')
                auth_part = ''
                if git_token:
                    if git_username:
                        auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                    else:
                        auth_part = f"{quote(git_token, safe='')}@"
                elif git_username:
                    auth_part = f"{quote(git_username, safe='')}@"
                
                repo_url = f"https://{auth_part}{base_url_clean}" if auth_part else base_url
            else:
                # Azure DevOps URL - construct from parts
                base_url_clean = base_url.replace('https://', '').replace('http://', '')
                
                auth_part = ''
                if git_token:
                    if git_username:
                        auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                    else:
                        auth_part = f"{quote(git_token, safe='')}@"
                elif git_username:
                    auth_part = f"{quote(git_username, safe='')}@"
                
                if 'visualstudio.com' in base_url_clean:
                    if auth_part:
                        repo_url = f"https://{auth_part}{base_url_clean}/{project_name}/_git/{repo_name}"
                    else:
                        repo_url = f"https://{base_url_clean}/{project_name}/_git/{repo_name}"
                else:
                    if not org:
                        self.send_error(400, 'organization required for dev.azure.com URLs')
                        return
                    if auth_part:
                        repo_url = f"https://{auth_part}{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
                    else:
                        repo_url = f"https://{org}@{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
            
            print(f"[GIT] Fetching commits for: {repo_name} (branch: {branch}, limit: {limit})")
            print(f"[GIT] URL: {repo_url}")
            
            # Create temporary directory
            temp_dir = tempfile.mkdtemp(prefix='git-commits-')
            
            try:
                # Clone the repository (shallow clone of the specific branch)
                clone_result = subprocess.run(
                    ['git', 'clone', '--depth', str(limit), '--single-branch', '--branch', branch, repo_url],
                    capture_output=True,
                    text=True,
                    timeout=60,
                    cwd=temp_dir
                )
                
                if clone_result.returncode != 0:
                    print(f"[GIT] Error: {clone_result.stderr}")
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'commits': [], 'error': clone_result.stderr}).encode())
                    return
                
                repo_dir = os.path.join(temp_dir, repo_name)
                
                # Get commit log with format
                log_result = subprocess.run(
                    ['git', 'log', f'-{limit}', '--pretty=format:%H%n%h%n%an%n%ae%n%at%n%s%n%b%n---COMMIT-END---'],
                    capture_output=True,
                    text=True,
                    timeout=10,
                    cwd=repo_dir
                )
                
                if log_result.returncode != 0:
                    print(f"[GIT] Error fetching log: {log_result.stderr}")
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'commits': [], 'error': log_result.stderr}).encode())
                    return
                
                # Parse commits
                commits = []
                commit_texts = log_result.stdout.split('---COMMIT-END---')
                
                for commit_text in commit_texts:
                    if not commit_text.strip():
                        continue
                    
                    lines = commit_text.strip().split('\n')
                    if len(lines) >= 6:
                        full_hash = lines[0]
                        short_hash = lines[1]
                        author_name = lines[2]
                        author_email = lines[3]
                        timestamp = lines[4]
                        subject = lines[5]
                        body = '\n'.join(lines[6:]).strip() if len(lines) > 6 else ''
                        
                        commits.append({
                            'hash': full_hash,
                            'shortHash': short_hash,
                            'author': author_name,
                            'email': author_email,
                            'timestamp': int(timestamp),
                            'date': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(int(timestamp))),
                            'subject': subject,
                            'body': body
                        })
                
                print(f"[GIT] Found {len(commits)} commits for {repo_name}")
                
                # Send response
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'commits': commits, 'branch': branch}).encode())
                
            finally:
                # Clean up temp directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except subprocess.TimeoutExpired:
            print(f"[GIT] Timeout fetching commits for {repo_name}")
            self.send_error(504, 'Git operation timed out')
        except Exception as e:
            print(f"[GIT] Error: {str(e)}")
            self.send_error(500, f'Internal Server Error: {str(e)}')
    
    def fetch_repo_tags(self):
        """Fetch tags for a repository using Git"""
        try:
            # Parse query parameters
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            
            if 'repo' not in query_params:
                self.send_error(400, 'Missing required parameter: repo')
                return
            
            repo_name = query_params['repo'][0]
            project_name = query_params.get('project', [repo_name])[0]  # Default to repo name if not provided
            
            # Load config to get organization and base URL
            try:
                config_file = 'config.json5' if os.path.exists('config.json5') else 'config.json'
                with open(config_file, 'r') as f:
                    content = f.read()
                
                if config_file.endswith('.json5'):
                    config = self.parse_json5(content)
                else:
                    config = json.loads(content)
            except Exception as e:
                self.send_error(500, f'Error loading config: {str(e)}')
                return
            
            org = config.get('organization', '')
            default_base_url = config.get('baseUrl', 'https://dev.azure.com')
            git_username = config.get('gitUsername', '')
            git_token = config.get('gitToken', '')
            
            # Get repository-specific baseUrl if provided
            base_url = query_params.get('baseUrl', [default_base_url])[0]
            
            # Check if baseUrl is a full Git URL
            if '.git' in base_url or 'github.com' in base_url or 'gitlab.com' in base_url:
                # Full Git URL - use directly
                base_url_clean = base_url.replace('https://', '').replace('http://', '')
                auth_part = ''
                if git_token:
                    if git_username:
                        auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                    else:
                        auth_part = f"{quote(git_token, safe='')}@"
                elif git_username:
                    auth_part = f"{quote(git_username, safe='')}@"
                
                repo_url = f"https://{auth_part}{base_url_clean}" if auth_part else base_url
            else:
                # Azure DevOps URL - construct from parts
                base_url_clean = base_url.replace('https://', '').replace('http://', '')
                
                auth_part = ''
                if git_token:
                    if git_username:
                        auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                    else:
                        auth_part = f"{quote(git_token, safe='')}@"
                elif git_username:
                    auth_part = f"{quote(git_username, safe='')}@"
                
                if 'visualstudio.com' in base_url_clean:
                    if auth_part:
                        repo_url = f"https://{auth_part}{base_url_clean}/{project_name}/_git/{repo_name}"
                    else:
                        repo_url = f"https://{base_url_clean}/{project_name}/_git/{repo_name}"
                else:
                    if not org:
                        self.send_error(400, 'organization required for dev.azure.com URLs')
                        return
                    if auth_part:
                        repo_url = f"https://{auth_part}{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
                    else:
                        repo_url = f"https://{org}@{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
            
            print(f"[GIT] Fetching tags for: {repo_name}")
            print(f"[GIT] URL: {repo_url}")
            
            # Create temporary directory
            temp_dir = tempfile.mkdtemp(prefix='git-tags-')
            
            try:
                # Use git ls-remote to fetch tags without cloning
                result = subprocess.run(
                    ['git', 'ls-remote', '--tags', '--refs', repo_url],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    cwd=temp_dir
                )
                
                if result.returncode != 0:
                    print(f"[GIT] Error: {result.stderr}")
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'tags': [], 'error': result.stderr}).encode())
                    return
                
                # Parse tags from output with commit hashes
                tags = []
                for line in result.stdout.strip().split('\n'):
                    if line and 'refs/tags/' in line:
                        parts = line.split()
                        if len(parts) >= 2:
                            commit_hash = parts[0]
                            tag_name = parts[1].split('refs/tags/')[1].strip()
                            tags.append({
                                'name': tag_name,
                                'commit': commit_hash,
                                'shortCommit': commit_hash[:7]
                            })
                
                print(f"[GIT] Found {len(tags)} tags for {repo_name}")
                
                # Send response (sorting will be done on frontend)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'tags': tags}).encode())
                
            finally:
                # Clean up temp directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except subprocess.TimeoutExpired:
            print(f"[GIT] Timeout fetching tags for {repo_name}")
            self.send_error(504, 'Git operation timed out')
        except Exception as e:
            print(f"[GIT] Error: {str(e)}")
            self.send_error(500, f'Internal Server Error: {str(e)}')
    
    def bulk_tag_repos(self):
        """Create tags for multiple repositories based on a branch"""
        try:
            # Read POST body
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            request = json.loads(post_data.decode('utf-8'))
            
            branch_name = request.get('branch')
            tag_name = request.get('tag')
            repos = request.get('repos', [])
            
            if not branch_name or not tag_name or not repos:
                self.send_error(400, 'Missing required parameters: branch, tag, repos')
                return
            
            # Load config
            config = self.get_config()
            if config is None:
                self.send_error(500, 'Failed to load config')
                return
            
            org = config.get('organization', '')
            default_base_url = config.get('baseUrl', 'https://dev.azure.com')
            git_username = config.get('gitUsername', '')
            git_token = config.get('gitToken', '')
            
            results = []
            
            for repo_info in repos:
                repo_name = repo_info['repo']
                project_name = repo_info.get('project', repo_name)  # Default to repo name if not provided
                base_url = repo_info.get('baseUrl', default_base_url)
                
                print(f"[BULK-TAG] Processing {repo_name}...")
                
                # Check if baseUrl is a full Git URL
                if '.git' in base_url or 'github.com' in base_url or 'gitlab.com' in base_url:
                    # Full Git URL - use directly
                    base_url_clean = base_url.replace('https://', '').replace('http://', '')
                    auth_part = ''
                    if git_token:
                        if git_username:
                            auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                        else:
                            auth_part = f"{quote(git_token, safe='')}@"
                    elif git_username:
                        auth_part = f"{quote(git_username, safe='')}@"
                    
                    repo_url = f"https://{auth_part}{base_url_clean}" if auth_part else base_url
                else:
                    # Azure DevOps URL - construct from parts
                    base_url_clean = base_url.replace('https://', '').replace('http://', '')
                    
                    auth_part = ''
                    if git_token:
                        if git_username:
                            auth_part = f"{quote(git_username, safe='')}:{quote(git_token, safe='')}@"
                        else:
                            auth_part = f"{quote(git_token, safe='')}@"
                    elif git_username:
                        auth_part = f"{quote(git_username, safe='')}@"
                    
                    if 'visualstudio.com' in base_url_clean:
                        if auth_part:
                            repo_url = f"https://{auth_part}{base_url_clean}/{project_name}/_git/{repo_name}"
                        else:
                            repo_url = f"https://{base_url_clean}/{project_name}/_git/{repo_name}"
                    else:
                        if not org:
                            results.append({
                                'repo': repo_name,
                                'success': False,
                                'error': 'organization required for dev.azure.com URLs'
                            })
                            continue
                        if auth_part:
                            repo_url = f"https://{auth_part}{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
                        else:
                            repo_url = f"https://{org}@{base_url_clean}/{org}/{project_name}/_git/{repo_name}"
                
                # Create temporary directory
                temp_dir = tempfile.mkdtemp(prefix=f'git-tag-{repo_name}-')
                
                try:
                    # Clone the specific branch
                    clone_result = subprocess.run(
                        ['git', 'clone', '--depth', '1', '--single-branch', '--branch', branch_name, repo_url],
                        capture_output=True,
                        text=True,
                        timeout=60,
                        cwd=temp_dir
                    )
                    
                    if clone_result.returncode != 0:
                        results.append({
                            'repo': repo_name,
                            'success': False,
                            'error': f'Failed to clone branch {branch_name}: {clone_result.stderr}'
                        })
                        continue
                    
                    repo_dir = os.path.join(temp_dir, repo_name)
                    
                    # Delete existing tag locally
                    subprocess.run(['git', 'tag', '-d', tag_name], cwd=repo_dir, capture_output=True)
                    
                    # Delete existing tag remotely
                    subprocess.run(['git', 'push', '--delete', 'origin', tag_name], cwd=repo_dir, capture_output=True)
                    
                    # Create new tag
                    tag_result = subprocess.run(
                        ['git', 'tag', tag_name, 'HEAD'],
                        capture_output=True,
                        text=True,
                        cwd=repo_dir
                    )
                    
                    if tag_result.returncode != 0:
                        results.append({
                            'repo': repo_name,
                            'success': False,
                            'error': f'Failed to create tag: {tag_result.stderr}'
                        })
                        continue
                    
                    # Push tag
                    push_result = subprocess.run(
                        ['git', 'push', 'origin', tag_name],
                        capture_output=True,
                        text=True,
                        timeout=30,
                        cwd=repo_dir
                    )
                    
                    if push_result.returncode != 0:
                        results.append({
                            'repo': repo_name,
                            'success': False,
                            'error': f'Failed to push tag: {push_result.stderr}'
                        })
                        continue
                    
                    results.append({
                        'repo': repo_name,
                        'success': True,
                        'message': f'Successfully tagged {branch_name} with {tag_name}'
                    })
                    print(f"[BULK-TAG] ✓ {repo_name} tagged successfully")
                    
                except subprocess.TimeoutExpired:
                    results.append({
                        'repo': repo_name,
                        'success': False,
                        'error': 'Operation timed out'
                    })
                except Exception as e:
                    results.append({
                        'repo': repo_name,
                        'success': False,
                        'error': str(e)
                    })
                finally:
                    # Clean up temp directory
                    shutil.rmtree(temp_dir, ignore_errors=True)
            
            # Send response
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'results': results}).encode())
            
        except Exception as e:
            print(f"[BULK-TAG] Error: {str(e)}")
            self.send_error(500, f'Internal Server Error: {str(e)}')
    
    def log_message(self, format, *args):
        """Custom logging format"""
        print(f"[{self.log_date_time_string()}] {format % args}")


def run_server(port=8000):
    """Start the HTTP server"""
    server_address = ('', port)
    httpd = HTTPServer(server_address, GitTagHandler)
    
    print("=" * 60)
    print("🚀 Git Tag Viewer Server")
    print("=" * 60)
    print(f"Server running at: http://localhost:{port}/")
    print("=" * 60)
    print("✓ Auto-reload: Config changes detected automatically")
    print("✓ Modular structure: HTML, CSS, JS separated")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    print()
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped")
        sys.exit(0)


if __name__ == '__main__':
    port = 8000
    
    # Allow custom port as command line argument
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
            sys.exit(1)
    
    run_server(port)
