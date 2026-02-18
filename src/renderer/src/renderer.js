/* ========================================
   ANIMA — Pixel Art Studio
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
// STATE & PROJECT MANAGEMENT
// ==========================================

class Project {
  constructor(name = 'Sin título', width = 16, height = 16) {
    this.id = Date.now() + Math.random().toString(36).substr(2, 9)
    this.name = name
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

    // Layers
    this.layers = []
    this.activeLayerIndex = 0

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
    }

    // Initialize with one frame and one layer
    this.init()
  }

  init() {
    const layer = this.createLayer('Capa 1')
    this.layers = [layer]
    this.frames = [[layer]]
    this.activeLayerIndex = 0
    this.currentFrameIndex = 0
  }

  createLayer(name) {
    const layerCanvas = document.createElement('canvas')
    layerCanvas.width = this.width
    layerCanvas.height = this.height
    return {
      name: name,
      canvas: layerCanvas,
      ctx: layerCanvas.getContext('2d'),
      visible: true,
      opacity: 1,
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
  wandTolerance: 50,
  brushSize: 1,  // 1-500px for pencil and eraser
  // Selection dragging
  dragSelection: false,
  dragStartX: 0,
  dragStartY: 0,
  dragStartRectX: 0,
  dragStartRectY: 0,
  draggedPixelsImageData: null,  // Store pixels being dragged
  draggedPixelsCanvas: null,  // Canvas to hold dragged pixels
  // Rigging tool
  rigBoneStart: null,
  // Color swapping: tracks which color to use for current brush stroke
  paintColor: null,  // null means use state.currentColor, otherwise use this color
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
  const w = state.width
  const h = state.height
  canvas.width = w
  canvas.height = h
  gridOverlay.width = w
  gridOverlay.height = h
  previewOverlay.width = w
  previewOverlay.height = h

  recalcCanvasSize()
}

function recalcCanvasSize() {
  if (!state) return
  const containerRect = canvasContainer.getBoundingClientRect()
  
  const availableW = containerRect.width - 64
  const availableH = containerRect.height - 64
  
  // Find the largest integer pixel size that fits in the available space
  let pixelSize = Math.floor(Math.min(availableW / state.width, availableH / state.height))
  if (pixelSize < 1) pixelSize = 1 
  
  drawingState.pixelSize = pixelSize
  
  const baseW = state.width * pixelSize
  const baseH = state.height * pixelSize
  
  const finalW = Math.round(baseW * state.zoom)
  const finalH = Math.round(baseH * state.zoom)

  canvasWrapper.style.width = finalW + 'px'
  canvasWrapper.style.height = finalH + 'px'

  canvas.style.width = finalW + 'px'
  canvas.style.height = finalH + 'px'
  gridOverlay.style.width = finalW + 'px'
  gridOverlay.style.height = finalH + 'px'
  previewOverlay.style.width = finalW + 'px'
  previewOverlay.style.height = finalH + 'px'

  drawGrid()
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
  if (state.layers[state.activeLayerIndex]) {
    layerOpacitySlider.value = state.layers[state.activeLayerIndex].opacity * 100
    opacityValueLabel.textContent = Math.round(state.layers[state.activeLayerIndex].opacity * 100) + '%'
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
      addToUserPalette(color)
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
    // Automatically add to user palette when a color is selected
    addToUserPalette(color)
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
  if (state.userPalette.includes(color)) return

  state.userPalette.push(color)
  renderUserPalette()
}

function renderUserPalette() {
  userPaletteEl.innerHTML = ''
  userPaletteEmpty.style.display = state.userPalette.length === 0 ? 'block' : 'none'

  state.userPalette.forEach((color) => {
    const swatch = document.createElement('div')
    swatch.className = 'color-swatch'
    swatch.style.backgroundColor = color
    swatch.title = color
    if (color === state.currentColor) swatch.classList.add('active')
    swatch.addEventListener('click', () => setCurrentColor(color))
    swatch.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      state.userPalette = state.userPalette.filter((c) => c !== color)
      renderUserPalette()
    })
    userPaletteEl.appendChild(swatch)
  })
}

// ==========================================
// LAYERS
// ==========================================
function createLayer(name) {
  const layerCanvas = document.createElement('canvas')
  layerCanvas.width = state.width
  layerCanvas.height = state.height

  return {
    name: name || `Capa ${state.layers.length + 1}`,
    canvas: layerCanvas,
    ctx: layerCanvas.getContext('2d'),
    visible: true,
    opacity: 1,
  }
}

function addLayer() {
  const layer = createLayer()
  state.layers.push(layer)
  state.activeLayerIndex = state.layers.length - 1
  renderLayersList()
  compositeAndDisplay()
}

function deleteLayer() {
  if (state.layers.length <= 1) return

  state.layers.splice(state.activeLayerIndex, 1)
  if (state.activeLayerIndex >= state.layers.length) {
    state.activeLayerIndex = state.layers.length - 1
  }
  renderLayersList()
  compositeAndDisplay()
}

function mergeDown() {
  if (state.activeLayerIndex >= state.layers.length - 1) return

  const top = state.layers[state.activeLayerIndex]
  const bottom = state.layers[state.activeLayerIndex + 1]

  bottom.ctx.globalAlpha = top.opacity
  bottom.ctx.drawImage(top.canvas, 0, 0)
  bottom.ctx.globalAlpha = 1

  state.layers.splice(state.activeLayerIndex, 1)
  renderLayersList()
  compositeAndDisplay()
}

function setActiveLayer(index) {
  state.activeLayerIndex = index
  layerOpacitySlider.value = state.layers[index].opacity * 100
  opacityValueLabel.textContent = Math.round(state.layers[index].opacity * 100) + '%'
  renderLayersList()
}

function renderLayersList() {
  layersList.innerHTML = ''

  // Render layers top to bottom (first in array = top)
  for (let i = 0; i < state.layers.length; i++) {
    const layer = state.layers[i]
    const item = document.createElement('div')
    item.className = 'layer-item' + (i === state.activeLayerIndex ? ' active' : '')
    item.draggable = true
    item.dataset.index = i

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
    nameEl.addEventListener('dblclick', () => {
      const input = document.createElement('input')
      input.value = layer.name
      nameEl.textContent = ''
      nameEl.appendChild(input)
      input.focus()
      input.select()

      const finish = () => {
        layer.name = input.value || layer.name
        nameEl.textContent = layer.name
      }
      input.addEventListener('blur', finish)
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish()
      })
    })

    // Visibility toggle
    const visBtn = document.createElement('button')
    visBtn.className = 'layer-visibility' + (layer.visible ? '' : ' hidden')
    visBtn.innerHTML = layer.visible
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      layer.visible = !layer.visible
      renderLayersList()
      compositeAndDisplay()
    })

    item.appendChild(thumb)
    item.appendChild(nameEl)
    item.appendChild(visBtn)

    item.addEventListener('click', () => setActiveLayer(i))

    // Drag and drop for reordering
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', i.toString())
      item.classList.add('dragging')
    })
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging')
    })
    item.addEventListener('dragover', (e) => {
      e.preventDefault()
    })
    item.addEventListener('drop', (e) => {
      e.preventDefault()
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'))
      const toIndex = i
      if (fromIndex === toIndex) return

      const [movedLayer] = state.layers.splice(fromIndex, 1)
      state.layers.splice(toIndex, 0, movedLayer)

      if (state.activeLayerIndex === fromIndex) {
        state.activeLayerIndex = toIndex
      } else if (fromIndex < state.activeLayerIndex && toIndex >= state.activeLayerIndex) {
        state.activeLayerIndex--
      } else if (fromIndex > state.activeLayerIndex && toIndex <= state.activeLayerIndex) {
        state.activeLayerIndex++
      }

      renderLayersList()
      compositeAndDisplay()
    })

    layersList.appendChild(item)
  }

  // Update opacity slider
  if (state.layers[state.activeLayerIndex]) {
    layerOpacitySlider.value = state.layers[state.activeLayerIndex].opacity * 100
    opacityValueLabel.textContent =
      Math.round(state.layers[state.activeLayerIndex].opacity * 100) + '%'
  }
}

// ==========================================
// FRAMES / ANIMATION
// ==========================================
function addNewFrame(duplicateFrom = null) {
  let frameLayers
  if (duplicateFrom !== null) {
    frameLayers = state.frames[duplicateFrom].map((l) => {
      const newLayer = createLayer(l.name)
      newLayer.ctx.drawImage(l.canvas, 0, 0)
      newLayer.visible = l.visible
      newLayer.opacity = l.opacity
      return newLayer
    })
  } else {
    frameLayers = [createLayer('Capa 1')]
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

  if (state.activeLayerIndex >= state.layers.length) {
    state.activeLayerIndex = state.layers.length - 1
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
    for (let li = frameLayers.length - 1; li >= 0; li--) {
      const layer = frameLayers[li]
      if (!layer.visible) continue
      fctx.globalAlpha = layer.opacity
      fctx.drawImage(layer.canvas, 0, 0)
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
    delBtn.textContent = '×'
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      deleteFrame(i)
    })
    thumb.appendChild(delBtn)

    // Duplicate button
    const dupBtn = document.createElement('button')
    dupBtn.className = 'frame-duplicate'
    dupBtn.textContent = '⧉'
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      // Insert duplicate after this frame
      let frameCopy = frameLayers.map((l) => {
        const newLayer = createLayer(l.name)
        newLayer.ctx.drawImage(l.canvas, 0, 0)
        newLayer.visible = l.visible
        newLayer.opacity = l.opacity
        return newLayer
      })
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
  ctx.clearRect(0, 0, state.width, state.height)

  // Draw onion skin (previous frame) - BLUE
  if (state.onionSkin && state.currentFrameIndex > 0) {
    const prevFrame = state.frames[state.currentFrameIndex - 1]
    ctx.globalAlpha = 0.3
    ctx.fillStyle = 'rgba(0, 100, 255, 0.2)'
    ctx.fillRect(0, 0, state.width, state.height)
    for (let i = prevFrame.length - 1; i >= 0; i--) {
      if (!prevFrame[i].visible) continue
      ctx.drawImage(prevFrame[i].canvas, 0, 0)
    }
    ctx.globalAlpha = 0.3
    ctx.fillStyle = 'rgba(0, 150, 255, 0.15)'
    ctx.fillRect(0, 0, state.width, state.height)
    ctx.globalAlpha = 1
  }

  // Draw current frame layers bottom to top - RED tint in preview mode
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i]
    if (!layer.visible) continue
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

  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i]
    if (!layer.visible) continue
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
    animPreviewCtx.drawImage(canvas, 0, 0)
  }
}

// ==========================================
// GRID
// ==========================================
function drawGrid() {
  if (!state) return
  gridCtx.clearRect(0, 0, state.width, state.height)

  if (!state.showGrid) return

  gridCtx.strokeStyle = '#333333'
  gridCtx.lineWidth = 0.5

  for (let x = 0; x <= state.width; x++) {
    gridCtx.beginPath()
    gridCtx.moveTo(x, 0)
    gridCtx.lineTo(x, state.height)
    gridCtx.stroke()
  }
  for (let y = 0; y <= state.height; y++) {
    gridCtx.beginPath()
    gridCtx.moveTo(0, y)
    gridCtx.lineTo(state.width, y)
    gridCtx.stroke()
  }
}

// ==========================================
// DRAWING TOOLS
// ==========================================
function getPixelCoords(e) {
  const rect = canvas.getBoundingClientRect()
  
  // Use clientX/Y but ensure we are relative to the canvas drawing area
  const x = Math.floor((e.clientX - rect.left) * (state.width / rect.width))
  const y = Math.floor((e.clientY - rect.top) * (state.height / rect.height))

  return { 
    x: Math.max(0, Math.min(x, state.width - 1)), 
    y: Math.max(0, Math.min(y, state.height - 1)) 
  }
}

function drawPixel(x, y, layerCtx, color = null) {
  const colorToUse = color || state.currentColor
  if (colorToUse === 'transparent') {
    layerCtx.clearRect(x, y, 1, 1)
  } else {
    layerCtx.fillStyle = colorToUse
    layerCtx.fillRect(x, y, 1, 1)
  }
}

function erasePixel(x, y, layerCtx) {
  layerCtx.clearRect(x, y, 1, 1)
}

function drawBrush(x, y, size, layerCtx, color = null) {
  const colorToUse = color || state.currentColor
  const halfSize = size / 2
  const offset = size % 2 === 0 ? halfSize : halfSize - 0.5

  if (colorToUse === 'transparent') {
    layerCtx.clearRect(x - offset, y - offset, size, size)
  } else {
    layerCtx.fillStyle = colorToUse
    layerCtx.fillRect(x - offset, y - offset, size, size)
  }
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
  const imageData = layerCtx.getImageData(0, 0, state.width, state.height)
  const data = imageData.data

  const targetIdx = (y * state.width + x) * 4
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
    const key = cy * state.width + cx
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
    if (cx < state.width - 1) stack.push([cx + 1, cy])
    if (cy > 0) stack.push([cx, cy - 1])
    if (cy < state.height - 1) stack.push([cx, cy + 1])
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

function selectByColor(x, y, layerCtx) {
  const pixelData = layerCtx.getImageData(x, y, 1, 1).data
  const targetColor = { r: pixelData[0], g: pixelData[1], b: pixelData[2], a: pixelData[3] }
  const tolerance = (drawingState.wandTolerance / 100) * 255

  const imageData = layerCtx.getImageData(0, 0, state.width, state.height)
  const data = imageData.data

  // Collect matching pixels (without modifying selection yet)
  const newPixels = new Set()

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]

    const distance = Math.sqrt(
      (r - targetColor.r) ** 2 +
      (g - targetColor.g) ** 2 +
      (b - targetColor.b) ** 2
    )

    if (a > 0 && distance <= tolerance) {
      const pixelIndex = i / 4
      const px = pixelIndex % state.width
      const py = Math.floor(pixelIndex / state.width)
      newPixels.add(px + ',' + py)
    }
  }

  // Apply selection modes
  switch (drawingState.selectionMode) {
    case 'replace':
      drawingState.selectedPixels.clear()
      // Fall through to add logic

    case 'add':
      // Union: add new pixels to existing selection
      newPixels.forEach((pixel) => {
        drawingState.selectedPixels.add(pixel)
      })
      break

    case 'subtract':
      // Difference: remove new pixels from existing selection
      newPixels.forEach((pixel) => {
        drawingState.selectedPixels.delete(pixel)
      })
      break
  }

  startMarchingAntsAnimation()
}

// ==========================================
// SELECTION CLIPBOARD HELPER
// ==========================================
function copySelectionToClipboard() {
  if (drawingState.selectedPixels.size === 0 || !drawingState.selectRect) return false

  const layer = state.layers[state.activeLayerIndex]
  const rect = drawingState.selectRect

  drawingState.clipboardCanvas = document.createElement('canvas')
  drawingState.clipboardCanvas.width = rect.w
  drawingState.clipboardCanvas.height = rect.h
  const clipCtx = drawingState.clipboardCanvas.getContext('2d')
  clipCtx.drawImage(layer.canvas, -rect.x, -rect.y)

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
    previewCtx.clearRect(0, 0, state.width, state.height)

    if (drawingState.selectRect) {
      drawMarchingAntsRect(
        drawingState.selectRect.x,
        drawingState.selectRect.y,
        drawingState.selectRect.w,
        drawingState.selectRect.h,
        previewCtx
      )
    } else if (drawingState.selectedPixels.size > 0) {
      drawMarchingAntsFromPixels(previewCtx)
    }
  }, 50)
}

function drawMarchingAntsRect(x, y, w, h, ctx) {
  // Outer bright white - much thicker and more visible
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineWidth = 1.5
  ctx.setLineDash([1, 1])
  ctx.lineDashOffset = -drawingState.marchingAntsOffset * 0.1
  ctx.strokeRect(x - 0.2, y - 0.2, w + 0.4, h + 0.4)

  // Inner bright yellow - thick and completely visible
  ctx.strokeStyle = '#FFFF00'
  ctx.lineWidth = 1
  ctx.lineDashOffset = -(drawingState.marchingAntsOffset * 0.1 + 0.5)
  ctx.strokeRect(x, y, w, h)

  ctx.setLineDash([])
}

function drawMarchingAntsFromPixels(ctx) {
  if (drawingState.selectedPixels.size === 0) return

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  drawingState.selectedPixels.forEach((key) => {
    const [px, py] = key.split(',').map(Number)
    minX = Math.min(minX, px)
    maxX = Math.max(maxX, px)
    minY = Math.min(minY, py)
    maxY = Math.max(maxY, py)
  })

  // Draw rect marching ants
  drawMarchingAntsRect(minX, minY, maxX - minX + 1, maxY - minY + 1, ctx)
}

function stopMarchingAntsAnimation() {
  if (drawingState.marchingAntsInterval) {
    clearInterval(drawingState.marchingAntsInterval)
    drawingState.marchingAntsInterval = null
  }
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
  const snapshot = state.layers.map((l) => {
    const copyCanvas = document.createElement('canvas')
    copyCanvas.width = state.width
    copyCanvas.height = state.height
    const copyCtx = copyCanvas.getContext('2d')
    copyCtx.drawImage(l.canvas, 0, 0)
    return {
      name: l.name,
      canvas: copyCanvas,
      visible: l.visible,
      opacity: l.opacity,
    }
  })

  state.undoStack.push({
    layers: snapshot,
    activeLayerIndex: state.activeLayerIndex,
  })

  if (state.undoStack.length > state.maxUndoSteps) {
    state.undoStack.shift()
  }

  state.redoStack = []
}

function undo() {
  if (state.undoStack.length === 0) return

  // Save current state to redo
  const currentSnapshot = state.layers.map((l) => {
    const copyCanvas = document.createElement('canvas')
    copyCanvas.width = state.width
    copyCanvas.height = state.height
    copyCanvas.getContext('2d').drawImage(l.canvas, 0, 0)
    return { name: l.name, canvas: copyCanvas, visible: l.visible, opacity: l.opacity }
  })
  state.redoStack.push({
    layers: currentSnapshot,
    activeLayerIndex: state.activeLayerIndex,
  })

  const prev = state.undoStack.pop()
  restoreFromSnapshot(prev)
}

function redo() {
  if (state.redoStack.length === 0) return

  const currentSnapshot = state.layers.map((l) => {
    const copyCanvas = document.createElement('canvas')
    copyCanvas.width = state.width
    copyCanvas.height = state.height
    copyCanvas.getContext('2d').drawImage(l.canvas, 0, 0)
    return { name: l.name, canvas: copyCanvas, visible: l.visible, opacity: l.opacity }
  })
  state.undoStack.push({
    layers: currentSnapshot,
    activeLayerIndex: state.activeLayerIndex,
  })

  const next = state.redoStack.pop()
  restoreFromSnapshot(next)
}

function restoreFromSnapshot(snapshot) {
  state.layers = snapshot.layers.map((s) => {
    const layer = createLayer(s.name)
    layer.ctx.drawImage(s.canvas, 0, 0)
    layer.visible = s.visible
    layer.opacity = s.opacity
    return layer
  })

  state.activeLayerIndex = snapshot.activeLayerIndex
  state.frames[state.currentFrameIndex] = state.layers

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
      drawingState.selectedPixels.clear()
      drawingState.selectRect = null
      stopMarchingAntsAnimation()
      previewCtx.clearRect(0, 0, state.width, state.height)
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
  $('#menuSave').addEventListener('click', () => exportPNG())
  $('#menuSaveAs').addEventListener('click', showSaveAsMenu)
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
      if (state) {
        state.currentTool = btn.dataset.tool
        $$('.tool-btn[data-tool]').forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
      }
    })
  })

  // === Grid toggle ===
  $('#toggleGrid').addEventListener('click', () => {
    if (!state) return
    state.showGrid = !state.showGrid
    $('#toggleGrid').classList.toggle('active', state.showGrid)
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
    addToUserPalette(e.target.value)
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
  $('#btnDeleteLayer').addEventListener('click', deleteLayer)
  $('#btnMergeDown').addEventListener('click', mergeDown)

  layerOpacitySlider.addEventListener('input', (e) => {
    if (!state) return
    const val = parseInt(e.target.value)
    state.layers[state.activeLayerIndex].opacity = val / 100
    opacityValueLabel.textContent = val + '%'
    compositeAndDisplay()
  })

  // === Magic Wand Tolerance ===
  const wandToleranceSlider = $('#wandTolerance')
  const wandToleranceValue = $('#wandToleranceValue')
  if (wandToleranceSlider && wandToleranceValue) {
    wandToleranceSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value)
      drawingState.wandTolerance = val
      wandToleranceValue.textContent = val
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
    state.userPalette = []
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
    const layer = state.layers[state.activeLayerIndex]
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
    const layer = state.layers[state.activeLayerIndex]
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
      state.rig.rigMode = e.target.value
    })
  }

  const btnDeleteBone = $('#btnDeleteBone')
  if (btnDeleteBone) {
    btnDeleteBone.addEventListener('click', () => {
      if (state.rig.selectedBoneId !== null) {
        state.rig.bones.splice(state.rig.selectedBoneId, 1)
        // Reassign IDs after deletion
        state.rig.bones.forEach((bone, idx) => {
          bone.id = idx
        })
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
    } else if (e.key === 'z' || e.key === 'Z') {
      selectTool('zoom')
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
        drawingState.selectedPixels.clear()
        drawingState.pasteMode = false
        stopMarchingAntsAnimation()
        drawingState.selectRect = null
        previewCtx.clearRect(0, 0, state.width, state.height)
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
        state.layers[state.activeLayerIndex].ctx.clearRect(rect.x, rect.y, rect.w, rect.h)
        compositeAndDisplay()
      }
    } else if (e.ctrlKey && e.key === 'v') {
      e.preventDefault()
      if (drawingState.clipboardCanvas && state) {
        if (state.currentTool !== 'select') selectTool('select')
        drawingState.pasteMode = true
        // Initialize paste position - show at current paste start position or center of canvas
        if (!drawingState.pasteStartX) {
          drawingState.pasteStartX = Math.max(0, Math.floor((state.width - drawingState.clipboardCanvas.width) / 2))
        }
        if (!drawingState.pasteStartY) {
          drawingState.pasteStartY = Math.max(0, Math.floor((state.height - drawingState.clipboardCanvas.height) / 2))
        }
        // Draw the pasted content to the preview
        previewCtx.clearRect(0, 0, state.width, state.height)
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

  // Show/hide tool-specific panels
  const wandToleranceSection = $('#wandToleranceSection')
  if (wandToleranceSection) {
    wandToleranceSection.style.display = tool === 'wand' ? 'block' : 'none'
  }

  const rigEditorPanel = $('#rigEditorPanel')
  if (rigEditorPanel) {
    rigEditorPanel.style.display = tool === 'rig' ? 'block' : 'none'
    if (tool === 'rig') {
      updateRigPanel()
      renderRigVisualization()
    }
  }

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
  const layer = state.layers[state.activeLayerIndex]
  // NOTE: Layer visibility check moved into switch statement for tool-specific handling

  drawingState.isDrawing = true

  switch (state.currentTool) {
    case 'pencil':
      // Pencil requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      if (drawingState.brushSize === 1) {
        drawPixel(x, y, layer.ctx, drawingState.paintColor)
      } else {
        drawBrush(x, y, drawingState.brushSize, layer.ctx, drawingState.paintColor)
      }
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      break

    case 'eraser':
      // Eraser requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      if (drawingState.brushSize === 1) {
        erasePixel(x, y, layer.ctx)
      } else {
        eraseBrush(x, y, drawingState.brushSize, layer.ctx)
      }
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
      // Pass selectedPixels if there's an active selection
      const fillSelection = drawingState.selectedPixels.size > 0 ? drawingState.selectedPixels : null
      floodFill(x, y, layer.ctx, fillSelection, fillColor)
      compositeAndDisplay()
      drawingState.isDrawing = false
      break

    case 'eyedropper': {
      // Eyedropper only requires layer to exist, not visibility
      if (!layer) return
      // Pick color from composite
      const compositeData = ctx.getImageData(x, y, 1, 1).data
      const pickedColor = compositeData[3] === 0
        ? 'transparent'
        : '#' + ((1 << 24) + (compositeData[0] << 16) + (compositeData[1] << 8) + compositeData[2]).toString(16).slice(1)

      // Determine if setting primary or secondary based on button
      if (e.button === 0) {
        // Left-click: set primary color
        setCurrentColor(pickedColor)
        if (pickedColor !== 'transparent') addToUserPalette(pickedColor)
      } else {
        // Right-click: set secondary color
        state.secondaryColor = pickedColor
        const secondaryColorSwatch = $('#secondaryColorSwatch')
        const secondaryColorHexLabel = $('#secondaryColorHexLabel')
        const secondaryColorPickerInput = $('#secondaryColorPickerInput')
        if (secondaryColorSwatch && secondaryColorHexLabel && secondaryColorPickerInput) {
          if (pickedColor === 'transparent') {
            secondaryColorSwatch.classList.add('transparent-bg')
            secondaryColorSwatch.style.backgroundColor = ''
            secondaryColorHexLabel.textContent = 'Transparente'
          } else {
            secondaryColorSwatch.classList.remove('transparent-bg')
            secondaryColorSwatch.style.backgroundColor = pickedColor
            secondaryColorHexLabel.textContent = pickedColor.toUpperCase()
            secondaryColorPickerInput.value = pickedColor
            addToUserPalette(pickedColor)
          }
        }
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
      drawingState.lineStart = { x, y }
      break

    case 'rect':
      // Rect requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      drawingState.rectStart = { x, y }
      break

    case 'move':
      // Move requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      drawingState.moveStart = { x, y }
      // Store copy of layer data
      const moveCanvas = document.createElement('canvas')
      moveCanvas.width = state.width
      moveCanvas.height = state.height
      moveCanvas.getContext('2d').drawImage(layer.canvas, 0, 0)
      drawingState.moveLayerData = moveCanvas
      break

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

          // Save a copy of ONLY the selected pixels (not the whole rect)
          const dragRect = drawingState.selectRect
          console.log('Drag rect:', dragRect)
          console.log('Selected pixels count:', drawingState.selectedPixels.size)

          drawingState.draggedPixelsCanvas = document.createElement('canvas')
          drawingState.draggedPixelsCanvas.width = dragRect.w
          drawingState.draggedPixelsCanvas.height = dragRect.h
          const dragCtx = drawingState.draggedPixelsCanvas.getContext('2d')
          dragCtx.imageSmoothingEnabled = false

          // Copy only selected pixels
          const layerImageData = layer.ctx.getImageData(dragRect.x, dragRect.y, dragRect.w, dragRect.h)
          const data = layerImageData.data
          let opaquePixels = 0
          for (let i = 0; i < data.length; i += 4) {
            // Check if this pixel is in the selection
            const pixelIndex = i / 4
            const px = dragRect.x + (pixelIndex % dragRect.w)
            const py = dragRect.y + Math.floor(pixelIndex / dragRect.w)
            const pixelKey = px + ',' + py

            // If pixel is NOT selected, make it transparent
            if (!drawingState.selectedPixels.has(pixelKey)) {
              data[i + 3] = 0  // Set alpha to 0
            } else {
              opaquePixels++
            }
          }
          console.log('Opaque pixels in drag canvas:', opaquePixels)
          dragCtx.putImageData(layerImageData, 0, 0)
          console.log('Drag canvas created, dimensions:', dragRect.w, 'x', dragRect.h)

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
      // Detect selection mode based on keyboard modifiers
      if (e.ctrlKey && e.altKey) {
        drawingState.selectionMode = 'subtract'
      } else if (e.ctrlKey && e.shiftKey) {
        drawingState.selectionMode = 'add'
      } else {
        drawingState.selectionMode = 'replace'
      }

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
        drawingState.rigBoneStart = { x, y }
        drawingState.isDrawing = true
      }
      break

    case 'zoom':
      // Zoom doesn't require layer at all
      if (e.shiftKey) {
        state.zoom = Math.max(0.25, state.zoom - 0.25)
      } else {
        state.zoom = Math.min(5, state.zoom + 0.25)
      }
      updateCanvasDisplay()
      break

    case 'circle':
      // Circle requires visible layer
      if (!layer || !layer.visible) return
      saveUndoState()
      drawingState.circleStart = { x, y }
      // Determine color: left-click = primary (currentColor), right-click = secondary
      drawingState.paintColor = e.button === 0 ? state.currentColor : state.secondaryColor
      drawingState.isDrawing = true
      break
  }
}

function onCanvasMouseMove(e) {
  if (!state) return

  const { x, y } = getPixelCoords(e)
  coordsDisplay.textContent = `X: ${x}, Y: ${y}`

  if (!drawingState.isDrawing) {
    // Show preview cursor - but skip for tools that handle their own preview
    if (state.currentTool !== 'select' && state.currentTool !== 'rig' && state.currentTool !== 'zoom' && state.currentTool !== 'circle') {
      previewCtx.clearRect(0, 0, state.width, state.height)
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
      previewCtx.clearRect(0, 0, state.width, state.height)
      previewCtx.strokeStyle = '#FFFFFF'
      previewCtx.lineWidth = 1.5
      previewCtx.setLineDash([1, 1])
      previewCtx.strokeRect(minX - 0.2, minY - 0.2, maxX - minX + 0.4, maxY - minY + 0.4)
      previewCtx.strokeStyle = '#FFFF00'
      previewCtx.lineWidth = 1
      previewCtx.lineDashOffset = 0.5
      previewCtx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      previewCtx.setLineDash([])
      return
    }
    return
  }

  const layer = state.layers[state.activeLayerIndex]
  if (!layer) return

  switch (state.currentTool) {
    case 'pencil':
      if (drawingState.lastPixelX !== -1) {
        if (drawingState.brushSize === 1) {
          drawLine(drawingState.lastPixelX, drawingState.lastPixelY, x, y, layer.ctx, false, drawingState.paintColor)
        } else {
          drawBrushLine(drawingState.lastPixelX, drawingState.lastPixelY, x, y, drawingState.brushSize, layer.ctx, false, drawingState.paintColor)
        }
      } else {
        if (drawingState.brushSize === 1) {
          drawPixel(x, y, layer.ctx, drawingState.paintColor)
        } else {
          drawBrush(x, y, drawingState.brushSize, layer.ctx, drawingState.paintColor)
        }
      }
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      break

    case 'eraser':
      if (drawingState.lastPixelX !== -1) {
        if (drawingState.brushSize === 1) {
          drawLine(drawingState.lastPixelX, drawingState.lastPixelY, x, y, layer.ctx, true)
        } else {
          drawBrushLine(drawingState.lastPixelX, drawingState.lastPixelY, x, y, drawingState.brushSize, layer.ctx, true)
        }
      } else {
        if (drawingState.brushSize === 1) {
          erasePixel(x, y, layer.ctx)
        } else {
          eraseBrush(x, y, drawingState.brushSize, layer.ctx)
        }
      }
      drawingState.lastPixelX = x
      drawingState.lastPixelY = y
      compositeAndDisplay()
      break

    case 'line':
      // Preview line
      previewCtx.clearRect(0, 0, state.width, state.height)
      if (drawingState.lineStart) {
        previewCtx.fillStyle =
          drawingState.paintColor === 'transparent' ? '#FF00FF' : drawingState.paintColor
        drawLineOnCtx(drawingState.lineStart.x, drawingState.lineStart.y, x, y, previewCtx)
      }
      break

    case 'rect':
      previewCtx.clearRect(0, 0, state.width, state.height)
      if (drawingState.rectStart) {
        previewCtx.fillStyle =
          drawingState.paintColor === 'transparent' ? '#FF00FF' : drawingState.paintColor
        drawRectPreview(drawingState.rectStart.x, drawingState.rectStart.y, x, y, previewCtx)
      }
      break

    case 'move':
      if (drawingState.moveStart && drawingState.moveLayerData) {
        const dx = x - drawingState.moveStart.x
        const dy = y - drawingState.moveStart.y
        layer.ctx.clearRect(0, 0, state.width, state.height)
        layer.ctx.drawImage(drawingState.moveLayerData, dx, dy)
        compositeAndDisplay()
      }
      break

    case 'circle':
      previewCtx.clearRect(0, 0, state.width, state.height)
      if (drawingState.circleStart) {
        previewCtx.fillStyle =
          drawingState.paintColor === 'transparent' ? '#FF00FF' : drawingState.paintColor
        drawCirclePreview(drawingState.circleStart.x, drawingState.circleStart.y, x, y, previewCtx)
      }
      break

    case 'select':
      if (drawingState.dragSelection) {
        // Handle dragging selection rectangle with pixels
        const dx = x - drawingState.dragStartX
        const dy = y - drawingState.dragStartY
        const newX = drawingState.dragStartRectX + dx
        const newY = drawingState.dragStartRectY + dy

        // Update selection rect position
        drawingState.selectRect.x = newX
        drawingState.selectRect.y = newY

        // Draw marching ants and dragged pixels on preview
        previewCtx.clearRect(0, 0, state.width, state.height)
        // Draw the dragged pixels at new position
        if (drawingState.draggedPixelsCanvas) {
          previewCtx.globalAlpha = 0.7
          previewCtx.drawImage(drawingState.draggedPixelsCanvas, newX, newY)
          previewCtx.globalAlpha = 1
        }
        // Draw marching ants at new position
        const savedOffset = drawingState.marchingAntsOffset
        drawingState.marchingAntsOffset = 0
        drawMarchingAntsRect(newX, newY, drawingState.selectRect.w, drawingState.selectRect.h, previewCtx)
        drawingState.marchingAntsOffset = savedOffset
      } else if (drawingState.selectStart && !drawingState.pasteMode) {
        const minX = Math.min(drawingState.selectStart.x, x)
        const maxX = Math.max(drawingState.selectStart.x, x)
        const minY = Math.min(drawingState.selectStart.y, y)
        const maxY = Math.max(drawingState.selectStart.y, y)
        drawingState.selectRect = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }

        // Draw preview of selection rect
        previewCtx.clearRect(0, 0, state.width, state.height)
        previewCtx.strokeStyle = '#FFFFFF'
        previewCtx.lineWidth = 1.5
        previewCtx.setLineDash([1, 1])
        previewCtx.strokeRect(minX - 0.2, minY - 0.2, maxX - minX + 0.4, maxY - minY + 0.4)
        previewCtx.strokeStyle = '#FFFF00'
        previewCtx.lineWidth = 1
        previewCtx.lineDashOffset = 0.5
        previewCtx.strokeRect(minX, minY, maxX - minX, maxY - minY)
        previewCtx.setLineDash([])
      } else if (drawingState.pasteMode && drawingState.clipboardCanvas) {
        // Moving pasted content - show clipboard image following the mouse
        previewCtx.clearRect(0, 0, state.width, state.height)
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
        renderRigPreview(drawingState.rigBoneStart, { x, y })
      } else {
        renderRigVisualization()
      }
      break
  }
}

function onCanvasMouseUp(e) {
  if (!drawingState.isDrawing) return

  const layer = state.layers[state.activeLayerIndex]

  if (state.currentTool === 'line' && drawingState.lineStart) {
    const { x, y } = getPixelCoords(e)
    drawLine(drawingState.lineStart.x, drawingState.lineStart.y, x, y, layer.ctx, false, drawingState.paintColor)
    drawingState.lineStart = null
    previewCtx.clearRect(0, 0, state.width, state.height)
    compositeAndDisplay()
  }

  if (state.currentTool === 'rect' && drawingState.rectStart) {
    const { x, y } = getPixelCoords(e)
    drawRectOutline(drawingState.rectStart.x, drawingState.rectStart.y, x, y, layer.ctx, drawingState.paintColor)
    drawingState.rectStart = null
    previewCtx.clearRect(0, 0, state.width, state.height)
    compositeAndDisplay()
  }

  if (state.currentTool === 'circle' && drawingState.circleStart) {
    const { x, y } = getPixelCoords(e)
    drawCircleOutline(drawingState.circleStart.x, drawingState.circleStart.y, x, y, layer.ctx, drawingState.paintColor)
    drawingState.circleStart = null
    previewCtx.clearRect(0, 0, state.width, state.height)
    compositeAndDisplay()
  }

  if (state.currentTool === 'select' && drawingState.dragSelection) {
    // Finalize dragging selection - apply pixel changes
    const dx = drawingState.selectRect.x - drawingState.dragStartRectX
    const dy = drawingState.selectRect.y - drawingState.dragStartRectY

    console.log('Finalizing drag:', { dx, dy, dragStartRect: { x: drawingState.dragStartRectX, y: drawingState.dragStartRectY }, newRect: drawingState.selectRect })

    if ((dx !== 0 || dy !== 0) && drawingState.draggedPixelsCanvas) {
      // Save undo state
      saveUndoState()

      const layer = state.layers[state.activeLayerIndex]

      // Clear only the selected pixels at old position
      const oldRect = {
        x: drawingState.dragStartRectX,
        y: drawingState.dragStartRectY,
        w: drawingState.selectRect.w,
        h: drawingState.selectRect.h
      }

      console.log('Clearing old position:', oldRect)

      // Clear old pixels by making selected ones transparent
      const oldImageData = layer.ctx.getImageData(oldRect.x, oldRect.y, oldRect.w, oldRect.h)
      const oldData = oldImageData.data
      let clearedPixels = 0
      for (let i = 0; i < oldData.length; i += 4) {
        const pixelIndex = i / 4
        const px = oldRect.x + (pixelIndex % oldRect.w)
        const py = oldRect.y + Math.floor(pixelIndex / oldRect.w)
        const pixelKey = px + ',' + py

        // Clear only pixels that were selected
        if (drawingState.selectedPixels.has(pixelKey)) {
          oldData[i + 3] = 0  // Set alpha to 0
          clearedPixels++
        }
      }
      console.log('Cleared pixels at old position:', clearedPixels)
      layer.ctx.putImageData(oldImageData, oldRect.x, oldRect.y)

      // Draw pixels at new position
      console.log('Drawing at new position:', { x: drawingState.selectRect.x, y: drawingState.selectRect.y, canvasSize: drawingState.draggedPixelsCanvas.width + 'x' + drawingState.draggedPixelsCanvas.height })
      layer.ctx.drawImage(drawingState.draggedPixelsCanvas, drawingState.selectRect.x, drawingState.selectRect.y)

      // Update display
      compositeAndDisplay()
    }

    // Clear drag state
    drawingState.dragSelection = false
    drawingState.draggedPixelsCanvas = null
    previewCtx.clearRect(0, 0, state.width, state.height)
    startMarchingAntsAnimation()
    drawingState.isDrawing = false
    return
  }

  if (state.currentTool === 'select' && drawingState.selectRect && !drawingState.pasteMode) {
    // Finalize selection with mode logic
    const rect = drawingState.selectRect
    console.log('Finalizing selection rect:', rect)

    switch (drawingState.selectionMode) {
      case 'replace':
        drawingState.selectedPixels.clear()
        // Fall through to add logic

      case 'add':
        // Union: add pixels from new rect
        for (let px = rect.x; px < rect.x + rect.w && px < state.width; px++) {
          for (let py = rect.y; py < rect.y + rect.h && py < state.height; py++) {
            drawingState.selectedPixels.add(px + ',' + py)
          }
        }
        console.log('Selection finalized, total selected pixels:', drawingState.selectedPixels.size)
        break

      case 'subtract':
        // Difference: remove pixels from rect
        for (let px = rect.x; px < rect.x + rect.w && px < state.width; px++) {
          for (let py = rect.y; py < rect.y + rect.h && py < state.height; py++) {
            drawingState.selectedPixels.delete(px + ',' + py)
          }
        }
        console.log('Selection subtracted, remaining selected pixels:', drawingState.selectedPixels.size)
        break
    }

    startMarchingAntsAnimation()
    previewCtx.clearRect(0, 0, state.width, state.height)
    $('#btnCopySelection').style.display = 'block'
  } else if (state.currentTool === 'select' && drawingState.pasteMode && drawingState.clipboardCanvas) {
    // Finalize paste position - place clipboard at current mouse position
    const { x, y } = getPixelCoords(e)
    saveUndoState()
    layer.ctx.drawImage(drawingState.clipboardCanvas, x, y)
    compositeAndDisplay()
    stopMarchingAntsAnimation()
    previewCtx.clearRect(0, 0, state.width, state.height)
    drawingState.pasteMode = false
    drawingState.selectedPixels.clear()
    $('#btnCopySelection').style.display = 'none'
    $('#btnPasteSelection').style.display = 'none'
  }

  if (state.currentTool === 'rig' && drawingState.rigBoneStart) {
    const { x, y } = getPixelCoords(e)
    addBone(drawingState.rigBoneStart.x, drawingState.rigBoneStart.y, x, y, null)
    drawingState.rigBoneStart = null
    previewCtx.clearRect(0, 0, state.width, state.height)
    renderRigVisualization()
  }

  drawingState.isDrawing = false
  drawingState.lastPixelX = -1
  drawingState.lastPixelY = -1
  drawingState.moveStart = null
  drawingState.moveLayerData = null
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
}

function renderRigVisualization() {
  if (!state || !state.rig) return
  previewCtx.clearRect(0, 0, state.width, state.height)

  // Draw all bones
  state.rig.bones.forEach((bone) => {
    const color = state.rig.boneColors[bone.id] || '#ffffff'
    previewCtx.strokeStyle = color
    previewCtx.lineWidth = 0.8
    previewCtx.beginPath()
    previewCtx.moveTo(bone.x1, bone.y1)
    previewCtx.lineTo(bone.x2, bone.y2)
    previewCtx.stroke()

    // Circles at joints - much larger and more visible
    previewCtx.fillStyle = color
    previewCtx.beginPath()
    previewCtx.arc(bone.x1, bone.y1, 0.6, 0, Math.PI * 2)
    previewCtx.fill()
    previewCtx.beginPath()
    previewCtx.arc(bone.x2, bone.y2, 0.6, 0, Math.PI * 2)
    previewCtx.fill()

    // White outline for better visibility
    previewCtx.strokeStyle = '#FFFFFF'
    previewCtx.lineWidth = 0.2
    previewCtx.beginPath()
    previewCtx.arc(bone.x1, bone.y1, 0.6, 0, Math.PI * 2)
    previewCtx.stroke()
    previewCtx.beginPath()
    previewCtx.arc(bone.x2, bone.y2, 0.6, 0, Math.PI * 2)
    previewCtx.stroke()
  })
}

function renderRigPreview(start, end) {
  renderRigVisualization()
  if (start) {
    previewCtx.strokeStyle = '#FFFFFF'
    previewCtx.lineWidth = 1.2
    previewCtx.beginPath()
    previewCtx.moveTo(start.x, start.y)
    previewCtx.lineTo(end.x, end.y)
    previewCtx.stroke()

    // Draw inner yellow line for better visibility
    previewCtx.strokeStyle = '#FFFF00'
    previewCtx.lineWidth = 0.6
    previewCtx.beginPath()
    previewCtx.moveTo(start.x, start.y)
    previewCtx.lineTo(end.x, end.y)
    previewCtx.stroke()
  }
}

function getRandomBoneColor() {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffa502', '#a78bfa']
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
    item.style.background = state.rig.boneColors[bone.id] + '33'
    item.style.border = '1px solid ' + state.rig.boneColors[bone.id]
    item.style.borderRadius = '4px'
    item.style.cursor = 'pointer'
    item.textContent = bone.name
    item.addEventListener('click', () => {
      state.rig.selectedBoneId = idx
    })
    bonesList.appendChild(item)
  })
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
    for (let i = frameLayers.length - 1; i >= 0; i--) {
      if (!frameLayers[i].visible) continue
      animPreviewCtx.globalAlpha = frameLayers[i].opacity
      animPreviewCtx.drawImage(frameLayers[i].canvas, 0, 0)
    }
    animPreviewCtx.globalAlpha = 1

    // Also update main canvas
    ctx.clearRect(0, 0, state.width, state.height)
    for (let i = frameLayers.length - 1; i >= 0; i--) {
      if (!frameLayers[i].visible) continue
      ctx.globalAlpha = frameLayers[i].opacity
      ctx.drawImage(frameLayers[i].canvas, 0, 0)
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
    frameLayers.forEach((layer) => {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = oldW
      tempCanvas.height = oldH
      tempCanvas.getContext('2d').drawImage(layer.canvas, 0, 0)

      layer.canvas.width = newW
      layer.canvas.height = newH
      layer.ctx = layer.canvas.getContext('2d')
      layer.ctx.imageSmoothingEnabled = false
      layer.ctx.drawImage(tempCanvas, 0, 0)
    })
  })

  canvas.width = newW
  canvas.height = newH
  gridOverlay.width = newW
  gridOverlay.height = newH
  previewOverlay.width = newW
  previewOverlay.height = newH

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
  input.accept = 'image/png, image/jpeg'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        // Create project from image
        createNewProject(file.name, img.width, img.height)
        // Draw image onto the initial layer
        const layer = state.layers[0]
        layer.ctx.drawImage(img, 0, 0)
        compositeAndDisplay()
        renderLayersList()
        renderFramesList()
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
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
// EXPORT
// ==========================================
function exportPNG() {
  if (!state) return
  // Composite current animation frame or current drawing
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = state.width
  exportCanvas.height = state.height
  const ectx = exportCanvas.getContext('2d')

  for (let i = state.layers.length - 1; i >= 0; i--) {
    if (!state.layers[i].visible) continue
    ectx.globalAlpha = state.layers[i].opacity
    ectx.drawImage(state.layers[i].canvas, 0, 0)
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

  for (let i = state.layers.length - 1; i >= 0; i--) {
    if (!state.layers[i].visible) continue
    ectx.globalAlpha = state.layers[i].opacity
    ectx.drawImage(state.layers[i].canvas, 0, 0)
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

    for (let i = frameLayers.length - 1; i >= 0; i--) {
      if (!frameLayers[i].visible) continue
      sctx.globalAlpha = frameLayers[i].opacity
      sctx.drawImage(frameLayers[i].canvas, fx, fy)
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
