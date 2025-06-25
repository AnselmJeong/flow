import { GoogleGenerativeAI } from '@google/generative-ai'
import { v4 as uuidv4 } from 'uuid'

import { ChatMessage, ChatSession, db } from './db'

export class AIService {
  private genAI: GoogleGenerativeAI
  private model: any

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey)
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
  }

  async sendMessage(
    content: string,
    bookId: string,
    sessionId?: string,
    context?: {
      text: string
      cfi: string
    }
  ): Promise<{ message: ChatMessage; sessionId: string }> {
    const timestamp = Date.now()
    
    // Create user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp,
      context: context ? { ...context, bookId } : undefined,
    }

    // Get or create session
    let session: ChatSession
    if (sessionId) {
      session = await this.getSession(sessionId)
      session.messages.push(userMessage)
      session.updatedAt = timestamp
    } else {
      session = {
        id: uuidv4(),
        bookId,
        title: this.generateSessionTitle(content, context),
        messages: [userMessage],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    }

    // Prepare context for AI
    const contextPrompt = context 
      ? `\n\nContext from the book:\n"${context.text}"\n\nUser question: ` 
      : ''
    
    const fullPrompt = contextPrompt + content

    try {
      // Get AI response
      const result = await this.model.generateContent(fullPrompt)
      const aiResponse = result.response.text()

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: aiResponse,
        timestamp: Date.now(),
      }

      session.messages.push(assistantMessage)
      session.updatedAt = Date.now()

      // Save session to database
      await this.saveSession(session)
      
      // Update book record with session reference
      await this.updateBookWithSession(bookId, session.id)

      return { message: assistantMessage, sessionId: session.id }
    } catch (error) {
      console.error('AI Service Error:', error)
      console.error('Error details:', {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
        bookId,
        sessionId,
        hasContext: !!context
      })
      
      // Create error message
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Sorry, I encountered an error while processing your request. Please try again.',
        timestamp: Date.now(),
      }

      session.messages.push(errorMessage)
      
      try {
        await this.saveSession(session)
      } catch (saveError) {
        console.error('Error saving session after AI error:', saveError)
      }
      
      return { message: errorMessage, sessionId: session.id }
    }
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const session = await db?.chatSessions.get(sessionId)
    if (!session) {
      throw new Error(`Chat session ${sessionId} not found`)
    }
    return session
  }

  async getSessionsForBook(bookId: string): Promise<ChatSession[]> {
    if (!db) return []
    return await db.chatSessions.where('bookId').equals(bookId).toArray()
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!db) return
    
    // Get session first to get bookId
    const session = await db.chatSessions.get(sessionId)
    if (!session) return
    
    const bookId = session.bookId
    
    // Delete session from chatSessions table
    await db.chatSessions.delete(sessionId)
    
    // Remove session reference from book
    const book = await db.books.get(bookId)
    if (book && book.chatSessions) {
      book.chatSessions = book.chatSessions.filter(s => s.id !== sessionId)
      await db.books.put(book)
    }
  }

  private async saveSession(session: ChatSession): Promise<void> {
    if (!db) return
    await db.chatSessions.put(session)
  }

  private async updateBookWithSession(bookId: string, sessionId: string): Promise<void> {
    if (!db) return
    
    const book = await db.books.get(bookId)
    if (book) {
      // Initialize chatSessions array if it doesn't exist
      if (!book.chatSessions) {
        book.chatSessions = []
      }
      
      // Check if session already exists in book
      const existingSessionIndex = book.chatSessions.findIndex(s => s.id === sessionId)
      
      if (existingSessionIndex === -1) {
        // Add new session reference (only store session metadata, not full object)
        const session = await this.getSession(sessionId)
        book.chatSessions.push({
          id: session.id,
          bookId: session.bookId,
          title: session.title,
          messages: [], // Don't store messages in book record to avoid data duplication
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        })
      } else {
        // Update existing session reference
        const session = await this.getSession(sessionId)
        book.chatSessions[existingSessionIndex] = {
          id: session.id,
          bookId: session.bookId,
          title: session.title,
          messages: [], // Don't store messages in book record to avoid data duplication
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        }
      }
      
      book.updatedAt = Date.now()
      await db.books.put(book)
    }
  }

  private generateSessionTitle(content: string, context?: { text: string; cfi: string }): string {
    if (context?.text) {
      // Use context text for title (first 30 characters)
      const contextTitle = context.text.slice(0, 30).trim()
      return contextTitle + (context.text.length > 30 ? '...' : '') + ' 근처 - AI 채팅'
    }
    
    // Generate a short title from the first message
    const words = content.split(' ').slice(0, 5)
    let title = words.join(' ')
    if (content.split(' ').length > 5) {
      title += '...'
    }
    return title || 'New Chat'
  }
}

// Singleton instance - will be initialized when API key is provided
let aiService: AIService | null = null

export function initializeAI(apiKey: string): AIService {
  aiService = new AIService(apiKey)
  return aiService
}

export function getAIService(): AIService | null {
  return aiService
}