import { reorderServices, isEditing } from './state.js';
import { renderGrid } from './grid.js';
import { renderEditMode } from './edit.js';

/** @type {HTMLElement|null} The service grid container. */
let gridEl = null;

/** @type {number|null} Index of the tile currently being dragged. */
let dragSourceIndex = null;

/**
 * Initialises HTML5 drag-and-drop reordering on the service grid.
 * Uses event delegation on the grid container to survive `renderGrid()` cycles.
 */
export function initDrag() {
  gridEl = document.querySelector('[data-testid="service-grid"]');
  if (!gridEl) return;

  gridEl.addEventListener('dragstart', handleDragStart);
  gridEl.addEventListener('dragover', handleDragOver);
  gridEl.addEventListener('drop', handleDrop);
  gridEl.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
  if (!isEditing()) return;

  const tile = e.target.closest('.tile');
  if (!tile) return;

  dragSourceIndex = parseInt(tile.dataset.index, 10);
  if (Number.isNaN(dragSourceIndex)) return;

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tile.dataset.index);
  tile.classList.add('dragging');
}

function handleDragOver(e) {
  if (!isEditing()) return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const targetTile = e.target.closest('.tile');

  gridEl.querySelectorAll('.tile').forEach(t => t.classList.remove('drag-over'));

  if (targetTile) {
    const targetIndex = parseInt(targetTile.dataset.index, 10);
    if (!Number.isNaN(targetIndex) && targetIndex !== dragSourceIndex) {
      targetTile.classList.add('drag-over');
    }
  }
}

function handleDrop(e) {
  if (!isEditing()) return;

  const targetTile = e.target.closest('.tile');
  if (!targetTile) return;

  const targetIndex = parseInt(targetTile.dataset.index, 10);
  if (Number.isNaN(targetIndex)) return;

  if (dragSourceIndex !== null && dragSourceIndex !== targetIndex) {
    reorderServices(dragSourceIndex, targetIndex);
    renderGrid();
    renderEditMode();
    dragSourceIndex = null;
  }
}

function handleDragEnd(_e) {
  gridEl.querySelectorAll('.tile').forEach(tile => {
    tile.classList.remove('dragging');
    tile.classList.remove('drag-over');
  });
  dragSourceIndex = null;
}
