import React, { useState, useCallback } from 'react'
import { Worker, Viewer } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'
import { highlightPlugin, Trigger, HighlightArea } from '@react-pdf-viewer/highlight'

import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/default-layout/lib/styles/index.css'
import '@react-pdf-viewer/highlight/lib/styles/index.css'

// Import simplified PDF text selection menu component (no Recoil dependency)
import SimplePdfTextSelectionMenu from './SimplePdfTextSelectionMenu'
import { MdOutlineEdit, MdChat, MdDelete } from 'react-icons/md'

// Force enable text selection for PDF viewer
const pdfViewerStyles = `
  .pdf-viewer-container * {
    user-select: text !important;
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
  }
  .rpv-core__text-layer {
    user-select: text !important;
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
  }
`

interface SimplePdfViewerProps {
  fileUrl: string
  tab?: any // PdfTab instance for annotations
  book?: any // BookRecord for annotations
}


export const SimplePdfViewer: React.FC<SimplePdfViewerProps> = ({ fileUrl, tab, book }) => {
  const [currentPage, setCurrentPage] = useState(1)
  const [highlightAreas, setHighlightAreas] = useState<HighlightArea[]>([])
  const [selectedHighlight, setSelectedHighlight] = useState<{
    areas: HighlightArea[]
    content: string
    position: { x: number; y: number }
  } | null>(null)
  const [highlightToDelete, setHighlightToDelete] = useState<{
    annotationId: string
    position: { x: number; y: number }
  } | null>(null)

  // Load existing highlights from annotations
  React.useEffect(() => {
    if (tab?.book.annotations) {
      const areas: any[] = []
      
      const highlights = tab.book.annotations.filter(a => a.type === 'highlight')
      console.log('Loading highlights:', highlights.length)
      
      highlights.forEach(annotation => {
        // If we have stored highlight areas, use them
        if (annotation.highlightAreas && Array.isArray(annotation.highlightAreas)) {
          const areasWithId = annotation.highlightAreas.map(area => ({
            ...area,
            annotationId: annotation.id // Add annotation ID for deletion
          }))
          areas.push(...areasWithId)
          console.log('Added highlight areas for annotation:', annotation.id)
        } else {
          // Fallback to default positioning (not ideal)
          areas.push({
            pageIndex: (annotation.page || 1) - 1, // Convert to 0-based
            height: 1.5,
            width: 20,
            left: 10,
            top: 10,
            annotationId: annotation.id
          })
          console.log('Added fallback highlight for annotation:', annotation.id)
        }
      })
      
      console.log('Total highlight areas:', areas.length)
      setHighlightAreas(areas)
    }
  }, [tab?.book.annotations])

  // Render highlight target (what shows when text is selected)
  const renderHighlightTarget = useCallback((props: any) => (
    <div
      className="bg-surface text-on-surface-variant shadow-1"
      style={{
        position: 'absolute',
        left: `${props.selectionRegion.left}%`,
        top: `${props.selectionRegion.top + props.selectionRegion.height}%`,
        transform: 'translate(0, 8px)',
        zIndex: 1000,
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid rgba(0, 0, 0, 0.1)',
      }}
    >
      <div className="text-on-surface-variant -mx-1 flex gap-1">
        <button
          className="relative block p-0.5 hover:bg-gray-100 rounded"
          title="Highlight"
          onClick={() => {
            // Check for duplicate highlights
            const selectedText = props.selectedText.trim()
            const pageIndex = props.highlightAreas[0]?.pageIndex + 1
            
            const existingAnnotation = tab?.book.annotations.find(
              a => a.type === 'highlight' && 
                   a.text?.trim() === selectedText && 
                   a.page === pageIndex
            )
            
            if (existingAnnotation) {
              console.log('Highlight already exists for this text')
              props.cancel()
              return
            }
            
            // Add highlight using the actual selected areas
            const newAreas = props.highlightAreas
            setHighlightAreas([...highlightAreas, ...newAreas])
            
            // Save to annotations with actual coordinates
            if (tab && newAreas.length > 0) {
              // Use the first area's coordinates for storage
              const area = newAreas[0]
              // Clean the highlight areas to remove any non-serializable properties
              const cleanAreas = newAreas.map(area => ({
                pageIndex: area.pageIndex,
                height: area.height,
                width: area.width,
                left: area.left,
                top: area.top
              }))
              
              tab.putAnnotation('highlight', area.pageIndex + 1, 'yellow', props.selectedText, '', {
                highlightAreas: cleanAreas // Store only serializable data
              })
            }
            
            props.cancel()
          }}
        >
          <MdOutlineEdit size={22} />
        </button>

        <button
          className="relative block p-0.5 hover:bg-gray-100 rounded"
          title="AI Chat"
          onClick={() => {
            // Trigger AI chat
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('ai-chat-request', {
                detail: { text: props.selectedText, page: currentPage }
              }))
            }
            props.cancel()
          }}
        >
          <MdChat size={22} />
        </button>
      </div>
    </div>
  ), [highlightAreas, tab, currentPage])

  // Render existing highlights
  const renderHighlights = useCallback((props: any) => (
    <div>
      {highlightAreas
        .filter((area) => area.pageIndex === props.pageIndex)
        .map((area, idx) => (
          <div
            key={`${area.annotationId}-${idx}-${area.pageIndex}-${area.left}-${area.top}`}
            className="pdf-highlight"
            style={{
              ...props.getCssProperties(area, props.rotation),
              background: '#ffff00',
              opacity: 0.3,
              position: 'absolute',
              cursor: 'pointer',
              zIndex: 100,
              pointerEvents: 'auto'
            }}
            onMouseDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              console.log('Highlight clicked:', area.annotationId)
              // Show delete menu
              setHighlightToDelete({
                annotationId: area.annotationId,
                position: { x: e.clientX, y: e.clientY }
              })
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.preventDefault()
              console.log('Highlight pointer down:', area.annotationId)
              // Show delete menu
              setHighlightToDelete({
                annotationId: area.annotationId,
                position: { x: e.clientX, y: e.clientY }
              })
            }}
            title="Click to delete highlight"
          />
        ))}
    </div>
  ), [highlightAreas])

  // Create highlight plugin instance
  const highlightPluginInstance = highlightPlugin({
    renderHighlightTarget,
    renderHighlights,
    trigger: Trigger.TextSelection, // Enable text selection
  })

  // Create the default layout plugin instance
  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    // Handle page changes
    onPageChange: useCallback((e: any) => {
      setCurrentPage(e.currentPage + 1) // Convert from 0-based to 1-based
    }, [])
  })

  // Function to delete highlight
  const deleteHighlight = useCallback((annotationId: string) => {
    if (tab) {
      // Remove from database
      const newAnnotations = tab.book.annotations.filter(a => a.id !== annotationId)
      tab.updateBook({ annotations: newAnnotations })
      
      // Remove from state
      setHighlightAreas(prev => prev.filter(area => area.annotationId !== annotationId))
    }
    setHighlightToDelete(null)
  }, [tab])

  // Close delete menu when clicking elsewhere (with delay)
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Don't close if clicking on a highlight or the delete menu
      const target = e.target as HTMLElement
      if (target.closest('.pdf-highlight') || target.closest('[data-delete-menu]')) {
        return
      }
      // Add small delay to allow delete button click to register
      setTimeout(() => {
        setHighlightToDelete(null)
      }, 100)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
      <div 
        className="pdf-viewer-container"
        style={{
          height: '100%',
          width: '100%',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text'
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: pdfViewerStyles }} />
        <Viewer 
          fileUrl={fileUrl}
          plugins={[defaultLayoutPluginInstance, highlightPluginInstance]}
        />
        
        {/* Delete highlight menu */}
        {highlightToDelete && (
          <div
            data-delete-menu="true"
            style={{
              position: 'fixed',
              left: Math.max(10, highlightToDelete.position.x - 15),
              top: Math.max(10, highlightToDelete.position.y - 35),
              zIndex: 99999,
              backgroundColor: 'white',
              border: '1px solid #dc3545',
              borderRadius: '6px',
              padding: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                color: '#dc3545',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Delete highlight"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('Delete button mouse down!')
                deleteHighlight(highlightToDelete.annotationId)
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f8d7da'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <MdDelete size={20} />
            </button>
          </div>
        )}
      </div>
    </Worker>
  )
}

export default SimplePdfViewer