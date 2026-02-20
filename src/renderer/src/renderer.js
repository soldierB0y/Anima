/* ========================================
   ANIMA � Pixel Art Studio
   Main Renderer Logic
   ======================================== */

// ==========================================
// DEFAULT COLOR PALETTE (Popular Pixel Art)
// ==========================================
const DEFAULT_PALETTE = [
  // Row 1: Grayscale
  '#000000', '#1a1a2e', '#2d2d44', '#404060',
  '#666680', '#9999aa', '#ccccdd', '#ffffff',
  // Row 2: Reds / Warm
  '#4a0000', '#8b0000', '#cc2222', '#ff4444',
  '#ff7777', '#ffaaaa', '#663300', '#994d00',
  // Row 3: Oranges / Yellows
  '#cc7700', '#ff9900', '#ffbb33', '#ffdd66',
  '#ffee99', '#ffffcc', '#556b2f', '#2e8b57',
  // Row 4: Greens
  '#006400', '#228b22', '#32cd32', '#66ff66',
  '#99ff99', '#ccffcc', '#004d4d', '#008080',
  // Row 5: Blues / Cyans
  '#006699', '#0088cc', '#3399ff', '#66bbff',
  '#99ddff', '#cceeff', '#000066', '#000099',
  // Row 6: Blues Dark to Light
  '#0000cc', '#3333ff', '#6666ff', '#9999ff',
  '#ccccff', '#e6e6ff', '#330066', '#660099',
  // Row 7: Purples / Pinks
  '#9900cc', '#cc33ff', '#dd66ff', '#ee99ff',
  '#440044', '#880066', '#cc0088', '#ff33aa',
  // Row 8: Skin / Earth tones
  '#8d5524', '#c68642', '#e0ac69', '#f1c27d',
  '#ffdbac', '#ffecd2', '#7c5c3c', '#a08060',
]

// ==========================================
// OVERFLOW MARGIN � allows drawing outside project bounds
// ==========================================
const OVERFLOW_MARGIN = 64

function totalW() { return state ? state.width + 2 * OVERFLOW_MARGIN : 2 * OVERFLOW_MARGIN }
function totalH() { return state ? state.height + 2 * OVERFLOW_MARGIN : 2 * OVERFLOW_MARGIN }

// ==========================================
// STATE & PROJECT MANAGEMENT
// ==========================================

class Project {
  constructor(name = 'Sin t�tulo', width = 16, height = 16) {
    this.id = Date.now() + Math.random().toString(36).substr(2, 9)
    this.name = name
    this.fileName = null  // .anima destino actual
    this.width = width
    this.height = height
    this.zoom = 1
    this.panX = 0
    this.panY = 0

    // Tools
    this.currentTool = 'pencil'
    this.currentColor = '#000000'
    this.secondaryColor = '#ffffff'
    this.showGrid = true
    this.onionSkin = false

    // Layers (tree structure: array of layers and folders)
    this.layers = []
    this.activeLayerId = null
    this.selectedLayerIds = new Set()  // IDs of additionally selected layers (multi-selection)

    // Frames / Animation
    this.frames = []
    this.currentFrameIndex = 0
    this.isPlaying = false
    this.fps = 8
    
    // History
    this.undoStack = []
    this.redoStack = []
    this.maxUndoSteps = 50

    // Rigging
    this.rig = {
      bones: [],  // Array of { id, name, x1, y1, x2, y2, angle, parentId }
      boneColors: {},  // Map of boneId -> color
      rigMode: 'create',  // 'create', 'paint', 'animate'
      selectedBoneId: null,
      boneWeights: {},  // Map of "x,y" -> boneId  (pixel-to-bone assignment)
      originalBones: null,  // Snapshot of bones at drag start (current drag)
      originalPixels: null,  // Snapshot of layer ImageData at drag start
      baseBones: null,       // Clean snapshot of bones before ANY deformation
      basePixels: null,      // Clean snapshot of pixels before ANY deformation
      baseBoneWeights: null, // Clean snapshot of bone weights before ANY deformation
    }

    // Initialize with one frame and one layer
    this.init()
  }

  init() {
    const layer = this.createLayer('Capa 1')
    this.layers = [layer]
    this.frames = [[layer]]
    this.activeLayerId = layer.id
    this.currentFrameIndex = 0
  }

  createLayer(name) {
    const layerCanvas = document.createElement('canvas')
    layerCanvas.width = this.width + 2 * OVERFLOW_MARGIN
    layerCanvas.height = this.height + 2 * OVERFLOW_MARGIN
    return {
      id: generateId(),
      type: 'layer',
      name: name,
      canvas: layerCanvas,
      ctx: layerCanvas.getContext('2d'),
      visible: true,
      opacity: 1,
    }
  }

  createFolder(name) {
    return {
      id: generateId(),
      type: 'folder',
      name: name,
      children: [],
      visible: true,
      opacity: 1,
      expanded: true,
    }
  }
}

const appState = {
  projects: [],
  currentProjectIndex: -1,
}

// Shortcut to active project
let state = null

// ==========================================
// DOM ELEMENTS
// ==========================================
const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

const canvas = $('#pixelCanvas')
const ctx = canvas.getContext('2d')
const gridOverlay = $('#gridOverlay')
const gridCtx = gridOverlay.getContext('2d')
const previewOverlay = $('#previewOverlay')
const previewCtx = previewOverlay.getContext('2d')
const rigOverlay = $('#rigOverlay')
const rigCtx = rigOverlay.getContext('2d')

const canvasWrapper = $('#canvasWrapper')
const canvasContainer = $('#canvasContainer')
const coordsDisplay = $('#coordsDisplay')
const zoomDisplay = $('#zoomDisplay')

const colorPreviewSwatch = $('#colorPreviewSwatch')
const colorPickerInput = $('#colorPickerInput')
const colorHexLabel = $('#colorHexLabel')

const defaultPaletteEl = $('#defaultPalette')
const userPaletteEl = $('#userPalette')
const userPaletteEmpty = $('#userPaletteEmpty')
const layersList = $('#layersList')
const layerOpacitySlider = $('#layerOpacity')
const opacityValueLabel = $('#opacityValue')

const brushSizeSlider = $('#brushSizeSlider')
const brushSizeValue = $('#brushSizeValue')

const framesList = $('#framesList')
const frameCounter = $('#frameCounter')
const fpsInput = $('#fpsInput')
const animPreviewCanvas = $('#animPreviewCanvas')
const animPreviewCtx = animPreviewCanvas.getContext('2d')

// Drawing state (Global for active canvas interaction)
const drawingState = {
  isDrawing: false,
  lastPixelX: -1,
  lastPixelY: -1,
  lineStart: null,
  rectStart: null,
  circleStart: null,
  circleRightClick: false,
  moveStart: null,
  moveLayerData: null,
  moveAllLayersData: null,  // [{layer, canvas}] for multi-layer move
  pixelSize: 1,
  animInterval: null,
  userPalette: [],
  // Selector tool
  selectStart: null,
  selectRect: null,
  selectedPixels: new Set(),
  selectionMode: 'replace',  // 'replace' | 'add' | 'subtract'
  clipboardCanvas: null,
  pasteMode: false,
  pasteStartX: 0,
  pasteStartY: 0,
  marchingAntsOffset: 0,
  marchingAntsInterval: null,
  // Magic Wand tool
  wandTolerance: 32,       // 0-255: distancia de color RGB máxima para incluir píxeles
  wandContiguous: true,     // true = Flood Fill contiguo, false = búsqueda global
  brushSize: 1,  // 1-500px for pencil and eraser
  // Selection dragging
  dragSelection: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartRectX: 0,
  dragStartRectY: 0,
  draggedPixelsImageData: null,  // Store pixels being dragged
  draggedPixelsCanvas: null,  // Canvas to hold dragged pixels (active layer)
  draggedAllLayersData: null, // [{layer, canvas}] selected pixels per selected layer
  // Panning (hand tool)
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  panScrollLeft: 0,
  panScrollTop: 0,
  // Rigging tool
  rigBoneStart: null,
  rigParentBoneId: null,
  rigDragJoint: null,  // { bone, endpoint: 'start'|'end' } for animate mode dragging
  rigPainting: false,  // true when painting bone weights
  rigAnimating: false, // true when dragging a joint in animate mode
  // Color swapping: tracks which color to use for current brush stroke
  paintColor: null,  // null means use state.currentColor, otherwise use this color
  // Mirror drawing
  mirrorH: false,  // horizontal mirror (left <-> right)
  mirrorV: false,  // vertical mirror (top <-> bottom)
  mirrorLastPixelX: -1,
  mirrorLastPixelY: -1,
  mirrorLastPixelX2: -1,  // for V mirror tracking
  mirrorLastPixelY2: -1,
  mirrorLastPixelX3: -1,  // for H+V combined
  mirrorLastPixelY3: -1,
}

// ==========================================
// INITIALIZATION
// ==========================================
function init() {
  buildDefaultPalette()
  setupEventListeners()
  
  // Create first project
  createNewProject()
}

function createNewProject(name = 'Nuevo Dibujo', width = 16, height = 16) {
  const project = new Project(name, width, height)
  appState.projects.push(project)
  appState.currentProjectIndex = appState.projects.length - 1
  state = project

  initCanvas()
  updateTabs()
  renderLayersList()
  renderFramesList()
  updateCanvasDisplay()

  // Reset tools UI
  selectTool(state.currentTool)
  $('#toggleGrid').classList.toggle('active', state.showGrid)
  $('#toggleOnionSkin').classList.toggle('active', state.onionSkin)
  $('#canvasWidth').value = state.width
  $('#canvasHeight').value = state.height

  // Initialize layer opacity to 100% (full intensity colors)
  layerOpacitySlider.value = 100
  opacityValueLabel.textContent = '100%'

  // Initialize secondary color UI
  const secondaryColorSwatch = $('#secondaryColorSwatch')
  const secondaryColorHexLabel = $('#secondaryColorHexLabel')
  const secondaryColorPickerInput = $('#secondaryColorPickerInput')
  if (secondaryColorSwatch && secondaryColorHexLabel && secondaryColorPickerInput) {
    secondaryColorSwatch.style.backgroundColor = state.secondaryColor
    secondaryColorHexLabel.textContent = state.secondaryColor.toUpperCase()
    secondaryColorPickerInput.value = state.secondaryColor
  }
}

// ==========================================
// CANVAS SETUP
// ==========================================
function initCanvas() {
  const tW = totalW()
  const tH = totalH()
  canvas.width = tW
  canvas.height = tH
  // Grid overlay size is set in recalcCanvasSize at display resolution
  previewOverlay.width = tW
  previewOverlay.height = tH

  recalcCanvasSize()
}

function recalcCanvasSize() {
  if (!state) return
  const containerRect = canvasContainer.getBoundingClientRect()
  const tW = totalW()
  const tH = totalH()
  
  const availableW = containerRect.width - 64
  const availableH = containerRect.height - 64
  
  // Base pixel size that fits in the container (based on project size, not total)
  let pixelSize = Math.floor(Math.min(availableW / state.width, availableH / state.height))
  if (pixelSize < 1) pixelSize = 1 
  
  // Effective scale must be an integer so every canvas pixel maps to
  // exactly N×N screen pixels. This prevents sub-pixel misalignment
  // between the CSS-scaled pixelCanvas and the display-res gridOverlay.
  let effectiveScale = Math.max(1, Math.round(pixelSize * state.zoom))
  
  drawingState.pixelSize = effectiveScale
  
  // Full internal canvas size (includes overflow)
  const fullW = tW * effectiveScale
  const fullH = tH * effectiveScale
  // Visible project area size (what the user sees)
  const projW = state.width * effectiveScale
  const projH = state.height * effectiveScale
  // Offset to hide the overflow margin
  const offsetPx = OVERFLOW_MARGIN * effectiveScale

  // Wrapper clips to project area only
  canvasWrapper.style.width = projW + 'px'
  canvasWrapper.style.height = projH + 'px'
  canvasWrapper.style.overflow = 'hidden'

  // Internal canvases are full size but shifted so project area aligns with wrapper
  canvas.style.width = fullW + 'px'
  canvas.style.height = fullH + 'px'
  canvas.style.marginLeft = -offsetPx + 'px'
  canvas.style.marginTop = -offsetPx + 'px'

  // Grid overlay at display resolution for crisp 1px lines
  gridOverlay.width = fullW
  gridOverlay.height = fullH
  gridOverlay.style.width = fullW + 'px'
  gridOverlay.style.height = fullH + 'px'
  gridOverlay.style.marginLeft = -offsetPx + 'px'
  gridOverlay.style.marginTop = -offsetPx + 'px'

  // Rig overlay at display resolution for visible bones
  rigOverlay.width = fullW
  rigOverlay.height = fullH
  rigOverlay.style.width = fullW + 'px'
  rigOverlay.style.height = fullH + 'px'
  rigOverlay.style.marginLeft = -offsetPx + 'px'
  rigOverlay.style.marginTop = -offsetPx + 'px'

  previewOverlay.style.width = fullW + 'px'
  previewOverlay.style.height = fullH + 'px'
  previewOverlay.style.marginLeft = -offsetPx + 'px'
  previewOverlay.style.marginTop = -offsetPx + 'px'

  drawGrid()

  // Re-render rig if in rig mode
  if (state && state.currentTool === 'rig') {
    renderRigVisualization()
  }
}

// ==========================================
// TABS
// ==========================================
function updateTabs() {
  const tabsList = $('#tabsList')
  tabsList.innerHTML = ''

  appState.projects.forEach((proj, idx) => {
    const tabEl = document.createElement('div')
    tabEl.className = 'tab' + (idx === appState.currentProjectIndex ? ' active' : '')
    
    const nameEl = document.createElement('span')
    nameEl.textContent = proj.name
    tabEl.appendChild(nameEl)

    const closeBtn = document.createElement('div')
    closeBtn.className = 'tab-close'
    closeBtn.innerHTML = '&times;'
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      closeProject(idx)
    })
    tabEl.appendChild(closeBtn)

    tabEl.addEventListener('click', () => {
      switchProject(idx)
    })

    tabsList.appendChild(tabEl)
  })
}

function switchProject(index) {
  if (index === appState.currentProjectIndex) return
  
  // Stop animation if playing
  if (state.isPlaying) stopAnimation()

  appState.currentProjectIndex = index
  state = appState.projects[index]

  initCanvas()
  updateTabs()
  renderLayersList()
  renderFramesList()
  updateCanvasDisplay()

  // Update UI state
  selectTool(state.currentTool)
  $('#toggleGrid').classList.toggle('active', state.showGrid)
  $('#toggleOnionSkin').classList.toggle('active', state.onionSkin)
  $('#canvasWidth').value = state.width
  $('#canvasHeight').value = state.height

  // Sync layer opacity slider with active layer
  const _activeLayer = getActiveLayer()
  if (_activeLayer) {
    layerOpacitySlider.value = _activeLayer.opacity * 100
    opacityValueLabel.textContent = Math.round(_activeLayer.opacity * 100) + '%'
  }

  // Update secondary color UI
  const secondaryColorSwatch = $('#secondaryColorSwatch')
  const secondaryColorHexLabel = $('#secondaryColorHexLabel')
  const secondaryColorPickerInput = $('#secondaryColorPickerInput')
  if (secondaryColorSwatch && secondaryColorHexLabel && secondaryColorPickerInput) {
    secondaryColorSwatch.style.backgroundColor = state.secondaryColor
    secondaryColorHexLabel.textContent = state.secondaryColor.toUpperCase()
    secondaryColorPickerInput.value = state.secondaryColor
  }
}

function closeProject(index) {
  appState.projects.splice(index, 1)

  if (appState.projects.length === 0) {
    createNewProject()
  } else {
    if (appState.currentProjectIndex >= appState.projects.length) {
      appState.currentProjectIndex = appState.projects.length - 1
    }
    state = appState.projects[appState.currentProjectIndex]
    switchProject(appState.currentProjectIndex)
  }
  updateTabs()
}

function closeAllProjects() {
  appState.projects = []
  createNewProject()
}

// ==========================================
// PALETTE
// ==========================================
function buildDefaultPalette() {
  defaultPaletteEl.innerHTML = ''

  // Transparent swatch first
  const transpDiv = document.createElement('div')
  transpDiv.className = 'color-swatch transparent-bg'
  transpDiv.title = 'Transparente'
  transpDiv.addEventListener('click', () => {
    setCurrentColor('transparent')
  })
  defaultPaletteEl.appendChild(transpDiv)

  DEFAULT_PALETTE.forEach((color) => {
    const swatch = document.createElement('div')
    swatch.className = 'color-swatch'
    swatch.style.backgroundColor = color
    swatch.title = color
    swatch.addEventListener('click', () => {
      setCurrentColor(color)
    })
    defaultPaletteEl.appendChild(swatch)
  })
}

function setCurrentColor(color) {
  state.currentColor = color
  if (color === 'transparent') {
    colorPreviewSwatch.style.background = ''
    colorPreviewSwatch.classList.add('transparent-bg')
    colorHexLabel.textContent = 'Transparente'
  } else {
    colorPreviewSwatch.classList.remove('transparent-bg')
    colorPreviewSwatch.style.backgroundColor = color
    colorHexLabel.textContent = color.toUpperCase()
    colorPickerInput.value = color
    // Debounced add to user palette (waits 5s after last color change)
    addToUserPaletteDebounced(color)
  }

  // Highlight active swatch
  $$('.color-swatch').forEach((s) => s.classList.remove('active'))
  $$('.color-swatch').forEach((s) => {
    if (s.title === color || (color === 'transparent' && s.title === 'Transparente')) {
      s.classList.add('active')
    }
  })
}

function addToUserPalette(color) {
  if (color === 'transparent') return
  if (drawingState.userPalette.includes(color)) return

  drawingState.userPalette.push(color)
  renderUserPalette()
}

// Debounced version: waits 5 seconds after last color picker interaction
let _paletteDebounceTimer = null
function addToUserPaletteDebounced(color) {
  if (color === 'transparent') return
  if (_paletteDebounceTimer) clearTimeout(_paletteDebounceTimer)
  _paletteDebounceTimer = setTimeout(() => {
    addToUserPalette(color)
    _paletteDebounceTimer = null
  }, 5000)
}

function renderUserPalette() {
  userPaletteEl.innerHTML = ''
  userPaletteEmpty.style.display = drawingState.userPalette.length === 0 ? 'block' : 'none'

  drawingState.userPalette.forEach((color) => {
    const swatch = document.createElement('div')
    swatch.className = 'color-swatch'
    swatch.style.backgroundColor = color
    swatch.title = color
    if (color === state.currentColor) swatch.classList.add('active')
    swatch.addEventListener('click', () => setCurrentColor(color))
    swatch.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      drawingState.userPalette = drawingState.userPalette.filter((c) => c !== color)
      renderUserPalette()
    })
    userPaletteEl.appendChild(swatch)
  })
}

// ==========================================
// LAYER TREE HELPERS
// ==========================================
let _idCounter = 0
function generateId() {
  return 'id_' + Date.now().toString(36) + '_' + (++_idCounter).toString(36)
}

/**
 * Flatten a layer tree into an ordered array of drawing layers only.
 * Respects folder visibility: if a folder is hidden, all children are excluded.
 * Order: top-to-bottom (first item = topmost layer).
 */
function getFlatLayers(items, parentVisible = true) {
  const result = []
  for (const item of items) {
    const effectiveVisible = parentVisible && item.visible
    if (item.type === 'folder') {
      result.push(...getFlatLayers(item.children, effectiveVisible))
    } else {
      if (effectiveVisible) {
        result.push(item)
      }
    }
  }
  return result
}

/**
 * Get ALL layers (including hidden) from the tree, flat.
 */
function getAllLayers(items) {
  const result = []
  for (const item of items) {
    if (item.type === 'folder') {
      result.push(...getAllLayers(item.children))
    } else {
      result.push(item)
    }
  }
  return result
}

/**
 * Get ALL items (layers + folders) from the tree, flat.
 */
function getAllItems(items) {
  const result = []
  for (const item of items) {
    result.push(item)
    if (item.type === 'folder') {
      result.push(...getAllItems(item.children))
    }
  }
  return result
}

/**
 * Find an item (layer or folder) by ID in the tree.
 */
function findItemById(items, id) {
  for (const item of items) {
    if (item.id === id) return item
    if (item.type === 'folder') {
      const found = findItemById(item.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Find the parent array and index of an item by ID.
 * Returns { parent: array, index: number } or null.
 */
function findParentAndIndex(items, id) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { parent: items, index: i }
    if (items[i].type === 'folder') {
      const found = findParentAndIndex(items[i].children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Remove an item from the tree by ID. Returns the removed item or null.
 */
function removeItemById(items, id) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) {
      return items.splice(i, 1)[0]
    }
    if (items[i].type === 'folder') {
      const removed = removeItemById(items[i].children, id)
      if (removed) return removed
    }
  }
  return null
}

/**
 * Get the active layer object (only if it's a drawing layer, not a folder).
 */
function getActiveLayer() {
  if (!state || !state.activeLayerId) return null
  const item = findItemById(state.layers, state.activeLayerId)
  if (item && item.type === 'layer') return item
  return null
}

/**
 * Get all currently selected layers (active + multi-selected), only drawing layers.
 */
function getSelectedLayers() {
  if (!state) return []
  const ids = new Set([state.activeLayerId])
  for (const id of (state.selectedLayerIds || [])) ids.add(id)
  return getAllLayers(state.layers).filter(l => ids.has(l.id))
}

/**
 * Get the active item (layer or folder).
 */
function getActiveItem() {
  if (!state || !state.activeLayerId) return null
  return findItemById(state.layers, state.activeLayerId)
}

/**
 * Count all drawing layers (for auto-naming).
 */
function countAllLayers(items) {
  return getAllLayers(items).length
}

/**
 * Count all folders (for auto-naming).
 */
function countAllFolders(items) {
  let count = 0
  for (const item of items) {
    if (item.type === 'folder') {
      count += 1 + countAllFolders(item.children)
    }
  }
  return count
}

/**
 * Deep clone a layer tree (for frames/undo).
 * Layers get new canvases with copied pixel data.
 */
function deepCloneTree(items, width, height) {
  return items.map(item => {
    if (item.type === 'folder') {
      return {
        id: item.id,
        type: 'folder',
        name: item.name,
        children: deepCloneTree(item.children, width, height),
        visible: item.visible,
        opacity: item.opacity,
        expanded: item.expanded,
      }
    } else {
      const newCanvas = document.createElement('canvas')
      newCanvas.width = width + 2 * OVERFLOW_MARGIN
      newCanvas.height = height + 2 * OVERFLOW_MARGIN
      const newCtx = newCanvas.getContext('2d')
      newCtx.drawImage(item.canvas, 0, 0)
      return {
        id: item.id,
        type: 'layer',
        name: item.name,
        canvas: newCanvas,
        ctx: newCtx,
        visible: item.visible,
        opacity: item.opacity,
      }
    }
  })
}

/**
 * Snapshot a layer tree for undo/redo (copies canvas data).
 */
function snapshotTree(items) {
  return items.map(item => {
    if (item.type === 'folder') {
      return {
        id: item.id,
        type: 'folder',
        name: item.name,
        children: snapshotTree(item.children),
        visible: item.visible,
        opacity: item.opacity,
        expanded: item.expanded,
      }
    } else {
      const copyCanvas = document.createElement('canvas')
      copyCanvas.width = item.canvas.width
      copyCanvas.height = item.canvas.height
      copyCanvas.getContext('2d').drawImage(item.canvas, 0, 0)
      return {
        id: item.id,
        type: 'layer',
        name: item.name,
        canvas: copyCanvas,
        visible: item.visible,
        opacity: item.opacity,
      }
    }
  })
}

/**
 * Restore a layer tree from a snapshot.
 */
function restoreTree(snapshot) {
  return snapshot.map(s => {
    if (s.type === 'folder') {
      return {
        id: s.id,
        type: 'folder',
        name: s.name,
        children: restoreTree(s.children),
        visible: s.visible,
        opacity: s.opacity,
        expanded: s.expanded,
      }
    } else {
      const layerCanvas = document.createElement('canvas')
      layerCanvas.width = s.canvas.width
      layerCanvas.height = s.canvas.height
      const layerCtx = layerCanvas.getContext('2d')
      layerCtx.drawImage(s.canvas, 0, 0)
      return {
        id: s.id,
        type: 'layer',
        name: s.name,
        canvas: layerCanvas,
        ctx: layerCtx,
        visible: s.visible,
        opacity: s.opacity,
      }
    }
  })
}

/**
 * Resize all canvases in a tree.
 */
function resizeTreeCanvases(items, oldW, oldH, newW, newH) {
  for (const item of items) {
    if (item.type === 'folder') {
      resizeTreeCanvases(item.children, oldW, oldH, newW, newH)
    } else {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = oldW + 2 * OVERFLOW_MARGIN
      tempCanvas.height = oldH + 2 * OVERFLOW_MARGIN
      tempCanvas.getContext('2d').drawImage(item.canvas, 0, 0)
      item.canvas.width = newW + 2 * OVERFLOW_MARGIN
      item.canvas.height = newH + 2 * OVERFLOW_MARGIN
      item.ctx = item.canvas.getContext('2d')
      item.ctx.imageSmoothingEnabled = false
      item.ctx.drawImage(tempCanvas, 0, 0)
    }
  }
}

// ==========================================
// LAYERS
// ==========================================
function createLayer(name) {
  const layerCanvas = document.createElement('canvas')
  layerCanvas.width = totalW()
  layerCanvas.height = totalH()

  return {
    id: generateId(),
    type: 'layer',
    name: name || `Capa ${countAllLayers(state.layers) + 1}`,
    canvas: layerCanvas,
    ctx: layerCanvas.getContext('2d'),
    visible: true,
    opacity: 1,
  }
}

function createFolder(name) {
  return {
    id: generateId(),
    type: 'folder',
    name: name || `Carpeta ${countAllFolders(state.layers) + 1}`,
    children: [],
    visible: true,
    opacity: 1,
    expanded: true,
  }
}

function addLayer() {
  const layer = createLayer()
  // Insert after the active item's position (same level)
  const activeItem = getActiveItem()
  if (activeItem) {
    const loc = findParentAndIndex(state.layers, activeItem.id)
    if (loc) {
      loc.parent.splice(loc.index + 1, 0, layer)
    } else {
      state.layers.push(layer)
    }
  } else {
    state.layers.push(layer)
  }
  state.activeLayerId = layer.id
  renderLayersList()
  compositeAndDisplay()
}

function addFolder() {
  const folder = createFolder()
  const activeItem = getActiveItem()
  if (activeItem) {
    const loc = findParentAndIndex(state.layers, activeItem.id)
    if (loc) {
      loc.parent.splice(loc.index + 1, 0, folder)
    } else {
      state.layers.push(folder)
    }
  } else {
    state.layers.push(folder)
  }
  state.activeLayerId = folder.id
  renderLayersList()
  compositeAndDisplay()
}

function deleteLayer() {
  const allLayers = getAllLayers(state.layers)
  if (allLayers.length <= 1 && !getActiveItem()) return

  const activeItem = getActiveItem()
  if (!activeItem) return

  // If deleting a folder, ensure at least one layer remains outside it
  if (activeItem.type === 'folder') {
    const layersInFolder = getAllLayers(activeItem.children)
    const totalLayers = allLayers.length
    if (totalLayers - layersInFolder.length < 1) return
  } else {
    if (allLayers.length <= 1) return
  }

  // Find sibling or parent to select after deletion
  const loc = findParentAndIndex(state.layers, activeItem.id)
  removeItemById(state.layers, activeItem.id)

  // Select next available item
  const allItems = getAllItems(state.layers)
  if (allItems.length > 0) {
    // Try to select the item at the same position or previous
    if (loc && loc.parent.length > 0) {
      const newIdx = Math.min(loc.index, loc.parent.length - 1)
      state.activeLayerId = loc.parent[newIdx].id
    } else {
      state.activeLayerId = allItems[0].id
    }
  }

  renderLayersList()
  compositeAndDisplay()
}

function mergeDown() {
  const activeItem = getActiveItem()
  if (!activeItem || activeItem.type !== 'layer') return

  const loc = findParentAndIndex(state.layers, activeItem.id)
  if (!loc) return

  // Find the next layer below in the same parent
  let bottomLayer = null
  for (let i = loc.index + 1; i < loc.parent.length; i++) {
    if (loc.parent[i].type === 'layer') {
      bottomLayer = loc.parent[i]
      break
    }
  }
  if (!bottomLayer) return

  bottomLayer.ctx.globalAlpha = activeItem.opacity
  bottomLayer.ctx.drawImage(activeItem.canvas, 0, 0)
  bottomLayer.ctx.globalAlpha = 1

  removeItemById(state.layers, activeItem.id)
  state.activeLayerId = bottomLayer.id
  renderLayersList()
  compositeAndDisplay()
}

function setActiveLayer(id) {
  state.activeLayerId = id
  state.selectedLayerIds.clear()  // Clear multi-selection on normal layer activation
  const item = findItemById(state.layers, id)
  if (item && item.type === 'layer') {
    layerOpacitySlider.value = item.opacity * 100
    opacityValueLabel.textContent = Math.round(item.opacity * 100) + '%'
  } else if (item && item.type === 'folder') {
    layerOpacitySlider.value = item.opacity * 100
    opacityValueLabel.textContent = Math.round(item.opacity * 100) + '%'
  }
  renderLayersList()
}

// Currently dragged item ID for drag-and-drop
let _draggedItemId = null

function renderLayersList() {
  layersList.innerHTML = ''
  _renderTreeItems(state.layers, layersList, 0)

  // Update opacity slider for active item
  const activeItem = getActiveItem()
  if (activeItem) {
    layerOpacitySlider.value = (activeItem.opacity || 1) * 100
    opacityValueLabel.textContent = Math.round((activeItem.opacity || 1) * 100) + '%'
  }
}

function _startRename(item, nameEl) {
  const input = document.createElement('input')
  input.value = item.name
  nameEl.textContent = ''
  nameEl.appendChild(input)
  input.focus()
  input.select()

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    item.name = input.value || item.name
    nameEl.textContent = item.name
  }
  input.addEventListener('blur', finish)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      finish()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      nameEl.textContent = item.name
      finished = true
    }
    e.stopPropagation()
  })
  input.addEventListener('click', (e) => e.stopPropagation())
}

function _renderTreeItems(items, container, depth) {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item.type === 'folder') {
      _renderFolderItem(item, container, depth)
    } else {
      _renderLayerItem(item, container, depth)
    }
  }
}

function _renderFolderItem(folder, container, depth) {
  const row = document.createElement('div')
  row.className = 'layer-item folder-item' + (folder.id === state.activeLayerId ? ' active' : '') + (state.selectedLayerIds.has(folder.id) ? ' multi-selected' : '')
  row.draggable = true
  row.dataset.id = folder.id
  row.dataset.type = 'folder'
  row.dataset.depth = depth

  // Expand/collapse arrow
  const arrow = document.createElement('div')
  arrow.className = 'folder-arrow' + (folder.expanded ? '' : ' collapsed')
  arrow.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>'
  arrow.addEventListener('click', (e) => {
    e.stopPropagation()
    folder.expanded = !folder.expanded
    renderLayersList()
  })

  // Folder icon
  const folderIcon = document.createElement('div')
  folderIcon.className = 'folder-icon'
  folderIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'

  // Name
  const nameEl = document.createElement('div')
  nameEl.className = 'layer-name'
  nameEl.textContent = folder.name

  // Visibility toggle
  const visBtn = _createVisibilityButton(folder)

  row.appendChild(arrow)
  row.appendChild(folderIcon)
  row.appendChild(nameEl)
  row.appendChild(visBtn)

  row.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    _startRename(folder, row.querySelector('.layer-name'))
  })

  row.addEventListener('click', (e) => {
    if (e.altKey) {
      // Alt+Click: remove from multi-selection
      e.stopPropagation()
      state.selectedLayerIds.delete(folder.id)
      if (state.activeLayerId === folder.id) {
        const remaining = [...state.selectedLayerIds]
        if (remaining.length > 0) {
          state.activeLayerId = remaining[remaining.length - 1]
          state.selectedLayerIds.delete(state.activeLayerId)
        }
      }
      renderLayersList()
    } else if (e.shiftKey) {
      // Shift+Click: add to multi-selection
      e.stopPropagation()
      if (folder.id !== state.activeLayerId) {
        state.selectedLayerIds.add(folder.id)
      }
      renderLayersList()
    } else {
      if (state.activeLayerId === folder.id) return // already active, don't re-render
      setActiveLayer(folder.id)
    }
  })

  // Drag and drop
  _setupDragDrop(row, folder.id)

  container.appendChild(row)

  // Children container
  const childContainer = document.createElement('div')
  childContainer.className = 'layer-tree-children' + (folder.expanded ? '' : ' collapsed')

  if (folder.expanded) {
    _renderTreeItems(folder.children, childContainer, depth + 1)
  }

  container.appendChild(childContainer)
}

function _renderLayerItem(layer, container, depth) {
  const row = document.createElement('div')
  row.className = 'layer-item' + (layer.id === state.activeLayerId ? ' active' : '') + (state.selectedLayerIds.has(layer.id) ? ' multi-selected' : '')
  row.draggable = true
  row.dataset.id = layer.id
  row.dataset.type = 'layer'
  row.dataset.depth = depth

  // Thumbnail
  const thumb = document.createElement('canvas')
  thumb.className = 'layer-thumb'
  thumb.width = 32
  thumb.height = 32
  const thumbCtx = thumb.getContext('2d')
  thumbCtx.imageSmoothingEnabled = false
  thumbCtx.drawImage(layer.canvas, 0, 0, 32, 32)

  // Name
  const nameEl = document.createElement('div')
  nameEl.className = 'layer-name'
  nameEl.textContent = layer.name

  // Visibility toggle
  const visBtn = _createVisibilityButton(layer)

  row.appendChild(thumb)
  row.appendChild(nameEl)
  row.appendChild(visBtn)

  row.addEventListener('dblclick', (e) => {
    e.stopPropagation()
    _startRename(layer, row.querySelector('.layer-name'))
  })

  row.addEventListener('click', (e) => {
    if (e.altKey) {
      // Alt+Click: remove from multi-selection
      e.stopPropagation()
      state.selectedLayerIds.delete(layer.id)
      if (state.activeLayerId === layer.id) {
        const remaining = [...state.selectedLayerIds]
        if (remaining.length > 0) {
          state.activeLayerId = remaining[remaining.length - 1]
          state.selectedLayerIds.delete(state.activeLayerId)
        } else {
          // Fall back to first available layer
          const allLayers = getAllLayers(state.layers)
          const other = allLayers.find(l => l.id !== layer.id)
          if (other) state.activeLayerId = other.id
        }
      }
      renderLayersList()
    } else if (e.shiftKey) {
      // Shift+Click: add to multi-selection
      e.stopPropagation()
      if (layer.id !== state.activeLayerId) {
        state.selectedLayerIds.add(layer.id)
      }
      renderLayersList()
    } else {
      if (state.activeLayerId === layer.id) return // already active, don't re-render
      setActiveLayer(layer.id)
    }
  })

  // Drag and drop
  _setupDragDrop(row, layer.id)

  container.appendChild(row)
}

function _createVisibilityButton(item) {
  const visBtn = document.createElement('button')
  visBtn.className = 'layer-visibility' + (item.visible ? '' : ' hidden')
  visBtn.innerHTML = item.visible
    ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
  visBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    item.visible = !item.visible
    renderLayersList()
    compositeAndDisplay()
  })
  return visBtn
}

function _setupDragDrop(row, itemId) {
  row.addEventListener('dragstart', (e) => {
    _draggedItemId = itemId
    e.dataTransfer.setData('text/plain', itemId)
    e.dataTransfer.effectAllowed = 'move'
    row.classList.add('dragging')
    // slight delay to allow dragstart visual to pass
    setTimeout(() => row.classList.add('dragging'), 0)
  })

  row.addEventListener('dragend', () => {
    _draggedItemId = null
    row.classList.remove('dragging')
    // Clear all indicators
    document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-inside').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside')
    })
  })

  row.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    // Don't allow drop on self
    if (row.dataset.id === _draggedItemId) return

    // Clear previous indicators on this row
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside')

    const rect = row.getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height

    if (row.dataset.type === 'folder') {
      // Folders: top third = before, middle third = inside, bottom third = after
      if (y < height * 0.25) {
        row.classList.add('drag-over-top')
      } else if (y > height * 0.75) {
        row.classList.add('drag-over-bottom')
      } else {
        row.classList.add('drag-over-inside')
      }
    } else {
      // Layers: top half = before, bottom half = after
      if (y < height * 0.5) {
        row.classList.add('drag-over-top')
      } else {
        row.classList.add('drag-over-bottom')
      }
    }
  })

  row.addEventListener('dragleave', () => {
    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside')
  })

  row.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()

    row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside')

    const fromId = e.dataTransfer.getData('text/plain')
    const toId = row.dataset.id

    if (!fromId || fromId === toId) return

    // Prevent dropping a folder into its own descendant
    const fromItem = findItemById(state.layers, fromId)
    if (fromItem && fromItem.type === 'folder') {
      if (findItemById(fromItem.children, toId)) return
    }

    const rect = row.getBoundingClientRect()
    const y = e.clientY - rect.top
    const height = rect.height

    let position // 'before', 'after', or 'inside'
    if (row.dataset.type === 'folder') {
      if (y < height * 0.25) position = 'before'
      else if (y > height * 0.75) position = 'after'
      else position = 'inside'
    } else {
      position = y < height * 0.5 ? 'before' : 'after'
    }

    // Remove the dragged item from its current position
    const movedItem = removeItemById(state.layers, fromId)
    if (!movedItem) return

    if (position === 'inside') {
      // Drop inside a folder
      const targetFolder = findItemById(state.layers, toId)
      if (targetFolder && targetFolder.type === 'folder') {
        targetFolder.children.unshift(movedItem)
        targetFolder.expanded = true
      }
    } else {
      // Drop before or after an item
      const targetLoc = findParentAndIndex(state.layers, toId)
      if (targetLoc) {
        const insertIdx = position === 'before' ? targetLoc.index : targetLoc.index + 1
        targetLoc.parent.splice(insertIdx, 0, movedItem)
      }
    }

    renderLayersList()
    compositeAndDisplay()
  })
}

// F2 rename support
document.addEventListener('keydown', (e) => {
  if (e.key === 'F2' && state && state.activeLayerId) {
    // Find the active item's name element in the DOM
    const activeRow = layersList.querySelector(`.layer-item[data-id="${state.activeLayerId}"]`)
    if (activeRow) {
      const nameEl = activeRow.querySelector('.layer-name')
      const activeItem = getActiveItem()
      if (nameEl && activeItem) {
        e.preventDefault()
        _startRename(activeItem, nameEl)
      }
    }
  }
})

// ==========================================
// FRAMES / ANIMATION
// ==========================================
function addNewFrame(duplicateFrom = null) {
  let frameLayers
  if (duplicateFrom !== null) {
    frameLayers = deepCloneTree(state.frames[duplicateFrom], state.width, state.height)
  } else {
    const newLayer = createLayer('Capa 1')
    frameLayers = [newLayer]
  }

  state.frames.push(frameLayers)
  switchToFrame(state.frames.length - 1)
  renderFramesList()
}

function deleteFrame(index) {
  if (state.frames.length <= 1) return

  state.frames.splice(index, 1)
  if (state.currentFrameIndex >= state.frames.length) {
    state.currentFrameIndex = state.frames.length - 1
  }
  switchToFrame(state.currentFrameIndex)
  renderFramesList()
}

function switchToFrame(index) {
  // Save current layers to current frame
  if (state.frames[state.currentFrameIndex]) {
    state.frames[state.currentFrameIndex] = state.layers
  }

  state.currentFrameIndex = index
  state.layers = state.frames[index]

  // Ensure activeLayerId exists in the new frame
  const allItemsInFrame = getAllItems(state.layers)
  if (!findItemById(state.layers, state.activeLayerId) && allItemsInFrame.length > 0) {
    state.activeLayerId = allItemsInFrame[0].id
  }

  renderLayersList()
  compositeAndDisplay()
  renderFramesList()
  frameCounter.textContent = `Frame ${index + 1} / ${state.frames.length}`
}

function renderFramesList() {
  framesList.innerHTML = ''

  state.frames.forEach((frameLayers, i) => {
    const thumb = document.createElement('div')
    thumb.className = 'frame-thumb' + (i === state.currentFrameIndex ? ' active' : '')

    // Frame canvas
    const fc = document.createElement('canvas')
    fc.width = state.width
    fc.height = state.height
    const fctx = fc.getContext('2d')
    fctx.imageSmoothingEnabled = false

    // Composite all layers for this frame
    const flatFrameLayers = getFlatLayers(frameLayers)
    for (let li = flatFrameLayers.length - 1; li >= 0; li--) {
      const layer = flatFrameLayers[li]
      fctx.globalAlpha = layer.opacity
      fctx.drawImage(layer.canvas, -OVERFLOW_MARGIN, -OVERFLOW_MARGIN)
    }
    fctx.globalAlpha = 1

    thumb.appendChild(fc)

    // Frame number
    const num = document.createElement('span')
    num.className = 'frame-number'
    num.textContent = i + 1
    thumb.appendChild(num)

    // Delete button
    const delBtn = document.createElement('button')
    delBtn.className = 'frame-delete'
    delBtn.textContent = '�'
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteFrame(i)
    })
    thumb.appendChild(delBtn)

    // Duplicate button
    const dupBtn = document.createElement('button')
    dupBtn.className = 'frame-duplicate'
    dupBtn.textContent = '?'
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      // Insert duplicate after this frame
      let frameCopy = deepCloneTree(frameLayers, state.width, state.height)
      state.frames.splice(i + 1, 0, frameCopy)
      switchToFrame(i + 1)
      renderFramesList()
    })
    thumb.appendChild(dupBtn)

    thumb.addEventListener('click', () => switchToFrame(i))
    framesList.appendChild(thumb)
  })

  frameCounter.textContent = `Frame ${state.currentFrameIndex + 1} / ${state.frames.length}`
}

// ==========================================
// COMPOSITING & DISPLAY
// ==========================================
function compositeAndDisplay() {
  if (!state) return
  const tW = totalW()
  const tH = totalH()
  ctx.clearRect(0, 0, tW, tH)

  // Draw onion skin (previous frame) - BLUE
  if (state.onionSkin && state.currentFrameIndex > 0) {
    const prevFrame = state.frames[state.currentFrameIndex - 1]
    const prevFlatLayers = getFlatLayers(prevFrame)
    ctx.globalAlpha = 0.3
    ctx.fillStyle = 'rgba(0, 100, 255, 0.2)'
    ctx.fillRect(0, 0, tW, tH)
    for (let i = prevFlatLayers.length - 1; i >= 0; i--) {
      ctx.drawImage(prevFlatLayers[i].canvas, 0, 0)
    }
    ctx.globalAlpha = 0.3
    ctx.fillStyle = 'rgba(0, 150, 255, 0.15)'
    ctx.fillRect(0, 0, tW, tH)
    ctx.globalAlpha = 1
  }

  // Draw current frame layers bottom to top
  const flatLayers = getFlatLayers(state.layers)
  for (let i = flatLayers.length - 1; i >= 0; i--) {
    const layer = flatLayers[i]
    ctx.globalAlpha = layer.opacity
    ctx.drawImage(layer.canvas, 0, 0)
  }
  ctx.globalAlpha = 1

  updateFrameThumbnail()
  updateAnimPreview()
}

function updateFrameThumbnail() {
  const thumbs = framesList.querySelectorAll('.frame-thumb')
  if (!thumbs[state.currentFrameIndex]) return

  const fc = thumbs[state.currentFrameIndex].querySelector('canvas')
  if (!fc) return
  const fctx = fc.getContext('2d')
  fctx.clearRect(0, 0, fc.width, fc.height)
  fctx.imageSmoothingEnabled = false

  const flatLayersThumb = getFlatLayers(state.layers)
  for (let i = flatLayersThumb.length - 1; i >= 0; i--) {
    const layer = flatLayersThumb[i]
    fctx.globalAlpha = layer.opacity
    fctx.drawImage(layer.canvas, 0, 0)
  }
  fctx.globalAlpha = 1
}

function updateAnimPreview() {
  if (!state.isPlaying) {
    animPreviewCanvas.width = state.width
    animPreviewCanvas.height = state.height
    animPreviewCtx.clearRect(0, 0, state.width, state.height)
    // Draw only the project area from the main canvas
    animPreviewCtx.drawImage(canvas, OVERFLOW_MARGIN, OVERFLOW_MARGIN, state.width, state.height, 0, 0, state.width, state.height)
  }
}

// ==========================================
// GRID
// ==========================================
function drawGrid() {
  if (!state) return
  const displayW = gridOverlay.width
  const displayH = gridOverlay.height
  const tW = totalW()
  const tH = totalH()
  gridCtx.clearRect(0, 0, displayW, displayH)

  // Cell size based on total canvas (including overflow)
  const cellW = displayW / tW
  const cellH = displayH / tH

  if (state.showGrid) {
    // Only show grid when pixels are large enough to distinguish
    if (cellW >= 4 && cellH >= 4) {
      gridCtx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
      gridCtx.lineWidth = 1

      // Grid lines for the FULL canvas (project + overflow)
      for (let x = 0; x <= tW; x++) {
        const px = Math.round(x * cellW) + 0.5
        gridCtx.beginPath()
        gridCtx.moveTo(px, 0)
        gridCtx.lineTo(px, displayH)
        gridCtx.stroke()
      }
      for (let y = 0; y <= tH; y++) {
        const py = Math.round(y * cellH) + 0.5
        gridCtx.beginPath()
        gridCtx.moveTo(0, py)
        gridCtx.lineTo(displayW, py)
        gridCtx.stroke()
      }
    }
  }

  // Always render mirror guides on top of grid
  renderMirrorGuides()
}

// ==========================================
// DRAWING TOOLS
// ==========================================
function getPixelCoords(e) {
  const rect = canvas.getBoundingClientRect()
  const tW = totalW()
  const tH = totalH()
  const x = Math.floor((e.clientX - rect.left) * (tW / rect.width))
  const y = Math.floor((e.clientY - rect.top) * (tH / rect.height))

  return { x, y }  // Internal coords � project origin at (OVERFLOW_MARGIN, OVERFLOW_MARGIN)
}

// Mirror helpers � mirror within the project area (internal coords)
function mirrorX(x) { return 2 * OVERFLOW_MARGIN + state.width - 1 - x }
function mirrorY(y) { return 2 * OVERFLOW_MARGIN + state.height - 1 - y }

// Execute a drawing operation and its mirrored versions
// fn(x, y, ...extra) will be called for each mirror variant
function withMirror(x, y, fn) {
  fn(x, y)
  if (drawingState.mirrorH) fn(mirrorX(x), y)
  if (drawingState.mirrorV) fn(x, mirrorY(y))
  if (drawingState.mirrorH && drawingState.mirrorV) fn(mirrorX(x), mirrorY(y))
}

// Execute a line drawing operation with mirroring
function withMirrorLine(x0, y0, x1, y1, fn) {
  fn(x0, y0, x1, y1)
  if (drawingState.mirrorH) fn(mirrorX(x0), y0, mirrorX(x1), y1)
  if (drawingState.mirrorV) fn(x0, mirrorY(y0), x1, mirrorY(y1))
  if (drawingState.mirrorH && drawingState.mirrorV) fn(mirrorX(x0), mirrorY(y0), mirrorX(x1), mirrorY(y1))
}

// Render mirror guide lines on the grid overlay
function renderMirrorGuides() {
  if (!drawingState.mirrorH && !drawingState.mirrorV) return
  const dw = gridOverlay.width
  const dh = gridOverlay.height
  if (dw === 0 || dh === 0) return
  const tW = totalW()
  const tH = totalH()
  
  const cellW = dw / tW
  const cellH = dh / tH
  
  gridCtx.save()
  gridCtx.setLineDash([6, 4])
  gridCtx.lineWidth = 2
  gridCtx.strokeStyle = '#ff00ffaa'
  
  if (drawingState.mirrorH) {
    const cx = Math.round((OVERFLOW_MARGIN + state.width / 2) * cellW)
    gridCtx.beginPath()
    gridCtx.moveTo(cx, 0)
    gridCtx.lineTo(cx, dh)
    gridCtx.stroke()
  }
  if (drawingState.mirrorV) {
    const cy = Math.round((OVERFLOW_MARGIN + state.height / 2) * cellH)
    gridCtx.beginPath()
    gridCtx.moveTo(0, cy)
    gridCtx.lineTo(dw, cy)
    gridCtx.stroke()
  }
  gridCtx.restore()
}

function drawPixel(x, y, layerCtx, color = null) {
  const colorToUse = color || state.currentColor
  if (colorToUse === 'transparent') return  // Only eraser tool should erase
  layerCtx.fillStyle = colorToUse
  layerCtx.fillRect(x, y, 1, 1)
}

function erasePixel(x, y, layerCtx) {
  layerCtx.clearRect(x, y, 1, 1)
}

function drawBrush(x, y, size, layerCtx, color = null) {
  const colorToUse = color || state.currentColor
  if (colorToUse === 'transparent') return  // Only eraser tool should erase
  const halfSize = size / 2
  const offset = size % 2 === 0 ? halfSize : halfSize - 0.5
  layerCtx.fillStyle = colorToUse
  layerCtx.fillRect(x - offset, y - offset, size, size)
}

function eraseBrush(x, y, size, layerCtx) {
  const halfSize = size / 2
  const offset = size % 2 === 0 ? halfSize : halfSize - 0.5
  layerCtx.clearRect(x - offset, y - offset, size, size)
}

function getPixelColor(x, y, layerCtx) {
  const data = layerCtx.getImageData(x, y, 1, 1).data
  if (data[3] === 0) return 'transparent'
  return (
    '#' +
    ((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2]).toString(16).slice(1)
  )
}

function floodFill(x, y, layerCtx, selectedPixels = null, color = null) {
  const tW = totalW()
  const tH = totalH()
  const imageData = layerCtx.getImageData(0, 0, tW, tH)
  const data = imageData.data

  const targetIdx = (y * tW + x) * 4
  const targetR = data[targetIdx]
  const targetG = data[targetIdx + 1]
  const targetB = data[targetIdx + 2]
  const targetA = data[targetIdx + 3]

  let fillR, fillG, fillB, fillA
  const colorToUse = color || state.currentColor
  if (colorToUse === 'transparent') {
    fillR = fillG = fillB = fillA = 0
  } else {
    const hex = colorToUse.replace('#', '')
    fillR = parseInt(hex.substr(0, 2), 16)
    fillG = parseInt(hex.substr(2, 2), 16)
    fillB = parseInt(hex.substr(4, 2), 16)
    fillA = 255
  }

  if (targetR === fillR && targetG === fillG && targetB === fillB && targetA === fillA) return

  const matches = (idx) =>
    data[idx] === targetR &&
    data[idx + 1] === targetG &&
    data[idx + 2] === targetB &&
    data[idx + 3] === targetA

  const stack = [[x, y]]
  const visited = new Set()

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()
    const key = cy * tW + cx
    if (visited.has(key)) continue
    visited.add(key)

    const idx = key * 4
    if (!matches(idx)) continue

    // If selection exists, only fill if pixel is in selection
    if (selectedPixels !== null && !selectedPixels.has(cx + ',' + cy)) continue

    data[idx] = fillR
    data[idx + 1] = fillG
    data[idx + 2] = fillB
    data[idx + 3] = fillA

    if (cx > 0) stack.push([cx - 1, cy])
    if (cx < tW - 1) stack.push([cx + 1, cy])
    if (cy > 0) stack.push([cx, cy - 1])
    if (cy < tH - 1) stack.push([cx, cy + 1])
  }

  layerCtx.putImageData(imageData, 0, 0)
}

// Bresenham line
function drawLine(x0, y0, x1, y1, layerCtx, erase = false, color = null) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    if (erase) erasePixel(x0, y0, layerCtx)
    else drawPixel(x0, y0, layerCtx, color)

    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
}

function drawBrushLine(x0, y0, x1, y1, size, layerCtx, erase = false, color = null) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    if (erase) {
      eraseBrush(x0, y0, size, layerCtx)
    } else {
      drawBrush(x0, y0, size, layerCtx, color)
    }

    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
}

function drawRectOutline(x0, y0, x1, y1, layerCtx, color = null) {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)

  for (let x = minX; x <= maxX; x++) {
    drawPixel(x, minY, layerCtx, color)
    drawPixel(x, maxY, layerCtx, color)
  }
  for (let y = minY + 1; y < maxY; y++) {
    drawPixel(minX, y, layerCtx, color)
    drawPixel(maxX, y, layerCtx, color)
  }
}

// ==========================================
// SELECTION & MAGIC WAND TOOLS
// ==========================================

function updateSelectionRectFromPixels() {
  if (drawingState.selectedPixels.size === 0) {
    drawingState.selectRect = null
    $('#btnCopySelection').style.display = 'none'
    return
  }

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  drawingState.selectedPixels.forEach((key) => {
    const [px, py] = key.split(',').map(Number)
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  })

  drawingState.selectRect = {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  }
  $('#btnCopySelection').style.display = 'block'
}

// ============================================================
// selectByColor – Varita Mágica (Magic Wand)
// ============================================================
// Selecciona píxeles cuyo color RGB está dentro de la tolerancia
// respecto al píxel clickeado (x, y).
//
// Modos:
//   • Contiguo  → Flood Fill con stack (solo vecinos conectados)
//   • No Contiguo → Recorrido lineal de toda la imagen
//
// Tolerancia: distancia euclídea en el espacio RGB
//   d = sqrt((r1-r2)² + (g1-g2)² + (b1-b2)²)
//   Rango útil: 0 (color exacto) – 441 (máximo teórico)
//   El slider va de 0 a 255 que cubre la mayoría de casos.
// ============================================================
function selectByColor(x, y, layerCtx) {
  const tW = totalW()
  const tH = totalH()

  // 1) Obtener TODOS los datos de imagen de una sola vez (rendimiento)
  const imageData = layerCtx.getImageData(0, 0, tW, tH)
  const data = imageData.data  // Uint8ClampedArray [R,G,B,A, R,G,B,A, …]

  // 2) Color del píxel semilla (el que clickeó el usuario)
  const seedIdx = (y * tW + x) * 4
  const seedR = data[seedIdx]
  const seedG = data[seedIdx + 1]
  const seedB = data[seedIdx + 2]
  const seedA = data[seedIdx + 3]

  // 3) Tolerancia directa (0-255)
  const tolerance = drawingState.wandTolerance

  // Función auxiliar: calcula si un píxel (por su índice en data[]) coincide
  // con el color semilla dentro de la tolerancia.
  // Compara también el canal alfa para manejar píxeles transparentes.
  function colorMatches(idx) {
    const r = data[idx]
    const g = data[idx + 1]
    const b = data[idx + 2]
    const a = data[idx + 3]

    // Si el píxel semilla es totalmente transparente, solo coinciden
    // otros píxeles totalmente transparentes (independiente de la tolerancia)
    if (seedA === 0) return a === 0

    // Si el píxel candidato es totalmente transparente pero el semilla no,
    // no coincide (a menos que la tolerancia cubra la diferencia de alfa)
    if (a === 0 && seedA > 0) {
      // Incluimos transparentes solo si la tolerancia de alfa los cubre
      const alphaDiff = seedA  // distancia al 0
      if (alphaDiff > tolerance) return false
    }

    // Distancia euclídea en espacio RGB:
    // d = sqrt( (r1-r2)² + (g1-g2)² + (b1-b2)² )
    const dr = r - seedR
    const dg = g - seedG
    const db = b - seedB
    const distance = Math.sqrt(dr * dr + dg * dg + db * db)

    return distance <= tolerance
  }

  // 4) Recopilar los píxeles nuevos que coinciden
  const newPixels = new Set()

  if (drawingState.wandContiguous) {
    // ───────────────────────────────────────────────
    // MODO CONTIGUO: Flood Fill basado en stack
    // ───────────────────────────────────────────────
    // Recorre los 4-vecinos a partir del píxel semilla.
    // Solo avanza a un vecino si su color coincide con el semilla
    // dentro de la tolerancia. Esto produce una selección "conectada".
    //
    // Usamos un stack explícito (array) en lugar de recursión
    // para evitar desbordamientos de pila en áreas grandes.
    // Se usa un Set de visitados indexado por posición lineal (y*tW+x)
    // para máximo rendimiento.

    const visited = new Set()     // Índice lineal → ya procesado
    const stack = [y * tW + x]    // Semilla en formato lineal
    visited.add(stack[0])

    while (stack.length > 0) {
      const pos = stack.pop()     // Posición lineal actual
      const idx = pos * 4         // Índice en data[]

      if (!colorMatches(idx)) continue

      // Este píxel coincide → añadir a la selección
      const px = pos % tW
      const py = (pos - px) / tW
      newPixels.add(px + ',' + py)

      // Explorar los 4 vecinos (arriba, abajo, izquierda, derecha)
      const neighbors = []
      if (px > 0)      neighbors.push(pos - 1)       // izquierda
      if (px < tW - 1) neighbors.push(pos + 1)       // derecha
      if (py > 0)      neighbors.push(pos - tW)      // arriba
      if (py < tH - 1) neighbors.push(pos + tW)      // abajo

      for (const nPos of neighbors) {
        if (!visited.has(nPos)) {
          visited.add(nPos)
          stack.push(nPos)
        }
      }
    }
  } else {
    // ───────────────────────────────────────────────
    // MODO NO CONTIGUO: recorrido global de la imagen
    // ───────────────────────────────────────────────
    // Recorre TODOS los píxeles de la imagen y selecciona cada uno
    // que esté dentro de la tolerancia respecto al color semilla.
    // No importa si están conectados o no al punto de origen.

    for (let i = 0; i < data.length; i += 4) {
      if (colorMatches(i)) {
        const pixelIndex = i / 4
        const px = pixelIndex % tW
        const py = (pixelIndex - px) / tW
        newPixels.add(px + ',' + py)
      }
    }
  }

  // 5) Aplicar modos de selección (reemplazar / agregar / substraer)
  //    Esto permite que la varita respete Ctrl+Shift (agregar) y
  //    Ctrl+Alt (substraer) como las herramientas de selección profesionales.
  switch (drawingState.selectionMode) {
    case 'replace':
      drawingState.selectedPixels.clear()
      // Fall through → agrega los nuevos píxeles

    case 'add':
      // Unión: agregar píxeles nuevos a la selección existente
      newPixels.forEach((pixel) => {
        drawingState.selectedPixels.add(pixel)
      })
      break

    case 'subtract':
      // Diferencia: remover píxeles del set existente
      newPixels.forEach((pixel) => {
        drawingState.selectedPixels.delete(pixel)
      })
      break
  }

  // 6) Actualizar bounding rect y feedback visual
  updateSelectionRectFromPixels()
  drawWandSelectionOverlay()   // superponer máscara visual roja
  startMarchingAntsAnimation()
}

// ==========================================
// SELECTION CLIPBOARD HELPER
// ==========================================
function copySelectionToClipboard() {
  if (drawingState.selectedPixels.size === 0 || !drawingState.selectRect) return false

  const layer = getActiveLayer()
  const rect = drawingState.selectRect

  drawingState.clipboardCanvas = document.createElement('canvas')
  drawingState.clipboardCanvas.width = rect.w
  drawingState.clipboardCanvas.height = rect.h
  const clipCtx = drawingState.clipboardCanvas.getContext('2d')
  clipCtx.imageSmoothingEnabled = false

  // Copy only the selected pixels, not the entire rect
  const imgData = layer.ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
  const d = imgData.data
  for (let i = 0; i < d.length; i += 4) {
    const pi = i / 4
    const px = rect.x + (pi % rect.w)
    const py = rect.y + Math.floor(pi / rect.w)
    if (!drawingState.selectedPixels.has(px + ',' + py)) {
      d[i + 3] = 0 // make non-selected pixels transparent
    }
  }
  clipCtx.putImageData(imgData, 0, 0)

  drawingState.pasteStartX = rect.x
  drawingState.pasteStartY = rect.y
  $('#btnPasteSelection').style.display = 'block'

  return true
}

function startMarchingAntsAnimation() {
  stopMarchingAntsAnimation()

  drawingState.marchingAntsOffset = 0
  drawingState.marchingAntsInterval = setInterval(() => {
    drawingState.marchingAntsOffset = (drawingState.marchingAntsOffset + 1) % 8
    previewCtx.clearRect(0, 0, totalW(), totalH())

    if (drawingState.selectedPixels.size > 0) {
      // Redraw visual feedback overlay (red semi-transparent mask)
      if (state.currentTool === 'wand') drawWandSelectionOverlay()
      // Always prefer pixel-based outline when we have selectedPixels
      drawMarchingAntsFromPixels(previewCtx)
    } else if (drawingState.selectRect) {
      drawMarchingAntsRect(
        drawingState.selectRect.x,
        drawingState.selectRect.y,
        drawingState.selectRect.w,
        drawingState.selectRect.h,
        previewCtx
      )
    }
  }, 50)
}

function drawMarchingAntsRect(x, y, w, h, ctx) {
  ctx.strokeStyle = '#FFFF00'
  ctx.lineWidth = 1
  ctx.setLineDash([1, 1])
  ctx.lineDashOffset = -drawingState.marchingAntsOffset * 0.1
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
}

function drawMarchingAntsFromPixels(ctx, offsetX = 0, offsetY = 0) {
  if (drawingState.selectedPixels.size === 0) return

  // Draw marching ants along the outline of the actual pixel shape
  ctx.strokeStyle = '#FFFF00'
  ctx.lineWidth = 1
  ctx.setLineDash([1, 1])
  ctx.lineDashOffset = -drawingState.marchingAntsOffset * 0.1

  ctx.beginPath()
  drawingState.selectedPixels.forEach((key) => {
    const [px, py] = key.split(',').map(Number)
    const dx = px + offsetX
    const dy = py + offsetY
    // Draw edges that border non-selected pixels
    if (!drawingState.selectedPixels.has((px - 1) + ',' + py)) {
      ctx.moveTo(dx, dy); ctx.lineTo(dx, dy + 1) // left
    }
    if (!drawingState.selectedPixels.has((px + 1) + ',' + py)) {
      ctx.moveTo(dx + 1, dy); ctx.lineTo(dx + 1, dy + 1) // right
    }
    if (!drawingState.selectedPixels.has(px + ',' + (py - 1))) {
      ctx.moveTo(dx, dy); ctx.lineTo(dx + 1, dy) // top
    }
    if (!drawingState.selectedPixels.has(px + ',' + (py + 1))) {
      ctx.moveTo(dx, dy + 1); ctx.lineTo(dx + 1, dy + 1) // bottom
    }
  })
  ctx.stroke()
  ctx.setLineDash([])
}

function stopMarchingAntsAnimation() {
  if (drawingState.marchingAntsInterval) {
    clearInterval(drawingState.marchingAntsInterval)
    drawingState.marchingAntsInterval = null
  }
}

// ==========================================
// WAND SELECTION VISUAL FEEDBACK
// ==========================================
// Pinta una máscara semitransparente roja sobre los píxeles
// seleccionados para dar feedback visual inmediato al usuario.
// Se dibuja en el previewOverlay para no alterar la imagen real.
function drawWandSelectionOverlay() {
  if (drawingState.selectedPixels.size === 0) return

  const rect = drawingState.selectRect
  if (!rect) return

  // Crear un ImageData temporal del tamaño del bounding rect
  const w = rect.w
  const h = rect.h
  const overlayData = previewCtx.createImageData(w, h)
  const d = overlayData.data

  // Pintar cada píxel seleccionado con rojo semitransparente (rgba 255,0,0,80)
  drawingState.selectedPixels.forEach((key) => {
    const [px, py] = key.split(',').map(Number)
    const lx = px - rect.x
    const ly = py - rect.y
    if (lx >= 0 && lx < w && ly >= 0 && ly < h) {
      const idx = (ly * w + lx) * 4
      d[idx]     = 255  // R
      d[idx + 1] = 0    // G
      d[idx + 2] = 0    // B
      d[idx + 3] = 80   // A (semitransparente)
    }
  })

  previewCtx.putImageData(overlayData, rect.x, rect.y)
}

// ==========================================
// TEXT TOOL
// ==========================================

function showTextDialog() {
  const dialog = $('#textDialog')
  const overlay = $('#textDialogOverlay')
  if (dialog && overlay) {
    dialog.style.display = 'block'
    overlay.style.display = 'block'
    const input = $('#textInput')
    if (input) input.focus()
  }
}

function hideTextDialog() {
  const dialog = $('#textDialog')
  const overlay = $('#textDialogOverlay')
  if (dialog && overlay) {
    dialog.style.display = 'none'
    overlay.style.display = 'none'
  }
}

function renderTextToBitmap(text, font, size) {
  // Create a temporary canvas for text measurement
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')

  const fontSize = parseInt(size)
  const fontFamily = font || 'monospace'
  tempCtx.font = `${fontSize}px ${fontFamily}`
  const metrics = tempCtx.measureText(text)
  const width = Math.ceil(metrics.width) + 4
  const height = fontSize + 4

  // Create the final canvas with text
  const textCanvas = document.createElement('canvas')
  textCanvas.width = width
  textCanvas.height = height
  const ctx = textCanvas.getContext('2d')
  ctx.font = `${fontSize}px ${fontFamily}`
  ctx.fillStyle = state.currentColor
  ctx.fillText(text, 2, fontSize + 1)

  return textCanvas
}

// ==========================================
// UNDO / REDO
// ==========================================
function saveUndoState() {
  const snapshot = snapshotTree(state.layers)

  state.undoStack.push({
    layers: snapshot,
    activeLayerId: state.activeLayerId,
    // Guardar estado de selección para que Ctrl+Z deshaga selecciones
    selectedPixels: new Set(drawingState.selectedPixels),
    selectRect: drawingState.selectRect ? { ...drawingState.selectRect } : null,
  })

  if (state.undoStack.length > state.maxUndoSteps) {
    state.undoStack.shift()
  }

  state.redoStack = []
}

function undo() {
  if (state.undoStack.length === 0) return

  // Save current state to redo
  const currentSnapshot = snapshotTree(state.layers)
  state.redoStack.push({
    layers: currentSnapshot,
    activeLayerId: state.activeLayerId,
    selectedPixels: new Set(drawingState.selectedPixels),
    selectRect: drawingState.selectRect ? { ...drawingState.selectRect } : null,
  })

  const prev = state.undoStack.pop()
  restoreFromSnapshot(prev)
}

function redo() {
  if (state.redoStack.length === 0) return

  const currentSnapshot = snapshotTree(state.layers)
  state.undoStack.push({
    layers: currentSnapshot,
    activeLayerId: state.activeLayerId,
    selectedPixels: new Set(drawingState.selectedPixels),
    selectRect: drawingState.selectRect ? { ...drawingState.selectRect } : null,
  })

  const next = state.redoStack.pop()
  restoreFromSnapshot(next)
}

function restoreFromSnapshot(snapshot) {
  state.layers = restoreTree(snapshot.layers)
  state.activeLayerId = snapshot.activeLayerId
  state.frames[state.currentFrameIndex] = state.layers

  // Restaurar estado de selección
  if (snapshot.selectedPixels) {
    drawingState.selectedPixels = new Set(snapshot.selectedPixels)
    drawingState.selectRect = snapshot.selectRect ? { ...snapshot.selectRect } : null
  } else {
    drawingState.selectedPixels.clear()
    drawingState.selectRect = null
  }

  // Actualizar UI de selección
  if (drawingState.selectedPixels.size > 0) {
    startMarchingAntsAnimation()
    $('#btnCopySelection').style.display = 'block'
  } else {
    stopMarchingAntsAnimation()
    previewCtx.clearRect(0, 0, totalW(), totalH())
    $('#btnCopySelection').style.display = 'none'
  }

  renderLayersList()
  compositeAndDisplay()
}

// ==========================================
// CANVAS DISPLAY UPDATE
// ==========================================
function updateCanvasDisplay() {
  recalcCanvasSize()
  compositeAndDisplay()
  zoomDisplay.textContent = `Zoom: ${Math.round(state.zoom * 100)}%`
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  // === Canvas mouse events ===
  canvasWrapper.addEventListener('mousedown', onCanvasMouseDown)
  canvasWrapper.addEventListener('mousemove', onCanvasMouseMove)
  canvasWrapper.addEventListener('mouseup', onCanvasMouseUp)
  canvasWrapper.addEventListener('mouseleave', onCanvasMouseUp)
  canvasWrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    // Right-click: deselect selection and wand tools
    if (state.currentTool === 'select' || state.currentTool === 'wand') {
      if (drawingState.selectedPixels.size > 0) saveUndoState()
      drawingState.selectedPixels.clear()
      drawingState.selectRect = null
      stopMarchingAntsAnimation()
      previewCtx.clearRect(0, 0, totalW(), totalH())
      $('#btnCopySelection').style.display = 'none'
      $('#btnPasteSelection').style.display = 'none'
    }
  })

  // === Zoom ===
  canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    state.zoom = Math.max(0.25, Math.min(state.zoom + delta, 5))
    updateCanvasDisplay()
  })

  // === Menu Bar ===
  $('#menuNew').addEventListener('click', () => createNewProject())
  $('#menuOpen').addEventListener('click', openProjectFile)
  $('#menuSave').addEventListener('click', () => exportAnima())
  $('#menuSaveAs').addEventListener('click', () => exportAnima())
  $('#menuExportSheet').addEventListener('click', exportSpritesheet)
  $('#menuCloseTab').addEventListener('click', () => closeProject(appState.currentProjectIndex))
  $('#menuCloseAllTabs').addEventListener('click', closeAllProjects)
  $('#menuExit').addEventListener('click', () => { if(window.electron) window.close() })

  $('#menuUndo').addEventListener('click', undo)
  $('#menuRedo').addEventListener('click', redo)
  
  $('#menuToggleGrid').addEventListener('click', () => {
    state.showGrid = !state.showGrid
    $('#toggleGrid').classList.toggle('active', state.showGrid)
    drawGrid()
  })
  
  $('#menuZoomIn').addEventListener('click', () => {
    state.zoom = Math.min(state.zoom + 0.25, 10)
    updateCanvasDisplay()
  })
  $('#menuZoomOut').addEventListener('click', () => {
    state.zoom = Math.max(state.zoom - 0.25, 0.1)
    updateCanvasDisplay()
  })
  $('#menuZoomReset').addEventListener('click', () => {
    state.zoom = 1
    updateCanvasDisplay()
  })

  // === Tabs Bar ===
  $('#btnNewTabPlus').addEventListener('click', () => createNewProject())

  // === Canvas mouse events ===
  $$('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state) selectTool(btn.dataset.tool)
    })
  })

  // === Grid toggle ===
  $('#toggleGrid').addEventListener('click', () => {
    if (!state) return
    state.showGrid = !state.showGrid
    $('#toggleGrid').classList.toggle('active', state.showGrid)
    drawGrid()
  })

  // === Mirror toggles ===
  $('#toggleMirrorH').addEventListener('click', () => {
    drawingState.mirrorH = !drawingState.mirrorH
    $('#toggleMirrorH').classList.toggle('active', drawingState.mirrorH)
    drawGrid()
  })
  $('#toggleMirrorV').addEventListener('click', () => {
    drawingState.mirrorV = !drawingState.mirrorV
    $('#toggleMirrorV').classList.toggle('active', drawingState.mirrorV)
    drawGrid()
  })

  // === Onion Skin toggle ===
  $('#toggleOnionSkin').addEventListener('click', () => {
    if (!state) return
    state.onionSkin = !state.onionSkin
    $('#toggleOnionSkin').classList.toggle('active', state.onionSkin)
    compositeAndDisplay()
  })

  // === Canvas Dimensions ===
  $('#btnResize').addEventListener('click', () => {
    const newW = parseInt($('#canvasWidth').value)
    const newH = parseInt($('#canvasHeight').value)
    if (newW > 0 && newH > 0) resizeAllCanvases(newW, newH)
  })

  // === Window resize ===
  window.addEventListener('resize', () => updateCanvasDisplay())

  // === Color picker ===
  colorPreviewSwatch.addEventListener('click', () => colorPickerInput.click())
  colorPickerInput.addEventListener('input', (e) => {
    setCurrentColor(e.target.value)
  })

  // === Secondary Color Picker ===
  const secondaryColorSwatch = $('#secondaryColorSwatch')
  const secondaryColorPickerInput = $('#secondaryColorPickerInput')
  const secondaryColorHexLabel = $('#secondaryColorHexLabel')

  if (secondaryColorSwatch && secondaryColorPickerInput && secondaryColorHexLabel) {
    secondaryColorSwatch.addEventListener('click', () => {
      secondaryColorPickerInput.click()
    })

    secondaryColorPickerInput.addEventListener('input', (e) => {
      if (state) {
        state.secondaryColor = e.target.value
        secondaryColorSwatch.style.backgroundColor = e.target.value
        secondaryColorHexLabel.textContent = e.target.value.toUpperCase()
      }
    })

    // Initialize visual (only if state exists)
    if (state) {
      secondaryColorSwatch.style.backgroundColor = state.secondaryColor
      secondaryColorHexLabel.textContent = state.secondaryColor.toUpperCase()
    }
  }

  // === Layers ===
  $('#btnAddLayer').addEventListener('click', addLayer)
  $('#btnAddFolder').addEventListener('click', addFolder)
  $('#btnDeleteLayer').addEventListener('click', deleteLayer)
  $('#btnMergeDown').addEventListener('click', mergeDown)

  layerOpacitySlider.addEventListener('input', (e) => {
    if (!state) return
    const val = parseInt(e.target.value)
    const activeItem = getActiveItem()
    if (activeItem) {
      activeItem.opacity = val / 100
    }
    opacityValueLabel.textContent = val + '%'
    compositeAndDisplay()
  })

  // === Magic Wand Tolerance & Contiguous ===
  const wandToleranceSlider = $('#wandTolerance')
  const wandToleranceValue = $('#wandToleranceValue')
  if (wandToleranceSlider && wandToleranceValue) {
    wandToleranceSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value)
      drawingState.wandTolerance = val
      wandToleranceValue.textContent = val
    })
  }
  const wandContiguousCheckbox = $('#wandContiguous')
  if (wandContiguousCheckbox) {
    wandContiguousCheckbox.addEventListener('change', (e) => {
      drawingState.wandContiguous = e.target.checked
    })
  }

  // === Brush Size Control ===
  if (brushSizeSlider && brushSizeValue) {
    brushSizeSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value)
      drawingState.brushSize = val
      brushSizeValue.textContent = val + 'px'
    })
  }

  // === Clear user palette ===
  $('#btnClearUserPalette').addEventListener('click', () => {
    drawingState.userPalette = []
    renderUserPalette()
  })

  // === Undo / Redo ===
  $('#btnUndo').addEventListener('click', undo)
  $('#btnRedo').addEventListener('click', redo)

  // === Animation controls ===
  $('#btnPlayPause').addEventListener('click', togglePlayPause)
  $('#btnFirstFrame').addEventListener('click', () => switchToFrame(0))
  $('#btnPrevFrame').addEventListener('click', () => {
    if (state && state.currentFrameIndex > 0) switchToFrame(state.currentFrameIndex - 1)
  })
  $('#btnNextFrame').addEventListener('click', () => {
    if (state && state.currentFrameIndex < state.frames.length - 1) switchToFrame(state.currentFrameIndex + 1)
  })
  $('#btnLastFrame').addEventListener('click', () => {
    if (state) switchToFrame(state.frames.length - 1)
  })
  $('#btnAddFrame').addEventListener('click', () => addNewFrame())

  fpsInput.addEventListener('change', (e) => {
    if (!state) return
    state.fps = Math.max(1, Math.min(60, parseInt(e.target.value) || 8))
    fpsInput.value = state.fps
    if (state.isPlaying) {
      stopAnimation()
      startAnimation()
    }
  })

  // === Export ===
  $('#btnExportPNG').addEventListener('click', exportPNG)
  $('#btnExportGIF').addEventListener('click', exportSpritesheet)

  // === Save As Dialog ===
  $('#btnSaveAsPNG').addEventListener('click', () => {
    exportPNG()
    hideSaveAsDialog()
  })
  $('#btnSaveAsJPEG').addEventListener('click', () => {
    exportJPEG()
    hideSaveAsDialog()
  })
  $('#btnCancelSaveAs').addEventListener('click', hideSaveAsDialog)
  $('#saveAsDialogOverlay').addEventListener('click', hideSaveAsDialog)

  // === Selection tools ===
  $('#btnCopySelection').addEventListener('click', () => {
    if (drawingState.selectedPixels.size === 0 || !drawingState.selectRect) return
    const layer = getActiveLayer()
    const rect = drawingState.selectRect
    drawingState.clipboardCanvas = document.createElement('canvas')
    drawingState.clipboardCanvas.width = rect.w
    drawingState.clipboardCanvas.height = rect.h
    const clipCtx = drawingState.clipboardCanvas.getContext('2d')
    clipCtx.drawImage(layer.canvas, -rect.x, -rect.y)
    drawingState.pasteMode = true
    drawingState.pasteStartX = rect.x
    drawingState.pasteStartY = rect.y
    $('#btnPasteSelection').style.display = 'block'
  })

  $('#btnPasteSelection').addEventListener('click', () => {
    if (!drawingState.clipboardCanvas) return
    selectTool('select')
    drawingState.pasteMode = true
  })

  // === Text Tool ===
  $('#btnInsertText').addEventListener('click', () => {
    const text = $('#textInput').value
    const font = $('#textFont').value
    const customSize = $('#textCustomSize').value
    let size = customSize || $('#textSize').value

    if (!text || !drawingState.textStart) {
      hideTextDialog()
      return
    }

    saveUndoState()
    const layer = getActiveLayer()
    const textCanvas = renderTextToBitmap(text, font, size)
    layer.ctx.drawImage(textCanvas, drawingState.textStart.x, drawingState.textStart.y)
    compositeAndDisplay()
    hideTextDialog()
    $('#textInput').value = ''
    $('#textCustomSize').value = ''
  })

  $('#btnCancelText').addEventListener('click', hideTextDialog)

  // Close text dialog when overlay is clicked
  $('#textDialogOverlay').addEventListener('click', hideTextDialog)

  // === Text Size Selection ===
  const textSizeSelect = $('#textSize')
  const textCustomSize = $('#textCustomSize')
  if (textSizeSelect && textCustomSize) {
    textSizeSelect.addEventListener('change', (e) => {
      textCustomSize.value = e.target.value
    })
  }

  // === Rig Editor ===
  const rigModeSelect = $('#rigModeSelect')
  if (rigModeSelect) {
    rigModeSelect.addEventListener('change', (e) => {
      // When leaving animate mode, commit the current deformation
      // by clearing base snapshots so deformed state becomes ground truth
      if (state.rig.rigMode === 'animate' && e.target.value !== 'animate') {
        state.rig.basePixels = null
        state.rig.baseBones = null
        state.rig.baseBoneWeights = null
      }
      state.rig.rigMode = e.target.value
      renderRigVisualization()
    })
  }

  const btnAutoWeights = $('#btnAutoWeights')
  if (btnAutoWeights) {
    btnAutoWeights.addEventListener('click', () => {
      autoAssignBoneWeights()
      updateRigPanel()
      renderRigVisualization()
    })
  }

  const btnClearWeights = $('#btnClearWeights')
  if (btnClearWeights) {
    btnClearWeights.addEventListener('click', () => {
      state.rig.boneWeights = {}
      updateRigPanel()
      renderRigVisualization()
    })
  }

  const btnDeleteBone = $('#btnDeleteBone')
  if (btnDeleteBone) {
    btnDeleteBone.addEventListener('click', () => {
      if (state.rig.selectedBoneId !== null) {
        const idx = state.rig.bones.findIndex(b => b.id === state.rig.selectedBoneId)
        if (idx !== -1) {
          state.rig.bones.splice(idx, 1)
          // Reassign IDs after deletion
          state.rig.bones.forEach((bone, i) => {
            bone.id = i
          })
          // Update boneColors map
          const newColors = {}
          state.rig.bones.forEach((bone) => {
            newColors[bone.id] = state.rig.boneColors[bone.id] || getRandomBoneColor()
          })
          state.rig.boneColors = newColors
        }
        state.rig.selectedBoneId = null
        updateRigPanel()
        renderRigVisualization()
      }
    })
  }

  // === Keyboard shortcuts ===
  window.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault()
      undo()
    } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault()
      redo()
    } else if (e.key === 'b' || e.key === 'B') {
      selectTool('pencil')
    } else if (e.key === 'e' || e.key === 'E') {
      selectTool('eraser')
    } else if (e.key === 'g' || e.key === 'G') {
      selectTool('fill')
    } else if (e.key === 'i' || e.key === 'I') {
      selectTool('eyedropper')
    } else if (e.key === 'l' || e.key === 'L') {
      selectTool('line')
    } else if (e.key === 'r' || e.key === 'R') {
      selectTool('rect')
    } else if (e.key === 'm' || e.key === 'M') {
      selectTool('move')
    } else if (e.key === 's' || e.key === 'S') {
      selectTool('select')
    } else if (e.key === 'w' || e.key === 'W') {
      selectTool('wand')
    } else if (e.key === 't' || e.key === 'T') {
      selectTool('text')
    } else if (e.key === 'z') {
      selectTool('zoom')
    } else if (e.key === 'Z') {
      selectTool('zoom-out')
    } else if (e.key === 'c' || e.key === 'C') {
      selectTool('circle')
    } else if (e.key === 'o' || e.key === 'O') {
      state.onionSkin = !state.onionSkin
      $('#toggleOnionSkin').classList.toggle('active', state.onionSkin)
      compositeAndDisplay()
    } else if (e.key === ' ') {
      e.preventDefault()
      togglePlayPause()
    } else if (e.key === 'Escape') {
      if (drawingState.selectedPixels.size > 0 || drawingState.pasteMode) {
        saveUndoState()
        drawingState.selectedPixels.clear()
        drawingState.pasteMode = false
        stopMarchingAntsAnimation()
        drawingState.selectRect = null
        previewCtx.clearRect(0, 0, totalW(), totalH())
        $('#btnCopySelection').style.display = 'none'
        $('#btnPasteSelection').style.display = 'none'
      }
    } else if (e.ctrlKey && e.key === 'c') {
      e.preventDefault()
      copySelectionToClipboard()
    } else if (e.ctrlKey && e.key === 'x') {
      e.preventDefault()
      if (copySelectionToClipboard()) {
        saveUndoState()
        const rect = drawingState.selectRect
        const layerCtx = getActiveLayer().ctx
        // Clear only the selected pixels, not the entire rect
        const imgData = layerCtx.getImageData(rect.x, rect.y, rect.w, rect.h)
        const d = imgData.data
        for (let i = 0; i < d.length; i += 4) {
          const pi = i / 4
          const px = rect.x + (pi % rect.w)
          const py = rect.y + Math.floor(pi / rect.w)
          if (drawingState.selectedPixels.has(px + ',' + py)) {
            d[i + 3] = 0
          }
        }
        layerCtx.putImageData(imgData, rect.x, rect.y)
        compositeAndDisplay()
      }
    } else if (e.ctrlKey && e.key === 'v') {
      e.preventDefault()
      if (drawingState.clipboardCanvas && state) {
        if (state.currentTool !== 'select') selectTool('select')
        drawingState.pasteMode = true
        // Initialize paste position - show at current paste start position or center of canvas
        if (!drawingState.pasteStartX) {
          drawingState.pasteStartX = Math.max(0, OVERFLOW_MARGIN + Math.floor((state.width - drawingState.clipboardCanvas.width) / 2))
        }
        if (!drawingState.pasteStartY) {
          drawingState.pasteStartY = Math.max(0, OVERFLOW_MARGIN + Math.floor((state.height - drawingState.clipboardCanvas.height) / 2))
        }
        // Draw the pasted content to the preview
        previewCtx.clearRect(0, 0, totalW(), totalH())
        previewCtx.drawImage(drawingState.clipboardCanvas, drawingState.pasteStartX, drawingState.pasteStartY)
      }
    }
  })
}

function selectTool(tool) {
  state.currentTool = tool
  $$('.tool-btn[data-tool]').forEach((b) => b.classList.remove('active'))
  const btn = $(`.tool-btn[data-tool="${tool}"]`)
  if (btn) btn.classList.add('active')

  // Clear any tool preview (pencil/eraser cursor dot, etc.)
  previewCtx.clearRect(0, 0, totalW(), totalH())

  // Show/hide tool-specific panels
  const wandToleranceSection = $('#wandToleranceSection')
  if (wandToleranceSection) {
    wandToleranceSection.style.display = tool === 'wand' ? 'block' : 'none'
    // Sync UI controls with current state values
    if (tool === 'wand') {
      const slider = $('#wandTolerance')
      const valLabel = $('#wandToleranceValue')
      const chk = $('#wandContiguous')
      if (slider) slider.value = drawingState.wandTolerance
      if (valLabel) valLabel.textContent = drawingState.wandTolerance
      if (chk) chk.checked = drawingState.wandContiguous
    }
  }

  const rigEditorPanel = $('#rigEditorPanel')
  if (rigEditorPanel) {
    if (tool === 'rig') {
      updateRigPanel()
      renderRigVisualization()
    } else {
      // Clear rig overlay and base snapshots when switching away
      rigCtx.clearRect(0, 0, rigOverlay.width, rigOverlay.height)
      state.rig.basePixels = null
      state.rig.baseBones = null
      state.rig.baseBoneWeights = null
    }
  }

  // Set cursor for each tool
  const toolCursors = {
    pencil: 'crosshair',
    eraser: 'crosshair',
    fill: 'crosshair',
    eyedropper: 'crosshair',
    line: 'crosshair',
    rect: 'crosshair',
    circle: 'crosshair',
    move: 'move',
    select: 'crosshair',
    wand: 'crosshair',
    text: 'text',
    rig: 'crosshair',
    zoom: 'zoom-in',
    'zoom-out': 'zoom-out',
    hand: 'grab',
  }
  const cursor = toolCursors[tool] || 'default'
  canvasContainer.style.cursor = cursor
  canvasWrapper.style.cursor = cursor

  const brushSizeSection = $('#brushSizeSection')
  if (brushSizeSection) {
    brushSizeSection.style.display =
      (tool === 'pencil' || tool === 'eraser') ? 'block' : 'none'

    // Sync brush size slider with current value
    if (brushSizeSlider && brushSizeValue) {
      brushSizeSlider.value = drawingState.brushSize
      brushSizeValue.textContent = drawingState.brushSize + 'px'
    }
  }
}

// ==========================================
// CANVAS MOUSE HANDLERS
// ==========================================
function onCanvasMouseDown(e) {
  if (!state) return
  if (state.isPlaying) return

  const { x, y } = getPixelCoords(e)
  const layer = getActiveLayer()
  // NOTE: Layer visibility check moved into switch statement for tool-specific handling

  drawingState.isDrawing = true

  switch (state.currentTool) {
    case 'pencil':
      // Pencil requires visible layer
      if (!layer || !layer.visible) return

      // If clicking inside existing selection, start drag just like select tool
      if (drawingState.selectRect && drawingState.selectedPixels.size > 0) {
        const sx = drawingState.selectRect.x
        const sy = drawingState.selectRect.y
        const sw = drawingState.selectRect.w
        const sh = drawingState.selectRect.h

        if (x >= sx && x < sx + sw && y >= sy && y < sy + sh) {
          drawingState.dragSelection = true
          drawingState.dragStartX = x
          drawingState.dragStartY = y
          drawingState.dragStartRectX = drawingState.selectRect.x
          drawingState.dragStartRectY = drawingState.selectRect.y

          // Extract selected pixels into draggedPixelsCanvas
          const dragRect = { x: sx, y: sy, w: sw, h: sh }
          drawingState.draggedPixelsCanvas = document.createElement('canvas')
          drawingState.draggedPixelsCanvas.width = dragRect.w
          drawingState.draggedPixelsCanvas.height = dragRect.h
          const dragCtx = drawingState.draggedPixelsCanvas.getContext('2d')
          const layerImageData = layer.ctx.getImageData(dragRect.x, dragRect.y, dragRect.w, dragRect.h)
          const data = layerImageData.data

          // Remove non-selected pixels within drag area
          for (let i = 0; i < data.length; i += 4) {
            const pixelIndex = i / 4
            const px = dragRect.x + (pixelIndex % dragRect.w)
            const py = dragRect.y + Math.floor(pixelIndex / dragRect.w)
            const pixelKey = px + ',' + py
            if (!drawingState.selectedPixels.has(pixelKey)) {
              data[i + 3] = 0
            }
          }
          dragCtx.putImageData(layerImageData, 0, 0)
          drawingState.isDrawing = true
          return
        }
      }
      saveUndoState()
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      addToUserPalette(drawingState.paintColor)
      withMirror(x, y, (mx, my) => {
        if (drawingState.brushSize === 1) {
          drawPixel(mx, my, layer.ctx, drawingState.paintColor)
        } else {
          drawBrush(mx, my, drawingState.brushSize, layer.ctx, drawingState.paintColor)
        }
      })
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      // isDrawing stays true so mousemove continues drawing
      break

    case 'eraser':
      // Eraser requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      withMirror(x, y, (mx, my) => {
        if (drawingState.brushSize === 1) {
          erasePixel(mx, my, layer.ctx)
        } else {
          eraseBrush(mx, my, drawingState.brushSize, layer.ctx)
        }
      })
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      break

    case 'fill':
      // Fill requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      // Determine color: left-click = primary (currentColor), right-click = secondary
      const fillColor = e.button === 0 ? state.currentColor : state.secondaryColor
      addToUserPalette(fillColor)
      // Pass selectedPixels if there's an active selection
      const fillSelection = drawingState.selectedPixels.size > 0 ? drawingState.selectedPixels : null
      withMirror(x, y, (mx, my) => {
        floodFill(mx, my, layer.ctx, fillSelection, fillColor)
      })
      compositeAndDisplay()
      drawingState.isDrawing = false
      break

    case 'eyedropper': {
      // Eyedropper only requires layer to exist, not visibility
      if (!layer) return
      // Pick color from composite
      const compositeData = ctx.getImageData(x, y, 1, 1).data
      const toHex = (v) => v.toString(16).padStart(2, '0')
      const pickedColor = compositeData[3] === 0
        ? 'transparent'
        : `#${toHex(compositeData[0])}${toHex(compositeData[1])}${toHex(compositeData[2])}`

      if (e.button === 2) {
        state.secondaryColor = pickedColor
        const secondaryColorSwatch = $('#secondaryColorSwatch')
        const secondaryColorHexLabel = $('#secondaryColorHexLabel')
        const secondaryColorPickerInput = $('#secondaryColorPickerInput')
        if (secondaryColorSwatch && secondaryColorHexLabel && secondaryColorPickerInput) {
          secondaryColorSwatch.style.backgroundColor = pickedColor === 'transparent' ? '' : pickedColor
          secondaryColorSwatch.classList.toggle('transparent-bg', pickedColor === 'transparent')
          secondaryColorHexLabel.textContent = pickedColor === 'transparent' ? 'Transparente' : pickedColor.toUpperCase()
          if (pickedColor !== 'transparent') secondaryColorPickerInput.value = pickedColor
        }
      } else {
        setCurrentColor(pickedColor)
      }
      drawingState.isDrawing = false
      break
    }

    case 'line':
      // Line requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      addToUserPalette(drawingState.paintColor)
      drawingState.lineStart = { x, y }
      break

    case 'rect':
      // Rect requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      addToUserPalette(drawingState.paintColor)
      drawingState.rectStart = { x, y }
      break

    case 'move': {
      // Move requires at least the active layer to be visible
      if (!layer || !layer.visible) return
      saveUndoState()
      drawingState.moveStart = { x, y }
      // Store copies of all selected layers for simultaneous movement
      const selectedMoveLayers = getSelectedLayers().filter(l => l.visible)
      drawingState.moveAllLayersData = selectedMoveLayers.map(l => {
        const c = document.createElement('canvas')
        c.width = totalW()
        c.height = totalH()
        c.getContext('2d').drawImage(l.canvas, 0, 0)
        return { layer: l, canvas: c }
      })
      // Backward compat single-layer reference
      const moveCanvas = document.createElement('canvas')
      moveCanvas.width = totalW()
      moveCanvas.height = totalH()
      moveCanvas.getContext('2d').drawImage(layer.canvas, 0, 0)
      drawingState.moveLayerData = moveCanvas
      break
    }

    case 'select':
      // Select requires visible layer
      if (!layer || !layer.visible) return

      console.log('Select click at:', x, y)
      console.log('Has selection:', !!drawingState.selectRect, 'pixels:', drawingState.selectedPixels.size)

      // Check if clicking inside an existing selection to drag it
      // Do this BEFORE clearing the selection
      if (drawingState.selectRect && drawingState.selectedPixels.size > 0) {
        const rect = drawingState.selectRect
        console.log('Selection rect:', rect)
        const isInside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
        console.log('Click inside selection:', isInside)

        if (isInside) {
          // Start dragging the selection border
          console.log('Starting drag mode')
          drawingState.dragSelection = true
          drawingState.dragStartX = x
          drawingState.dragStartY = y
          drawingState.dragStartRectX = rect.x
          drawingState.dragStartRectY = rect.y
          drawingState.isDrawing = true

          const dragRect = drawingState.selectRect

          // Helper: extract selected pixels from a layer into a canvas
          function extractSelectedPixels(srcCtx) {
            const c = document.createElement('canvas')
            c.width = dragRect.w
            c.height = dragRect.h
            const cCtx = c.getContext('2d')
            cCtx.imageSmoothingEnabled = false
            const imgData = srcCtx.getImageData(dragRect.x, dragRect.y, dragRect.w, dragRect.h)
            const d = imgData.data
            for (let i = 0; i < d.length; i += 4) {
              const pi = i / 4
              const px = dragRect.x + (pi % dragRect.w)
              const py = dragRect.y + Math.floor(pi / dragRect.w)
              if (!drawingState.selectedPixels.has(px + ',' + py)) d[i + 3] = 0
            }
            cCtx.putImageData(imgData, 0, 0)
            return c
          }

          // Capture selected pixels for all selected layers
          const selectedLayers = getSelectedLayers().filter(l => l.visible)
          drawingState.draggedAllLayersData = selectedLayers.map(l => ({
            layer: l,
            canvas: extractSelectedPixels(l.ctx)
          }))

          // Keep single-layer canvas for backward compat (active layer)
          drawingState.draggedPixelsCanvas = drawingState.draggedAllLayersData.find(
            d => d.layer.id === state.activeLayerId
          )?.canvas || extractSelectedPixels(layer.ctx)

          console.log('Drag started on', drawingState.draggedAllLayersData.length, 'layers')
          break
        } else {
          // Click is outside the existing selection - clear it and start new one
          console.log('Click outside selection, clearing')
          drawingState.selectedPixels.clear()
          drawingState.selectRect = null
        }
      }

      // Start a new selection
      console.log('Starting new selection at:', x, y)
      drawingState.selectStart = { x, y }

      // Detect selection mode based on keyboard modifiers
      if (e.ctrlKey && e.altKey) {
        drawingState.selectionMode = 'subtract'
      } else if (e.ctrlKey && e.shiftKey) {
        drawingState.selectionMode = 'add'
      } else {
        // Only clear for replace mode (already cleared above if outside selection)
        drawingState.selectionMode = 'replace'
      }

      drawingState.isDrawing = true
      break

    case 'wand':
      // Wand only requires layer to exist, not visibility
      if (!layer) return

      // Check if clicking inside an existing selection to drag it
      if (drawingState.selectRect && drawingState.selectedPixels.size > 0) {
        const rect = drawingState.selectRect
        const isInside = x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h
          && drawingState.selectedPixels.has(x + ',' + y)

        if (isInside) {
          // Start dragging the selection
          drawingState.dragSelection = true
          drawingState.dragStartX = x
          drawingState.dragStartY = y
          drawingState.dragStartRectX = rect.x
          drawingState.dragStartRectY = rect.y
          drawingState.isDrawing = true

          const dragRect = drawingState.selectRect

          function extractSelectedPixels(srcCtx) {
            const c = document.createElement('canvas')
            c.width = dragRect.w
            c.height = dragRect.h
            const cCtx = c.getContext('2d')
            cCtx.imageSmoothingEnabled = false
            const imgData = srcCtx.getImageData(dragRect.x, dragRect.y, dragRect.w, dragRect.h)
            const d = imgData.data
            for (let i = 0; i < d.length; i += 4) {
              const pi = i / 4
              const px = dragRect.x + (pi % dragRect.w)
              const py = dragRect.y + Math.floor(pi / dragRect.w)
              if (!drawingState.selectedPixels.has(px + ',' + py)) d[i + 3] = 0
            }
            cCtx.putImageData(imgData, 0, 0)
            return c
          }

          const selectedLayers = getSelectedLayers().filter(l => l.visible)
          drawingState.draggedAllLayersData = selectedLayers.map(l => ({
            layer: l,
            canvas: extractSelectedPixels(l.ctx)
          }))
          drawingState.draggedPixelsCanvas = drawingState.draggedAllLayersData.find(
            d => d.layer.id === state.activeLayerId
          )?.canvas || extractSelectedPixels(layer.ctx)
          break
        } else {
          // Click outside selection - clear selection
          saveUndoState()
          drawingState.selectedPixels.clear()
          drawingState.selectRect = null
          stopMarchingAntsAnimation()
          previewCtx.clearRect(0, 0, totalW(), totalH())
          $('#btnCopySelection').style.display = 'none'
          $('#btnPasteSelection').style.display = 'none'
          break
        }
      }

      // Detect selection mode based on keyboard modifiers
      if (e.ctrlKey && e.altKey) {
        drawingState.selectionMode = 'subtract'
      } else if (e.ctrlKey && e.shiftKey) {
        drawingState.selectionMode = 'add'
      } else {
        drawingState.selectionMode = 'replace'
      }

      saveUndoState()
      selectByColor(x, y, layer.ctx)
      break

    case 'text':
      // Text requires visible layer
      if (!layer || !layer.visible) return
      drawingState.textStart = { x, y }
      showTextDialog()
      break

    case 'rig':
      // Rigging doesn't require visible layer - just layer existence
      if (!layer) return
      if (state.rig.rigMode === 'create') {
        const joint = findBoneJointAtPixel(x, y)
        if (joint) {
          const jx = joint.endpoint === 'start' ? joint.bone.x1 : joint.bone.x2
          const jy = joint.endpoint === 'start' ? joint.bone.y1 : joint.bone.y2
          drawingState.rigBoneStart = { x: jx, y: jy }
          drawingState.rigParentBoneId = joint.bone.id
        } else {
          drawingState.rigBoneStart = { x, y }
          drawingState.rigParentBoneId = null
        }
        drawingState.isDrawing = true
      } else if (state.rig.rigMode === 'animate') {
        // Try to grab a joint for dragging
        const joint = findBoneJointAtPixel(x, y)
        if (joint) {
          // On first grab in a deformation session, save the clean base state
          if (!state.rig.basePixels) {
            state.rig.basePixels = layer.ctx.getImageData(0, 0, totalW(), totalH())
            state.rig.baseBones = state.rig.bones.map(b => ({ ...b }))
            state.rig.baseBoneWeights = { ...state.rig.boneWeights }
          }
          // Per-drag snapshots (always from current state for delta calc)
          state.rig.originalBones = state.rig.bones.map(b => ({ ...b }))
          state.rig.originalPixels = layer.ctx.getImageData(0, 0, totalW(), totalH())
          drawingState.rigDragJoint = joint
          drawingState.rigAnimating = true
          drawingState.isDrawing = true
          saveUndoState()
        } else {
          // Try to select a bone
          const bone = findBoneAtPixel(x, y)
          state.rig.selectedBoneId = bone ? bone.id : null
          updateRigPanel()
          renderRigVisualization()
        }
      } else if (state.rig.rigMode === 'paint') {
        // Paint mode: assign pixels to the selected bone
        if (state.rig.selectedBoneId !== null) {
          drawingState.rigPainting = true
          drawingState.isDrawing = true
          paintBoneWeight(x, y, state.rig.selectedBoneId)
          renderRigVisualization()
        } else {
          // If no bone selected, try to select one
          const clickedBone = findBoneAtPixel(x, y)
          state.rig.selectedBoneId = clickedBone ? clickedBone.id : null
          updateRigPanel()
          renderRigVisualization()
        }
      } else {
        // Fallback: select a bone by clicking on canvas
        const clickedBone = findBoneAtPixel(x, y)
        state.rig.selectedBoneId = clickedBone ? clickedBone.id : null
        updateRigPanel()
        renderRigVisualization()
      }
      break

    case 'zoom':
      // Zoom in
      state.zoom = Math.min(5, state.zoom + 0.25)
      updateCanvasDisplay()
      break

    case 'zoom-out':
      // Zoom out
      state.zoom = Math.max(0.25, state.zoom - 0.25)
      updateCanvasDisplay()
      break

    case 'hand':
      drawingState.isPanning = true
      drawingState.panStartX = e.clientX
      drawingState.panStartY = e.clientY
      drawingState.panScrollLeft = canvasContainer.scrollLeft
      drawingState.panScrollTop = canvasContainer.scrollTop
      canvasContainer.style.cursor = 'grabbing'
      canvasWrapper.style.cursor = 'grabbing'
      break

    case 'circle':
      // Circle requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      drawingState.circleStart = { x, y }
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      addToUserPalette(drawingState.paintColor)
      drawingState.isDrawing = true
      break
  }
}

function onCanvasMouseMove(e) {
  if (!state) return

  const { x, y } = getPixelCoords(e)
  coordsDisplay.textContent = `X: ${x - OVERFLOW_MARGIN}, Y: ${y - OVERFLOW_MARGIN}`

  if (state.currentTool === 'hand') {
    if (drawingState.isPanning) {
      const dx = e.clientX - drawingState.panStartX
      const dy = e.clientY - drawingState.panStartY
      canvasContainer.scrollLeft = drawingState.panScrollLeft - dx
      canvasContainer.scrollTop = drawingState.panScrollTop - dy
    }
    return
  }

  if (!drawingState.isDrawing) {
    // Show preview cursor - but skip for tools that handle their own preview
    if (state.currentTool !== 'select' && state.currentTool !== 'rig' && state.currentTool !== 'zoom' && state.currentTool !== 'circle') {
      previewCtx.clearRect(0, 0, totalW(), totalH())
      if (state.currentTool === 'pencil' || state.currentTool === 'eraser') {
        previewCtx.fillStyle =
          state.currentTool === 'eraser'
            ? '#FF0000'
            : state.currentColor === 'transparent'
              ? '#FF00FF'
              : state.currentColor
        previewCtx.fillRect(x, y, 1, 1)
      }
    }

    // For select tool showing preview even without drawing
    if (state.currentTool === 'select' && drawingState.selectStart && !drawingState.isDrawing) {
      const minX = Math.min(drawingState.selectStart.x, x)
      const maxX = Math.max(drawingState.selectStart.x, x)
      const minY = Math.min(drawingState.selectStart.y, y)
      const maxY = Math.max(drawingState.selectStart.y, y)
      previewCtx.clearRect(0, 0, totalW(), totalH())
      previewCtx.strokeStyle = '#FFFF00'
      previewCtx.lineWidth = 1
      previewCtx.setLineDash([1, 1])
      previewCtx.lineDashOffset = 0
      previewCtx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      previewCtx.setLineDash([])
      return
    }
    return
  }

  const layer = getActiveLayer()
  if (!layer) return

  switch (state.currentTool) {
    case 'pencil':
      // If dragging a selection with pencil, move it (same logic as select/wand)
      if (drawingState.dragSelection) {
        const ddx = x - drawingState.dragStartX
        const ddy = y - drawingState.dragStartY
        const newX = drawingState.dragStartRectX + ddx
        const newY = drawingState.dragStartRectY + ddy
        drawingState.selectRect.x = newX
        drawingState.selectRect.y = newY
        previewCtx.clearRect(0, 0, totalW(), totalH())
        if (drawingState.draggedPixelsCanvas) {
          previewCtx.globalAlpha = 0.7
          previewCtx.drawImage(drawingState.draggedPixelsCanvas, newX, newY)
          previewCtx.globalAlpha = 1
        }
        const savedOffset = drawingState.marchingAntsOffset
        drawingState.marchingAntsOffset = 0
        drawMarchingAntsRect(newX, newY, drawingState.selectRect.w, drawingState.selectRect.h, previewCtx)
        drawingState.marchingAntsOffset = savedOffset
        break
      }
      if (drawingState.lastPixelX !== -1) {
        withMirrorLine(drawingState.lastPixelX, drawingState.lastPixelY, x, y, (x0, y0, x1, y1) => {
          if (drawingState.brushSize === 1) {
            drawLine(x0, y0, x1, y1, layer.ctx, false, drawingState.paintColor)
          } else {
            drawBrushLine(x0, y0, x1, y1, drawingState.brushSize, layer.ctx, false, drawingState.paintColor)
          }
        })
      } else {
        withMirror(x, y, (mx, my) => {
          if (drawingState.brushSize === 1) {
            drawPixel(mx, my, layer.ctx, drawingState.paintColor)
          } else {
            drawBrush(mx, my, drawingState.brushSize, layer.ctx, drawingState.paintColor)
          }
        })
      }
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      break

    case 'eraser':
      if (drawingState.lastPixelX !== -1) {
        withMirrorLine(drawingState.lastPixelX, drawingState.lastPixelY, x, y, (x0, y0, x1, y1) => {
          if (drawingState.brushSize === 1) {
            drawLine(x0, y0, x1, y1, layer.ctx, true)
          } else {
            drawBrushLine(x0, y0, x1, y1, drawingState.brushSize, layer.ctx, true)
          }
        })
      } else {
        withMirror(x, y, (mx, my) => {
          if (drawingState.brushSize === 1) {
            erasePixel(mx, my, layer.ctx)
          } else {
            eraseBrush(mx, my, drawingState.brushSize, layer.ctx)
          }
        })
      }
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      break

    case 'line':
      // Preview line
      previewCtx.clearRect(0, 0, totalW(), totalH())
      if (drawingState.lineStart) {
        previewCtx.fillStyle =
          drawingState.paintColor === 'transparent' ? '#FF00FF' : drawingState.paintColor
        drawLineOnCtx(drawingState.lineStart.x, drawingState.lineStart.y, x, y, previewCtx)
      }
      break

    case 'rect':
      previewCtx.clearRect(0, 0, totalW(), totalH())
      if (drawingState.rectStart) {
        previewCtx.fillStyle =
          drawingState.paintColor === 'transparent' ? '#FF00FF' : drawingState.paintColor
        drawRectPreview(drawingState.rectStart.x, drawingState.rectStart.y, x, y, previewCtx)
      }
      break

    case 'move':
      if (drawingState.moveStart) {
        const dx = x - drawingState.moveStart.x
        const dy = y - drawingState.moveStart.y
        if (drawingState.moveAllLayersData && drawingState.moveAllLayersData.length > 0) {
          // Move all selected layers simultaneously
          for (const { layer: l, canvas } of drawingState.moveAllLayersData) {
            l.ctx.clearRect(0, 0, totalW(), totalH())
            l.ctx.drawImage(canvas, dx, dy)
          }
        } else if (drawingState.moveLayerData) {
          layer.ctx.clearRect(0, 0, totalW(), totalH())
          layer.ctx.drawImage(drawingState.moveLayerData, dx, dy)
        }
        compositeAndDisplay()
      }
      break

    case 'circle':
      previewCtx.clearRect(0, 0, totalW(), totalH())
      if (drawingState.circleStart) {
        previewCtx.fillStyle =
          drawingState.paintColor === 'transparent' ? '#FF00FF' : drawingState.paintColor
        drawCirclePreview(drawingState.circleStart.x, drawingState.circleStart.y, x, y, previewCtx)
      }
      break

    case 'select':
    case 'wand':
      if (drawingState.dragSelection) {
        // Handle dragging selection with pixels
        const dx = x - drawingState.dragStartX
        const dy = y - drawingState.dragStartY
        const newX = drawingState.dragStartRectX + dx
        const newY = drawingState.dragStartRectY + dy

        // Update selection rect position
        drawingState.selectRect.x = newX
        drawingState.selectRect.y = newY

        // Update selectedPixels positions for pixel-accurate outline during drag
        if (!drawingState._originalSelectedPixels) {
          drawingState._originalSelectedPixels = new Set(drawingState.selectedPixels)
        }
        drawingState.selectedPixels.clear()
        drawingState._originalSelectedPixels.forEach(key => {
          const [px, py] = key.split(',').map(Number)
          drawingState.selectedPixels.add((px + dx) + ',' + (py + dy))
        })

        // Draw marching ants and dragged pixels on preview
        previewCtx.clearRect(0, 0, totalW(), totalH())
        // Composite all selected layers' dragged pixels
        previewCtx.globalAlpha = 0.7
        if (drawingState.draggedAllLayersData && drawingState.draggedAllLayersData.length > 0) {
          for (const { canvas } of drawingState.draggedAllLayersData) {
            previewCtx.drawImage(canvas, newX, newY)
          }
        } else if (drawingState.draggedPixelsCanvas) {
          previewCtx.drawImage(drawingState.draggedPixelsCanvas, newX, newY)
        }
        previewCtx.globalAlpha = 1
        // Draw pixel-accurate marching ants at new position
        const savedOffset = drawingState.marchingAntsOffset
        drawingState.marchingAntsOffset = 0
        drawMarchingAntsFromPixels(previewCtx)
        drawingState.marchingAntsOffset = savedOffset
      } else if (drawingState.selectStart && !drawingState.pasteMode) {
        const minX = Math.min(drawingState.selectStart.x, x)
        const maxX = Math.max(drawingState.selectStart.x, x)
        const minY = Math.min(drawingState.selectStart.y, y)
        const maxY = Math.max(drawingState.selectStart.y, y)
        drawingState.selectRect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }

        // Draw preview of selection rect
        previewCtx.clearRect(0, 0, totalW(), totalH())
        previewCtx.strokeStyle = '#FFFF00'
        previewCtx.lineWidth = 1
        previewCtx.setLineDash([1, 1])
        previewCtx.lineDashOffset = 0
        previewCtx.strokeRect(minX, minY, maxX - minX, maxY - minY)
        previewCtx.setLineDash([])
      } else if (drawingState.pasteMode && drawingState.clipboardCanvas) {
        // Moving pasted content - show clipboard image following the mouse
        previewCtx.clearRect(0, 0, totalW(), totalH())
        // Draw marching ants around the area to be pasted
        drawMarchingAntsRect(x, y, drawingState.clipboardCanvas.width, drawingState.clipboardCanvas.height, previewCtx)
        // Draw the pasted content semi-transparent
        previewCtx.globalAlpha = 0.8
        previewCtx.drawImage(drawingState.clipboardCanvas, x, y)
        previewCtx.globalAlpha = 1
      }
      break

    case 'text':
      // Text tool doesn't need mouse movement
      break

    case 'rig':
      if (drawingState.isDrawing && drawingState.rigBoneStart) {
        // Creating a new bone - show preview
        renderRigPreview(drawingState.rigBoneStart, { x, y })
      } else if (drawingState.isDrawing && drawingState.rigDragJoint && drawingState.rigAnimating) {
        // Animate mode - rotation only, preserve bone length
        const joint = drawingState.rigDragJoint
        const origBone = state.rig.originalBones.find(b => b.id === joint.bone.id)
        if (origBone) {
          if (joint.endpoint === 'end') {
            // Rotate around start joint, keep original length
            const angle = Math.atan2(y - joint.bone.y1, x - joint.bone.x1)
            joint.bone.x2 = joint.bone.x1 + Math.cos(angle) * origBone.length
            joint.bone.y2 = joint.bone.y1 + Math.sin(angle) * origBone.length
          } else {
            // Moving start joint: shift the whole bone, keep direction & length
            const dx = x - joint.bone.x1
            const dy = y - joint.bone.y1
            joint.bone.x1 = x
            joint.bone.y1 = y
            joint.bone.x2 += dx
            joint.bone.y2 += dy
          }
          // Propagate transform to children so chain follows the parent
          propagateChildBones(joint.bone.id)
        }
        // Apply pixel deformation for all bones that changed
        applyRigDeformation()
        renderRigVisualization()
      } else if (drawingState.isDrawing && drawingState.rigPainting) {
        // Paint mode - assign pixels to selected bone while dragging
        paintBoneWeight(x, y, state.rig.selectedBoneId)
        renderRigVisualization()
      } else {
        renderRigVisualization()
      }
      break
  }
}

function onCanvasMouseUp(e) {
  if (!drawingState.isDrawing) return

  const layer = getActiveLayer()

  if (state.currentTool === 'line' && drawingState.lineStart) {
    const { x, y } = getPixelCoords(e)
    withMirrorLine(drawingState.lineStart.x, drawingState.lineStart.y, x, y, (x0, y0, x1, y1) => {
      drawLine(x0, y0, x1, y1, layer.ctx, false, drawingState.paintColor)
    })
    drawingState.lineStart = null
    previewCtx.clearRect(0, 0, totalW(), totalH())
    compositeAndDisplay()
  }

  if (state.currentTool === 'rect' && drawingState.rectStart) {
    const { x, y } = getPixelCoords(e)
    withMirrorLine(drawingState.rectStart.x, drawingState.rectStart.y, x, y, (x0, y0, x1, y1) => {
      drawRectOutline(x0, y0, x1, y1, layer.ctx, drawingState.paintColor)
    })
    drawingState.rectStart = null
    previewCtx.clearRect(0, 0, totalW(), totalH())
    compositeAndDisplay()
  }

  if (state.currentTool === 'circle' && drawingState.circleStart) {
    const { x, y } = getPixelCoords(e)
    withMirrorLine(drawingState.circleStart.x, drawingState.circleStart.y, x, y, (x0, y0, x1, y1) => {
      drawCircleOutline(x0, y0, x1, y1, layer.ctx, drawingState.paintColor)
    })
    drawingState.circleStart = null
    previewCtx.clearRect(0, 0, totalW(), totalH())
    compositeAndDisplay()
  }

  if ((state.currentTool === 'select' || state.currentTool === 'wand' || state.currentTool === 'pencil') && drawingState.dragSelection) {
    // Finalize dragging selection - apply pixel changes
    const dx = drawingState.selectRect.x - drawingState.dragStartRectX
    const dy = drawingState.selectRect.y - drawingState.dragStartRectY

    const hasData = drawingState.draggedAllLayersData
      ? drawingState.draggedAllLayersData.length > 0
      : !!drawingState.draggedPixelsCanvas

    if ((dx !== 0 || dy !== 0) && hasData) {
      saveUndoState()

      const oldRect = {
        x: drawingState.dragStartRectX,
        y: drawingState.dragStartRectY,
        w: drawingState.selectRect.w,
        h: drawingState.selectRect.h
      }

      // Determine which layers to operate on
      const layersToMove = drawingState.draggedAllLayersData
        ? drawingState.draggedAllLayersData
        : [{ layer: getActiveLayer(), canvas: drawingState.draggedPixelsCanvas }]

      // Use original pixel positions for clearing old data
      const origPixels = drawingState._originalSelectedPixels || drawingState.selectedPixels

      for (const { layer: l, canvas } of layersToMove) {
        if (!l) continue
        // Clear selected pixels at old position
        const oldImageData = l.ctx.getImageData(oldRect.x, oldRect.y, oldRect.w, oldRect.h)
        const oldData = oldImageData.data
        for (let i = 0; i < oldData.length; i += 4) {
          const pi = i / 4
          const px = oldRect.x + (pi % oldRect.w)
          const py = oldRect.y + Math.floor(pi / oldRect.w)
          if (origPixels.has(px + ',' + py)) oldData[i + 3] = 0
        }
        l.ctx.putImageData(oldImageData, oldRect.x, oldRect.y)
        // Draw at new position
        l.ctx.drawImage(canvas, drawingState.selectRect.x, drawingState.selectRect.y)
      }

      compositeAndDisplay()
    }

    // Clear drag state
    drawingState.dragSelection = false
    drawingState.draggedPixelsCanvas = null
    drawingState.draggedAllLayersData = null
    drawingState._originalSelectedPixels = null
    previewCtx.clearRect(0, 0, totalW(), totalH())
    startMarchingAntsAnimation()
    drawingState.isDrawing = false
    return
  }

  if (state.currentTool === 'select' && drawingState.selectRect && !drawingState.pasteMode) {
    // Finalize rectangular selection with mode logic (select tool only)
    saveUndoState()
    const rect = drawingState.selectRect

    switch (drawingState.selectionMode) {
      case 'replace':
        drawingState.selectedPixels.clear()
        // Fall through to add logic

      case 'add':
        // Union: add pixels from new rect
        for (let px = rect.x; px < rect.x + rect.w && px < totalW(); px++) {
          for (let py = rect.y; py < rect.y + rect.h && py < totalH(); py++) {
            drawingState.selectedPixels.add(px + ',' + py)
          }
        }
        break

      case 'subtract':
        // Difference: remove pixels from rect
        for (let px = rect.x; px < rect.x + rect.w && px < totalW(); px++) {
          for (let py = rect.y; py < rect.y + rect.h && py < totalH(); py++) {
            drawingState.selectedPixels.delete(px + ',' + py)
          }
        }
        break
    }

    startMarchingAntsAnimation()
    previewCtx.clearRect(0, 0, totalW(), totalH())
    $('#btnCopySelection').style.display = 'block'
  } else if (state.currentTool === 'wand' && drawingState.selectedPixels.size > 0 && !drawingState.pasteMode) {
    // Wand selection was already computed in mousedown via selectByColor
    startMarchingAntsAnimation()
    previewCtx.clearRect(0, 0, totalW(), totalH())
    $('#btnCopySelection').style.display = 'block'
  } else if ((state.currentTool === 'select' || state.currentTool === 'wand') && drawingState.pasteMode && drawingState.clipboardCanvas) {
    // Finalize paste position - place clipboard at current mouse position
    const { x, y } = getPixelCoords(e)
    saveUndoState()
    layer.ctx.drawImage(drawingState.clipboardCanvas, x, y)
    compositeAndDisplay()
    stopMarchingAntsAnimation()
    previewCtx.clearRect(0, 0, totalW(), totalH())
    drawingState.pasteMode = false
    drawingState.selectedPixels.clear()
    $('#btnCopySelection').style.display = 'none'
    $('#btnPasteSelection').style.display = 'none'
  }

  if (state.currentTool === 'rig' && drawingState.rigBoneStart) {
    const { x, y } = getPixelCoords(e)
    const endJoint = findBoneJointAtPixel(x, y)
    const endX = endJoint ? (endJoint.endpoint === 'start' ? endJoint.bone.x1 : endJoint.bone.x2) : x
    const endY = endJoint ? (endJoint.endpoint === 'start' ? endJoint.bone.y1 : endJoint.bone.y2) : y
    const parentId = drawingState.rigParentBoneId
    addBone(drawingState.rigBoneStart.x, drawingState.rigBoneStart.y, endX, endY, parentId)
    drawingState.rigBoneStart = null
    drawingState.rigParentBoneId = null
    renderRigVisualization()
  }

  if (state.currentTool === 'rig' && drawingState.rigDragJoint) {
    // Finalize animate deformation - update bone weights to new pixel positions
    updateBoneWeightsAfterDeformation()
    drawingState.rigDragJoint = null
    drawingState.rigAnimating = false
    state.rig.originalBones = null
    state.rig.originalPixels = null
    // Keep baseBones/basePixels/baseBoneWeights alive for next grab
    compositeAndDisplay()
    renderRigVisualization()
  }

  if (state.currentTool === 'rig' && drawingState.rigPainting) {
    drawingState.rigPainting = false
  }

  if (state.currentTool === 'hand' && drawingState.isPanning) {
    drawingState.isPanning = false
    canvasContainer.style.cursor = 'grab'
    canvasWrapper.style.cursor = 'grab'
  }

  drawingState.isDrawing = false
  drawingState.lastPixelX = -1
  drawingState.lastPixelY = -1
  drawingState.moveStart = null
  drawingState.moveLayerData = null
  drawingState.moveAllLayersData = null
  drawingState.draggedAllLayersData = null
  drawingState.selectStart = null
  drawingState.dragSelection = false
  drawingState.paintColor = null
}

// Helper for line preview
function drawLineOnCtx(x0, y0, x1, y1, targetCtx) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  while (true) {
    targetCtx.fillRect(x0, y0, 1, 1)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x0 += sx
    }
    if (e2 < dx) {
      err += dx
      y0 += sy
    }
  }
}

function drawRectPreview(x0, y0, x1, y1, targetCtx) {
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)

  for (let x = minX; x <= maxX; x++) {
    targetCtx.fillRect(x, minY, 1, 1)
    targetCtx.fillRect(x, maxY, 1, 1)
  }
  for (let y = minY + 1; y < maxY; y++) {
    targetCtx.fillRect(minX, y, 1, 1)
    targetCtx.fillRect(maxX, y, 1, 1)
  }
}

function drawCircleOutline(x0, y0, x1, y1, layerCtx, color = null) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const radius = Math.sqrt(dx * dx + dy * dy)
  const centerX = x0
  const centerY = y0

  // Use provided color or fall back to state.currentColor
  const useColor = color || state.currentColor

  // Midpoint circle algorithm
  let x = 0
  let y = Math.round(radius)
  let d = 3 - 2 * Math.round(radius)

  while (x <= y) {
    drawPixel(centerX + x, centerY + y, layerCtx, useColor)
    drawPixel(centerX - x, centerY + y, layerCtx, useColor)
    drawPixel(centerX + x, centerY - y, layerCtx, useColor)
    drawPixel(centerX - x, centerY - y, layerCtx, useColor)
    drawPixel(centerX + y, centerY + x, layerCtx, useColor)
    drawPixel(centerX - y, centerY + x, layerCtx, useColor)
    drawPixel(centerX + y, centerY - x, layerCtx, useColor)
    drawPixel(centerX - y, centerY - x, layerCtx, useColor)

    if (d < 0) {
      d = d + 4 * x + 6
    } else {
      d = d + 4 * (x - y) + 10
      y--
    }
    x++
  }
}

function drawCirclePreview(x0, y0, x1, y1, targetCtx, color = null) {
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const radius = Math.sqrt(dx * dx + dy * dy)
  const centerX = x0
  const centerY = y0

  // Save and apply color if provided
  const savedFillStyle = targetCtx.fillStyle
  if (color) targetCtx.fillStyle = color

  // Midpoint circle algorithm
  let x = 0
  let y = Math.round(radius)
  let d = 3 - 2 * Math.round(radius)

  while (x <= y) {
    targetCtx.fillRect(centerX + x, centerY + y, 1, 1)
    targetCtx.fillRect(centerX - x, centerY + y, 1, 1)
    targetCtx.fillRect(centerX + x, centerY - y, 1, 1)
    targetCtx.fillRect(centerX - x, centerY - y, 1, 1)
    targetCtx.fillRect(centerX + y, centerY + x, 1, 1)
    targetCtx.fillRect(centerX - y, centerY + x, 1, 1)
    targetCtx.fillRect(centerX + y, centerY - x, 1, 1)
    targetCtx.fillRect(centerX - y, centerY - x, 1, 1)

    if (d < 0) {
      d = d + 4 * x + 6
    } else {
      d = d + 4 * (x - y) + 10
      y--
    }
    x++
  }

  // Restore original fillStyle
  targetCtx.fillStyle = savedFillStyle
}

// ==========================================
// RIGGING / SKELETAL ANIMATION
// ==========================================

// Convert pixel coords to display coords for rigOverlay
function pixelToDisplay(px, py) {
  const displayW = rigOverlay.width
  const displayH = rigOverlay.height
  return {
    x: (px / totalW()) * displayW,
    y: (py / totalH()) * displayH
  }
}

// Paint bone weight: assign a pixel (and surrounding area) to a bone
function paintBoneWeight(px, py, boneId) {
  const radius = Math.max(1, Math.floor(drawingState.brushSize / 2))
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const nx = px + dx
      const ny = py + dy
      if (nx >= 0 && nx < totalW() && ny >= 0 && ny < totalH()) {
        if (dx * dx + dy * dy <= radius * radius) {
          state.rig.boneWeights[nx + ',' + ny] = boneId
        }
      }
    }
  }
}

// Apply rig deformation: transform pixels based on bone movements.
// Uses a combined forward + inverse mapping strategy:
//  - Forward pass places every source pixel at its destination (no gaps in coverage)
//  - Inverse pass fills any remaining empty pixels (no gaps from rounding)
// Then a connectivity-aware cleanup removes pixel-doubling artifacts
// that break 1px line art.
function applyRigDeformation() {
  if (!state.rig.originalBones || !state.rig.originalPixels) return
  const layer = getActiveLayer()
  if (!layer) return

  const w = totalW()
  const h = totalH()

  // Always transform from the CLEAN base if available, so repeated
  // grab-drag-release cycles don't accumulate rounding errors.
  const useBase = !!state.rig.basePixels
  const srcPixels = useBase ? state.rig.basePixels : state.rig.originalPixels
  const srcBones  = useBase ? state.rig.baseBones  : state.rig.originalBones
  const srcWeights = useBase ? state.rig.baseBoneWeights : state.rig.boneWeights

  const origData = srcPixels.data
  const newImageData = layer.ctx.createImageData(w, h)
  const newData = newImageData.data

  // Copy all non-weighted pixels as-is
  for (let i = 0; i < origData.length; i++) {
    newData[i] = origData[i]
  }

  // Build per-bone transforms from the BASE bone positions to CURRENT positions
  const boneTransforms = []
  state.rig.bones.forEach((bone) => {
    const baseBone = srcBones.find(b => b.id === bone.id)
    if (!baseBone) return

    const baseAngle = Math.atan2(baseBone.y2 - baseBone.y1, baseBone.x2 - baseBone.x1)
    const curAngle = Math.atan2(bone.y2 - bone.y1, bone.x2 - bone.x1)
    const deltaAngle = curAngle - baseAngle

    const translateX = bone.x1 - baseBone.x1
    const translateY = bone.y1 - baseBone.y1

    const pivotX = baseBone.x1 + 0.5
    const pivotY = baseBone.y1 + 0.5

    const cosF = Math.cos(deltaAngle)
    const sinF = Math.sin(deltaAngle)
    const cosInv = Math.cos(-deltaAngle)
    const sinInv = Math.sin(-deltaAngle)

    boneTransforms.push({
      boneId: bone.id, deltaAngle,
      translateX, translateY,
      pivotX, pivotY,
      cosF, sinF, cosInv, sinInv
    })
  })

  // Collect weighted pixels (from base weights) and clear them from the base
  const weightedPixels = {} // boneId -> [{x,y}]
  const boneBounds = {}     // boneId -> destination bounding box
  for (const key in srcWeights) {
    const boneId = srcWeights[key]
    const t = boneTransforms.find(bt => bt.boneId === boneId)
    if (!t) continue
    const [px, py] = key.split(',').map(Number)
    if (px < 0 || px >= w || py < 0 || py >= h) continue

    if (!weightedPixels[boneId]) weightedPixels[boneId] = []
    weightedPixels[boneId].push({ x: px, y: py })

    // Clear from base
    const idx = (py * w + px) * 4
    newData[idx] = 0; newData[idx + 1] = 0
    newData[idx + 2] = 0; newData[idx + 3] = 0
  }

  // Track which destination pixels were written by bones (for cleanup)
  const boneWritten = new Uint8Array(w * h)

  boneTransforms.forEach((t) => {
    const pixels = weightedPixels[t.boneId]
    if (!pixels || pixels.length === 0) return

    // ---- PASS 1: Forward mapping (source → dest) ----
    // Guarantees every source pixel appears at least once in output
    for (const { x: px, y: py } of pixels) {
      const si = (py * w + px) * 4
      if (origData[si + 3] === 0) continue

      const relX = (px + 0.5) - t.pivotX
      const relY = (py + 0.5) - t.pivotY
      const dstX = Math.floor(relX * t.cosF - relY * t.sinF + t.pivotX + t.translateX)
      const dstY = Math.floor(relX * t.sinF + relY * t.cosF + t.pivotY + t.translateY)

      if (dstX < 0 || dstX >= w || dstY < 0 || dstY >= h) continue
      const di = (dstY * w + dstX) * 4
      // Only write if destination is empty (don't overwrite other bone data)
      if (newData[di + 3] === 0) {
        newData[di] = origData[si]
        newData[di + 1] = origData[si + 1]
        newData[di + 2] = origData[si + 2]
        newData[di + 3] = origData[si + 3]
        boneWritten[dstY * w + dstX] = 1
      }
    }

    // ---- PASS 2: Inverse mapping (dest → source) ----
    // Fills gaps the forward pass missed due to rounding
    // Compute destination bounds from forward-mapped pixels
    let dMinX = w, dMinY = h, dMaxX = 0, dMaxY = 0
    for (const { x: px, y: py } of pixels) {
      const relX = (px + 0.5) - t.pivotX
      const relY = (py + 0.5) - t.pivotY
      const dstX = Math.floor(relX * t.cosF - relY * t.sinF + t.pivotX + t.translateX)
      const dstY = Math.floor(relX * t.sinF + relY * t.cosF + t.pivotY + t.translateY)
      if (dstX < dMinX) dMinX = dstX
      if (dstY < dMinY) dMinY = dstY
      if (dstX > dMaxX) dMaxX = dstX
      if (dstY > dMaxY) dMaxY = dstY
    }
    const startX = Math.max(0, dMinX - 1)
    const endX = Math.min(w - 1, dMaxX + 1)
    const startY = Math.max(0, dMinY - 1)
    const endY = Math.min(h - 1, dMaxY + 1)

    for (let dy = startY; dy <= endY; dy++) {
      for (let dx = startX; dx <= endX; dx++) {
        const di = (dy * w + dx) * 4
        // Only fill if pixel is still empty
        if (newData[di + 3] !== 0) continue

        // Inverse transform: destination → original source
        const relX = (dx + 0.5) - t.pivotX - t.translateX
        const relY = (dy + 0.5) - t.pivotY - t.translateY
        const srcFX = relX * t.cosInv - relY * t.sinInv + t.pivotX
        const srcFY = relX * t.sinInv + relY * t.cosInv + t.pivotY
        const srcX = Math.floor(srcFX)
        const srcY = Math.floor(srcFY)

        if (srcX < 0 || srcX >= w || srcY < 0 || srcY >= h) continue
        if (srcWeights[srcX + ',' + srcY] !== t.boneId) continue

        const si = (srcY * w + srcX) * 4
        if (origData[si + 3] === 0) continue

        newData[di] = origData[si]
        newData[di + 1] = origData[si + 1]
        newData[di + 2] = origData[si + 2]
        newData[di + 3] = origData[si + 3]
        boneWritten[dy * w + dx] = 1
      }
    }
  })

  // ---- PASS 3: Pixel-art cleanup ----
  // Remove "staircase doubles": when rotation creates 2×1 or 1×2 blocks
  // where the original had only 1px lines. We detect isolated doubled
  // outline pixels and thin them. Only acts on dark outline pixels that
  // form a 2-wide band between two empty regions (actual line doubling).
  const cleaned = new Uint8ClampedArray(newData)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!boneWritten[y * w + x]) continue
      const ci = (y * w + x) * 4
      if (cleaned[ci + 3] === 0) continue

      // Only clean dark pixels (outlines), skip fills
      const brightness = cleaned[ci] + cleaned[ci + 1] + cleaned[ci + 2]
      if (brightness > 200) continue  // Not an outline pixel

      // Count same-color orthogonal neighbors
      const up    = ((y - 1) * w + x) * 4
      const down  = ((y + 1) * w + x) * 4
      const left  = (y * w + (x - 1)) * 4
      const right = (y * w + (x + 1)) * 4

      const isSimColor = (ni) =>
        cleaned[ni + 3] > 0 &&
        Math.abs(cleaned[ni] - cleaned[ci]) < 30 &&
        Math.abs(cleaned[ni + 1] - cleaned[ci + 1]) < 30 &&
        Math.abs(cleaned[ni + 2] - cleaned[ci + 2]) < 30

      const hasUp = isSimColor(up)
      const hasDown = isSimColor(down)
      const hasLeft = isSimColor(left)
      const hasRight = isSimColor(right)

      // Only remove if this pixel is part of a 2-wide line doubling:
      // it has a same-color neighbor on one axis AND empty on both sides
      // of the perpendicular axis (meaning it's a doubled outline, not fill)
      const horizontalPair = (hasLeft || hasRight) && cleaned[up + 3] === 0 && cleaned[down + 3] === 0
      const verticalPair   = (hasUp || hasDown) && cleaned[left + 3] === 0 && cleaned[right + 3] === 0

      if (horizontalPair || verticalPair) {
        newData[ci] = 0; newData[ci + 1] = 0
        newData[ci + 2] = 0; newData[ci + 3] = 0
      }
    }
  }

  layer.ctx.putImageData(newImageData, 0, 0)
  compositeAndDisplay()
}

// After deformation, remap boneWeights using the same inverse-mapping logic
// as the deformation itself (nearest-neighbor, bone ownership check). This
// preserves mask coverage and avoids leaving pixels behind on next moves.
function updateBoneWeightsAfterDeformation() {
  if (!state.rig.originalBones) return
  const w = totalW()
  const h = totalH()
  const newWeights = {}

  // Use base weights/bones when available for accuracy across multiple drags
  const refBones = state.rig.baseBones || state.rig.originalBones
  const refWeights = state.rig.baseBoneWeights || state.rig.boneWeights

  // Build inverse transforms (current -> original)
  const boneTransforms = []
  state.rig.bones.forEach((bone) => {
    const origBone = refBones.find(b => b.id === bone.id)
    if (!origBone) return

    const origAngle = Math.atan2(origBone.y2 - origBone.y1, origBone.x2 - origBone.x1)
    const newAngle = Math.atan2(bone.y2 - bone.y1, bone.x2 - bone.x1)
    const deltaAngle = newAngle - origAngle

    const translateX = bone.x1 - origBone.x1
    const translateY = bone.y1 - origBone.y1

    const pivotX = origBone.x1 + 0.5
    const pivotY = origBone.y1 + 0.5

    const cosInv = Math.cos(-deltaAngle)
    const sinInv = Math.sin(-deltaAngle)

    boneTransforms.push({
      boneId: bone.id,
      translateX, translateY,
      pivotX, pivotY,
      cosInv, sinInv
    })
  })

  // Bounding boxes for destination pixels per bone (using forward approx)
  const boneBounds = {}
  for (const key in refWeights) {
    const boneId = refWeights[key]
    const t = boneTransforms.find(bt => bt.boneId === boneId)
    if (!t) continue
    const [px, py] = key.split(',').map(Number)
    if (px < 0 || px >= w || py < 0 || py >= h) continue

    const cosF = t.cosInv
    const sinF = -t.sinInv
    const relX = (px + 0.5) - t.pivotX
    const relY = (py + 0.5) - t.pivotY
    const dstX = Math.round(relX * cosF - relY * sinF + t.pivotX + t.translateX - 0.5)
    const dstY = Math.round(relX * sinF + relY * cosF + t.pivotY + t.translateY - 0.5)

    if (!boneBounds[boneId]) {
      boneBounds[boneId] = { minX: dstX, minY: dstY, maxX: dstX, maxY: dstY }
    } else {
      const bb = boneBounds[boneId]
      if (dstX < bb.minX) bb.minX = dstX
      if (dstY < bb.minY) bb.minY = dstY
      if (dstX > bb.maxX) bb.maxX = dstX
      if (dstY > bb.maxY) bb.maxY = dstY
    }
  }

  // Inverse map to fill newWeights at destination
  boneTransforms.forEach((t) => {
    const bb = boneBounds[t.boneId]
    if (!bb) return

    const startX = Math.max(0, bb.minX - 1)
    const endX = Math.min(w - 1, bb.maxX + 1)
    const startY = Math.max(0, bb.minY - 1)
    const endY = Math.min(h - 1, bb.maxY + 1)

    for (let dy = startY; dy <= endY; dy++) {
      for (let dx = startX; dx <= endX; dx++) {
        const relX = (dx + 0.5) - t.pivotX - t.translateX
        const relY = (dy + 0.5) - t.pivotY - t.translateY
        const srcFX = relX * t.cosInv - relY * t.sinInv + t.pivotX
        const srcFY = relX * t.sinInv + relY * t.cosInv + t.pivotY

        const srcX = Math.round(srcFX - 0.5)
        const srcY = Math.round(srcFY - 0.5)

        if (srcX < 0 || srcX >= w || srcY < 0 || srcY >= h) continue
        if (refWeights[srcX + ',' + srcY] !== t.boneId) continue

        newWeights[dx + ',' + dy] = t.boneId
      }
    }
  })

  state.rig.boneWeights = newWeights
}

// Auto-assign bone weights: for each non-transparent pixel, assign it to the nearest bone
function autoAssignBoneWeights() {
  if (!state || state.rig.bones.length === 0) return
  const layer = getActiveLayer()
  if (!layer) return

  const w = totalW()
  const h = totalH()
  const imgData = layer.ctx.getImageData(0, 0, w, h)
  const data = imgData.data

  state.rig.boneWeights = {}

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4
      // Skip transparent pixels
      if (data[idx + 3] === 0) continue

      // Find nearest bone (distance from pixel center to bone line segment)
      let nearestBoneId = null
      let nearestDist = Infinity

      state.rig.bones.forEach((bone) => {
        const dx = bone.x2 - bone.x1
        const dy = bone.y2 - bone.y1
        const lenSq = dx * dx + dy * dy
        if (lenSq === 0) return

        let t = ((px - bone.x1) * dx + (py - bone.y1) * dy) / lenSq
        t = Math.max(0, Math.min(1, t))
        const projX = bone.x1 + t * dx
        const projY = bone.y1 + t * dy
        const dist = Math.hypot(px - projX, py - projY)

        if (dist < nearestDist) {
          nearestDist = dist
          nearestBoneId = bone.id
        }
      })

      if (nearestBoneId !== null) {
        state.rig.boneWeights[px + ',' + py] = nearestBoneId
      }
    }
  }
}

function addBone(x1, y1, x2, y2, parentId) {
  const length = Math.hypot(x2 - x1, y2 - y1)

  // Validate bone length - prevent zero-length bones
  if (length < 1) {
    console.warn('Bone length too small, ignoring')
    return
  }

  const boneId = state.rig.bones.length
  const bone = {
    id: boneId,
    parentId: parentId,
    name: `Bone ${boneId + 1}`,
    x1, y1, x2, y2,
    angle: 0,
    length: length
  }
  state.rig.bones.push(bone)
  state.rig.boneColors[boneId] = getRandomBoneColor()
  updateRigPanel()
  renderRigVisualization()
}

function findBoneAtPixel(px, py) {
  // Find the closest bone to a pixel coordinate (for selection)
  const threshold = 1.5 // pixels distance threshold
  let closestBone = null
  let closestDist = Infinity

  state.rig.bones.forEach((bone) => {
    // Distance from point to line segment
    const dx = bone.x2 - bone.x1
    const dy = bone.y2 - bone.y1
    const lenSq = dx * dx + dy * dy
    if (lenSq === 0) return

    let t = ((px - bone.x1) * dx + (py - bone.y1) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const projX = bone.x1 + t * dx
    const projY = bone.y1 + t * dy
    const dist = Math.hypot(px - projX, py - projY)

    if (dist < threshold && dist < closestDist) {
      closestDist = dist
      closestBone = bone
    }
  })

  return closestBone
}

function findBoneJointAtPixel(px, py) {
  // Find if clicking near a bone joint (endpoint) for dragging in animate mode
  const threshold = 1.5
  let closestJoint = null
  let closestDist = Infinity

  state.rig.bones.forEach((bone) => {
    // Check start joint
    const d1 = Math.hypot(px - bone.x1, py - bone.y1)
    if (d1 < threshold && d1 < closestDist) {
      closestDist = d1
      closestJoint = { bone, endpoint: 'start' }
    }
    // Check end joint
    const d2 = Math.hypot(px - bone.x2, py - bone.y2)
    if (d2 < threshold && d2 < closestDist) {
      closestDist = d2
      closestJoint = { bone, endpoint: 'end' }
    }
  })

  return closestJoint
}

// Forward transform helper (rotate around pivot, then translate)
function transformPoint(px, py, pivotX, pivotY, cosA, sinA, translateX, translateY) {
  const relX = (px + 0.5) - pivotX
  const relY = (py + 0.5) - pivotY
  const rotX = relX * cosA - relY * sinA
  const rotY = relX * sinA + relY * cosA
  const nx = Math.round(rotX + pivotX + translateX - 0.5)
  const ny = Math.round(rotY + pivotY + translateY - 0.5)
  return { x: nx, y: ny }
}

// Propagate a moved bone's transform to all its descendants (chain effect)
function propagateChildBones(parentId) {
  const origParent = state.rig.originalBones ? state.rig.originalBones.find(b => b.id === parentId) : null
  const parent = state.rig.bones.find(b => b.id === parentId)
  if (!origParent || !parent) return

  const origAngle = Math.atan2(origParent.y2 - origParent.y1, origParent.x2 - origParent.x1)
  const newAngle = Math.atan2(parent.y2 - parent.y1, parent.x2 - parent.x1)
  const deltaAngle = newAngle - origAngle
  const translateX = parent.x1 - origParent.x1
  const translateY = parent.y1 - origParent.y1
  const pivotX = origParent.x1 + 0.5
  const pivotY = origParent.y1 + 0.5
  const cosA = Math.cos(deltaAngle)
  const sinA = Math.sin(deltaAngle)

  // Apply parent transform to each child, then recurse
  state.rig.bones.forEach((child) => {
    if (child.parentId !== parentId) return
    const origChild = state.rig.originalBones.find(b => b.id === child.id)
    if (!origChild) return

    const p1 = transformPoint(origChild.x1, origChild.y1, pivotX, pivotY, cosA, sinA, translateX, translateY)
    const p2 = transformPoint(origChild.x2, origChild.y2, pivotX, pivotY, cosA, sinA, translateX, translateY)

    child.x1 = p1.x
    child.y1 = p1.y
    child.x2 = p2.x
    child.y2 = p2.y
    child.length = Math.hypot(child.x2 - child.x1, child.y2 - child.y1)

    propagateChildBones(child.id)
  })
}

function renderRigVisualization() {
  if (!state || !state.rig) return
  const dw = rigOverlay.width
  const dh = rigOverlay.height
  if (dw === 0 || dh === 0) return

  rigCtx.clearRect(0, 0, dw, dh)

  // Only draw if rig tool is active
  if (state.currentTool !== 'rig') return

  const cellW = dw / totalW()
  const cellH = dh / totalH()
  const jointRadius = Math.max(4, cellW * 0.35)
  const lineWidth = Math.max(2, cellW * 0.15)

  // Draw bone weight overlay (paint mode or always show subtle)
  if (state.rig.rigMode === 'paint' && Object.keys(state.rig.boneWeights).length > 0) {
    rigCtx.globalAlpha = 0.35
    for (const key in state.rig.boneWeights) {
      const boneId = state.rig.boneWeights[key]
      const color = state.rig.boneColors[boneId]
      if (!color) continue
      const [px, py] = key.split(',').map(Number)
      rigCtx.fillStyle = color
      rigCtx.fillRect(px * cellW, py * cellH, cellW, cellH)
    }
    rigCtx.globalAlpha = 1.0
  }

  // Draw all bones
  state.rig.bones.forEach((bone) => {
    const isSelected = state.rig.selectedBoneId === bone.id
    const color = state.rig.boneColors[bone.id] || '#4ecdc4'

    // Convert to display coords (center of pixel)
    const p1 = pixelToDisplay(bone.x1 + 0.5, bone.y1 + 0.5)
    const p2 = pixelToDisplay(bone.x2 + 0.5, bone.y2 + 0.5)

    // Draw bone line - outer glow for selected
    if (isSelected) {
      rigCtx.strokeStyle = '#ffffff'
      rigCtx.lineWidth = lineWidth + 4
      rigCtx.beginPath()
      rigCtx.moveTo(p1.x, p1.y)
      rigCtx.lineTo(p2.x, p2.y)
      rigCtx.stroke()
    }

    // Draw bone line
    rigCtx.strokeStyle = color
    rigCtx.lineWidth = lineWidth
    rigCtx.lineCap = 'round'
    rigCtx.beginPath()
    rigCtx.moveTo(p1.x, p1.y)
    rigCtx.lineTo(p2.x, p2.y)
    rigCtx.stroke()

    // Draw direction arrow (small triangle at 2/3 along bone)
    const mx = p1.x + (p2.x - p1.x) * 0.65
    const my = p1.y + (p2.y - p1.y) * 0.65
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    const arrowSize = jointRadius * 0.6
    rigCtx.fillStyle = color
    rigCtx.beginPath()
    rigCtx.moveTo(mx + Math.cos(angle) * arrowSize, my + Math.sin(angle) * arrowSize)
    rigCtx.lineTo(mx + Math.cos(angle + 2.5) * arrowSize, my + Math.sin(angle + 2.5) * arrowSize)
    rigCtx.lineTo(mx + Math.cos(angle - 2.5) * arrowSize, my + Math.sin(angle - 2.5) * arrowSize)
    rigCtx.closePath()
    rigCtx.fill()

    // Draw joints (circles at endpoints)
    // Start joint
    rigCtx.fillStyle = isSelected ? '#ffffff' : color
    rigCtx.strokeStyle = '#000000'
    rigCtx.lineWidth = 1.5
    rigCtx.beginPath()
    rigCtx.arc(p1.x, p1.y, jointRadius, 0, Math.PI * 2)
    rigCtx.fill()
    rigCtx.stroke()

    // End joint
    rigCtx.fillStyle = isSelected ? '#ffffff' : color
    rigCtx.beginPath()
    rigCtx.arc(p2.x, p2.y, jointRadius * 0.7, 0, Math.PI * 2)
    rigCtx.fill()
    rigCtx.stroke()

    // Draw bone name near midpoint
    const labelX = (p1.x + p2.x) / 2
    const labelY = (p1.y + p2.y) / 2 - jointRadius - 4
    rigCtx.font = `${Math.max(10, cellW * 0.3)}px Inter, sans-serif`
    rigCtx.fillStyle = '#ffffff'
    rigCtx.strokeStyle = '#000000'
    rigCtx.lineWidth = 2
    rigCtx.textAlign = 'center'
    rigCtx.strokeText(bone.name, labelX, labelY)
    rigCtx.fillText(bone.name, labelX, labelY)
  })
}

function renderRigPreview(start, end) {
  renderRigVisualization()
  if (start && end) {
    const p1 = pixelToDisplay(start.x + 0.5, start.y + 0.5)
    const p2 = pixelToDisplay(end.x + 0.5, end.y + 0.5)
    const dw = rigOverlay.width
    const cellW = dw / totalW()
    const lineWidth = Math.max(2, cellW * 0.15)

    // White outer
    rigCtx.strokeStyle = '#ffffff'
    rigCtx.lineWidth = lineWidth + 2
    rigCtx.lineCap = 'round'
    rigCtx.beginPath()
    rigCtx.moveTo(p1.x, p1.y)
    rigCtx.lineTo(p2.x, p2.y)
    rigCtx.stroke()

    // Yellow inner
    rigCtx.strokeStyle = '#FFFF00'
    rigCtx.lineWidth = lineWidth
    rigCtx.beginPath()
    rigCtx.moveTo(p1.x, p1.y)
    rigCtx.lineTo(p2.x, p2.y)
    rigCtx.stroke()

    // Joint indicators
    const jointRadius = Math.max(4, cellW * 0.35)
    rigCtx.fillStyle = '#FFFF00'
    rigCtx.strokeStyle = '#000000'
    rigCtx.lineWidth = 1.5
    rigCtx.beginPath()
    rigCtx.arc(p1.x, p1.y, jointRadius, 0, Math.PI * 2)
    rigCtx.fill()
    rigCtx.stroke()
    rigCtx.beginPath()
    rigCtx.arc(p2.x, p2.y, jointRadius * 0.7, 0, Math.PI * 2)
    rigCtx.fill()
    rigCtx.stroke()
  }
}

function getRandomBoneColor() {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffa502', '#a78bfa', '#f472b6', '#34d399', '#fbbf24']
  return colors[Math.floor(Math.random() * colors.length)]
}

function updateRigPanel() {
  const bonesList = $('#bonesList')
  if (!bonesList) return

  bonesList.innerHTML = ''
  state.rig.bones.forEach((bone, idx) => {
    const item = document.createElement('div')
    item.style.padding = '6px'
    item.style.marginBottom = '4px'
    item.style.background = state.rig.selectedBoneId === bone.id
      ? state.rig.boneColors[bone.id] + '66'
      : state.rig.boneColors[bone.id] + '33'
    item.style.border = state.rig.selectedBoneId === bone.id
      ? '2px solid ' + state.rig.boneColors[bone.id]
      : '1px solid ' + state.rig.boneColors[bone.id]
    item.style.borderRadius = '4px'
    item.style.cursor = 'pointer'
    item.style.fontSize = '12px'
    item.style.display = 'flex'
    item.style.alignItems = 'center'
    item.style.justifyContent = 'space-between'

    const nameSpan = document.createElement('span')
    nameSpan.textContent = bone.name
    nameSpan.style.flex = '1'
    item.appendChild(nameSpan)

    const deleteBtn = document.createElement('button')
    deleteBtn.innerHTML = '&#x2715;'
    deleteBtn.title = 'Eliminar hueso'
    deleteBtn.style.cssText = 'background:none;border:none;color:var(--danger,#ff6b6b);cursor:pointer;font-size:14px;padding:0 4px;line-height:1;font-weight:bold;'
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      state.rig.bones.splice(idx, 1)
      // Reassign IDs
      state.rig.bones.forEach((b, i) => { b.id = i })
      const newColors = {}
      state.rig.bones.forEach((b) => {
        newColors[b.id] = state.rig.boneColors[b.id] || getRandomBoneColor()
      })
      state.rig.boneColors = newColors
      if (state.rig.selectedBoneId === bone.id) state.rig.selectedBoneId = null
      updateRigPanel()
      renderRigVisualization()
    })
    item.appendChild(deleteBtn)

    item.addEventListener('click', () => {
      state.rig.selectedBoneId = bone.id
      updateRigPanel()
      renderRigVisualization()
    })
    bonesList.appendChild(item)
  })

  // Update weight info display
  const rigWeightInfo = $('#rigWeightInfo')
  if (rigWeightInfo) {
    const totalWeights = Object.keys(state.rig.boneWeights).length
    if (totalWeights > 0) {
      rigWeightInfo.textContent = `Pesos asignados: ${totalWeights} p�xeles`
    } else {
      rigWeightInfo.textContent = 'Sin pesos asignados. Usa "Auto-asignar" o pinta en modo Influencia.'
    }
  }
}

// ==========================================
// ANIMATION PLAYBACK
// ==========================================
function togglePlayPause() {
  if (state.isPlaying) {
    stopAnimation()
  } else {
    startAnimation()
  }
}

function startAnimation() {
  if (state.frames.length <= 1) return

  state.isPlaying = true
  $('#playIcon').style.display = 'none'
  $('#pauseIcon').style.display = 'block'
  $('#btnPlayPause').classList.add('playing')

  let frameIdx = 0
  animPreviewCanvas.width = state.width
  animPreviewCanvas.height = state.height

  state.animInterval = setInterval(() => {
    animPreviewCtx.clearRect(0, 0, state.width, state.height)

    const frameLayers = state.frames[frameIdx]
    const flatAnimLayers = getFlatLayers(frameLayers)
    for (let i = flatAnimLayers.length - 1; i >= 0; i--) {
      animPreviewCtx.globalAlpha = flatAnimLayers[i].opacity
      animPreviewCtx.drawImage(flatAnimLayers[i].canvas, -OVERFLOW_MARGIN, -OVERFLOW_MARGIN)
    }
    animPreviewCtx.globalAlpha = 1

    // Also update main canvas
    ctx.clearRect(0, 0, totalW(), totalH())
    for (let i = flatAnimLayers.length - 1; i >= 0; i--) {
      ctx.globalAlpha = flatAnimLayers[i].opacity
      ctx.drawImage(flatAnimLayers[i].canvas, 0, 0)
    }
    ctx.globalAlpha = 1

    // Highlight frame in timeline
    framesList.querySelectorAll('.frame-thumb').forEach((t, idx) => {
      t.classList.toggle('active', idx === frameIdx)
    })

    frameCounter.textContent = `Frame ${frameIdx + 1} / ${state.frames.length}`
    frameIdx = (frameIdx + 1) % state.frames.length
  }, 1000 / state.fps)
}

function stopAnimation() {
  state.isPlaying = false
  clearInterval(state.animInterval)
  state.animInterval = null

  $('#playIcon').style.display = 'block'
  $('#pauseIcon').style.display = 'none'
  $('#btnPlayPause').classList.remove('playing')

  switchToFrame(state.currentFrameIndex)
}

// ==========================================
// RESIZE CANVAS
// ==========================================
function resizeAllCanvases(newW, newH) {
  const oldW = state.width
  const oldH = state.height
  state.width = newW
  state.height = newH

  // Resize all frames and layers
  state.frames.forEach((frameLayers) => {
    resizeTreeCanvases(frameLayers, oldW, oldH, newW, newH)
  })

  canvas.width = totalW()
  canvas.height = totalH()
  // Grid overlay size is set in recalcCanvasSize at display resolution
  previewOverlay.width = totalW()
  previewOverlay.height = totalH()

  updateCanvasDisplay()
  renderFramesList()
  renderLayersList()
}

// ==========================================
// EXPORT
// ==========================================
// ==========================================
// FILE OPERATIONS
// ==========================================
function openProjectFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.anima,application/json,image/png,image/jpeg'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const isAnima = file.name.toLowerCase().endsWith('.anima') || file.type === 'application/json'
    if (isAnima) {
      file.text().then((txt) => {
        try {
          const data = JSON.parse(txt)
          importAnimaData(data, file.name)
        } catch (err) {
          console.error('Error al cargar .anima', err)
        }
      })
    } else {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          // Create project from image
          createNewProject(file.name, img.width, img.height)
          // Draw image onto the initial layer at the project origin
          const allLayers = getAllLayers(state.layers)
          const layer = allLayers[0]
          layer.ctx.drawImage(img, OVERFLOW_MARGIN, OVERFLOW_MARGIN)
          compositeAndDisplay()
          renderLayersList()
          renderFramesList()
        }
        img.src = event.target.result
      }
      reader.readAsDataURL(file)
    }
  }
  input.click()
}

function showSaveAsMenu() {
  const dialog = $('#saveAsDialog')
  const overlay = $('#saveAsDialogOverlay')
  if (dialog && overlay) {
    dialog.style.display = 'block'
    overlay.style.display = 'block'
  }
}

function hideSaveAsDialog() {
  const dialog = $('#saveAsDialog')
  const overlay = $('#saveAsDialogOverlay')
  if (dialog && overlay) {
    dialog.style.display = 'none'
    overlay.style.display = 'none'
  }
}

// ==========================================
// PROJECT EXPORT/IMPORT (.anima)
// ==========================================
function serializeLayerTreeForExport(items) {
  return items.map(item => {
    if (item.type === 'folder') {
      return {
        id: item.id,
        type: 'folder',
        name: item.name,
        children: serializeLayerTreeForExport(item.children),
        visible: item.visible,
        opacity: item.opacity,
        expanded: item.expanded,
      }
    } else {
      return {
        id: item.id,
        type: 'layer',
        name: item.name,
        visible: item.visible,
        opacity: item.opacity,
        png: item.canvas.toDataURL('image/png'),
      }
    }
  })
}

function loadImageFromDataURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function deserializeLayerTreeFromExport(items, width, height) {
  const result = []
  for (const s of items) {
    if (s.type === 'folder') {
      result.push({
        id: s.id,
        type: 'folder',
        name: s.name,
        children: await deserializeLayerTreeFromExport(s.children || [], width, height),
        visible: s.visible ?? true,
        opacity: s.opacity ?? 1,
        expanded: s.expanded ?? true,
      })
    } else {
      const layerCanvas = document.createElement('canvas')
      layerCanvas.width = width + 2 * OVERFLOW_MARGIN
      layerCanvas.height = height + 2 * OVERFLOW_MARGIN
      const layerCtx = layerCanvas.getContext('2d')
      layerCtx.imageSmoothingEnabled = false
      if (s.png) {
        try {
          const img = await loadImageFromDataURL(s.png)
          // If saved image already includes overflow (new format), draw at origin;
          // otherwise (old format, project-size only) draw at OVERFLOW_MARGIN
          if (img.width === width + 2 * OVERFLOW_MARGIN && img.height === height + 2 * OVERFLOW_MARGIN) {
            layerCtx.drawImage(img, 0, 0)
          } else {
            layerCtx.drawImage(img, OVERFLOW_MARGIN, OVERFLOW_MARGIN)
          }
        } catch (err) {
          console.error('Error cargando imagen de capa', err)
        }
      }
      result.push({
        id: s.id,
        type: 'layer',
        name: s.name,
        canvas: layerCanvas,
        ctx: layerCtx,
        visible: s.visible ?? true,
        opacity: s.opacity ?? 1,
      })
    }
  }
  return result
}

function exportAnima(forcePrompt = false) {
  if (!state) return

  let targetName = state.fileName || `${state.name || 'proyecto'}.anima`
  if (forcePrompt || !state.fileName) {
    const suggested = targetName.endsWith('.anima') ? targetName : `${targetName}.anima`
    const newName = window.prompt('Nombre de archivo (.anima):', suggested)
    if (!newName) return
    targetName = newName.toLowerCase().endsWith('.anima') ? newName : `${newName}.anima`
    state.fileName = targetName
  }

  const payload = {
    version: 1,
    name: state.name,
    width: state.width,
    height: state.height,
    fps: state.fps,
    showGrid: state.showGrid,
    onionSkin: state.onionSkin,
    currentColor: state.currentColor,
    secondaryColor: state.secondaryColor,
    userPalette: drawingState.userPalette,
    currentFrameIndex: state.currentFrameIndex,
    activeLayerId: state.activeLayerId,
    frames: state.frames.map(f => serializeLayerTreeForExport(f)),
    rig: {
      bones: state.rig.bones,
      boneColors: state.rig.boneColors,
      boneWeights: state.rig.boneWeights,
    }
  }

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = targetName
  link.click()
  URL.revokeObjectURL(url)
}

async function importAnimaData(data, fileName = null) {
  if (!data || !data.frames) return
  const width = data.width || 16
  const height = data.height || 16
  createNewProject(data.name || 'Proyecto', width, height)

  state.fileName = fileName && fileName.toLowerCase().endsWith('.anima') ? fileName : null

  state.fps = data.fps ?? state.fps
  state.showGrid = data.showGrid ?? true
  state.onionSkin = data.onionSkin ?? false
  state.currentColor = data.currentColor || state.currentColor
  state.secondaryColor = data.secondaryColor || state.secondaryColor
  drawingState.userPalette = data.userPalette || []

  $('#toggleGrid').classList.toggle('active', state.showGrid)
  $('#toggleOnionSkin').classList.toggle('active', state.onionSkin)
  if (data.currentColor) setCurrentColor(data.currentColor)
  const secondaryColorSwatch = $('#secondaryColorSwatch')
  const secondaryColorHexLabel = $('#secondaryColorHexLabel')
  if (secondaryColorSwatch && secondaryColorHexLabel && data.secondaryColor) {
    secondaryColorSwatch.style.backgroundColor = data.secondaryColor
    secondaryColorHexLabel.textContent = data.secondaryColor.toUpperCase()
  }

  const frames = []
  for (const frame of data.frames) {
    frames.push(await deserializeLayerTreeFromExport(frame, width, height))
  }
  state.frames = frames.length > 0 ? frames : [state.layers]
  state.currentFrameIndex = Math.min(data.currentFrameIndex || 0, state.frames.length - 1)
  state.layers = state.frames[state.currentFrameIndex]
  state.activeLayerId = data.activeLayerId || (getAllLayers(state.layers)[0]?.id || null)

  if (data.rig) {
    state.rig.bones = data.rig.bones || []
    state.rig.boneColors = data.rig.boneColors || {}
    state.rig.boneWeights = data.rig.boneWeights || {}
    state.rig.selectedBoneId = null
    state.rig.originalBones = null
    state.rig.originalPixels = null
  }

  renderUserPalette()
  renderLayersList()
  renderFramesList()
  compositeAndDisplay()
  drawGrid()
}

// ==========================================
// EXPORT
// ==========================================
function exportPNG() {
  if (!state) return
  // Composite current animation frame or current drawing
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = state.width
  exportCanvas.height = state.height
  const ectx = exportCanvas.getContext('2d')

  const flatExportLayers = getFlatLayers(state.layers)
  for (let i = flatExportLayers.length - 1; i >= 0; i--) {
    ectx.globalAlpha = flatExportLayers[i].opacity
    ectx.drawImage(flatExportLayers[i].canvas, -OVERFLOW_MARGIN, -OVERFLOW_MARGIN)
  }

  const link = document.createElement('a')
  link.download = `${state.name || 'anima_export'}.png`
  link.href = exportCanvas.toDataURL('image/png')
  link.click()
}

function exportJPEG() {
  if (!state) return
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = state.width
  exportCanvas.height = state.height
  const ectx = exportCanvas.getContext('2d')

  // JPEG needs a background color (usually white)
  ectx.fillStyle = '#ffffff'
  ectx.fillRect(0, 0, state.width, state.height)

  const flatJpegLayers = getFlatLayers(state.layers)
  for (let i = flatJpegLayers.length - 1; i >= 0; i--) {
    ectx.globalAlpha = flatJpegLayers[i].opacity
    ectx.drawImage(flatJpegLayers[i].canvas, -OVERFLOW_MARGIN, -OVERFLOW_MARGIN)
  }

  const link = document.createElement('a')
  link.download = `${state.name || 'anima_export'}.jpg`
  link.href = exportCanvas.toDataURL('image/jpeg', 0.9)
  link.click()
}

function exportSpritesheet() {
  const cols = Math.ceil(Math.sqrt(state.frames.length))
  const rows = Math.ceil(state.frames.length / cols)

  const sheetCanvas = document.createElement('canvas')
  sheetCanvas.width = state.width * cols
  sheetCanvas.height = state.height * rows
  const sctx = sheetCanvas.getContext('2d')
  sctx.imageSmoothingEnabled = false

  state.frames.forEach((frameLayers, idx) => {
    const fx = (idx % cols) * state.width
    const fy = Math.floor(idx / cols) * state.height

    const flatSheetLayers = getFlatLayers(frameLayers)
    for (let i = flatSheetLayers.length - 1; i >= 0; i--) {
      sctx.globalAlpha = flatSheetLayers[i].opacity
      sctx.drawImage(flatSheetLayers[i].canvas, fx - OVERFLOW_MARGIN, fy - OVERFLOW_MARGIN)
    }
    sctx.globalAlpha = 1
  })

  const link = document.createElement('a')
  link.download = `anima_spritesheet_${state.frames.length}frames.png`
  link.href = sheetCanvas.toDataURL('image/png')
  link.click()
}

// ==========================================
// BOOT
// ==========================================
init()
