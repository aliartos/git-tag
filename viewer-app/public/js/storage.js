/**
 * LocalStorage Management Module
 * Handles saving and loading user preferences
 */

// LocalStorage keys
const STORAGE_KEYS = {
    BRANCH_SELECTIONS: 'gitTag.branchSelections',
    BULK_TAG_BRANCH: 'gitTag.bulkTagBranch',
    ADVANCED_SETTINGS: 'gitTag.advancedSettings'
};

const DEFAULT_ADVANCED_SETTINGS = {
    autoFetchCommits: false,
    defaultCommitLimit: 10
};

/**
 * Safely save data to localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified)
 */
function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}

/**
 * Safely load data from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Parsed value or default
 */
function loadFromLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn('Failed to load from localStorage:', e);
        return defaultValue;
    }
}

/**
 * Save branch selection for a specific repository
 * @param {string} repoName - Repository name
 * @param {string} branch - Branch name
 */
function saveBranchSelection(repoName, branch) {
    const selections = loadFromLocalStorage(STORAGE_KEYS.BRANCH_SELECTIONS, {});
    selections[repoName] = branch;
    saveToLocalStorage(STORAGE_KEYS.BRANCH_SELECTIONS, selections);
}

/**
 * Load branch selection for a specific repository
 * @param {string} repoName - Repository name
 * @returns {string} Branch name (defaults to 'dev')
 */
function loadBranchSelection(repoName) {
    const selections = loadFromLocalStorage(STORAGE_KEYS.BRANCH_SELECTIONS, {});
    return selections[repoName] || 'dev';
}

/**
 * Save bulk tag modal inputs
 * @param {string} branchName - Branch name
 * @param {string} tagName - Tag name
 */
function saveBulkTagInputs(branchName) {
    saveToLocalStorage(STORAGE_KEYS.BULK_TAG_BRANCH, branchName);
}

/**
 * Load bulk tag modal inputs
 * @returns {{branch: string, tag: string}} Saved branch and tag names
 */
function loadBulkTagInputs() {
    return {
        branch: loadFromLocalStorage(STORAGE_KEYS.BULK_TAG_BRANCH, ''),
        tag: ''
    };
}

/**
 * Save advanced settings
 * @param {{autoFetchCommits: boolean, defaultCommitLimit: number}} settings - Advanced settings values
 */
function saveAdvancedSettings(settings) {
    const mergedSettings = {
        ...DEFAULT_ADVANCED_SETTINGS,
        ...settings
    };
    saveToLocalStorage(STORAGE_KEYS.ADVANCED_SETTINGS, mergedSettings);
}

/**
 * Load advanced settings with defaults
 * @returns {{autoFetchCommits: boolean, defaultCommitLimit: number}}
 */
function loadAdvancedSettings() {
    const settings = loadFromLocalStorage(STORAGE_KEYS.ADVANCED_SETTINGS, DEFAULT_ADVANCED_SETTINGS);
    return {
        ...DEFAULT_ADVANCED_SETTINGS,
        ...settings
    };
}
