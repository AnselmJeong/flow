import { useBoolean } from '@literal-ui/hooks'
import clsx from 'clsx'
import { useLiveQuery } from 'dexie-react-hooks'
import Head from 'next/head'
import { useRouter } from 'next/router'
import React, { useEffect, useState } from 'react'
import {
  MdCheckBox,
  MdCheckBoxOutlineBlank,
  MdCheckCircle,
  MdSearch,
} from 'react-icons/md'
import { useSet } from 'react-use'
import { usePrevious } from 'react-use'

import { ReaderGridView, Button, TextField, DropZone, ToastContainer, useToast } from '../components'
import { BookRecord, CoverRecord, db } from '../db'
import { addFile, fetchBook, handleFiles } from '../file'
import {
  useDisablePinchZooming,
  useLibrary,
  useMobile,
  useRemoteBooks,
  useRemoteFiles,
  useTranslation,
} from '../hooks'
import { reader, useReaderSnapshot } from '../models'
import { lock } from '../styles'
import { dbx, uploadData } from '../sync'

const placeholder = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect fill="gray" fill-opacity="0" width="1" height="1"/></svg>`

const SOURCE = 'src'

export default function Index() {
  const { focusedTab } = useReaderSnapshot()
  const router = useRouter()
  const src = new URL(window.location.href).searchParams.get(SOURCE)
  const [loading, setLoading] = useState(!!src)

  useDisablePinchZooming()

  useEffect(() => {
    let src = router.query[SOURCE]
    if (!src) return
    if (!Array.isArray(src)) src = [src]

    Promise.all(
      src.map((s) =>
        fetchBook(s).then((b) => {
          reader.addTab(b)
        }),
      ),
    ).finally(() => setLoading(false))
  }, [router.query])

  useEffect(() => {
    if ('launchQueue' in window && 'LaunchParams' in window) {
      window.launchQueue.setConsumer((params) => {
        console.log('launchQueue', params)
        if (params.files.length) {
          Promise.all(params.files.map((f) => f.getFile()))
            .then((files) => handleFiles(files))
            .then((books) => books.forEach((b) => reader.addTab(b)))
        }
      })
    }
  }, [])

  useEffect(() => {
    router.beforePopState(({ url }) => {
      if (url === '/') {
        reader.clear()
      }
      return true
    })
  }, [router])

  return (
    <>
      <Head>
        {/* https://github.com/microsoft/vscode/blob/36fdf6b697cba431beb6e391b5a8c5f3606975a1/src/vs/code/browser/workbench/workbench.html#L16 */}
        {/* Disable pinch zooming */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no"
        />
        <title>{focusedTab?.title ?? 'Flow'}</title>
      </Head>
      <ReaderGridView />
      {loading || <Library />}
    </>
  )
}

const Library: React.FC = () => {
  const books = useLibrary()
  const covers = useLiveQuery(() => db?.covers.toArray() ?? [])
  const t = useTranslation('home')

  const { data: remoteBooks, mutate: mutateRemoteBooks } = useRemoteBooks()
  const { data: remoteFiles, mutate: mutateRemoteFiles } = useRemoteFiles()
  const previousRemoteBooks = usePrevious(remoteBooks)
  const previousRemoteFiles = usePrevious(remoteFiles)

  const [select, toggleSelect] = useBoolean(false)
  const [selectedBookIds, { add, has, toggle, reset }] = useSet<string>()
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState<string | undefined>()
  const [readyToSync, setReadyToSync] = useState(false)
  const { toasts, removeToast, showSuccess, showError, showWarning, showInfo } = useToast()

  const { groups } = useReaderSnapshot()

  useEffect(() => {
    if (previousRemoteFiles && remoteFiles) {
      // to remove effect dependency `books`
      db?.books.toArray().then((books) => {
        if (books.length === 0) return

        const newRemoteBooks = remoteFiles.map((f) =>
          books.find((b) => b.name === f.name),
        ) as BookRecord[]

        uploadData(newRemoteBooks)
        mutateRemoteBooks(newRemoteBooks, { revalidate: false })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutateRemoteBooks, remoteFiles])

  useEffect(() => {
    if (!previousRemoteBooks && remoteBooks) {
      db?.books.bulkPut(remoteBooks).then(() => setReadyToSync(true))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteBooks])

  useEffect(() => {
    if (!remoteFiles || !readyToSync) return

    db?.books.toArray().then(async (books) => {
      for (const remoteFile of remoteFiles) {
        const book = books.find((b) => b.name === remoteFile.name)
        if (!book) continue

        const file = await db?.files.get(book.id)
        if (file) continue

        setLoading(book.id)
        await dbx
          .filesDownload({ path: `/files/${remoteFile.name}` })
          .then((d) => {
            const blob: Blob = (d.result as any).fileBlob
            return addFile(book.id, new File([blob], book.name))
          })
        setLoading(undefined)
      }
    })
  }, [readyToSync, remoteFiles])

  useEffect(() => {
    if (!select) reset()
  }, [reset, select])

  if (groups.length) return null
  if (!books) return null

  // Filter books based on search query
  const filteredBooks = searchQuery
    ? books.filter((book) =>
        (book.metadata?.title || book.name).toLowerCase().includes(searchQuery.toLowerCase()) ||
        book.metadata?.creator?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : books

  // Sort books by date added (most recent first) for "Recently Added" section
  const recentBooks = [...filteredBooks]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 6) // Show only first 6 books in recently added

  const selectedBooks = [...selectedBookIds].map(
    (id) => books.find((b) => b.id === id)!,
  )
  const allSelected = selectedBookIds.size === books.length

  return (
    <DropZone
      className="scroll-parent h-full p-4"
      onDrop={(e) => {
        const bookId = e.dataTransfer.getData('text/plain')
        const book = books.find((b) => b.id === bookId)
        if (book) reader.addTab(book)

        handleFiles(e.dataTransfer.files)
      }}
    >
      {/* Header */}
      <div className="mb-8">
        {/* Title Row */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{t('my_library')}</h1>
        </div>

        {/* Search and Action Bar */}
        <div className="flex items-center gap-4 mb-6">
          {/* Enhanced Search Box */}
          <div className="flex-1 max-w-md relative">
            <div className="relative">
              <MdSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="책 제목이나 저자를 검색하세요..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-shadow duration-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {books.length ? (
              <Button 
                variant="secondary" 
                onClick={toggleSelect}
                className="px-4 py-2 text-sm"
              >
                {t(select ? 'cancel' : 'select')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={!books}
                onClick={() => {
                  fetchBook(
                    'https://epubtest.org/books/Fundamental-Accessibility-Tests-Basic-Functionality-v1.0.0.epub',
                  )
                }}
                className="px-4 py-2 text-sm"
              >
                {t('download_sample_book')}
              </Button>
            )}
            
            {select && (
              <>
                {allSelected ? (
                  <Button 
                    variant="secondary" 
                    onClick={reset}
                    className="px-4 py-2 text-sm"
                  >
                    {t('deselect_all')}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => books.forEach((b) => add(b.id))}
                    className="px-4 py-2 text-sm"
                  >
                    {t('select_all')}
                  </Button>
                )}
              </>
            )}

            {/* Import Button */}
            {!select && (
              <Button className="relative bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm rounded-lg font-medium shadow-sm hover:shadow-md transition-all duration-200">
                <input
                  type="file"
                  accept="application/epub+zip,application/epub,application/zip"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => {
                    const files = e.target.files
                    if (files) handleFiles(files)
                  }}
                />
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Import Books
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Selection Action Buttons */}
        {select && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200/60 shadow-sm">
            <span className="text-sm text-violet-700 font-medium">
              {selectedBookIds.size}개 선택됨
            </span>
            <div className="flex gap-3 ml-auto">
              <Button
                onClick={async () => {
                  toggleSelect()

                  // 재시도 함수
                  const uploadWithRetry = async (book: BookRecord, file: any, maxRetries = 3) => {
                    for (let attempt = 1; attempt <= maxRetries; attempt++) {
                      try {
                        await dbx.filesUpload({
                          path: `/files/${book.name}`,
                          contents: file.file,
                        })
                        return true
                      } catch (error: any) {
                        console.error(`Upload attempt ${attempt} failed for ${book.name}:`, error)
                        
                        // 429 Rate Limit 에러인 경우
                        if (error.status === 429) {
                          const retryAfter = error.headers?.['retry-after'] || (attempt * 2)
                          console.log(`Rate limit reached. Waiting ${retryAfter} seconds before retry...`)
                          
                          if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
                            continue
                          }
                        }
                        
                        // 마지막 시도였거나 다른 에러인 경우
                        if (attempt === maxRetries) {
                          throw error
                        }
                        
                        // 일반적인 재시도 대기 (지수 백오프)
                        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
                      }
                    }
                    return false
                  }

                  let successCount = 0
                  let failedBooks: string[] = []
                  let totalBooks = selectedBooks.filter(book => {
                    const remoteFile = remoteFiles?.find(f => f.name === book.name)
                    return !remoteFile
                  }).length

                  if (totalBooks === 0) {
                    showInfo('업로드 불필요', '선택된 모든 책이 이미 클라우드에 동기화되어 있습니다.')
                    return
                  }

                  showInfo('업로드 시작', `${totalBooks}개 파일 업로드를 시작합니다...`)

                  for (const book of selectedBooks) {
                    const remoteFile = remoteFiles?.find(
                      (f) => f.name === book.name,
                    )
                    if (remoteFile) continue

                    const file = await db?.files.get(book.id)
                    if (!file) continue

                    setLoading(book.id)
                    try {
                      await uploadWithRetry(book, file)
                      successCount++
                    } catch (error: any) {
                      console.error(`Failed to upload ${book.name} after all retries:`, error)
                      failedBooks.push(book.name)
                      
                                             // 사용자에게 알림
                       if (error.status === 429) {
                         showWarning('업로드 제한', `${book.name} 파일의 업로드가 제한되었습니다. 잠시 후 다시 시도해주세요.`)
                       } else {
                         showError('업로드 실패', `${book.name}: ${error.message || '알 수 없는 오류'}`)
                       }
                    }
                    setLoading(undefined)
                  }

                  mutateRemoteFiles()
                  
                  // 결과 요약 알림
                  if (successCount > 0 || failedBooks.length > 0) {
                    if (failedBooks.length === 0) {
                      showSuccess('업로드 완료', `${successCount}개 파일이 성공적으로 업로드되었습니다.`)
                    } else if (successCount === 0) {
                      showError('업로드 실패', `${failedBooks.length}개 파일의 업로드가 모두 실패했습니다.`)
                    } else {
                      showWarning('업로드 부분 완료', `성공: ${successCount}개, 실패: ${failedBooks.length}개`)
                    }
                  }
                }}
                className="px-4 py-2 text-sm bg-emerald-100 hover:bg-emerald-200 text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-lg font-medium transition-colors duration-200"
                title="선택된 책들을 Dropbox 클라우드에 업로드합니다"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  클라우드 업로드
                </span>
              </Button>
              <Button
                onClick={async () => {
                  toggleSelect()
                  const bookIds = [...selectedBookIds]

                  db?.books.bulkDelete(bookIds)
                  db?.covers.bulkDelete(bookIds)
                  db?.files.bulkDelete(bookIds)

                  // folder data is not updated after `filesDeleteBatch`
                  mutateRemoteFiles(
                    async (data) => {
                      await dbx.filesDeleteBatch({
                        entries: selectedBooks.map((b) => ({
                          path: `/files/${b.name}`,
                        })),
                      })
                      return data?.filter(
                        (f) => !selectedBooks.find((b) => b.name === f.name),
                      )
                    },
                    { revalidate: false },
                  )
                }}
                className="px-4 py-2 text-sm bg-rose-100 hover:bg-rose-200 text-rose-700 hover:text-rose-800 border border-rose-200 rounded-lg font-medium transition-colors duration-200"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  삭제
                </span>
              </Button>
            </div>
          </div>
        )}


      </div>

      <div className="scroll h-full">
        {/* Recently Added Section */}
        {!searchQuery && recentBooks.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('recently_added')}</h2>
              {recentBooks.length >= 6 && (
                <Button
                  variant="secondary"
                  onClick={() => setSearchQuery('')}
                >
                  {t('show_all')}
                </Button>
              )}
            </div>
            <ul
              className="grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(calc(80px + 3vw), 1fr))`,
                columnGap: lock(16, 32),
                rowGap: lock(32, 48),
              }}
            >
              {recentBooks.map((book) => (
                <Book
                  key={book.id}
                  book={book}
                  covers={covers}
                  select={select}
                  selected={has(book.id)}
                  loading={loading === book.id}
                  toggle={toggle}
                />
              ))}
            </ul>
          </div>
        )}

        {/* All Books Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {searchQuery ? `검색 결과 (${filteredBooks.length})` : t('all_books')}
            </h2>
          </div>
          
          {filteredBooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {searchQuery ? (
                // No search results
                <>
                  <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <MdSearch className="w-12 h-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-medium text-gray-900 mb-2">검색 결과가 없습니다</h3>
                  <p className="text-gray-500 mb-4">
                    '{searchQuery}'에 대한 검색 결과를 찾을 수 없습니다.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2"
                  >
                    모든 책 보기
                  </Button>
                </>
              ) : (
                // No books at all
                <>
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center mb-6">
                    <svg className="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">첫 번째 책을 추가해보세요!</h3>
                  <p className="text-gray-600 mb-8 max-w-md">
                    EPUB 파일을 업로드하여 디지털 도서관을 시작해보세요. 
                    파일을 드래그 앤 드롭하거나 버튼을 클릭하여 추가할 수 있습니다.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 items-center">
                    <Button className="relative bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-medium shadow-lg hover:shadow-xl transition-all duration-200 text-lg">
                      <input
                        type="file"
                        accept="application/epub+zip,application/epub,application/zip"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={(e) => {
                          const files = e.target.files
                          if (files) handleFiles(files)
                        }}
                      />
                                             <span className="flex items-center gap-3">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                         </svg>
                         Import Books
                       </span>
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={!books}
                      onClick={() => {
                        fetchBook(
                          'https://epubtest.org/books/Fundamental-Accessibility-Tests-Basic-Functionality-v1.0.0.epub',
                        )
                      }}
                      className="px-6 py-4 text-base rounded-xl"
                    >
                      샘플 책 다운로드
                    </Button>
                  </div>
                  <div className="mt-8 p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <p className="text-sm text-gray-500">
                      💡 <strong>팁:</strong> EPUB 파일을 이 영역에 직접 드래그해서 놓으시면 자동으로 추가됩니다.
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <ul
              className="grid"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(calc(80px + 3vw), 1fr))`,
                columnGap: lock(16, 32),
                rowGap: lock(32, 48),
              }}
            >
              {filteredBooks.map((book) => (
              <Book
                key={book.id}
                book={book}
                covers={covers}
                select={select}
                selected={has(book.id)}
                loading={loading === book.id}
                toggle={toggle}
              />
            ))}
            </ul>
          )}
        </div>
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </DropZone>
  )
}

interface BookProps {
  book: BookRecord
  covers?: CoverRecord[]
  select?: boolean
  selected?: boolean
  loading?: boolean
  toggle: (id: string) => void
}
const Book: React.FC<BookProps> = ({
  book,
  covers,
  select,
  selected,
  loading,
  toggle,
}) => {
  const remoteFiles = useRemoteFiles()

  const router = useRouter()
  const mobile = useMobile()

  const cover = covers?.find((c) => c.id === book.id)?.cover
  const remoteFile = remoteFiles.data?.find((f) => f.name === book.name)

  const Icon = selected ? MdCheckBox : MdCheckBoxOutlineBlank

  return (
    <div
      className="relative flex flex-col bg-surface rounded-xl border border-outline-variant shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
      role="button"
      onClick={async () => {
        if (select) {
          toggle(book.id)
        } else {
          if (mobile) await router.push('/_')
          reader.addTab(book)
        }
      }}
    >
      {/* Book Cover Section */}
      <div className="relative">
        <div
          className={clsx(
            'absolute bottom-0 h-1 bg-blue-500 z-10',
            loading && 'progress-bit w-[5%]',
          )}
        />
        {book.percentage !== undefined && (
          <div className="typescale-body-large absolute top-2 right-2 bg-gray-500/60 px-2 py-1 rounded text-gray-100 z-10">
            {(book.percentage * 100).toFixed()}%
          </div>
        )}
        <img
          src={cover ?? placeholder}
          alt="Cover"
          className="w-full aspect-[2/3] object-cover"
          draggable={false}
        />
        {select && (
          <div className="absolute bottom-2 right-2 z-10">
            <Icon
              size={24}
              className={clsx(
                '-m-1 bg-white/80 rounded-full p-1',
                selected ? 'text-tertiary' : 'text-outline',
              )}
            />
          </div>
        )}
      </div>

      {/* Book Info Section */}
      <div className="p-3 space-y-2">
        {/* Book Title */}
        <div
          className="line-clamp-2 text-on-surface font-medium typescale-body-medium"
          title={book.metadata?.title || book.name}
        >
          {book.metadata?.title || book.name}
        </div>
        
        {/* Author */}
        {book.metadata?.creator && (
          <div
            className="line-clamp-1 text-on-surface-variant typescale-body-small"
            title={book.metadata.creator}
          >
            {book.metadata.creator}
          </div>
        )}
        
        {/* Cloud sync indicator */}
        <div className="flex items-center pt-1">
          <MdCheckCircle
            className={clsx(
              'mr-1',
              remoteFile ? 'text-tertiary' : 'text-surface-variant',
            )}
            size={12}
          />
          <span className="text-on-surface-variant typescale-body-small opacity-60">
            {remoteFile ? 'Synced' : 'Local'}
          </span>
        </div>
      </div>
    </div>
  )
}
