import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import { MdCheckCircle, MdError, MdInfo, MdWarning, MdClose } from 'react-icons/md'

export interface ToastProps {
  id: string
  type?: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  onClose: (id: string) => void
}

export const Toast: React.FC<ToastProps> = ({
  id,
  type = 'info',
  title,
  message,
  duration = 5000,
  onClose,
}) => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(true)
    
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(() => onClose(id), 300) // 애니메이션 완료 후 제거
      }, duration)
      
      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  const handleClose = () => {
    setVisible(false)
    setTimeout(() => onClose(id), 300)
  }

  const icons = {
    success: <MdCheckCircle className="w-5 h-5" />,
    error: <MdError className="w-5 h-5" />,
    warning: <MdWarning className="w-5 h-5" />,
    info: <MdInfo className="w-5 h-5" />,
  }

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  }

  const iconColors = {
    success: 'text-green-600',
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
  }

  return (
    <div
      className={clsx(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-300 max-w-md',
        colors[type],
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      )}
    >
      <div className={clsx(iconColors[type], 'flex-shrink-0 mt-0.5')}>
        {icons[type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{title}</div>
        {message && <div className="text-sm mt-1 opacity-90">{message}</div>}
      </div>
      <button
        onClick={handleClose}
        className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
      >
        <MdClose className="w-4 h-4" />
      </button>
    </div>
  )
}

// 토스트 컨테이너
export interface ToastContainerProps {
  toasts: ToastProps[]
  onClose: (id: string) => void
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  )
}

// 토스트 훅
export const useToast = () => {
  const [toasts, setToasts] = useState<ToastProps[]>([])

  const addToast = (toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { ...toast, id, onClose: removeToast }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const showSuccess = (title: string, message?: string) => {
    addToast({ type: 'success', title, message })
  }

  const showError = (title: string, message?: string) => {
    addToast({ type: 'error', title, message })
  }

  const showWarning = (title: string, message?: string) => {
    addToast({ type: 'warning', title, message })
  }

  const showInfo = (title: string, message?: string) => {
    addToast({ type: 'info', title, message })
  }

  return {
    toasts,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  }
} 