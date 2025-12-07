/**
 * Main Application Module
 * Coordinates all application logic and event handlers
 */

// Application state
let allRepos = [];
let config = null;
let currentSortOrder = 'name-desc';
let branchCheckResults = {};
const repoCommitsState = {}; // Track which repos have commits displayed
const repoBranchesState = {}; // Cache branches per repository
let advancedSettings = loadAdvancedSettings();
const DEFAULT_COMMIT_LIMIT = 10;

function getDefaultCommitLimit() {
    const parsed = parseInt(advancedSettings.defaultCommitLimit);
    return Number.isNaN(parsed) ? DEFAULT_COMMIT_LIMIT : parsed;
}

/**
 * Initialize the application
 */
async function init() {
    // Setup event listeners
    setupEventListeners();

    // Sync advanced settings UI state
    hydrateAdvancedSettingsUI();

    // Load data
    await loadAndRefresh();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Main controls
    document.getElementById('refreshBtn').addEventListener('click', loadAndRefresh);
    document.getElementById('bulkTagBtn').addEventListener('click', handleBulkTagModalOpen);
    document.getElementById('searchBox').addEventListener('input', handleSearch);
    document.getElementById('sortOrder').addEventListener('change', handleSortChange);
    document.getElementById('advancedSettingsToggle').addEventListener('click', toggleAdvancedSettingsPanel);
    document.getElementById('autoFetchToggle').addEventListener('change', handleAutoFetchToggle);
    document.getElementById('defaultLimitInput').addEventListener('change', handleDefaultLimitChange);

    // Modal controls
    document.getElementById('closeBulkTagModalBtn').addEventListener('click', closeBulkTagModal);
    document.getElementById('cancelBulkTagBtn').addEventListener('click', closeBulkTagModal);
    document.getElementById('checkBranchesBtn').addEventListener('click', handleCheckBranches);
    document.getElementById('executeTagBtn').addEventListener('click', handleExecuteBulkTag);

    // Modal window click (close on outside click)
    window.addEventListener('click', (event) => {
        const modal = document.getElementById('bulkTagModal');
        if (event.target === modal) {
            closeBulkTagModal();
        }
    });

    // Bulk tag inputs (save to localStorage on change)
    document.getElementById('branchSelectModal').addEventListener('change', handleBulkTagInputChange);
    document.getElementById('refreshBulkBranchesBtn').addEventListener('click', handleRefreshBulkBranches);
    document.getElementById('tagInput').addEventListener('input', handleBulkTagTagChange);

    // Delegate events for dynamically created elements
    document.addEventListener('change', (event) => {
        // Branch select change
        if (event.target.id && event.target.id.startsWith('branch-select-')) {
            const index = parseInt(event.target.dataset.repoIndex);
            handleBranchSelectChange(index);
        }
    });

    document.addEventListener('click', (event) => {
        // Load commits button
        if (event.target.dataset.loadCommits !== undefined) {
            const index = parseInt(event.target.dataset.loadCommits);
            handleLoadCommits(index);
        }

        // Refresh branches button
        if (event.target.dataset.refreshBranches !== undefined) {
            const index = parseInt(event.target.dataset.refreshBranches);
            handleRefreshBranches(index);
        }
    });
}

/**
 * Load configuration and refresh all data
 */
async function loadAndRefresh() {
    try {
        showLoading();

        // Fetch config from backend
        config = await fetchConfig();

        if (!config.repositories || !Array.isArray(config.repositories)) {
            throw new Error('Invalid configuration: repositories array not found');
        }

        // Fetch all tags
        await fetchAllTags();

        // Reset cached state
        branchCheckResults = {};
        Object.keys(repoCommitsState).forEach(key => delete repoCommitsState[key]);
        Object.keys(repoBranchesState).forEach(key => delete repoBranchesState[key]);

        await fetchAllBranches();

        // Render UI
        renderReposWithState(allRepos);
        updateStats(allRepos);

        if (advancedSettings.autoFetchCommits) {
            await autoFetchCommitsForAll();
        }
    } catch (error) {
        showError('Error loading configuration: ' + error.message);
    }
}

/**
 * Fetch tags for all repositories
 */
async function fetchAllTags() {
    const promises = config.repositories.map(async (repo) => {
        const tags = await fetchRepoTags(repo, config);
        return {
            ...repo,
            tags: tags || []
        };
    });

    allRepos = await Promise.all(promises);
}

/**
 * Fetch branches for all repositories
 */
async function fetchAllBranches() {
    const promises = allRepos.map(async (repo) => {
        repoBranchesState[repo.repo] = { loading: true, branches: [], error: null };

        try {
            const data = await fetchRepoBranches(repo, config);
            const branchNames = (data.branches || []).map(b => b.name).filter(Boolean);
            repoBranchesState[repo.repo] = {
                loading: false,
                branches: branchNames,
                error: data.error || null
            };
        } catch (error) {
            repoBranchesState[repo.repo] = {
                loading: false,
                branches: [],
                error: error.message
            };
        }
    });

    await Promise.all(promises);
}

/**
 * Helper to render repos with the current shared state
 * @param {Array} reposToRender - list of repositories to render
 */
function renderReposWithState(reposToRender = allRepos) {
    renderRepos(reposToRender, currentSortOrder, repoBranchesState, advancedSettings, repoCommitsState);
}

/**
 * Handle search input
 */
function handleSearch() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();

    if (!searchTerm) {
        renderReposWithState(allRepos);
        return;
    }

    const filtered = allRepos.filter(repo => {
        const repoMatch = repo.repo.toLowerCase().includes(searchTerm);
        const nameMatch = (repo.name || '').toLowerCase().includes(searchTerm);
        const projectMatch = (repo.project || repo.repo).toLowerCase().includes(searchTerm);
        const tagsMatch = repo.tags.some(tag =>
            tag.name.toLowerCase().includes(searchTerm) ||
            tag.commit.toLowerCase().includes(searchTerm) ||
            tag.shortCommit.toLowerCase().includes(searchTerm)
        );

        return repoMatch || nameMatch || projectMatch || tagsMatch;
    });

    renderReposWithState(filtered);
}

/**
 * Handle sort order change
 */
function handleSortChange(event) {
    currentSortOrder = event.target.value;
    handleSearch(); // Re-render with current search filter
}

/**
 * Handle branch select change
 */
function handleBranchSelectChange(index) {
    const repo = allRepos[index];
    const branchSelect = document.getElementById(`branch-select-${index}`);

    if (!repo || !branchSelect) return;

    const selectedValue = branchSelect.value;

    if (selectedValue) {
        saveBranchSelection(repo.repo, selectedValue);
    }
}

/**
 * Handle load commits button click
 */
async function handleLoadCommits(index) {
    const limitSelect = document.getElementById(`limit-select-${index}`);
    const branchSelect = document.getElementById(`branch-select-${index}`);

    if (!branchSelect || !limitSelect) {
        return;
    }

    const repo = allRepos[index];

    if (!repo) {
        return;
    }

    const branch = branchSelect.value || loadBranchSelection(repo.repo) || 'dev';
    branchSelect.value = branch;
    const limit = parseInt(limitSelect.value) || getDefaultCommitLimit();

    saveBranchSelection(repo.repo, branch);

    showCommitsLoading(index);

    try {
        const commits = await fetchRepoCommits(repo, limit, branch);

        // Use branch from response or fallback to the requested branch
        const branchName = commits.branch || branch;

        if (commits.commits.length === 0) {
            showNoCommits(index, branchName);
            repoCommitsState[index] = { loaded: true, commits: [], branch: branchName };
            return;
        }

        repoCommitsState[index] = { loaded: true, commits: commits.commits, branch: branchName };
        renderCommits(index, repo, commits.commits, branchName);
    } catch (error) {
        showCommitsError(index, error.message);
        delete repoCommitsState[index];
    }
}

/**
 * Handle manual refresh of branches for a repo
 */
async function handleRefreshBranches(index) {
    const repo = allRepos[index];
    if (!repo) return;

    const refreshBtn = document.querySelector(`[data-refresh-branches="${index}"]`);
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
    }

    repoBranchesState[repo.repo] = { ...(repoBranchesState[repo.repo] || {}), loading: true, error: null };
    applyBranchesToSelect(index);

    await fetchBranchesForRepo(repo, { force: true });
    applyBranchesToSelect(index);

    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh Branches';
    }
}

/**
 * Fetch branches for a single repo with optional force refresh
 */
async function fetchBranchesForRepo(repo, options = {}) {
    const cache = repoBranchesState[repo.repo] || {};

    if (!options.force && cache.branches && cache.branches.length) {
        return cache.branches;
    }

    repoBranchesState[repo.repo] = { ...cache, loading: true, error: null };

    try {
        const data = await fetchRepoBranches(repo, config);
        const branchNames = (data.branches || []).map(b => b.name).filter(Boolean);
        repoBranchesState[repo.repo] = {
            loading: false,
            branches: branchNames,
            error: data.error || null
        };
        return branchNames;
    } catch (error) {
        repoBranchesState[repo.repo] = {
            loading: false,
            branches: cache.branches || [],
            error: error.message
        };
        return cache.branches || [];
    }
}

/**
 * Apply cached branches into the branch dropdown for a specific repo card
 */
function applyBranchesToSelect(index) {
    const repo = allRepos[index];
    if (!repo) return;

    const select = document.getElementById(`branch-select-${index}`);
    const status = document.getElementById(`branch-status-${index}`);
    const state = repoBranchesState[repo.repo] || {};

    if (!select) return;

    const branches = (state.branches && state.branches.length) ? Array.from(new Set(state.branches)) : ['main', 'dev', 'master'];
    const savedBranch = loadBranchSelection(repo.repo);

    if (savedBranch && !branches.includes(savedBranch)) {
        branches.unshift(savedBranch);
    }

    select.innerHTML = branches.map(branch => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join('');

    if (branches.includes(savedBranch)) {
        select.value = savedBranch;
    } else if (branches.length > 0) {
        select.value = branches[0];
        saveBranchSelection(repo.repo, branches[0]);
    }

    if (status) {
        const label = state.loading
            ? 'Loading branches...'
            : state.error
                ? 'Branches unavailable'
                : `Branches (${branches.length})`;

        status.textContent = label;
        status.classList.toggle('loading', !!state.loading);
        status.classList.toggle('error', !!state.error);
        status.classList.toggle('ok', !state.loading && !state.error);
    }
}

/**
 * Auto-fetch commits for all repositories based on advanced settings
 */
async function autoFetchCommitsForAll() {
    for (let i = 0; i < allRepos.length; i++) {
        const limitSelect = document.getElementById(`limit-select-${i}`);
        if (limitSelect) {
            const defaultLimit = getDefaultCommitLimit();
            ensureLimitOption(limitSelect, defaultLimit);
            limitSelect.value = defaultLimit.toString();
        }

        await handleLoadCommits(i);
    }
}

/**
 * Ensure a select element includes a specific numeric option
 */
function ensureLimitOption(select, value) {
    if (!select || !value) return;
    const exists = Array.from(select.options).some(opt => parseInt(opt.value) === value);
    if (!exists) {
        const option = document.createElement('option');
        option.value = value.toString();
        option.textContent = value.toString();
        select.prepend(option);
    }
}

/**
 * Toggle advanced settings panel visibility
 */
function toggleAdvancedSettingsPanel() {
    const panel = document.getElementById('advancedSettingsPanel');
    const toggleBtn = document.getElementById('advancedSettingsToggle');
    if (!panel || !toggleBtn) return;
    const isHidden = panel.classList.contains('hidden');

    panel.classList.toggle('hidden', !isHidden);
    panel.setAttribute('aria-hidden', (!isHidden).toString());
    toggleBtn.setAttribute('aria-expanded', isHidden.toString());
    toggleBtn.classList.toggle('active', isHidden);
}

/**
 * Sync UI controls with saved advanced settings
 */
function hydrateAdvancedSettingsUI() {
    const autoFetchCheckbox = document.getElementById('autoFetchToggle');
    const defaultLimitInput = document.getElementById('defaultLimitInput');

    if (autoFetchCheckbox) {
        autoFetchCheckbox.checked = !!advancedSettings.autoFetchCommits;
    }

    if (defaultLimitInput) {
        defaultLimitInput.value = getDefaultCommitLimit();
    }
}

/**
 * Handle toggling auto-fetch commits setting
 */
function handleAutoFetchToggle(event) {
    advancedSettings = {
        ...advancedSettings,
        autoFetchCommits: event.target.checked
    };
    saveAdvancedSettings(advancedSettings);
}

/**
 * Handle default limit change
 */
function handleDefaultLimitChange(event) {
    const newValue = parseInt(event.target.value);

    if (Number.isNaN(newValue) || newValue <= 0) {
        event.target.value = getDefaultCommitLimit();
        return;
    }

    advancedSettings = {
        ...advancedSettings,
        defaultCommitLimit: newValue
    };

    saveAdvancedSettings(advancedSettings);
    applyDefaultLimitToSelects(newValue);
}

/**
 * Push updated default limit value into all existing limit selects
 */
function applyDefaultLimitToSelects(limitValue) {
    document.querySelectorAll('[id^="limit-select-"]').forEach(select => {
        ensureLimitOption(select, limitValue);
        select.value = limitValue.toString();
    });
}

/**
 * Handle bulk tag modal open
 */
function handleBulkTagModalOpen() {
    if (!config || !allRepos.length) {
        alert('Please load configuration first');
        return;
    }

    openBulkTagModal();
    branchCheckResults = {};

    populateBulkBranchSelect();
    prefillTagInputWithLatest();

    // Reset execute button state
    const executeBtn = document.getElementById('executeTagBtn');
    executeBtn.textContent = 'Execute Tagging';
    executeBtn.classList.remove('secondary');
    executeBtn.classList.add('primary');
    executeBtn.disabled = true;
}

/**
 * Handle bulk tag input changes
 */
function handleBulkTagInputChange() {
    const branchInput = document.getElementById('branchSelectModal');
    saveBulkTagInputs(branchInput.value);
}

function handleBulkTagTagChange() {
    // Tag is not cached by request, so we do not persist it.
}

/**
 * Populate bulk tagging branch select from all known branches
 */
function populateBulkBranchSelect() {
    const select = document.getElementById('branchSelectModal');
    if (!select) return;

    const options = getAggregatedBranchOptions();
    const saved = loadBulkTagInputs().branch;
    const selected = saved && options.includes(saved) ? saved : options[0] || '';

    select.innerHTML = options.map(branch => `<option value="${escapeHtml(branch)}">${escapeHtml(branch)}</option>`).join('');
    select.value = selected;

    saveBulkTagInputs(selected);
}

/**
 * Collect unique branch names across repos from cache
 */
function getAggregatedBranchOptions() {
    const defaults = ['main', 'dev', 'master'];
    const branchSet = new Set();

    Object.values(repoBranchesState).forEach(state => {
        (state.branches || []).forEach(name => {
            if (name) branchSet.add(name);
        });
    });

    if (branchSet.size === 0) {
        defaults.forEach(d => branchSet.add(d));
    }

    return Array.from(branchSet);
}

/**
 * Prefill tag input with latest tag name (non-cached)
 */
function prefillTagInputWithLatest() {
    const tagInput = document.getElementById('tagInput');
    if (!tagInput) return;

    const latestTag = computeLatestTagName();
    if (latestTag) {
        tagInput.value = latestTag;
    }
}

/**
 * Estimate latest tag using semantic version ordering when possible
 */
function computeLatestTagName() {
    const tagNames = allRepos.flatMap(repo => (repo.tags || []).map(t => t.name)).filter(Boolean);
    if (!tagNames.length) return '';

    const semverTags = tagNames.map(name => ({ name, parts: parseSemver(name) })).filter(t => t.parts);

    if (semverTags.length) {
        semverTags.sort((a, b) => compareSemver(b.parts, a.parts));
        return semverTags[0].name;
    }

    // Fallback: last tag alphabetically
    return tagNames.sort().pop();
}

function parseSemver(name) {
    const match = name.match(/^v?(\d+)\.(\d+)\.(\d+)/i);
    if (!match) return null;
    return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function compareSemver(a, b) {
    for (let i = 0; i < 3; i++) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Refresh branch options for bulk modal
 */
async function handleRefreshBulkBranches() {
    const btn = document.getElementById('refreshBulkBranchesBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Refreshing...';
    }

    await fetchAllBranches();
    renderReposWithState(allRepos);
    populateBulkBranchSelect();

    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Refresh Branches';
    }
}

/**
 * Handle check branches button click
 */
async function handleCheckBranches() {
    const branchName = document.getElementById('branchSelectModal').value.trim();
    const tagName = document.getElementById('tagInput').value.trim();

    if (!branchName || !tagName) {
        alert('Please enter both branch name and tag name');
        return;
    }

    showBranchChecking();
    branchCheckResults = {};

    const promises = allRepos.map(async (repo) => {
        try {
            const data = await fetchRepoBranches(repo, config);

            const hasBranch = data.branches && data.branches.some(b => b.name === branchName);

            branchCheckResults[repo.repo] = {
                name: repo.name || repo.repo,
                repo: repo.repo,
                project: repo.project || repo.repo,
                hasBranch: hasBranch,
                baseUrl: repo.baseUrl || config.baseUrl,
                error: data.error
            };
        } catch (error) {
            branchCheckResults[repo.repo] = {
                name: repo.name || repo.repo,
                repo: repo.repo,
                project: repo.project || repo.repo,
                hasBranch: false,
                baseUrl: repo.baseUrl || config.baseUrl,
                error: error.message
            };
        }
    });

    await Promise.all(promises);

    // Display results and enable execute button if applicable
    const hasReposWithBranch = renderBranchCheckResults(branchCheckResults, branchName);
    document.getElementById('executeTagBtn').disabled = !hasReposWithBranch;
}

/**
 * Handle execute bulk tag button click
 */
async function handleExecuteBulkTag() {
    const executeBtn = document.getElementById('executeTagBtn');

    // Check if button is now a close button (after successful tagging)
    if (executeBtn.textContent.includes('Close')) {
        closeBulkTagModal();
        return;
    }

    const branchName = document.getElementById('branchSelectModal').value.trim();
    const tagName = document.getElementById('tagInput').value.trim();

    const reposToTag = Object.values(branchCheckResults)
        .filter(r => r.hasBranch)
        .map(r => ({
            repo: r.repo,
            project: r.project,
            baseUrl: r.baseUrl
        }));

    if (reposToTag.length === 0) {
        alert('No repositories with the specified branch');
        return;
    }

    // Disable inputs and show progress
    executeBtn.disabled = true;
    document.getElementById('branchInput').disabled = true;
    document.getElementById('tagInput').disabled = true;

    showBulkTagProgress();

    try {
        const data = await executeBulkTagOperation(branchName, tagName, reposToTag);

        // Display results
        const successCount = renderBulkTagProgress(data);

        // Change button to "Close Modal" after successful operation
        if (successCount > 0) {
            executeBtn.textContent = 'Close Modal';
            executeBtn.disabled = false;
            executeBtn.classList.remove('primary');
            executeBtn.classList.add('secondary');

            // Refresh tags after bulk operation
            setTimeout(() => {
                loadAndRefresh();
            }, 2000);
        } else {
            // Re-enable button if no success
            executeBtn.disabled = false;
        }

    } catch (error) {
        showBulkTagError(error.message);
        executeBtn.disabled = false;
    } finally {
        // Re-enable inputs
        document.getElementById('branchInput').disabled = false;
        document.getElementById('tagInput').disabled = false;
    }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', init);
