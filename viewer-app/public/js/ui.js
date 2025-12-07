/**
 * UI Module
 * Handles all UI rendering and interactions
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show loading state
 */
function showLoading() {
    document.getElementById('output').innerHTML = `
        <div class="loading">
            <h3>Loading repositories...</h3>
            <p>Fetching tags from Azure DevOps</p>
        </div>
    `;
}

/**
 * Show error message
 * @param {string} message - Error message
 */
function showError(message) {
    document.getElementById('output').innerHTML = `
        <div class="error">
            <strong>Error:</strong> ${escapeHtml(message)}
        </div>
    `;
}

/**
 * Update statistics display
 * @param {Array} repos - Array of repositories
 */
function updateStats(repos) {
    const totalTags = repos.reduce((sum, repo) => sum + repo.tags.length, 0);
    const uniqueProjects = new Set(repos.map(r => r.project || r.repo));

    document.getElementById('repoCount').textContent = repos.length;
    document.getElementById('tagCount').textContent = totalTags;
    document.getElementById('projectCount').textContent = uniqueProjects.size;
    document.getElementById('stats').classList.remove('hidden');
}

/**
 * Sort tags based on current sort order
 * @param {Array} tags - Array of tag objects
 * @param {string} sortOrder - Sort order
 */
function sortTags(tags, sortOrder) {
    switch(sortOrder) {
        case 'name-asc':
            tags.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'name-desc':
            tags.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'commit-asc':
            tags.sort((a, b) => a.commit.localeCompare(b.commit));
            break;
        case 'commit-desc':
            tags.sort((a, b) => b.commit.localeCompare(a.commit));
            break;
    }
}

/**
 * Render repositories grid
 * @param {Array} repos - Array of repositories
 * @param {string} sortOrder - Current sort order
 */
function renderRepos(repos, sortOrder, branchesState = {}, settings = {}, commitsState = {}) {
    const output = document.getElementById('output');

    if (repos.length === 0) {
        output.innerHTML = `
            <div class="empty">
                <div class="empty-icon">🔍</div>
                <h3>No Repositories Found</h3>
                <p>Try adjusting your search criteria</p>
            </div>
        `;
        return;
    }

    // Sort tags in each repo based on current sort order
    repos.forEach(repo => {
        sortTags(repo.tags, sortOrder);
    });

    const defaultCommitLimit = parseInt(settings.defaultCommitLimit, 10) || 10;

    const html = `
        <div class="repo-grid">
            ${repos.map((repo, index) => {
                const repoIndex = (typeof allRepos !== 'undefined')
                    ? allRepos.findIndex(r => r.repo === repo.repo && (r.project || r.repo) === (repo.project || repo.repo))
                    : index;
                const safeIndex = repoIndex === -1 ? index : repoIndex;

                const savedBranch = loadBranchSelection(repo.repo);
                const branchState = branchesState[repo.repo] || {};
                const branchOptions = (branchState.branches && branchState.branches.length)
                    ? Array.from(new Set(branchState.branches))
                    : ['main', 'dev', 'master'];

                if (savedBranch && !branchOptions.includes(savedBranch)) {
                    branchOptions.unshift(savedBranch);
                }

                const selectedBranch = branchOptions.includes(savedBranch)
                    ? savedBranch
                    : branchOptions[0] || 'dev';

                const branchStatusLabel = branchState.loading
                    ? 'Loading branches...'
                    : branchState.error
                        ? 'Branches unavailable'
                        : `Branches (${branchOptions.length})`;

                const limitOptions = [5, 10, 20, 50];
                if (!limitOptions.includes(defaultCommitLimit)) {
                    limitOptions.unshift(defaultCommitLimit);
                }

                return `
                <div class="repo-card" data-repo-index="${safeIndex}">
                    <div class="repo-name">${escapeHtml(repo.name || repo.repo)}</div>
                    <div class="repo-projects">
                        <div class="repo-project">
                            <span class="project-label">Project:</span>
                            <span>${escapeHtml(repo.project || repo.repo)}</span>
                        </div>
                        <div class="repo-project">
                            <span class="project-label">Repo:</span>
                            <span>${escapeHtml(repo.repo)}</span>
                        </div>
                    </div>
                    <div class="tags-section">
                        <div class="tags-header">
                            Tags
                            <span class="tag-count">${repo.tags.length}</span>
                        </div>
                        <div class="tags-list">
                            ${repo.tags.length > 0 
                                ? repo.tags.map(tag => `
                                    <span class="tag">
                                        ${escapeHtml(tag.name)}
                                        <span class="tag-tooltip">
                                            Commit: ${escapeHtml(tag.shortCommit)}<br>
                                            Full: ${escapeHtml(tag.commit)}
                                        </span>
                                    </span>
                                `).join('')
                                : '<span style="color: #6c757d; font-size: 0.85rem;">No tags</span>'
                            }
                        </div>
                        <div class="commits-controls" style="margin-top: 15px;">
                            <label>View commits - Branch:</label>
                            <div class="branch-row">
                                <select id="branch-select-${safeIndex}" data-repo-index="${safeIndex}" data-repo-name="${escapeHtml(repo.repo)}">
                                    ${branchOptions.map(branch => `
                                        <option value="${escapeHtml(branch)}" ${branch === selectedBranch ? 'selected' : ''}>${escapeHtml(branch)}</option>
                                    `).join('')}
                                </select>
                                <button class="refresh-branches-btn" data-refresh-branches="${safeIndex}">🔄 Refresh Branches</button>
                                <span class="branch-status-pill ${branchState.loading ? 'loading' : branchState.error ? 'error' : 'ok'}" id="branch-status-${safeIndex}">
                                    ${escapeHtml(branchStatusLabel)}
                                </span>
                            </div>
                            <label>Limit:</label>
                            <select id="limit-select-${safeIndex}">
                                ${limitOptions.map(limit => `
                                    <option value="${limit}" ${limit === defaultCommitLimit ? 'selected' : ''}>${limit}</option>
                                `).join('')}
                            </select>
                            <button data-load-commits="${safeIndex}">📝 View Commits</button>
                        </div>
                    </div>
                    <div id="commits-${safeIndex}" class="commits-container"></div>
                </div>
            `}).join('')}
        </div>
    `;

    output.innerHTML = html;

    restoreCommitSections(commitsState, repos);
}

/**
 * Re-render commit sections after the repo grid rehydrates
 * @param {Object} commitsState - commit cache keyed by repo index
 * @param {Array} repos - repositories rendered
 */
function restoreCommitSections(commitsState, repos) {
    if (!commitsState || !repos) return;

    Object.entries(commitsState).forEach(([index, state]) => {
        const repoIndex = parseInt(index, 10);
        const container = document.getElementById(`commits-${repoIndex}`);
        if (!container || !state || !state.loaded || !state.commits) return;

        const repo = (typeof allRepos !== 'undefined' && allRepos[repoIndex]) ? allRepos[repoIndex] : repos[repoIndex];
        if (!repo) return;

        const branch = state.branch || loadBranchSelection(repo.repo);

        if (state.commits.length === 0) {
            showNoCommits(repoIndex, branch);
            return;
        }

        renderCommits(repoIndex, repo, state.commits, branch);
    });
}

/**
 * Render commits for a repository
 * @param {number} index - Repository index
 * @param {Object} repo - Repository object
 * @param {Array} commits - Array of commits
 * @param {string} branch - Branch name
 */
function renderCommits(index, repo, commits, branch) {
    const container = document.getElementById(`commits-${index}`);

    // Create a map of commit hashes to tags for quick lookup
    const commitTagMap = {};
    repo.tags.forEach(tag => {
        if (!commitTagMap[tag.commit]) {
            commitTagMap[tag.commit] = [];
        }
        commitTagMap[tag.commit].push(tag.name);
    });

    const html = `
        <div class="commits-section">
            <div class="commits-header">
                <div class="commits-title">
                    📝 Showing ${commits.length} commits on <strong>${escapeHtml(branch)}</strong>
                </div>
            </div>
            <div class="commits-list">
                ${commits.map(commit => {
                    const tags = commitTagMap[commit.hash] || [];
                    return `
                    <div class="commit-item">
                        <div class="commit-header">
                            <span class="commit-hash">${escapeHtml(commit.shortHash)}</span>
                            <span class="commit-date">${escapeHtml(commit.date)}</span>
                        </div>
                        <div class="commit-subject">${escapeHtml(commit.subject)}</div>
                        ${tags.length > 0 ? `
                            <div class="commit-tags">
                                🏷️ ${tags.map(tag => `<span class="commit-tag">${escapeHtml(tag)}</span>`).join(' ')}
                            </div>
                        ` : ''}
                        <div class="commit-author">👤 ${escapeHtml(commit.author)} &lt;${escapeHtml(commit.email)}&gt;</div>
                        ${commit.body ? `<div class="commit-body">${escapeHtml(commit.body)}</div>` : ''}
                    </div>
                `}).join('')}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Show commits loading state
 * @param {number} index - Repository index
 */
function showCommitsLoading(index) {
    const container = document.getElementById(`commits-${index}`);
    container.innerHTML = `
        <div class="commits-section">
            <div class="commits-loading">⏳ Loading commits...</div>
        </div>
    `;
}

/**
 * Show commits error
 * @param {number} index - Repository index
 * @param {string} message - Error message
 */
function showCommitsError(index, message) {
    const container = document.getElementById(`commits-${index}`);
    container.innerHTML = `
        <div class="commits-section">
            <div class="commits-error">
                ❌ Error loading commits: ${escapeHtml(message)}
            </div>
        </div>
    `;
}

/**
 * Show no commits message
 * @param {number} index - Repository index
 * @param {string} branch - Branch name
 */
function showNoCommits(index, branch) {
    const container = document.getElementById(`commits-${index}`);
    container.innerHTML = `
        <div class="commits-section">
            <div class="commits-header">
                <div class="commits-title">
                    📝 Commits
                </div>
            </div>
            <div style="text-align: center; padding: 20px; color: #6c757d; font-size: 0.85rem;">
                No commits found on branch "${escapeHtml(branch)}"
            </div>
        </div>
    `;
}

/**
 * Open bulk tag modal
 */
function openBulkTagModal() {
    document.getElementById('bulkTagModal').style.display = 'block';

    // Load saved values from localStorage
    const savedInputs = loadBulkTagInputs();
    const branchInput = document.getElementById('branchSelectModal');
    const tagInput = document.getElementById('tagInput');

    branchInput.value = savedInputs.branch;
    // Tag will be filled by latest tag in app logic; keep existing value otherwise

    document.getElementById('branchCheckResults').style.display = 'none';
    document.getElementById('progressLog').style.display = 'none';
    document.getElementById('executeTagBtn').disabled = true;
}

/**
 * Close bulk tag modal
 */
function closeBulkTagModal() {
    document.getElementById('bulkTagModal').style.display = 'none';
}

/**
 * Render branch check results
 * @param {Object} results - Branch check results
 * @param {string} branchName - Branch name
 */
function renderBranchCheckResults(results, branchName) {
    const statusDiv = document.getElementById('branchStatus');
    const resultsDiv = document.getElementById('branchCheckResults');
    resultsDiv.style.display = 'block';

    const reposWithBranch = Object.values(results).filter(r => r.hasBranch);
    const reposWithoutBranch = Object.values(results).filter(r => !r.hasBranch);

    let html = '';

    if (reposWithBranch.length > 0) {
        html += `<div style="margin-bottom: 15px; font-weight: 600; color: #155724;">✓ Repositories with branch "${escapeHtml(branchName)}" (${reposWithBranch.length}):</div>`;
        reposWithBranch.forEach(r => {
            html += `<div class="branch-item has-branch">
                <span class="branch-icon">✓</span>
                <span class="branch-repo-name">${escapeHtml(r.name)}</span>
            </div>`;
        });
    }

    if (reposWithoutBranch.length > 0) {
        html += `<div style="margin: 15px 0; font-weight: 600; color: #721c24;">⚠ Repositories WITHOUT branch "${escapeHtml(branchName)}" (${reposWithoutBranch.length}):</div>`;
        reposWithoutBranch.forEach(r => {
            const errorMsg = r.error ? ` (${r.error})` : '';
            html += `<div class="branch-item no-branch">
                <span class="branch-icon">✗</span>
                <span class="branch-repo-name">${escapeHtml(r.name)}${errorMsg}</span>
            </div>`;
        });
    }

    statusDiv.innerHTML = html;
    return reposWithBranch.length > 0;
}

/**
 * Show branch checking state
 */
function showBranchChecking() {
    const statusDiv = document.getElementById('branchStatus');
    const resultsDiv = document.getElementById('branchCheckResults');
    resultsDiv.style.display = 'block';
    statusDiv.innerHTML = '<div class="branch-item checking"><span class="branch-icon">⏳</span><span>Checking branches...</span></div>';
}

/**
 * Render bulk tag progress
 * @param {Object} data - Results data
 */
function renderBulkTagProgress(data) {
    const progressLog = document.getElementById('progressLog');

    let logHtml = '<div class="progress-log-line info">Operation completed!</div>';
    let successCount = 0;
    let failCount = 0;

    data.results.forEach(result => {
        if (result.success) {
            successCount++;
            logHtml += `<div class="progress-log-line success">✓ ${result.repo}: ${result.message}</div>`;
        } else {
            failCount++;
            logHtml += `<div class="progress-log-line error">✗ ${result.repo}: ${result.error}</div>`;
        }
    });

    logHtml += `<div class="progress-log-line info">Summary: ${successCount} successful, ${failCount} failed</div>`;
    progressLog.innerHTML = logHtml;

    return successCount;
}

/**
 * Show bulk tag progress initialization
 */
function showBulkTagProgress() {
    const progressLog = document.getElementById('progressLog');
    progressLog.style.display = 'block';
    progressLog.innerHTML = '<div class="progress-log-line info">Starting bulk tagging operation...</div>';
}

/**
 * Show bulk tag error
 * @param {string} message - Error message
 */
function showBulkTagError(message) {
    const progressLog = document.getElementById('progressLog');
    progressLog.innerHTML += `<div class="progress-log-line error">Error: ${message}</div>`;
}
