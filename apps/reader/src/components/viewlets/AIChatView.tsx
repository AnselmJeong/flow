import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MdSend, MdAdd, MdDelete, MdSettings } from 'react-icons/md'
import ReactMarkdown from 'react-markdown'

import { getAIService, initializeAI } from '../../ai'
import { ChatMessage, ChatSession } from '../../db'
import { BookTab } from '../../models'
import { Button, IconButton } from '../Button'
import { TextField } from '../Form'

interface AIChatViewProps {
  tab?: BookTab
  selectedText?: string
  selectedCfi?: string
  onClose?: () => void
  name?: string
  title?: string
  className?: string
}

export const AIChatView: React.FC<AIChatViewProps> = ({
  tab,
  selectedText,
  selectedCfi,
  onClose: _onClose,
  className,
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get book info safely without useSnapshot
  const book = tab?.book || null

  // Load API key from localStorage on mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('gemini-api-key')
    if (savedApiKey) {
      setApiKey(savedApiKey)
      initializeAI(savedApiKey)
    } else {
      setShowSettings(true)
    }
  }, [])

  // Load sessions when book becomes available
  useEffect(() => {
    if (book?.id && apiKey) {
      loadSessions()
    }
  }, [book?.id, apiKey])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  // Set initial input if text is selected (only once)
  useEffect(() => {
    if (selectedText && !input) {
      setInput(`Please explain this text: "${selectedText}"`)
    }
  }, [selectedText]) // Remove input dependency to prevent loop

  const loadSessions = useCallback(async () => {
    if (!book?.id) return
    const aiService = getAIService()
    if (aiService) {
      const bookSessions = await aiService.getSessionsForBook(book.id)
      setSessions(bookSessions)
    }
  }, [book?.id])

  const saveApiKey = useCallback(() => {
    if (apiKey.trim()) {
      localStorage.setItem('gemini-api-key', apiKey.trim())
      initializeAI(apiKey.trim())
      setShowSettings(false)
      if (book?.id) {
        loadSessions()
      }
    }
  }, [apiKey, book?.id, loadSessions])

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !book?.id) return

    const aiService = getAIService()
    if (!aiService) {
      setShowSettings(true)
      return
    }

    setIsLoading(true)
    const messageContent = input.trim()
    setInput('')

    try {
      const context = selectedText && selectedCfi 
        ? { text: selectedText, cfi: selectedCfi }
        : undefined

      const result = await aiService.sendMessage(
        messageContent,
        book.id,
        currentSession?.id,
        context
      )

      // Reload sessions to get updated data
      await loadSessions()
      
      // Update current session
      const updatedSession = await aiService.getSession(result.sessionId)
      setCurrentSession(updatedSession)
      
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const startNewSession = () => {
    setCurrentSession(null)
    setInput('')
    inputRef.current?.focus()
  }

  const selectSession = (session: ChatSession) => {
    setCurrentSession(session)
  }

  const deleteSession = async (sessionId: string) => {
    const aiService = getAIService()
    if (aiService) {
      await aiService.deleteSession(sessionId)
      await loadSessions()
      if (currentSession?.id === sessionId) {
        setCurrentSession(null)
      }
    }
  }

  const formatTimestamp = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp))
  }

  // Conditional rendering based on state
  if (!tab || !book) {
    return (
      <div className={`flex h-full items-center justify-center p-4 ${className || ''}`}>
        <div className="text-center text-gray-500">
          <p>Please open a book to use AI Chat</p>
        </div>
      </div>
    )
  }

  if (showSettings) {
    return (
      <div className={`flex h-full flex-col p-4 ${className || ''}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">AI Chat Settings</h3>
          {apiKey && (
            <IconButton
              Icon={MdSettings}
              onClick={() => setShowSettings(false)}
              size={20}
            />
          )}
        </div>
        
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">
            Gemini API Key
          </label>
          <TextField
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Enter your Gemini API key"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveApiKey()
              }
            }}
          />
          <p className="mt-1 text-xs text-gray-500">
            Get your API key from{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Google AI Studio
            </a>
          </p>
        </div>
        
        <Button onClick={saveApiKey} disabled={!apiKey.trim()}>
          Save API Key
        </Button>
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col ${className || ''}`}>
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">AI Chat</h3>
          <div className="flex gap-2">
            <IconButton
              Icon={MdSettings}
              onClick={() => setShowSettings(true)}
              size={20}
              title="Settings"
            />
            <IconButton
              Icon={MdAdd}
              onClick={startNewSession}
              size={20}
              title="New Chat"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-64 border-r p-2 flex-shrink-0">
          <div className="mb-2 text-sm font-medium">Chat History</div>
          <div className="space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`cursor-pointer rounded p-2 text-xs hover:bg-gray-100 ${
                  currentSession?.id === session.id ? 'bg-blue-100' : ''
                }`}
                onClick={() => selectSession(session)}
              >
                <div className="flex items-center justify-between">
                  <div className="truncate font-medium">{session.title}</div>
                  <IconButton
                    Icon={MdDelete}
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSession(session.id)
                    }}
                    size={14}
                    className="opacity-0 group-hover:opacity-100"
                  />
                </div>
                <div className="text-gray-500">
                  {formatTimestamp(session.updatedAt)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {currentSession ? (
              <div className="w-full">
                {currentSession.messages.map((message) => (
                  <ChatMessageComponent key={message.id} message={message} />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500">
                Select a chat or start a new conversation
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2 items-end">
              <TextField
                ref={inputRef}
                as="textarea"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about the book..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                disabled={isLoading}
                className="flex-1 min-h-[60px] max-h-[120px] resize-y"
                rows={2}
              />
              <IconButton
                Icon={MdSend}
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size={20}
                className="mb-1"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const ChatMessageComponent: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user'
  
  return (
    <div className="w-full mb-4">
      <div
        className={`w-full rounded-lg p-4 ${
          isUser 
            ? 'bg-blue-500 text-white' 
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        ) : (
          <div className="prose prose-sm max-w-none text-gray-900">
            <ReactMarkdown
              components={{
                // Custom styling for markdown elements
                h1: ({ children }) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                code: ({ children }) => <code className="bg-gray-200 px-1 py-0.5 rounded text-xs">{children}</code>,
                pre: ({ children }) => <pre className="bg-gray-200 p-2 rounded text-xs overflow-x-auto">{children}</pre>,
                strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
        <div className={`mt-2 text-xs ${isUser ? 'text-blue-100' : 'text-gray-500'}`}>
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}