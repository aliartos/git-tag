/**
 * API Module
 * Handles all backend communication
 */

/**
 * Fetch configuration from backend
 * @returns {Promise<Object>} Configuration object
 */
async function fetchConfig() {
    const response = await fetch('/api/config');
    if (!response.ok) {
        throw new Error('Failed to load configuration from server');
    }
    return await response.json();
}

/**
 * Fetch tags for a specific repository
 * @param {Object} repo - Repository object
 * @param {Object} config - Configuration object
 * @returns {Promise<Array>} Array of tags
 */
async function fetchRepoTags(repo, config) {
    try {
        const params = new URLSearchParams({
            org: config.organization,
            project: repo.project || repo.repo,
            repo: repo.repo,
            baseUrl: repo.baseUrl || config.baseUrl
        });

        const response = await fetch(`/api/tags?${params}`);

        if (!response.ok) {
            console.warn(`Failed to fetch tags for ${repo.repo}: ${response.status}`);
            return [];
        }

        const data = await response.json();
        return data.tags || [];
    } catch (error) {
        console.error(`Error fetching tags for ${repo.repo}:`, error);
        return [];
    }
}

/**
 * Fetch commits for a repository
 * @param {Object} repo - Repository object
 * @param {number} limit - Number of commits to fetch
 * @param {string} branch - Branch name
 * @returns {Promise<Object>} Commits data
 */
async function fetchRepoCommits(repo, limit = 10, branch = 'dev') {
    const params = new URLSearchParams({
        repo: repo.repo,
        project: repo.project || repo.repo,
        branch: branch,
        limit: limit.toString()
    });

    const response = await fetch(`/api/commits?${params}`);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * Fetch branches for a repository
 * @param {Object} repo - Repository object
 * @param {Object} config - Configuration object
 * @returns {Promise<Object>} Branches data
 */
async function fetchRepoBranches(repo, config) {
    const params = new URLSearchParams({
        repo: repo.repo,
        project: repo.project || repo.repo,
        baseUrl: repo.baseUrl || config.baseUrl
    });

    const response = await fetch(`/api/branches?${params}`);
    return await response.json();
}

/**
 * Execute bulk tagging operation
 * @param {string} branchName - Branch name
 * @param {string} tagName - Tag name
 * @param {Array} repos - Array of repository objects
 * @returns {Promise<Object>} Results of the operation
 */
async function executeBulkTagOperation(branchName, tagName, repos) {
    const response = await fetch('/api/bulk-tag', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            branch: branchName,
            tag: tagName,
            repos: repos
        })
    });

    return await response.json();
}

