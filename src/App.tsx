import { useEffect, useRef, useState } from 'react'
import {
  Atom, CircleHelp, Copy, Download, Eraser, Link2, MoreHorizontal,
  MousePointer2, Redo2, Trash2, Undo2,
} from 'lucide-react'

type ElementSymbol = 'C' | 'H' | 'O' | 'N' | 'S' | 'P' | 'F' | 'Cl' | 'Br' | 'I'
type AtomData = { id: string; element: ElementSymbol; x: number; y: number }
type Bond = { id: string; a: string; b: string; order: 1 | 2 | 3 }
type Drawing = { atoms: AtomData[]; bonds: Bond[] }
type Tool = 'move' | 'bond' | 'delete'
type ElementDrag = { element: ElementSymbol; x: number; y: number; pointerId: number }
type SelectionBox = { startX: number; startY: number; x: number; y: number; pointerId: number; additiveIds: string[] }
type AtomDrag = { pointerId: number; startX: number; startY: number; atomIds: string[]; origins: Map<string, { x: number; y: number }>; moved: boolean }

const WIDTH = 1040
const HEIGHT = 660
const GRID_SIZE = 30
const EXPORT_PADDING = 18
const elements: { symbol: ElementSymbol; name: string; tone: string }[] = [
  { symbol: 'C', name: 'Carbon', tone: 'carbon' },
  { symbol: 'H', name: 'Hydrogen', tone: 'hydrogen' },
  { symbol: 'O', name: 'Oxygen', tone: 'oxygen' },
]
const extraElements: ElementSymbol[] = ['N', 'S', 'P', 'F', 'Cl', 'Br', 'I']

function cloneDrawing(drawing: Drawing): Drawing {
  return { atoms: drawing.atoms.map((atom) => ({ ...atom })), bonds: drawing.bonds.map((bond) => ({ ...bond })) }
}

function bondLines(a: AtomData, b: AtomData, order: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const px = (-dy / length) * 6
  const py = (dx / length) * 6
  const aGap = a.element.length > 1 ? 25 : 20
  const bGap = b.element.length > 1 ? 25 : 20
  const offsets = order === 1 ? [0] : order === 2 ? [-0.5, 0.5] : [-1, 0, 1]
  return offsets.map((offset) => ({
    x1: a.x + ux * aGap + px * offset,
    y1: a.y + uy * aGap + py * offset,
    x2: b.x - ux * bGap + px * offset,
    y2: b.y - uy * bGap + py * offset,
  }))
}

function App() {
  const [drawing, setDrawing] = useState<Drawing>({ atoms: [], bonds: [] })
  const [past, setPast] = useState<Drawing[]>([])
  const [future, setFuture] = useState<Drawing[]>([])
  const [tool, setTool] = useState<Tool>('move')
  const [selectedElement, setSelectedElement] = useState<ElementSymbol>('C')
  const [bondStart, setBondStart] = useState<string | null>(null)
  const [elementDrag, setElementDrag] = useState<ElementDrag | null>(null)
  const [selectedAtomIds, setSelectedAtomIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [draggingAtomIds, setDraggingAtomIds] = useState<string[]>([])
  const [showMore, setShowMore] = useState(false)
  const [showHowItWorks, setShowHowItWorks] = useState(false)
  const [message, setMessage] = useState('Drag an element onto the page to begin.')
  const svgRef = useRef<SVGSVGElement>(null)
  const dragOriginal = useRef<Drawing | null>(null)
  const atomDragRef = useRef<AtomDrag | null>(null)
  const selectionBoxRef = useRef<SelectionBox | null>(null)
  const elementDragRef = useRef<ElementDrag | null>(null)
  const addAtomRef = useRef<(element: ElementSymbol, x: number, y: number) => void>(() => undefined)

  const commit = (next: Drawing) => {
    setPast((items) => [...items, cloneDrawing(drawing)])
    setFuture([])
    setDrawing(next)
  }

  const pointInCanvas = (clientX: number, clientY: number, snapToGrid = true) => {
    const svg = svgRef.current!
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const transformed = point.matrixTransform(svg.getScreenCTM()!.inverse())
    if (!snapToGrid) {
      return {
        x: Math.max(0, Math.min(WIDTH, transformed.x)),
        y: Math.max(0, Math.min(HEIGHT, transformed.y)),
      }
    }
    return {
      x: Math.max(GRID_SIZE, Math.min(WIDTH - GRID_SIZE, Math.round(transformed.x / GRID_SIZE) * GRID_SIZE)),
      y: Math.max(GRID_SIZE, Math.min(HEIGHT - GRID_SIZE, Math.round(transformed.y / GRID_SIZE) * GRID_SIZE)),
    }
  }

  const addAtom = (element: ElementSymbol, x: number, y: number) => {
    const id = crypto.randomUUID()
    commit({ ...drawing, atoms: [...drawing.atoms, { id, element, x, y }] })
    setMessage(`${element} placed on the grid. Drag it to reposition.`)
  }
  addAtomRef.current = addAtom

  const startElementDrag = (event: React.PointerEvent, element: ElementSymbol) => {
    event.preventDefault()
    setSelectedElement(element)
    setShowMore(false)
    const nextDrag = { element, x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    elementDragRef.current = nextDrag
    setElementDrag(nextDrag)
  }

  const chooseAtom = (id: string) => {
    if (tool === 'delete') {
      commit({
        atoms: drawing.atoms.filter((atom) => atom.id !== id),
        bonds: drawing.bonds.filter((bond) => bond.a !== id && bond.b !== id),
      })
      setSelectedAtomIds((ids) => ids.filter((atomId) => atomId !== id))
      setBondStart(null)
      setMessage('Atom deleted.')
      return
    }
    if (tool === 'move') {
      return
    }
    if (!bondStart) {
      setBondStart(id)
      setMessage('Now tap the second atom to make a single bond.')
      return
    }
    if (bondStart === id) {
      setBondStart(null)
      setMessage('Bond creation cancelled.')
      return
    }
    const existing = drawing.bonds.find((bond) => (bond.a === bondStart && bond.b === id) || (bond.a === id && bond.b === bondStart))
    if (!existing) {
      commit({ ...drawing, bonds: [...drawing.bonds, { id: crypto.randomUUID(), a: bondStart, b: id, order: 1 }] })
      setMessage('Bond made. Tap a bond to change it to double or triple.')
    } else {
      setMessage('Those atoms already have a bond.')
    }
    setBondStart(null)
  }

  const chooseBond = (bond: Bond) => {
    if (tool === 'delete') {
      commit({ ...drawing, bonds: drawing.bonds.filter((item) => item.id !== bond.id) })
      setMessage('Bond deleted.')
      return
    }
    if (tool !== 'bond') return
    const nextOrder = bond.order === 3 ? 1 : (bond.order + 1) as 1 | 2 | 3
    commit({ ...drawing, bonds: drawing.bonds.map((item) => item.id === bond.id ? { ...item, order: nextOrder } : item) })
    setMessage(`${nextOrder === 1 ? 'Single' : nextOrder === 2 ? 'Double' : 'Triple'} bond selected.`)
  }

  const undo = () => {
    const previous = past.at(-1)
    if (!previous) return
    setFuture((items) => [cloneDrawing(drawing), ...items])
    setDrawing(previous)
    setPast((items) => items.slice(0, -1))
    setBondStart(null)
    setSelectedAtomIds([])
  }

  const redo = () => {
    const next = future[0]
    if (!next) return
    setPast((items) => [...items, cloneDrawing(drawing)])
    setDrawing(next)
    setFuture((items) => items.slice(1))
    setBondStart(null)
    setSelectedAtomIds([])
  }

  const atomsInSelection = (box: SelectionBox) => {
    const left = Math.min(box.startX, box.x)
    const right = Math.max(box.startX, box.x)
    const top = Math.min(box.startY, box.y)
    const bottom = Math.max(box.startY, box.y)
    const inside = drawing.atoms.filter((atom) => atom.x >= left && atom.x <= right && atom.y >= top && atom.y <= bottom).map((atom) => atom.id)
    return [...new Set([...box.additiveIds, ...inside])]
  }

  const startSelection = (event: React.PointerEvent<SVGSVGElement>) => {
    if (tool === 'bond' || event.button !== 0) return
    const point = pointInCanvas(event.clientX, event.clientY, false)
    const box = { startX: point.x, startY: point.y, x: point.x, y: point.y, pointerId: event.pointerId, additiveIds: event.shiftKey ? selectedAtomIds : [] }
    selectionBoxRef.current = box
    setSelectionBox(box)
    if (!event.shiftKey) setSelectedAtomIds([])
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startAtomDrag = (event: React.PointerEvent<SVGGElement>, atomId: string) => {
    event.stopPropagation()
    if (tool !== 'move' || event.button !== 0) {
      chooseAtom(atomId)
      return
    }
    if (event.shiftKey) {
      setSelectedAtomIds((ids) => ids.includes(atomId) ? ids.filter((id) => id !== atomId) : [...ids, atomId])
      return
    }

    const atomIds = selectedAtomIds.includes(atomId) ? selectedAtomIds : [atomId]
    const start = pointInCanvas(event.clientX, event.clientY, false)
    const origins = new Map(drawing.atoms.filter((atom) => atomIds.includes(atom.id)).map((atom) => [atom.id, { x: atom.x, y: atom.y }]))
    dragOriginal.current = cloneDrawing(drawing)
    atomDragRef.current = { pointerId: event.pointerId, startX: start.x, startY: start.y, atomIds, origins, moved: false }
    setSelectedAtomIds(atomIds)
    setDraggingAtomIds(atomIds)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = atomDragRef.current
    if (drag && event.pointerId === drag.pointerId) {
      const point = pointInCanvas(event.clientX, event.clientY, false)
      let dx = Math.round((point.x - drag.startX) / GRID_SIZE) * GRID_SIZE
      let dy = Math.round((point.y - drag.startY) / GRID_SIZE) * GRID_SIZE
      const positions = [...drag.origins.values()]
      dx = Math.max(GRID_SIZE - Math.min(...positions.map((position) => position.x)), Math.min(WIDTH - GRID_SIZE - Math.max(...positions.map((position) => position.x)), dx))
      dy = Math.max(GRID_SIZE - Math.min(...positions.map((position) => position.y)), Math.min(HEIGHT - GRID_SIZE - Math.max(...positions.map((position) => position.y)), dy))
      drag.moved ||= dx !== 0 || dy !== 0
      setDrawing((current) => ({
        ...current,
        atoms: current.atoms.map((atom) => {
          const origin = drag.origins.get(atom.id)
          return origin ? { ...atom, x: origin.x + dx, y: origin.y + dy } : atom
        }),
      }))
      return
    }

    const box = selectionBoxRef.current
    if (!box || event.pointerId !== box.pointerId) return
    const point = pointInCanvas(event.clientX, event.clientY, false)
    const nextBox = { ...box, x: point.x, y: point.y }
    selectionBoxRef.current = nextBox
    setSelectionBox(nextBox)
    setSelectedAtomIds(atomsInSelection(nextBox))
  }

  const finishCanvasPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const cancelled = event.type === 'pointercancel'
    const drag = atomDragRef.current
    if (drag && event.pointerId === drag.pointerId) {
      if (cancelled && dragOriginal.current) {
        setDrawing(dragOriginal.current)
      } else if (drag.moved && dragOriginal.current) {
        setPast((items) => [...items, dragOriginal.current!])
        setFuture([])
        setMessage(`${drag.atomIds.length} atom${drag.atomIds.length === 1 ? '' : 's'} moved together.`)
      }
      dragOriginal.current = null
      atomDragRef.current = null
      setDraggingAtomIds([])
    }

    const box = selectionBoxRef.current
    if (!box || event.pointerId !== box.pointerId) return
    const selectedIds = atomsInSelection(box)
    const dragged = Math.abs(box.x - box.startX) > 3 || Math.abs(box.y - box.startY) > 3
    if (cancelled) {
      setSelectedAtomIds(box.additiveIds)
    } else if (tool === 'delete' && dragged && selectedIds.length) {
      const selected = new Set(selectedIds)
      commit({
        atoms: drawing.atoms.filter((atom) => !selected.has(atom.id)),
        bonds: drawing.bonds.filter((bond) => !selected.has(bond.a) && !selected.has(bond.b)),
      })
      setSelectedAtomIds([])
      setMessage(`${selectedIds.length} atom${selectedIds.length === 1 ? '' : 's'} deleted.`)
    } else if (tool === 'move' && selectedIds.length) {
      setMessage(`${selectedIds.length} atom${selectedIds.length === 1 ? '' : 's'} selected. Drag one to move the group.`)
    }
    selectionBoxRef.current = null
    setSelectionBox(null)
  }

  const exportImage = async (copy = false) => {
    const svg = svgRef.current
    if (!svg) return
    const visibleElements = Array.from(svg.querySelectorAll<SVGGraphicsElement>('.bond-line, .atom-label'))
    if (!visibleElements.length) {
      setMessage('Add an atom before exporting your structure.')
      return
    }

    const bounds = visibleElements.map((element) => element.getBBox()).reduce((combined, box) => ({
      left: Math.min(combined.left, box.x),
      top: Math.min(combined.top, box.y),
      right: Math.max(combined.right, box.x + box.width),
      bottom: Math.max(combined.bottom, box.y + box.height),
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
    const x = bounds.left - EXPORT_PADDING
    const y = bounds.top - EXPORT_PADDING
    const width = bounds.right - bounds.left + EXPORT_PADDING * 2
    const height = bounds.bottom - bounds.top + EXPORT_PADDING * 2
    const content = svg.querySelector('[data-export-content]')!.cloneNode(true) as SVGGElement
    content.querySelectorAll('[data-ui="true"]').forEach((element) => element.remove())

    const exportedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    exportedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    exportedSvg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
    exportedSvg.setAttribute('width', String(Math.ceil(width)))
    exportedSvg.setAttribute('height', String(Math.ceil(height)))
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    style.textContent = '.bond-line{stroke:#263536;stroke-width:3;stroke-linecap:round}.atom-label{fill:#213133;font:600 28px Fraunces,Georgia,serif;paint-order:stroke;stroke:#fffdf7;stroke-width:7px;stroke-linejoin:round}'
    exportedSvg.append(style, content)

    const source = new XMLSerializer().serializeToString(exportedSvg)
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    if (!copy) {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(svgBlob)
      link.download = 'molecule-notebook.svg'
      link.click()
      URL.revokeObjectURL(link.href)
      setMessage('Cropped SVG downloaded.')
      return
    }

    const image = new Image()
    const url = URL.createObjectURL(svgBlob)
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render drawing')); image.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * 2)
    canvas.height = Math.ceil(height * 2)
    const context = canvas.getContext('2d')!
    context.scale(2, 2)
    context.drawImage(image, 0, 0, width, height)
    URL.revokeObjectURL(url)
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob || !navigator.clipboard || !('ClipboardItem' in window)) return
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
    setMessage('Cropped image copied. Paste it into your document.')
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (event.key === 'Escape') {
        setBondStart(null)
        setShowHowItWorks(false)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const currentDrag = elementDragRef.current
      if (!currentDrag || event.pointerId !== currentDrag.pointerId) return
      event.preventDefault()
      const nextDrag = { ...currentDrag, x: event.clientX, y: event.clientY }
      elementDragRef.current = nextDrag
      setElementDrag(nextDrag)
    }
    const end = (event: PointerEvent) => {
      const currentDrag = elementDragRef.current
      if (!currentDrag || event.pointerId !== currentDrag.pointerId) return
      const svg = svgRef.current
      if (svg) {
        const bounds = svg.getBoundingClientRect()
        const isOverCanvas = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom
        if (isOverCanvas) {
          const point = pointInCanvas(event.clientX, event.clientY)
          addAtomRef.current(currentDrag.element, point.x, point.y)
        }
      }
      elementDragRef.current = null
      setElementDrag(null)
    }

    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Atom size={25} /></span><span>Molecule <b>Notebook</b></span></div>
        <div className="header-actions">
          <button className="text-button" onClick={() => setShowHowItWorks(true)}><CircleHelp size={18} /> How it works</button>
          <button className="outline-button" onClick={() => exportImage(true)}><Copy size={17} /> Copy image</button>
          <button className="download-button" onClick={() => exportImage()}><Download size={17} /> Download SVG</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Drawing tools">
          <div className="tool-section"><p className="eyebrow">Build your structure</p><h1>Element tray</h1><p className="sidebar-copy">Drag an element from here onto your page.</p></div>
          <div className="element-stack">
            {elements.map((element) => <button key={element.symbol} onPointerDown={(event) => startElementDrag(event, element.symbol)} className={`element-card ${element.tone} ${selectedElement === element.symbol ? 'selected-element' : ''}`} aria-label={`Drag ${element.name} onto canvas`}><strong>{element.symbol}</strong><span>{element.name}</span><span className="drag-dots">::::</span></button>)}
          </div>
          <div className="more-wrap">
            <button className="more-elements" onClick={() => setShowMore(!showMore)}><MoreHorizontal size={19} /> More elements</button>
            {showMore && <div className="more-palette">{extraElements.map((element) => <button key={element} onPointerDown={(event) => startElementDrag(event, element)}>{element}</button>)}</div>}
          </div>
          <div className="side-rule" />
          <div className="tool-section"><p className="eyebrow">Connect and edit</p><h2>Tools</h2></div>
          <div className="tool-list">
            <button className={tool === 'move' ? 'active-tool' : ''} onClick={() => { setTool('move'); setBondStart(null); setMessage('Drag around atoms to select them, then drag the group.') }}><MousePointer2 size={18} /> Move mode</button>
            <button className={tool === 'bond' ? 'active-tool' : ''} onClick={() => { setTool('bond'); setBondStart(null); setSelectedAtomIds([]); setMessage('Tap two atoms to connect them.') }}><Link2 size={18} /> Bond mode</button>
            <button className={tool === 'delete' ? 'active-delete-tool' : ''} onClick={() => { setTool('delete'); setBondStart(null); setMessage('Tap one item, or drag around atoms to delete them.') }}><Eraser size={18} /> Delete mode</button>
          </div>
          <div className="sidebar-footer">Tip: In Bond mode, tap a bond to cycle through single, double, and triple bonds.</div>
        </aside>

        <section className="drawing-area">
          <div className="canvas-topline"><div><span className="status-dot" /> <span>{message}</span></div><span className="atom-count">{drawing.atoms.length} atom{drawing.atoms.length === 1 ? '' : 's'}</span></div>
          <div className="canvas-frame">
            <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className={`molecule-canvas ${tool}-mode ${draggingAtomIds.length ? 'dragging-atoms' : ''}`} role="application" aria-label="Chemical structure drawing canvas" onPointerMove={moveCanvasPointer} onPointerUp={finishCanvasPointer} onPointerCancel={finishCanvasPointer} onPointerDown={(event) => { setBondStart(null); startSelection(event) }}>
              <defs><pattern id="paper-grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse"><path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#d9d4c9" strokeWidth="1" opacity=".62" /></pattern></defs>
              <rect width={WIDTH} height={HEIGHT} fill="#fffdf7" /><rect width={WIDTH} height={HEIGHT} fill="url(#paper-grid)" />
              <g data-export-content="true">
                {drawing.bonds.map((bond) => {
                  const a = drawing.atoms.find((atom) => atom.id === bond.a); const b = drawing.atoms.find((atom) => atom.id === bond.b)
                  if (!a || !b) return null
                  return <g key={bond.id} onPointerDown={(event) => { if (tool !== 'move') { event.stopPropagation(); chooseBond(bond) } }} className="bond-group" aria-label={`${bond.order} bond`}>
                    <line data-ui="true" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="28" />
                    {bondLines(a, b, bond.order).map((line, index) => <line key={index} {...line} className="bond-line" />)}
                  </g>
                })}
                {drawing.atoms.map((atom) => {
                  return <g key={atom.id} className={`atom-group ${bondStart === atom.id ? 'bond-start' : ''} ${selectedAtomIds.includes(atom.id) && tool !== 'bond' ? 'selected-atom' : ''}`} onPointerDown={(event) => startAtomDrag(event, atom.id)}>
                    <circle data-ui="true" cx={atom.x} cy={atom.y} r="24" fill="transparent" />
                    <text x={atom.x} y={atom.y + 10} textAnchor="middle" className="atom-label">{atom.element}</text>
                  </g>
                })}
              </g>
              {selectionBox && <rect data-ui="true" className={`selection-box ${tool === 'delete' ? 'delete-selection-box' : ''}`} x={Math.min(selectionBox.startX, selectionBox.x)} y={Math.min(selectionBox.startY, selectionBox.y)} width={Math.abs(selectionBox.x - selectionBox.startX)} height={Math.abs(selectionBox.y - selectionBox.startY)} />}
              {drawing.atoms.length === 0 && <g data-ui="true" className="empty-state"><circle cx="520" cy="290" r="43" fill="#f1ede3" /><Atom x="500" y="270" width="40" height="40" color="#a29b8b" /><text x="520" y="365" textAnchor="middle">Your structure will appear here</text><text x="520" y="394" textAnchor="middle" className="empty-subtitle">Drag C, H, or O from the element tray to get started.</text></g>}
            </svg>
          </div>
          <div className="history-bar"><div><button onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 size={18} /></button><button onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 size={18} /></button><span className="shortcut-hint">Undo & redo</span></div><div><button className="clear-button" disabled={!drawing.atoms.length} onClick={() => { if (confirm('Clear the entire structure?')) { commit({ atoms: [], bonds: [] }); setBondStart(null); setMessage('Fresh page ready.') } }}><Trash2 size={16} /> Clear page</button></div></div>
        </section>
      </section>
      <footer><span>Made for classroom chemistry</span><span>Structures stay in this browser until you export them.</span></footer>
      {elementDrag && <div className="element-drag-preview" style={{ left: elementDrag.x, top: elementDrag.y }} aria-hidden="true">{elementDrag.element}</div>}
      {showHowItWorks && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowHowItWorks(false)}>
        <section className="how-it-works-modal" role="dialog" aria-modal="true" aria-labelledby="how-it-works-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-heading"><div><p className="eyebrow">Molecule Notebook</p><h2 id="how-it-works-title">How it works</h2></div><button className="modal-close" onClick={() => setShowHowItWorks(false)} aria-label="Close instructions">&times;</button></div>
          <ol>
            <li><b>Drag</b> an element from the tray onto the grid.</li>
            <li>Use <b>Move mode</b> to drag around several atoms, then drag one selected atom to move the group.</li>
            <li>Use <b>Bond mode</b> to connect two atoms. Tap an existing bond to change it from single to double or triple.</li>
            <li>Use <b>Delete mode</b> to tap one item or drag around several atoms to remove them together.</li>
          </ol>
          <button className="modal-done" onClick={() => setShowHowItWorks(false)}>Got it</button>
        </section>
      </div>}
    </main>
  )
}

export default App
