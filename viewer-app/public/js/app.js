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

/**
 * Initialize the application
 */
async function init() {
    // Setup event listeners
    setupEventListeners();

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
    document.getElementById('branchInput').addEventListener('input', handleBulkTagInputChange);
    document.getElementById('tagInput').addEventListener('input', handleBulkTagInputChange);

    // Delegate events for dynamically created elements
    document.addEventListener('change', (event) => {
        // Branch select change
        if (event.target.id && event.target.id.startsWith('branch-select-')) {
            const index = parseInt(event.target.dataset.repoIndex);
            handleBranchSelectChange(index);
        }

        // Custom branch input change
        if (event.target.id && event.target.id.startsWith('branch-custom-input-')) {
            const index = parseInt(event.target.dataset.repoIndex);
            handleCustomBranchChange(index);
        }
    });

    document.addEventListener('click', (event) => {
        // Load commits button
        if (event.target.dataset.loadCommits !== undefined) {
            const index = parseInt(event.target.dataset.loadCommits);
            handleLoadCommits(index);
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

        // Render UI
        renderRepos(allRepos, currentSortOrder);
        updateStats(allRepos);
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
 * Handle search input
 */
function handleSearch() {
    const searchTerm = document.getElementById('searchBox').value.toLowerCase();

    if (!searchTerm) {
        renderRepos(allRepos, currentSortOrder);
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

    renderRepos(filtered, currentSortOrder);
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
    const selectedValue = branchSelect.value;

    if (selectedValue !== 'custom') {
        saveBranchSelection(repo.repo, selectedValue);
    }
}

/**
 * Handle custom branch input change
 */
function handleCustomBranchChange(index) {
    const repo = allRepos[index];
    const branchSelect = document.getElementById(`branch-select-${index}`);
    const branchCustom = document.getElementById(`branch-custom-input-${index}`);

    if (branchSelect.value === 'custom' && branchCustom.value.trim()) {
        saveBranchSelection(repo.repo, branchCustom.value.trim());
    }
}

/**
 * Handle load commits button click
 */
async function handleLoadCommits(index) {
    const branchSelect = document.getElementById(`branch-select-${index}`);
    const branchCustom = document.getElementById(`branch-custom-input-${index}`);
    const limitSelect = document.getElementById(`limit-select-${index}`);

    let branch;
    if (branchSelect.value === 'custom') {
        branch = branchCustom.value.trim();
        if (!branch) {
            alert('Please enter a custom branch name');
            return;
        }
        saveBranchSelection(allRepos[index].repo, branch);
    } else {
        branch = branchSelect.value;
        saveBranchSelection(allRepos[index].repo, branch);
    }

    const limit = parseInt(limitSelect.value);
    const repo = allRepos[index];

    showCommitsLoading(index);

    try {
        const commits = await fetchRepoCommits(repo, limit, branch);

        if (commits.commits.length === 0) {
            showNoCommits(index, commits.branch);
            repoCommitsState[index] = { loaded: true, commits: [] };
            return;
        }

        repoCommitsState[index] = { loaded: true, commits: commits.commits, branch: commits.branch };
        renderCommits(index, repo, commits.commits, commits.branch);
    } catch (error) {
        showCommitsError(index, error.message);
        delete repoCommitsState[index];
    }
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
}

/**
 * Handle bulk tag input changes
 */
function handleBulkTagInputChange() {
    const branchInput = document.getElementById('branchInput');
    const tagInput = document.getElementById('tagInput');
    saveBulkTagInputs(branchInput.value, tagInput.value);
}

/**
 * Handle check branches button click
 */
async function handleCheckBranches() {
    const branchName = document.getElementById('branchInput').value.trim();
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
    const branchName = document.getElementById('branchInput').value.trim();
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

    const confirmMsg = `This will create tag "${tagName}" on branch "${branchName}" for ${reposToTag.length} repositories. Continue?`;
    if (!confirm(confirmMsg)) {
        return;
    }

    // Disable inputs and show progress
    document.getElementById('executeTagBtn').disabled = true;
    document.getElementById('branchInput').disabled = true;
    document.getElementById('tagInput').disabled = true;

    showBulkTagProgress();

    try {
        const data = await executeBulkTagOperation(branchName, tagName, reposToTag);

        // Display results
        const successCount = renderBulkTagProgress(data);

        // Refresh tags after bulk operation
        if (successCount > 0) {
            setTimeout(() => {
                loadAndRefresh();
            }, 2000);
        }

    } catch (error) {
        showBulkTagError(error.message);
    } finally {
        // Re-enable inputs
        document.getElementById('branchInput').disabled = false;
        document.getElementById('tagInput').disabled = false;
    }
}

// Initialize app when DOM is ready
window.addEventListener('DOMContentLoaded', init);

