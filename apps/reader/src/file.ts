import * as pdfjsLib from 'pdfjs-dist'
import { v4 as uuidv4 } from 'uuid'

import ePub, { Book } from '@flow/epubjs'

import { BookRecord, db } from './db'
import { mapExtToMimes } from './mime'
import { unpack } from './sync'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`

export async function fileToEpub(file: File) {
  const data = await file.arrayBuffer()
  return ePub(data)
}

export async function fileToPdf(file: File) {
  const data = await file.arrayBuffer()
  return pdfjsLib.getDocument({ data }).promise
}

export async function handleFiles(files: Iterable<File>) {
  const books = await db?.books.toArray()
  const newBooks = []

  for (const file of files) {
    console.log(file)

    if (mapExtToMimes['.zip'].includes(file.type)) {
      unpack(file)
      continue
    }

    if (!mapExtToMimes['.epub'].includes(file.type) && !mapExtToMimes['.pdf'].includes(file.type)) {
      console.error(`Unsupported file type: ${file.type}`)
      continue
    }

    let book = books?.find((b) => b.name === file.name)

    if (!book) {
      book = await addBook(file)
    }

    newBooks.push(book)
  }

  return newBooks
}

export async function addBook(file: File) {
  console.log('addBook called with file:', file.name, 'type:', file.type)
  const isPdf = mapExtToMimes['.pdf'].includes(file.type)
  console.log('isPdf check:', isPdf, 'expected types:', mapExtToMimes['.pdf'])
  
  if (isPdf) {
    const pdf = await fileToPdf(file)
    const metadata = await pdf.getMetadata()
    const info = metadata.info as any
    
    const book: BookRecord = {
      id: uuidv4(),
      name: file.name || `${info?.Title || 'Untitled'}.pdf`,
      size: file.size,
      metadata: {
        title: info?.Title || file.name.replace('.pdf', ''),
        creator: info?.Author || 'Unknown',
        description: info?.Subject || '',
        language: 'en',
        publisher: info?.Producer || '',
        pubdate: info?.CreationDate || '',
        modified_date: info?.ModDate || '',
        identifier: '',
        rights: '',
        // Add PDF-specific metadata
        isPdf: true,
        numPages: pdf.numPages,
      },
      createdAt: Date.now(),
      definitions: [],
      annotations: [],
      chatSessions: [],
    }
    console.log('Adding PDF book to DB:', book)
    db?.books.add(book)
    addFile(book.id, file, undefined, pdf)
    return book
  } else {
    const epub = await fileToEpub(file)
    const metadata = await epub.loaded.metadata

    const book: BookRecord = {
      id: uuidv4(),
      name: file.name || `${metadata.title}.epub`,
      size: file.size,
      metadata: {
        ...metadata,
        isPdf: false,
      },
      createdAt: Date.now(),
      definitions: [],
      annotations: [],
      chatSessions: [],
    }
    db?.books.add(book)
    addFile(book.id, file, epub)
    return book
  }
}

export async function addFile(id: string, file: File, epub?: Book, pdf?: pdfjsLib.PDFDocumentProxy) {
  db?.files.add({ id, file })

  if (mapExtToMimes['.pdf'].includes(file.type)) {
    if (!pdf) {
      pdf = await fileToPdf(file)
    }
    // For PDFs, we'll generate a cover from the first page
    try {
      const page = await pdf.getPage(1)
      const viewport = page.getViewport({ scale: 0.5 })
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      canvas.height = viewport.height
      canvas.width = viewport.width
      
      await page.render({ canvasContext: context, viewport }).promise
      const cover = canvas.toDataURL()
      db?.covers.add({ id, cover })
    } catch (error) {
      console.warn('Failed to generate PDF cover:', error)
      db?.covers.add({ id, cover: null })
    }
  } else {
    if (!epub) {
      epub = await fileToEpub(file)
    }

    const url = await epub.coverUrl()
    const cover = url && (await toDataUrl(url))
    db?.covers.add({ id, cover })
  }
}

export function readBlob(fn: (reader: FileReader) => void) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      resolve(reader.result as string)
    })
    fn(reader)
  })
}

async function toDataUrl(url: string) {
  const res = await fetch(url)
  const buffer = await res.blob()
  return readBlob((r) => r.readAsDataURL(buffer))
}

export async function fetchBook(url: string) {
  const filename = decodeURIComponent(/\/([^/]*\.epub)$/i.exec(url)?.[1] ?? '')
  const books = await db?.books.toArray()
  const book = books?.find((b) => b.name === filename)

  return (
    book ??
    fetch(url)
      .then((res) => res.blob())
      .then((blob) => addBook(new File([blob], filename)))
  )
}
