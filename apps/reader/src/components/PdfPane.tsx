import React, { useEffect, useRef } from 'react'

import { PdfTab } from '../models'

interface PdfPaneProps {
  tab: PdfTab
  onMouseDown?: (e: React.MouseEvent) => void
}

export const PdfPane: React.FC<PdfPaneProps> = ({ tab, onMouseDown }) => {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      tab.render(ref.current)
    }
  }, [tab])

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={ref}
        className="relative flex-1 overflow-hidden"
        onMouseDown={onMouseDown}
        style={{ colorScheme: 'auto' }}
      />
    </div>
  )
}

export default PdfPane