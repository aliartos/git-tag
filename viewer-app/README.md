# Modular Web Viewer

## Overview

The viewer application helps quickly visualize and manage tags across multiple repositories, supporting bulk tagging operations.



```
viewer-app/
├── public/
│   ├── index.html          # Main HTML structure
│   ├── styles.css          # All CSS styles
│   └── js/
│       ├── storage.js      # LocalStorage management
│       ├── api.js          # Backend API communication
│       ├── ui.js           # UI rendering functions
│       └── app.js          # Main application logic
```

## File Descriptions

### `index.html`
The main HTML structure containing:
- Semantic HTML markup
- Repository grid container
- Statistics display
- Bulk tagging modal
- Script includes for all JavaScript modules

**Key Features:**
- Clean semantic structure
- No inline JavaScript
- Proper separation of concerns

### `styles.css`
Complete CSS styling including:
- Global reset and typography
- Layout (grid, flexbox)
- Component styles (cards, modals, buttons)
- Responsive design (mobile-friendly)
- Animations and transitions
- State-based styling

**Organization:**
- Logical grouping by component
- Clear section comments
- Consistent naming conventions
- Media queries for responsiveness

### JavaScript Modules

#### `storage.js` - LocalStorage Management
Handles all browser storage operations:
- `saveToLocalStorage()` - Safe storage with error handling
- `loadFromLocalStorage()` - Safe retrieval with fallbacks
- `saveBranchSelection()` - Store branch preferences per repository
- `loadBranchSelection()` - Retrieve saved branch preferences
- `saveBulkTagInputs()` - Store bulk tag form data
- `loadBulkTagInputs()` - Retrieve bulk tag form data

**Features:**
- Error handling for storage failures
- Graceful degradation (private browsing mode)
- Per-repository preferences

#### `api.js` - Backend Communication
Manages all API calls:
- `fetchConfig()` - Load configuration from server
- `fetchRepoTags()` - Get tags for a repository
- `fetchRepoCommits()` - Get commit history
- `fetchRepoBranches()` - Get available branches
- `executeBulkTagOperation()` - Perform bulk tagging

**Features:**
- Async/await pattern
- Error handling
- Query parameter construction
- Response parsing

#### `ui.js` - User Interface Rendering
Handles all DOM manipulation and rendering:
- `renderRepos()` - Display repository grid
- `renderCommits()` - Display commit history
- `updateStats()` - Update statistics display
- `showLoading()`, `showError()` - State management
- `openBulkTagModal()`, `closeBulkTagModal()` - Modal controls
- `escapeHtml()` - XSS protection

**Features:**
- Template-based rendering
- State management
- XSS protection
- Loading/error states

#### `app.js` - Main Application Logic
Coordinates all functionality:
- Application initialization
- Event listener setup
- Data fetching and coordination
- User interaction handlers
- State management

**Key Functions:**
- `init()` - Initialize app on page load
- `setupEventListeners()` - Wire up all event handlers
- `loadAndRefresh()` - Fetch and display data
- `handleSearch()` - Filter repositories
- `handleLoadCommits()` - Load commit history
- `handleExecuteBulkTag()` - Execute bulk tagging

## Benefits of Modular Structure

### Maintainability
- **Single Responsibility**: Each file has a clear, focused purpose
- **Easy Navigation**: Find code quickly by module
- **Independent Testing**: Test modules in isolation
- **Version Control**: Better git diffs and merge conflict resolution

### Scalability
- **Add Features**: Easy to add new modules without cluttering existing code
- **Team Development**: Multiple developers can work on different modules
- **Code Reuse**: Modules can be reused in other projects

### Performance
- **Browser Caching**: CSS and JS files cached separately
- **Minification**: Can minify files independently
- **Lazy Loading**: Future support for loading modules on demand

### Development Experience
- **Better IDE Support**: Autocomplete and syntax highlighting
- **Debugging**: Easier to debug with separated concerns
- **Documentation**: Each module can have focused documentation

## Loading Order

The scripts are loaded in dependency order:
1. `storage.js` - No dependencies
2. `api.js` - No dependencies
3. `ui.js` - Depends on storage.js
4. `app.js` - Depends on all other modules

## Migration from Legacy viewer.html

The original `viewer.html` file is preserved for backward compatibility. The new modular structure provides:
- Same functionality
- Better maintainability
- localStorage persistence (new feature)
- Cleaner code organization

### Accessing the Application

**New Modular Version:**
```
http://localhost:8000/
http://localhost:8000/index.html
```

**Legacy Version:**
```
http://localhost:8000/viewer.html
```

## Development Guidelines

### Adding New Features

1. **Storage Feature**: Add to `storage.js`
2. **API Endpoint**: Add to `api.js`
3. **UI Component**: Add to `ui.js`
4. **Application Logic**: Add to `app.js`

### Event Handlers

Use event delegation for dynamic content:
```javascript
document.addEventListener('click', (event) => {
    if (event.target.dataset.action === 'myAction') {
        handleMyAction(event.target);
    }
});
```

### State Management

Store application state in `app.js`:
```javascript
let allRepos = [];
let config = null;
let currentSortOrder = 'name-desc';
```

### Error Handling

Always include try-catch blocks for async operations:
```javascript
try {
    const data = await fetchSomething();
    // process data
} catch (error) {
    showError(error.message);
}
```

## Future Enhancements

Potential improvements for the modular structure:
- [ ] Add TypeScript for type safety
- [ ] Implement a module bundler (webpack, rollup)
- [ ] Add unit tests for each module
- [ ] Implement a state management library (Redux, MobX)
- [ ] Add CSS preprocessor (SASS, LESS)
- [ ] Implement component-based architecture (Web Components)
- [ ] Add build process for minification/optimization

## Browser Compatibility

The application uses modern JavaScript features:
- ES6+ syntax (arrow functions, async/await)
- fetch API
- localStorage API
- template literals

**Supported Browsers:**
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Contributing

When contributing to the codebase:
1. Follow the existing code style
2. Update relevant module(s)
3. Test changes thoroughly
4. Update this README if adding new features
5. Ensure backward compatibility with legacy viewer.html

## Troubleshooting

### JavaScript Not Loading
- Check browser console for errors
- Verify file paths in index.html
- Ensure server is serving files from correct directory

### LocalStorage Not Working
- Check browser privacy settings
- Verify localStorage is enabled
- Check console for storage errors

### API Calls Failing
- Verify server is running
- Check network tab in browser dev tools
- Ensure config.json5 is properly formatted

