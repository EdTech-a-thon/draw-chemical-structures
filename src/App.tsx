import { useEffect, useRef, useState } from 'react'
import {
  Atom, CircleHelp, Copy, Download, Eraser, Link2, MoreHorizontal,
  MousePointer2, Redo2, RotateCcw, Trash2, Undo2, X,
} from 'lucide-react'

type ElementSymbol = 'C' | 'H' | 'O' | 'N' | 'S' | 'P' | 'F' | 'Cl' | 'Br' | 'I'
type AtomData = { id: string; element: ElementSymbol; x: number; y: number }
type Bond = { id: string; a: string; b: string; order: 1 | 2 | 3 }
type Drawing = { atoms: AtomData[]; bonds: Bond[] }
type Tool = 'select' | 'bond'
type Selection = { type: 'atom' | 'bond'; id: string } | null

const WIDTH = 1040
const HEIGHT = 660
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
  const px = (-dy / length) * 6
  const py = (dx / length) * 6
  const offsets = order === 1 ? [0] : order === 2 ? [-0.5, 0.5] : [-1, 0, 1]
  return offsets.map((offset) => ({ x1: a.x + px * offset, y1: a.y + py * offset, x2: b.x + px * offset, y2: b.y + py * offset }))
}

function App() {
  const [drawing, setDrawing] = useState<Drawing>({ atoms: [], bonds: [] })
  const [past, setPast] = useState<Drawing[]>([])
  const [future, setFuture] = useState<Drawing[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [selectedElement, setSelectedElement] = useState<ElementSymbol>('C')
  const [selection, setSelection] = useState<Selection>(null)
  const [bondStart, setBondStart] = useState<string | null>(null)
  const [draggedElement, setDraggedElement] = useState<ElementSymbol | null>(null)
  const [draggingAtom, setDraggingAtom] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [message, setMessage] = useState('Drag an element onto the page to begin.')
  const svgRef = useRef<SVGSVGElement>(null)
  const dragOriginal = useRef<Drawing | null>(null)

  const commit = (next: Drawing) => {
    setPast((items) => [...items, cloneDrawing(drawing)])
    setFuture([])
    setDrawing(next)
  }

  const updateAtom = (id: string, x: number, y: number) => {
    setDrawing((current) => ({ ...current, atoms: current.atoms.map((atom) => atom.id === id ? { ...atom, x, y } : atom) }))
  }

  const pointInCanvas = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current!
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: Math.max(28, Math.min(WIDTH - 28, transformed.x)), y: Math.max(28, Math.min(HEIGHT - 28, transformed.y)) }
  }

  const addAtom = (element: ElementSymbol, x: number, y: number) => {
    const id = crypto.randomUUID()
    commit({ ...drawing, atoms: [...drawing.atoms, { id, element, x, y }] })
    setSelection({ type: 'atom', id })
    setMessage(`${element} placed. Drag it to reposition.`)
  }

  const chooseAtom = (id: string) => {
    if (tool !== 'bond') {
      setSelection({ type: 'atom', id })
      return
    }
    if (!bondStart) {
      setBondStart(id)
      setSelection({ type: 'atom', id })
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
    setSelection(null)
  }

  const chooseBond = (bond: Bond) => {
    const nextOrder = bond.order === 3 ? 1 : (bond.order + 1) as 1 | 2 | 3
    commit({ ...drawing, bonds: drawing.bonds.map((item) => item.id === bond.id ? { ...item, order: nextOrder } : item) })
    setSelection({ type: 'bond', id: bond.id })
    setMessage(`${nextOrder === 1 ? 'Single' : nextOrder === 2 ? 'Double' : 'Triple'} bond selected.`)
  }

  const deleteSelection = () => {
    if (!selection) return
    if (selection.type === 'atom') {
      commit({ atoms: drawing.atoms.filter((atom) => atom.id !== selection.id), bonds: drawing.bonds.filter((bond) => bond.a !== selection.id && bond.b !== selection.id) })
    } else {
      commit({ ...drawing, bonds: drawing.bonds.filter((bond) => bond.id !== selection.id) })
    }
    setSelection(null)
    setBondStart(null)
    setMessage('Selection deleted.')
  }

  const undo = () => {
    const previous = past.at(-1)
    if (!previous) return
    setFuture((items) => [cloneDrawing(drawing), ...items])
    setDrawing(previous)
    setPast((items) => items.slice(0, -1))
    setSelection(null)
  }

  const redo = () => {
    const next = future[0]
    if (!next) return
    setPast((items) => [...items, cloneDrawing(drawing)])
    setDrawing(next)
    setFuture((items) => items.slice(1))
    setSelection(null)
  }

  const exportImage = async (copy = false) => {
    const svg = svgRef.current
    if (!svg) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.querySelectorAll('[data-ui="true"]').forEach((element) => element.remove())
    const source = new XMLSerializer().serializeToString(clone)
    const image = new Image()
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render drawing')); image.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH * 2
    canvas.height = HEIGHT * 2
    const context = canvas.getContext('2d')!
    context.scale(2, 2)
    context.drawImage(image, 0, 0, WIDTH, HEIGHT)
    URL.revokeObjectURL(url)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    if (copy && navigator.clipboard && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setMessage('Image copied. Paste it into your document.')
    } else {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'molecule-notebook.png'
      link.click()
      URL.revokeObjectURL(link.href)
      setMessage('PNG downloaded.')
    }
  }

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (event.key === 'Delete' || event.key === 'Backspace') deleteSelection()
      if (event.key === 'Escape') { setSelection(null); setBondStart(null) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Atom size={25} /></span><span>Molecule <b>Notebook</b></span></div>
        <div className="header-actions">
          <button className="text-button" onClick={() => alert('Place element labels, connect them with bonds, then tap a bond to cycle through single, double, and triple lines.')}><CircleHelp size={18} /> How it works</button>
          <button className="outline-button" onClick={() => exportImage(true)}><Copy size={17} /> Copy image</button>
          <button className="download-button" onClick={() => exportImage()}><Download size={17} /> Download PNG</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Drawing tools">
          <div className="tool-section"><p className="eyebrow">Build your structure</p><h1>Element tray</h1><p className="sidebar-copy">Drag an element from here onto your page.</p></div>
          <div className="element-stack">
            {elements.map((element) => <button key={element.symbol} draggable onDragStart={() => setDraggedElement(element.symbol)} onPointerDown={() => setSelectedElement(element.symbol)} className={`element-card ${element.tone} ${selectedElement === element.symbol ? 'selected-element' : ''}`} aria-label={`Drag ${element.name} onto canvas`}><strong>{element.symbol}</strong><span>{element.name}</span><span className="drag-dots">::::</span></button>)}
          </div>
          <div className="more-wrap">
            <button className="more-elements" onClick={() => setShowMore(!showMore)}><MoreHorizontal size={19} /> More elements</button>
            {showMore && <div className="more-palette">{extraElements.map((element) => <button key={element} draggable onDragStart={() => setDraggedElement(element)} onClick={() => { setSelectedElement(element); setShowMore(false) }}>{element}</button>)}</div>}
          </div>
          <div className="side-rule" />
          <div className="tool-section"><p className="eyebrow">Connect and edit</p><h2>Tools</h2></div>
          <div className="tool-list">
            <button className={tool === 'select' ? 'active-tool' : ''} onClick={() => { setTool('select'); setBondStart(null); setMessage('Select or move an atom.') }}><MousePointer2 size={18} /> Select & move</button>
            <button className={tool === 'bond' ? 'active-tool' : ''} onClick={() => { setTool('bond'); setBondStart(null); setMessage('Tap two atoms to connect them.') }}><Link2 size={18} /> Add bond</button>
            <button className="danger-tool" disabled={!selection} onClick={deleteSelection}><Eraser size={18} /> Delete selection</button>
          </div>
          <div className="sidebar-footer">Tip: Tap a bond to cycle through single, double, and triple bonds.</div>
        </aside>

        <section className="drawing-area">
          <div className="canvas-topline"><div><span className="status-dot" /> <span>{message}</span></div><span className="atom-count">{drawing.atoms.length} atom{drawing.atoms.length === 1 ? '' : 's'}</span></div>
          <div className="canvas-frame">
            <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="molecule-canvas" role="application" aria-label="Chemical structure drawing canvas" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const point = pointInCanvas(event as unknown as React.PointerEvent<SVGSVGElement>); if (draggedElement) addAtom(draggedElement, point.x, point.y); setDraggedElement(null) }} onPointerMove={(event) => { if (draggingAtom) { const point = pointInCanvas(event); updateAtom(draggingAtom, point.x, point.y) } }} onPointerUp={() => { if (draggingAtom && dragOriginal.current) { setPast((items) => [...items, dragOriginal.current!]); setFuture([]); dragOriginal.current = null; setDraggingAtom(null) } }} onPointerDown={(event) => { if (event.target === event.currentTarget) { setSelection(null); setBondStart(null) } }}>
              <defs><pattern id="paper-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M 30 0 L 0 0 0 30" fill="none" stroke="#d9d4c9" strokeWidth="1" opacity=".62" /></pattern></defs>
              <rect width={WIDTH} height={HEIGHT} fill="#fffdf7" /><rect width={WIDTH} height={HEIGHT} fill="url(#paper-grid)" />
              {drawing.bonds.map((bond) => {
                const a = drawing.atoms.find((atom) => atom.id === bond.a); const b = drawing.atoms.find((atom) => atom.id === bond.b)
                if (!a || !b) return null
                const active = selection?.type === 'bond' && selection.id === bond.id
                return <g key={bond.id} onPointerDown={(event) => { event.stopPropagation(); chooseBond(bond) }} className="bond-group" aria-label={`${bond.order} bond`}>
                  <line data-ui="true" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth="28" />
                  {bondLines(a, b, bond.order).map((line, index) => <line key={index} {...line} className={`bond-line ${active ? 'bond-active' : ''}`} />)}
                </g>
              })}
              {drawing.atoms.map((atom) => {
                const active = selection?.type === 'atom' && selection.id === atom.id; const pending = bondStart === atom.id
                return <g key={atom.id} className="atom-group" onPointerDown={(event) => { event.stopPropagation(); chooseAtom(atom.id); if (tool === 'select') { dragOriginal.current = cloneDrawing(drawing); setDraggingAtom(atom.id); event.currentTarget.setPointerCapture(event.pointerId) } }}>
                  {(active || pending) && <circle cx={atom.x} cy={atom.y} r="29" className="atom-halo" />}
                  <circle data-ui="true" cx={atom.x} cy={atom.y} r="24" fill="transparent" />
                  <text x={atom.x} y={atom.y + 10} textAnchor="middle" className="atom-label">{atom.element}</text>
                </g>
              })}
              {drawing.atoms.length === 0 && <g data-ui="true" className="empty-state"><circle cx="520" cy="290" r="43" fill="#f1ede3" /><Atom x="500" y="270" width="40" height="40" color="#a29b8b" /><text x="520" y="365" textAnchor="middle">Your structure will appear here</text><text x="520" y="394" textAnchor="middle" className="empty-subtitle">Drag C, H, or O from the element tray to get started.</text></g>}
            </svg>
          </div>
          <div className="history-bar"><div><button onClick={undo} disabled={!past.length} aria-label="Undo"><Undo2 size={18} /></button><button onClick={redo} disabled={!future.length} aria-label="Redo"><Redo2 size={18} /></button><span className="shortcut-hint">Undo & redo</span></div><div><button className="clear-button" disabled={!drawing.atoms.length} onClick={() => { if (confirm('Clear the entire structure?')) { commit({ atoms: [], bonds: [] }); setSelection(null); setMessage('Fresh page ready.') } }}><Trash2 size={16} /> Clear page</button><button className="reset-button" onClick={() => { setTool('select'); setSelection(null); setBondStart(null); setMessage('Select or move an atom.') }}><RotateCcw size={16} /> Reset tool</button></div></div>
        </section>
      </section>
      <footer><span>Made for classroom chemistry</span><span>Structures stay in this browser until you export them.</span></footer>
      {selection && <button className="floating-delete" onClick={deleteSelection}><X size={18} /> Delete selected</button>}
    </main>
  )
}

export default App
