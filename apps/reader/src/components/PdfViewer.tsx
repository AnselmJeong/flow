import React, { useCallback, useRef, useState } from 'react'
import { Worker, Viewer } from '@react-pdf-viewer/core'
import '@react-pdf-viewer/core/lib/styles/index.css'

import { BookRecord } from '../db'
import { PdfTab } from '../models'

import PdfTextSelectionMenu from './PdfTextSelectionMenu'

export type PdfViewMode = 'single' | 'dual' | 'scroll'

interface PdfViewerProps {
  book: BookRecord
  tab: PdfTab
  fileUrl: string
  viewMode?: PdfViewMode
  onPageChange?: (page: number) => void
  onTextSelect?: (text: string, pageIndex: number) => void
  onViewModeChange?: (mode: PdfViewMode) => void
  className?: string
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  book,
  tab,
  fileUrl,
  viewMode = 'dual',
  onPageChange,
  onTextSelect,
  onViewModeChange,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(book.currentPage || 1)
  const [currentViewMode, setCurrentViewMode] = useState<PdfViewMode>(viewMode)
  const [selectedText, setSelectedText] = useState<string>('')
  const [selectionPageNumber, setSelectionPageNumber] = useState<number>(0)
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [showSelectionMenu, setShowSelectionMenu] = useState(false)


  // Handle page changes
  const handlePageChange = useCallback((e: any) => {
    const pageIndex = e.currentPage + 1 // Convert from 0-based to 1-based
    setCurrentPage(pageIndex)
    onPageChange?.(pageIndex)
  }, [onPageChange])


  // Close selection menu
  const handleCloseSelectionMenu = useCallback(() => {
    setShowSelectionMenu(false)
    setSelectedText('')
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
    }
  }, [])

  return (
    <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
      <div 
        ref={containerRef}
        className={className}
        style={{
          border: '1px solid rgba(0, 0, 0, 0.3)',
          height: '100%',
          width: '100%'
        }}
        onContextMenu={(e) => {
          // Get selection when right-clicking
          setTimeout(() => {
            const selection = window.getSelection()
            if (selection && selection.toString().trim()) {
              e.preventDefault()
              const text = selection.toString()
              console.log('Text selected on right click:', text)
              setSelectedText(text)
              setSelectionPageNumber(currentPage)
              setSelectionPosition({ x: e.clientX, y: e.clientY })
              setShowSelectionMenu(true)
              onTextSelect?.(text, currentPage)
            }
          }, 50)
        }}
      >
        <Viewer
          fileUrl={fileUrl}
          onPageChange={handlePageChange}
          defaultScale={1.0}
          initialPage={book.currentPage ? book.currentPage - 1 : 0}
        />
        
        {/* Text Selection Menu */}
        {showSelectionMenu && selectedText && (
          <PdfTextSelectionMenu
            tab={tab}
            selectedText={selectedText}
            pageNumber={selectionPageNumber}
            position={selectionPosition}
            onClose={handleCloseSelectionMenu}
          />
        )}
      </div>
    </Worker>
  )
}

export default PdfViewer