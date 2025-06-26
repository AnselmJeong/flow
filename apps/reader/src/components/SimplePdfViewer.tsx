import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Worker, Viewer, ViewMode, ScrollMode, SpecialZoomLevel } from '@react-pdf-viewer/core'
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout'
import { highlightPlugin, Trigger, HighlightArea } from '@react-pdf-viewer/highlight'
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation'
import { scrollModePlugin } from '@react-pdf-viewer/scroll-mode'
import { useSnapshot } from 'valtio'

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
  // Reference to page navigation functions
  const jumpToPageRef = useRef<((pageIndex: number) => void) | null>(null)
  const [viewerKey, setViewerKey] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Subscribe to tab state changes (for external page navigation)
  const tabSnapshot = useSnapshot(tab || {})
  
  // Listen for custom page change events from the tab
  useEffect(() => {
    const handlePdfPageChange = (event: CustomEvent) => {
      const { page, tabId } = event.detail
      console.log('Received pdf-page-change event:', { page, tabId, currentTabId: tab?.id })
      
      console.log('Condition check: tab && tabId === tab.id && page !== currentPage', {
        hasTab: !!tab,
        tabIdMatch: tabId === tab?.id,
        pageIsDifferent: page !== currentPage,
        page,
        currentPage
      })
      
      if (tab && tabId === tab.id) { // Remove the page !== currentPage condition
        console.log('Using jumpToPage to navigate from', currentPage, 'to', page)
        console.log('jumpToPageRef.current:', jumpToPageRef.current)
        console.log('pageNavigationPluginInstance:', pageNavigationPluginInstance)
        console.log('pageNavigationPluginInstance.jumpToPage:', pageNavigationPluginInstance.jumpToPage)
        console.log('Target page (0-based):', page - 1)
        
                // Try multiple ways to get jumpToPage function
        const jumpToPageFunction = jumpToPageRef.current || pageNavigationPluginInstance.jumpToPage
        
        if (jumpToPageFunction) {
          try {
            console.log('Calling jumpToPage with page:', page - 1)
            const result = jumpToPageFunction(page - 1) // Convert to 0-based
            console.log('jumpToPage call result:', result)
            console.log('Successfully called jumpToPage')
          } catch (error) {
            console.error('Error calling jumpToPage:', error)
            // Fallback to re-render
            console.log('Falling back to re-render method')
            setCurrentPage(page)
            setViewerKey(prev => prev + 1)
          }
        } else {
          console.warn('jumpToPage function not available, using re-render method')
          
          // Force re-render with initialPage
          console.log('Forcing page change by updating state and key')
          setCurrentPage(page)
          setViewerKey(prev => prev + 1) // Force complete re-render
        }
      }
    }

    window.addEventListener('pdf-page-change', handlePdfPageChange as EventListener)
    return () => {
      window.removeEventListener('pdf-page-change', handlePdfPageChange as EventListener)
    }
  }, [tab, currentPage])
  
  // Create page navigation plugin instance
  const pageNavigationPluginInstance = pageNavigationPlugin({
    enableShortcuts: true  // Enable keyboard shortcuts
  })
  
  // Create scroll mode plugin instance for dual page view
  const scrollModePluginInstance = scrollModePlugin()
  
  // Store the jumpToPage function when plugin is ready
  useEffect(() => {
    console.log('Setting up jumpToPage function from pageNavigationPlugin:', pageNavigationPluginInstance.jumpToPage)
    jumpToPageRef.current = pageNavigationPluginInstance.jumpToPage
    
    // Also get navigation functions for keyboard shortcuts
    const { jumpToNextPage, jumpToPreviousPage } = pageNavigationPluginInstance
    
    // Debug: test if jumpToPage works
    setTimeout(() => {
      console.log('jumpToPage function available:', !!jumpToPageRef.current)
      if (jumpToPageRef.current) {
        console.log('jumpToPage function type:', typeof jumpToPageRef.current)
      }
    }, 1000)
    
    // Also set it for immediate use
    if (pageNavigationPluginInstance.jumpToPage) {
      jumpToPageRef.current = pageNavigationPluginInstance.jumpToPage
      console.log('jumpToPage set immediately')
    }
    
    // Add keyboard event listeners for page navigation
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle arrow keys specifically for PDF navigation
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Prevent all default behaviors for arrow keys
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        
        if (event.key === 'ArrowLeft' && jumpToPreviousPage) {
          jumpToPreviousPage()
          console.log('Previous page via ArrowLeft (forced)')
        } else if (event.key === 'ArrowRight' && jumpToNextPage) {
          jumpToNextPage()
          console.log('Next page via ArrowRight (forced)')
        }
        return false
      }
      
      // Handle PageUp/PageDown normally
      switch (event.key) {
        case 'PageUp':
          if (jumpToPreviousPage) {
            event.preventDefault()
            jumpToPreviousPage()
            console.log('Previous page via PageUp')
          }
          break
        case 'PageDown':
          if (jumpToNextPage) {
            event.preventDefault()
            jumpToNextPage()
            console.log('Next page via PageDown')
          }
          break
      }
    }
    
    // Add event listener to document with capture mode for better control
    document.addEventListener('keydown', handleKeyDown, true)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [pageNavigationPluginInstance])
  
  // Also try to get jumpToPage from defaultLayoutPlugin
  const [defaultLayoutJumpToPage, setDefaultLayoutJumpToPage] = useState<((pageIndex: number) => void) | null>(null)

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
            const selectedPageNumber = props.highlightAreas && props.highlightAreas[0] 
              ? props.highlightAreas[0].pageIndex + 1  // Convert from 0-based to 1-based
              : currentPage // Fallback to current page
            
            console.log('AI Chat triggered with page:', selectedPageNumber, 'from highlightAreas:', props.highlightAreas)
            
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('ai-chat-request', {
                detail: { text: props.selectedText, page: selectedPageNumber }
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
      const newPage = e.currentPage + 1 // Convert from 0-based to 1-based
      console.log('PDF viewer page change:', { from: currentPage, to: newPage })
      setCurrentPage(newPage)
      // Don't update tab here to avoid loops - let the external events handle it
    }, [currentPage]),
    // Handle document load to get total pages
    onDocumentLoad: useCallback((e: any) => {
      console.log('PDF document loaded, total pages:', e.doc.numPages)
      setTotalPages(e.doc.numPages)
    }, [])
  })
  
  // Try to access jumpToPage from defaultLayoutPlugin after it's created
  useEffect(() => {
    console.log('defaultLayoutPluginInstance:', defaultLayoutPluginInstance)
    
    // The default layout plugin might expose page navigation functions
    if (defaultLayoutPluginInstance && typeof defaultLayoutPluginInstance === 'object') {
      const keys = Object.keys(defaultLayoutPluginInstance)
      console.log('defaultLayoutPlugin keys:', keys)
      
      // Look for page navigation properties
      const pageNavigation = keys.find(key => key.includes('page') || key.includes('Page') || key.includes('jump'))
      console.log('Found page navigation related keys:', pageNavigation)
    }
  }, [defaultLayoutPluginInstance])

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
          key={viewerKey}
          fileUrl={fileUrl}
          plugins={[defaultLayoutPluginInstance, highlightPluginInstance, pageNavigationPluginInstance, scrollModePluginInstance]}
          initialPage={currentPage - 1} // Convert to 0-based for react-pdf-viewer
          defaultScale={SpecialZoomLevel.PageFit}
          scrollMode={ScrollMode.Page}
          viewMode={
            // Use DualPageWithCover for better odd page handling
            // This treats the first page as cover and pairs subsequent pages properly
            ViewMode.DualPageWithCover
          }
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