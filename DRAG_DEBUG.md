# Selection Drag Debug Guide

## Changes Made

Added comprehensive console logging to track the selection and drag operation workflow:

### 1. **Selection Finalization** (onCanvasMouseUp ~line 2204)
- Logs the selection rectangle dimensions
- Logs total selected pixels count after finalization
- Logs when pixels are subtracted from selection

### 2. **Drag Start** (onCanvasMouseDown ~line 1801)
- Logs when entering drag mode
- Logs the drag rectangle
- Logs the count of selected pixels available
- **CRITICAL**: Logs "Opaque pixels in drag canvas" - shows how many pixels will be dragged
- Logs the final drag canvas dimensions

### 3. **Drag Finalization** (onCanvasMouseUp ~line 2145)
- Logs dx and dy offsets
- Logs the old rectangle position
- **CRITICAL**: Logs "Cleared pixels at old position" - shows how many pixels were cleared
- Logs the new position where pixels will be drawn
- Logs the dragged canvas dimensions

## How to Test

1. **Open the application** with DevTools enabled (Ctrl+Shift+I or F12)
2. **Create a layer with pixels** - draw something on the canvas
3. **Make a selection** - click and drag to create a rectangular selection
4. **View the console** - you should see "Finalizing selection rect" message
5. **Check selected pixels count** - should be greater than 0
6. **Click inside the selection** - to start dragging
7. **Watch for key console messages**:
   - "Starting drag mode" ✓
   - "Selected pixels count: X" (should be > 0)
   - "Opaque pixels in drag canvas: X" (CRITICAL - if 0, pixels won't copy)
8. **Drag the selection** to a new position
9. **Release the mouse** - watch console for finalization messages
10. **Check for issues**:
    - If "Opaque pixels in drag canvas" is 0 → selectedPixels has wrong format
    - If "Cleared pixels at old position" is 0 → selectedPixels coordinates don't match
    - If nothing appears at new position → drawing failed silently

## Expected Console Output

```
Select click at: 50, 50
Has selection: true, pixels: 0
Finalizing selection rect: {x: 40, y: 40, w: 21, h: 21}
Selection finalized, total selected pixels: 441
Select click at: 57, 57
Has selection: true, pixels: 441
Selection rect: {x: 40, y: 40, w: 21, h: 21}
Click inside selection: true
Starting drag mode
Drag rect: {x: 40, y: 40, w: 21, h: 21}
Selected pixels count: 441
Opaque pixels in drag canvas: 441
Drag canvas created, dimensions: 21 x 21
Finalizing drag: {dx: 10, dy: 10, dragStartRect: {x: 40, y: 40}, newRect: {x: 50, y: 50}}
Clearing old position: {x: 40, y: 40, w: 21, h: 21}
Cleared pixels at old position: 441
Drawing at new position: {x: 50, y: 50, canvasSize: "21x21"}
```

## Possible Issues and Solutions

### Issue: "Opaque pixels in drag canvas: 0"
**Problem**: No pixels are being copied to the drag canvas
**Cause**: The selectedPixels Set doesn't have the right format or coordinates don't match
**Debug**: Check if selectedPixels contains entries like "50,50" (pixel coordinates)

### Issue: "Cleared pixels at old position: 0"
**Problem**: Old pixels aren't being cleared
**Cause**: The coordinate system used to check selectedPixels is wrong
**Debug**: Compare calculated px, py values with what's actually in selectedPixels

### Issue: Pixels appear in dragged preview but disappear on release
**Problem**: Drawing at new position is failing or clearing is overwriting it
**Cause**: compositeAndDisplay() might be redrawing layers in wrong order
**Debug**: Check if layer visibility affects the result

## Quick Fixes to Try

If debugging shows the issue, likely fixes are:

1. **selectedPixels coordinate format**: Ensure it matches "x,y" format
2. **Pixel coordinate calculation**: Verify px and py calculations match selection rect
3. **Layer state**: Ensure layer doesn't get re-rendered after we update it

## Files Modified

- `/src/renderer/src/renderer.js`
  - onCanvasMouseDown (select case, ~line 1801)
  - onCanvasMouseMove (select case, ~line 2038)
  - onCanvasMouseUp (select case, ~line 2145 and ~line 2204)
