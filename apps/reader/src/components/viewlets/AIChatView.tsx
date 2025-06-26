import React, { useState, useRef, useEffect, useCallback } from 'react'
import { MdSend, MdAdd, MdDelete, MdSettings, MdClose } from 'react-icons/md'
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
  const [showContext, setShowContext] = useState(!!selectedText)
  
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

  // Show context when selected text changes
  useEffect(() => {
    if (selectedText) {
      setShowContext(true)
    }
  }, [selectedText])

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

  const handleContextClick = useCallback(() => {
    if (selectedCfi && tab) {
      try {
        console.log('Context click - selectedCfi:', selectedCfi, 'tab type:', tab.constructor.name)
        // Check if this is a page-based CFI (for PDF) or actual CFI (for ePub)
        if (selectedCfi.startsWith('page-')) {
          const pageNumber = parseInt(selectedCfi.replace('page-', ''))
          console.log('Navigating to PDF page:', pageNumber)
          if (tab.goToPage) {
            // PDF tab - use goToPage method
            tab.goToPage(pageNumber)
            console.log('Called goToPage with:', pageNumber)
          } else {
            console.warn('tab.goToPage method not available')
          }
        } else if (tab.display) {
          console.log('Navigating to ePub CFI:', selectedCfi)
          // ePub tab - use display method with CFI
          tab.display(selectedCfi, false) // Set returnable to false to avoid locationToReturn issues
        }
        // Keep the AI chat view open after navigation
      } catch (error) {
        console.error('Error navigating to context location:', error)
      }
    } else {
      console.log('Cannot navigate - selectedCfi:', selectedCfi, 'tab:', !!tab)
    }
  }, [selectedCfi, tab])

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
      let context: { text: string; cfi?: string; page?: number } | undefined = undefined
      
      if (selectedText && selectedCfi) {
        if (selectedCfi.startsWith('page-')) {
          // PDF context - extract page number
          const pageNumber = parseInt(selectedCfi.replace('page-', ''))
          context = { text: selectedText, page: pageNumber }
        } else {
          // ePub context - use CFI
          context = { text: selectedText, cfi: selectedCfi }
        }
      }

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
    return new Intl.DateTimeFormat('ko-KR', {
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
          <p>책을 열어 AI 채팅을 사용해주세요</p>
        </div>
      </div>
    )
  }

  if (showSettings) {
    return (
      <div className={`flex h-full flex-col p-4 ${className || ''}`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">AI 채팅 설정</h3>
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
            name="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Gemini API 키를 입력하세요"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveApiKey()
              }
            }}
          />
          <p className="mt-1 text-xs text-gray-500">
            API 키는{' '}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Google AI Studio
            </a>
            에서 받을 수 있습니다
          </p>
        </div>
        
        <Button onClick={saveApiKey} disabled={!apiKey.trim()}>
          API 키 저장
        </Button>
      </div>
    )
  }

  return (
    <div className={`flex h-full flex-col bg-white ${className || ''}`}>
      {/* Header */}
      <div className="border-b p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">AI에게 질문하세요</h3>
          <div className="flex gap-2">
            <IconButton
              Icon={MdSettings}
              onClick={() => setShowSettings(true)}
              size={20}
              title="설정"
              className="text-gray-600 hover:text-gray-800"
            />
            <IconButton
              Icon={MdAdd}
              onClick={startNewSession}
              size={20}
              title="새 채팅"
              className="text-gray-600 hover:text-gray-800"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sessions Sidebar */}
        <div className="w-64 border-r bg-gray-50 flex-shrink-0 overflow-hidden">
          <div className="p-4">
            <div className="mb-3 text-sm font-medium text-gray-700">대화 기록</div>
            <div className="space-y-2 max-h-full overflow-y-auto">
              {sessions.map((session) => {
                // Get context from first user message
                const firstUserMessage = session.messages.find(m => m.role === 'user')
                const hasContext = firstUserMessage?.context?.text
                
                return (
                  <div
                    key={session.id}
                    className={`group cursor-pointer rounded-lg p-3 transition-colors hover:bg-white ${
                      currentSession?.id === session.id ? 'bg-white shadow-sm border border-blue-200' : ''
                    }`}
                    onClick={() => selectSession(session)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        {hasContext ? (
                          <>
                            <div className="truncate font-medium text-sm text-gray-800">
                              "{firstUserMessage.context.text.slice(0, 40)}{firstUserMessage.context.text.length > 40 ? '...' : ''}"
                            </div>
                            <div className="text-xs text-blue-600 mt-1">
                              근처 - AI 채팅
                            </div>
                          </>
                        ) : (
                          <div className="truncate font-medium text-sm text-gray-800">{session.title}</div>
                        )}
                        <div className="text-gray-500 text-xs mt-1">
                          {formatTimestamp(session.updatedAt)}
                        </div>
                      </div>
                      <IconButton
                        Icon={MdDelete}
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSession(session.id)
                        }}
                        size={14}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                      />
                    </div>
                    {hasContext && (
                      <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                        질문 {session.messages.filter(m => m.role === 'user').length}개 · 
                        답변 {session.messages.filter(m => m.role === 'assistant').length}개
                      </div>
                    )}
                  </div>
                )
              })}
              {sessions.length === 0 && (
                <div className="text-center text-gray-500 text-sm py-8">
                  아직 대화가 없습니다
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Context Display */}
          {((selectedText && showContext) || (currentSession && currentSession.messages.find(m => m.role === 'user' && m.context))) && (
            <div className="border-b bg-blue-50 p-4 flex-shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
                  <span className="text-sm font-medium text-gray-700">
                    {selectedText ? '선택된 원문 위치를 이용' : '대화 컨텍스트'}
                  </span>
                </div>
                <IconButton
                  Icon={MdClose}
                  onClick={() => setShowContext(false)}
                  size={16}
                  className="text-gray-500 hover:text-gray-700"
                />
              </div>
              <div 
                className="rounded-lg bg-white p-4 shadow-sm border cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  console.log('Context area clicked!')
                  console.log('selectedText:', selectedText)
                  console.log('selectedCfi:', selectedCfi)
                  console.log('currentSession:', currentSession)
                  
                  if (selectedText && selectedCfi) {
                    console.log('Using selectedText context')
                    handleContextClick()
                  } else if (currentSession) {
                    const firstUserMessage = currentSession.messages.find(m => m.role === 'user' && m.context)
                    console.log('firstUserMessage with context:', firstUserMessage)
                    
                    if (firstUserMessage?.context) {
                      console.log('Found context:', firstUserMessage.context)
                      
                      // Handle PDF context (page-based)
                      if (firstUserMessage.context.page && tab && 'goToPage' in tab) {
                        console.log('Navigating to PDF page:', firstUserMessage.context.page)
                        try {
                          tab.goToPage(firstUserMessage.context.page)
                        } catch (error) {
                          console.error('Error navigating to PDF page:', error)
                        }
                      }
                      // Handle ePub context (CFI-based)  
                      else if (firstUserMessage.context.cfi && tab?.display) {
                        console.log('Navigating to ePub CFI:', firstUserMessage.context.cfi)
                        try {
                          tab.display(firstUserMessage.context.cfi, false)
                        } catch (error) {
                          console.error('Error navigating to ePub CFI:', error)
                        }
                      }
                      else {
                        console.log('No valid navigation method found')
                      }
                    }
                  }
                }}
                title="클릭하면 해당 페이지로 이동합니다"
              >
                <div className="text-sm leading-relaxed text-gray-800">
                  "{selectedText || currentSession?.messages.find(m => m.role === 'user' && m.context)?.context?.text}"
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  위치: "{(selectedText || currentSession?.messages.find(m => m.role === 'user' && m.context)?.context?.text)?.slice(0, 20)}..." 근처
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentSession ? (
              <div className="max-w-4xl mx-auto">
                {currentSession.messages.map((message) => (
                  <ChatMessageComponent key={message.id} message={message} />
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <div className="mb-4 text-6xl">🤖</div>
                  <h4 className="text-lg font-medium text-gray-800 mb-2">
                    {selectedText ? '위에 표시된 텍스트에 대해' : 'AI에게 질문하세요'}
                  </h4>
                  <p className="text-gray-600 mb-4">
                    무엇이든 질문해보세요!
                  </p>
                  <div className="text-sm text-gray-500">
                    {selectedText 
                      ? '선택된 텍스트를 클릭하면 해당 페이지로 돌아갑니다'
                      : 'AI에게 질문을 하시면 도움을 드릴 수 있습니다'
                    }
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t bg-white p-6 flex-shrink-0">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <TextField
                    name="chatInput"
                    mRef={inputRef}
                    as="textarea"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="AI에게 질문하세요..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendMessage()
                      }
                    }}
                    disabled={isLoading}
                    className="min-h-[48px] max-h-[120px] resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    rows={1}
                  />
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="h-12 w-12 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 flex items-center justify-center"
                >
                  <MdSend size={20} className="text-white" />
                </Button>
              </div>
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
    <div className="mb-6">
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-3xl ${isUser ? 'order-2' : 'order-1'}`}>
          <div
            className={`rounded-2xl p-4 ${
              isUser 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            {isUser ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
            ) : (
              <div className="prose prose-sm max-w-none text-gray-900">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-lg font-bold mb-3 text-gray-800">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-base font-bold mb-2 text-gray-800">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-bold mb-2 text-gray-800">{children}</h3>,
                    p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed text-gray-700">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-3">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3">{children}</ol>,
                    li: ({ children }) => <li className="mb-1 text-gray-700">{children}</li>,
                    code: ({ children }) => <code className="bg-gray-200 px-2 py-1 rounded text-xs font-mono">{children}</code>,
                    pre: ({ children }) => <pre className="bg-gray-800 text-white p-4 rounded-lg text-sm overflow-x-auto">{children}</pre>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
                    em: ({ children }) => <em className="italic text-gray-700">{children}</em>,
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
          <div className={`mt-2 text-xs ${isUser ? 'text-right text-gray-500' : 'text-gray-500'}`}>
            {new Date(message.timestamp).toLocaleTimeString('ko-KR')}
          </div>
        </div>
      </div>
    </div>
  )
}