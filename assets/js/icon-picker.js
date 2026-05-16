/**
 * Icon picker widget — debounced search from /api/icons/search
 * with inline dropdown and custom URL fallback.
 *
 * Exports: initIconPicker(inputEl, previewEl)
 */

import { escapeHtml } from './api.js';

let activePicker = null;

/**
 * Initialize the icon picker on a text input and its preview image.
 *
 * Wraps the input in a `.icon-picker` container, appends a dropdown
 * element, and wires up all interaction handlers.
 *
 * @param {HTMLInputElement} inputEl
 * @param {HTMLImageElement} previewEl
 */
export function initIconPicker(inputEl, previewEl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'icon-picker';

  // Move input into wrapper
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  // Dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'icon-picker__dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('aria-label', 'Icon search results');
  dropdown.hidden = true;
  wrapper.appendChild(dropdown);

  // State
  let results = [];
  let selectedIndex = -1;
  let debounceTimer = null;
  let abortController = null;

  /**
   * Render dropdown items from results array.
   */
  function renderDropdown() {
    dropdown.innerHTML = '';

    if (results.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'icon-picker__empty';
      noResults.textContent = t('icon.search.noResults');
      dropdown.appendChild(noResults);
      return;
    }

    results.forEach((entry, i) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'icon-picker__item';
      if (i === selectedIndex) {
        item.classList.add('icon-picker__item--active');
      }
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(i === selectedIndex));

      const img = document.createElement('img');
      img.className = 'icon-picker__item-preview';
      img.src = entry.u;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function () {
        this.style.display = 'none';
      };

      const nameSpan = document.createElement('span');
      nameSpan.className = 'icon-picker__item-name';
      nameSpan.textContent = entry.n;

      const sourceSpan = document.createElement('span');
      sourceSpan.className = 'icon-picker__item-source';
      sourceSpan.textContent = entry.s;

      item.appendChild(img);
      item.appendChild(nameSpan);
      item.appendChild(sourceSpan);

      item.addEventListener('click', () => selectEntry(entry));
      item.addEventListener('mousedown', (e) => e.preventDefault()); // prevent input blur
      dropdown.appendChild(item);
    });

    // Custom URL option (shown when input starts with http)
    const inputVal = inputEl.value.trim();
    if (inputVal && /^https?:\/\//i.test(inputVal)) {
      const customItem = document.createElement('button');
      customItem.type = 'button';
      customItem.className = 'icon-picker__item icon-picker__custom-url';
      customItem.setAttribute('role', 'option');

      const customText = document.createElement('span');
      customText.className = 'icon-picker__item-name';
      customText.style.fontStyle = 'italic';
      customText.textContent = t('icon.search.customUrl') + ': ' + inputVal;

      customItem.appendChild(customText);
      customItem.addEventListener('click', () => {
        selectCustomUrl(inputVal);
      });
      customItem.addEventListener('mousedown', (e) => e.preventDefault());
      dropdown.appendChild(customItem);
    }
  }

  /**
   * Select an icon entry from the dropdown.
   */
  function selectEntry(entry) {
    inputEl.value = entry.u;
    updatePreview();
    closeDropdown();
    inputEl.focus();
  }

  /**
   * Accept a custom URL typed by the user.
   */
  function selectCustomUrl(url) {
    inputEl.value = url;
    updatePreview();
    closeDropdown();
    inputEl.focus();
  }

  /**
   * Update the preview image with the current input value.
   */
  function updatePreview() {
    const val = inputEl.value.trim();
    if (val && /^https?:\/\//i.test(val)) {
      previewEl.src = val;
      previewEl.classList.add('icon-preview--visible');
    } else if (val) {
      // Could be a slug — try SimpleIcons CDN as preview
      previewEl.src = `https://cdn.simpleicons.org/${encodeURIComponent(val)}`;
      previewEl.classList.add('icon-preview--visible');
    } else {
      previewEl.src = '';
      previewEl.classList.remove('icon-preview--visible');
    }
  }

  /**
   * Fetch icon search results from the API.
   */
  async function fetchIcons(query) {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    try {
      const resp = await fetch(
        `/api/icons/search?q=${encodeURIComponent(query)}`,
        { signal: abortController.signal }
      );
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Icon search failed:', err);
      }
      return [];
    }
  }

  /**
   * Open the dropdown and trigger a search.
   */
  function openDropdown() {
    if (activePicker && activePicker !== wrapper) {
      activePicker.querySelector('.icon-picker__dropdown').hidden = true;
    }
    activePicker = wrapper;

    const query = inputEl.value.trim();
    if (query && !/^https?:\/\//i.test(query)) {
      // Show loading state
      dropdown.innerHTML = `<div class="icon-picker__loading">${escapeHtml(t('icon.search.loading'))}</div>`;
    }

    dropdown.hidden = false;
    selectedIndex = -1;

    if (query && !/^https?:\/\//i.test(query)) {
      doSearch(query);
    } else if (query && /^https?:\/\//i.test(query)) {
      // Just show custom URL option
      results = [];
      renderDropdown();
    } else {
      results = [];
      dropdown.innerHTML = '';
      dropdown.hidden = true;
    }
  }

  async function doSearch(query) {
    results = await fetchIcons(query);
    renderDropdown();
  }

  function closeDropdown() {
    dropdown.hidden = true;
    results = [];
    selectedIndex = -1;
    if (activePicker === wrapper) {
      activePicker = null;
    }
  }

  // --- Event Listeners ---

  inputEl.addEventListener('input', () => {
    updatePreview();

    const val = inputEl.value.trim();
    if (!val || /^https?:\/\//i.test(val)) {
      // For URLs, skip API search
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (!dropdown.hidden) {
        openDropdown(); // re-render with custom URL option
      }
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      openDropdown();
    }, 150);
  });

  inputEl.addEventListener('focus', () => {
    const val = inputEl.value.trim();
    if (val) {
      openDropdown();
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    if (dropdown.hidden) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, results.length - 1);
        renderDropdown();
        scrollToSelected();
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderDropdown();
        scrollToSelected();
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          selectEntry(results[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown();
        break;
    }
  });

  function scrollToSelected() {
    const active = dropdown.querySelector('.icon-picker__item--active');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  // Click outside closes
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      closeDropdown();
    }
  });

  // Initial preview
  updatePreview();
}

/**
 * Simple translation lookup (mirrors app.js t() but avoids circular deps).
 */
function t(key) {
  // Look for a global `t` function set by app.js
  if (typeof window.__t === 'function') {
    return window.__t(key);
  }
  return key;
}
