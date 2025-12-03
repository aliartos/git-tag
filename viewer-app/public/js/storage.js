/**
 * LocalStorage Management Module
 * Handles saving and loading user preferences
 */

// LocalStorage keys
const STORAGE_KEYS = {
    BRANCH_SELECTIONS: 'gitTag.branchSelections',
    BULK_TAG_BRANCH: 'gitTag.bulkTagBranch',
    BULK_TAG_NAME: 'gitTag.bulkTagName'
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
function saveBulkTagInputs(branchName, tagName) {
    saveToLocalStorage(STORAGE_KEYS.BULK_TAG_BRANCH, branchName);
    saveToLocalStorage(STORAGE_KEYS.BULK_TAG_NAME, tagName);
}

/**
 * Load bulk tag modal inputs
 * @returns {{branch: string, tag: string}} Saved branch and tag names
 */
function loadBulkTagInputs() {
    return {
        branch: loadFromLocalStorage(STORAGE_KEYS.BULK_TAG_BRANCH, ''),
        tag: loadFromLocalStorage(STORAGE_KEYS.BULK_TAG_NAME, '')
    };
}

