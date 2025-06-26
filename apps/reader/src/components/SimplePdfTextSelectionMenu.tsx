import { Overlay } from '@literal-ui/core'
import clsx from 'clsx'
import { useCallback, useRef, useState, useEffect } from 'react'
import FocusLock from 'react-focus-lock'
import {
  MdCopyAll,
  MdOutlineEdit,
  MdSearch,
  MdChat,
} from 'react-icons/md'

import { colorMap, AnnotationColor } from '../annotation'
import { PdfTab } from '../models'
import { scale } from '../platform'
import { copy, keys } from '../utils'

import { Button, IconButton } from './Button'

interface SimplePdfTextSelectionMenuProps {
  tab: PdfTab
  selectedText: string
  pageNumber: number
  position: { x: number; y: number }
  onClose: () => void
}

export const SimplePdfTextSelectionMenu: React.FC<SimplePdfTextSelectionMenuProps> = ({
  tab,
  selectedText,
  pageNumber,
  position,
  onClose,
}) => {
  const [annotate, setAnnotate] = useState(false)
  const [notes, setNotes] = useState('')
  const [selectedColor, setSelectedColor] = useState<AnnotationColor>('yellow')
  const ref = useRef<HTMLDivElement>(null)

  // Check if text is already annotated
  const existingAnnotation = tab.book.annotations.find(
    (a) => a.page === pageNumber && a.text === selectedText
  )

  useEffect(() => {
    if (existingAnnotation) {
      setAnnotate(true)
      setNotes(existingAnnotation.notes || '')
      setSelectedColor(existingAnnotation.color)
    }
  }, [existingAnnotation])

  const handleCopy = useCallback(() => {
    copy(selectedText)
    onClose()
  }, [selectedText, onClose])

  const handleSearch = useCallback(() => {
    // Trigger search functionality
    console.log('Search:', selectedText)
    onClose()
  }, [selectedText, onClose])

  const handleChat = useCallback(() => {
    // Trigger AI chat with selected text as context
    console.log('AI Chat:', selectedText)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ai-chat-request', {
        detail: { text: selectedText, page: pageNumber }
      }))
    }
    onClose()
  }, [selectedText, pageNumber, onClose])

  const handleAnnotate = useCallback(() => {
    if (annotate) {
      // Save annotation
      tab.putAnnotation('highlight', pageNumber, selectedColor, selectedText, notes)
      onClose()
    } else {
      setAnnotate(true)
    }
  }, [annotate, tab, pageNumber, selectedColor, selectedText, notes, onClose])

  const handleRemoveAnnotation = useCallback(() => {
    if (existingAnnotation) {
      const newAnnotations = tab.book.annotations.filter(a => a.id !== existingAnnotation.id)
      tab.updateBook({ annotations: newAnnotations })
      onClose()
    }
  }, [existingAnnotation, tab, onClose])

  const ICON_SIZE = scale(22, 28)

  return (
    <FocusLock disabled={false}>
      <Overlay
        className="!z-50 !bg-transparent"
        onMouseDown={onClose}
      >
        <div
          ref={ref}
          className={clsx(
            'bg-surface text-on-surface-variant shadow-1 absolute z-50 p-2 focus:outline-none',
          )}
          style={{
            left: position.x - 100, // Center horizontally
            top: position.y - 60,   // Position above selection
          }}
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'c' && e.ctrlKey) {
              copy(selectedText)
            }
          }}
        >
          {annotate ? (
            <div className="mb-3">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-40 w-72 p-2 border border-gray-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add notes..."
                autoFocus
              />
            </div>
          ) : (
            <div className="text-on-surface-variant -mx-1 mb-3 flex gap-1">
              <IconButton
                title="Highlight"
                Icon={MdOutlineEdit}
                size={ICON_SIZE}
                onClick={handleAnnotate}
              />

              <IconButton
                title="AI Chat"
                Icon={MdChat}
                size={ICON_SIZE}
                onClick={handleChat}
              />
            </div>
          )}

          {annotate && (
            <div className="flex gap-2">
              {/* Color selection */}
              <div className="flex gap-1">
                {keys(colorMap).map((color) => (
                  <button
                    key={color}
                    className={clsx(
                      'w-6 h-6 rounded-full border-2',
                      selectedColor === color
                        ? 'border-on-surface'
                        : 'border-outline-variant'
                    )}
                    style={{ backgroundColor: colorMap[color] }}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 ml-auto">
                <Button
                  variant="secondary"
                  onClick={() => setAnnotate(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleAnnotate}
                >
                  Save
                </Button>
              </div>
            </div>
          )}

          {existingAnnotation && !annotate && (
            <div className="border-t border-outline-variant pt-2 mt-2">
              <Button
                variant="secondary"
                onClick={handleRemoveAnnotation}
                className="text-error"
              >
                Remove Annotation
              </Button>
            </div>
          )}
        </div>
      </Overlay>
    </FocusLock>
  )
}

export default SimplePdfTextSelectionMenu