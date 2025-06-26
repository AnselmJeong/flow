import { IS_SERVER } from '@literal-ui/hooks'
import Dexie, { Table } from 'dexie'

import { PackagingMetadataObject } from '@flow/epubjs/types/packaging'

// Extended metadata interface to support both EPUB and PDF
export interface BookMetadata extends Partial<PackagingMetadataObject> {
  title: string
  creator?: string
  description?: string
  language?: string
  publisher?: string
  pubdate?: string
  modified_date?: string
  identifier?: string
  rights?: string
  // PDF-specific fields
  isPdf?: boolean
  numPages?: number
  // Page-based location for PDFs instead of CFI
  currentPage?: number
}

import { Annotation } from './annotation'
import { fileToEpub } from './file'
import { TypographyConfiguration } from './state'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  context?: {
    text: string
    cfi?: string
    page?: number
    bookId: string
  }
}

export interface ChatSession {
  id: string
  bookId: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export interface FileRecord {
  id: string
  file: File
}

export interface CoverRecord {
  id: string
  cover: string | null
}

export interface BookRecord {
  // TODO: use file hash as id
  id: string
  name: string
  size: number
  metadata: BookMetadata
  createdAt: number
  updatedAt?: number
  cfi?: string
  currentPage?: number
  percentage?: number
  definitions: string[]
  annotations: Annotation[]
  chatSessions: ChatSession[]
  configuration?: {
    typography?: TypographyConfiguration
  }
}

export class DB extends Dexie {
  // 'books' is added by dexie when declaring the stores()
  // We just tell the typing system this is the case
  files!: Table<FileRecord>
  covers!: Table<CoverRecord>
  books!: Table<BookRecord>
  chatSessions!: Table<ChatSession>

  constructor(name: string) {
    super(name)

    this.version(7).stores({
      books:
        'id, name, size, metadata, createdAt, updatedAt, cfi, currentPage, percentage, definitions, annotations, chatSessions, configuration',
      chatSessions:
        'id, bookId, title, messages, createdAt, updatedAt',
    })

    this.version(6).stores({
      books:
        'id, name, size, metadata, createdAt, updatedAt, cfi, percentage, definitions, annotations, chatSessions, configuration',
      chatSessions:
        'id, bookId, title, messages, createdAt, updatedAt',
    })

    this.version(5)
      .stores({
        books:
          'id, name, size, metadata, createdAt, updatedAt, cfi, percentage, definitions, annotations, configuration',
      })
      .upgrade(async (t) => {
        t.table('books')
          .toCollection()
          .modify((r) => {
            r.chatSessions = []
          })
      })

    this.version(4)
      .stores({
        books:
          'id, name, size, metadata, createdAt, updatedAt, cfi, percentage, definitions, annotations',
      })
      .upgrade(async (t) => {
        t.table('books')
          .toCollection()
          .modify((r) => {
            r.annotations = []
          })
      })

    this.version(3)
      .stores({
        books:
          'id, name, size, metadata, createdAt, updatedAt, cfi, percentage, definitions',
      })
      .upgrade(async (t) => {
        const files = await t.table('files').toArray()

        const metadatas = await Dexie.waitFor(
          Promise.all(
            files.map(async ({ file }) => {
              const epub = await fileToEpub(file)
              return epub.loaded.metadata
            }),
          ),
        )

        return t
          .table('books')
          .toCollection()
          .modify(async (r) => {
            const i = files.findIndex((f) => f.id === r.id)
            r.metadata = metadatas[i]
            r.size = files[i].file.size
          })
          .catch((e) => {
            console.error(e)
            throw e
          })
      })
    this.version(2)
      .stores({
        books: 'id, name, createdAt, cfi, percentage, definitions',
      })
      .upgrade(async (t) => {
        const books = await t.table('books').toArray()
        ;['covers', 'files'].forEach((tableName) => {
          t.table(tableName)
            .toCollection()
            .modify((r) => {
              const book = books.find((b) => b.name === r.id)
              if (book) r.id = book.id
            })
        })
      })
    this.version(1).stores({
      books: 'id, name, createdAt, cfi, percentage, definitions', // Primary key and indexed props
      covers: 'id, cover',
      files: 'id, file',
    })
  }
}

export const db = IS_SERVER ? null : new DB('re-reader')
