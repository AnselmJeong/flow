import { debounce } from '@github/mini-throttle/decorators'
import { IS_SERVER } from '@literal-ui/hooks'
import * as pdfjsLib from 'pdfjs-dist'
import React from 'react'
import { v4 as uuidv4 } from 'uuid'
import { proxy, ref, snapshot, subscribe, useSnapshot } from 'valtio'

import type { Rendition, Location, Book } from '@flow/epubjs'
import Navigation, { NavItem } from '@flow/epubjs/types/navigation'
import Section from '@flow/epubjs/types/section'

import { AnnotationColor, AnnotationType } from '../annotation'
import { BookRecord, db } from '../db'
import { fileToEpub, fileToPdf } from '../file'
import { defaultStyle } from '../styles'

import { dfs, find, INode } from './tree'

function updateIndex(array: any[], deletedItemIndex: number) {
  const last = array.length - 1
  return deletedItemIndex > last ? last : deletedItemIndex
}

export function compareHref(
  sectionHref: string | undefined,
  navitemHref: string | undefined,
) {
  if (sectionHref && navitemHref) {
    const [target] = navitemHref.split('#')

    return (
      sectionHref.endsWith(target!) ||
      // fix for relative nav path `../Text/example.html`
      target?.endsWith(sectionHref)
    )
  }
}

function compareDefinition(d1: string, d2: string) {
  return d1.toLowerCase() === d2.toLowerCase()
}

export interface INavItem extends NavItem, INode {
  subitems?: INavItem[]
}

export interface IMatch extends INode {
  excerpt: string
  description?: string
  cfi?: string
  subitems?: IMatch[]
}

export interface ISection extends Section {
  length: number
  images: string[]
  navitem?: INavItem
}

interface TimelineItem {
  location: Location
  timestamp: number
}

class BaseTab {
  constructor(public readonly id: string, public readonly title = id) {}

  get isBook(): boolean {
    return this instanceof BookTab
  }

  get isPage(): boolean {
    return this instanceof PageTab
  }
}

// https://github.com/pmndrs/valtio/blob/92f3311f7f1a9fe2a22096cd30f9174b860488ed/src/vanilla.ts#L6
type AsRef = { $$valtioRef: true }

export class BookTab extends BaseTab {
  epub?: Book
  iframe?: Window & AsRef
  rendition?: Rendition & { manager?: any }
  nav?: Navigation
  locationToReturn?: Location
  section?: ISection
  sections?: ISection[]
  results?: IMatch[]
  activeResultID?: string
  rendered = false

  get container() {
    return this?.rendition?.manager?.container as HTMLDivElement | undefined
  }

  timeline: TimelineItem[] = []
  get location() {
    return this.timeline[0]?.location
  }

  display(target?: string, returnable = true) {
    this.rendition?.display(target)
    if (returnable) this.showPrevLocation()
  }
  displayFromSelector(selector: string, section: ISection, returnable = true) {
    try {
      const el = section.document.querySelector(selector)
      if (el) this.display(section.cfiFromElement(el), returnable)
    } catch (err) {
      this.display(section.href, returnable)
    }
  }
  prev() {
    this.rendition?.prev()
    // avoid content flash
    if (this.container?.scrollLeft === 0 && !this.location?.atStart) {
      this.rendered = false
    }
  }
  next() {
    this.rendition?.next()
  }

  updateBook(changes: Partial<BookRecord>) {
    changes = {
      ...changes,
      updatedAt: Date.now(),
    }
    // don't wait promise resolve to make valtio batch updates
    this.book = { ...this.book, ...changes }
    db?.books.update(this.book.id, changes)
  }

  annotationRange?: Range
  setAnnotationRange(cfi: string) {
    const range = this.view?.contents.range(cfi)
    if (range) this.annotationRange = ref(range)
  }

  define(def: string[]) {
    this.updateBook({ definitions: [...this.book.definitions, ...def] })
  }
  undefine(def: string) {
    this.updateBook({
      definitions: this.book.definitions.filter(
        (d) => !compareDefinition(d, def),
      ),
    })
  }
  isDefined(def: string) {
    return this.book.definitions.some((d) => compareDefinition(d, def))
  }

  rangeToCfi(range: Range) {
    return this.view.contents.cfiFromRange(range)
  }
  putAnnotation(
    type: AnnotationType,
    cfi: string,
    color: AnnotationColor,
    text: string,
    notes?: string,
  ) {
    const spine = this.section
    if (!spine?.navitem) return

    const i = this.book.annotations.findIndex((a) => a.cfi === cfi)
    let annotation = this.book.annotations[i]

    const now = Date.now()
    if (!annotation) {
      annotation = {
        id: uuidv4(),
        bookId: this.book.id,
        cfi,
        spine: {
          index: spine.index,
          title: spine.navitem.label,
        },
        createAt: now,
        updatedAt: now,
        type,
        color,
        notes,
        text,
      }

      this.updateBook({
        // DataCloneError: Failed to execute 'put' on 'IDBObjectStore': #<Object> could not be cloned.
        annotations: [...snapshot(this.book.annotations), annotation],
      })
    } else {
      annotation = {
        ...this.book.annotations[i]!,
        type,
        updatedAt: now,
        color,
        notes,
        text,
      }
      this.book.annotations.splice(i, 1, annotation)
      this.updateBook({
        annotations: [...snapshot(this.book.annotations)],
      })
    }
  }
  removeAnnotation(cfi: string) {
    return this.updateBook({
      annotations: snapshot(this.book.annotations).filter((a) => a.cfi !== cfi),
    })
  }

  keyword = ''
  setKeyword(keyword: string) {
    if (this.keyword === keyword) return
    this.keyword = keyword
    this.onKeywordChange()
  }

  // only use throttle/debounce for side effects
  @debounce(1000)
  async onKeywordChange() {
    this.results = await this.search()
  }

  get totalLength() {
    return this.sections?.reduce((acc, s) => acc + s.length, 0) ?? 0
  }

  toggle(id: string) {
    const item = find(this.nav?.toc, id) as INavItem
    if (item) item.expanded = !item.expanded
  }

  toggleResult(id: string) {
    const item = find(this.results, id)
    if (item) item.expanded = !item.expanded
  }

  showPrevLocation() {
    if (this.location) {
      this.locationToReturn = this.location
    }
  }

  hidePrevLocation() {
    this.locationToReturn = undefined
  }

  mapSectionToNavItem(sectionHref: string) {
    let navItem: NavItem | undefined
    this.nav?.toc.forEach((item) =>
      dfs(item as NavItem, (i) => {
        if (compareHref(sectionHref, i.href)) navItem ??= i
      }),
    )
    return navItem
  }

  get currentHref() {
    return this.location?.start.href
  }

  get currentNavItem() {
    return this.section?.navitem
  }

  get view() {
    return this.rendition?.manager?.views._views[0]
  }

  getNavPath(navItem = this.currentNavItem) {
    const path: INavItem[] = []

    if (this.nav) {
      while (navItem) {
        path.unshift(navItem)
        const parentId = navItem.parent
        if (!parentId) {
          navItem = undefined
        } else {
          const index = this.nav.tocById[parentId]!
          navItem = this.nav.getByIndex(parentId, index, this.nav.toc)
        }
      }
    }

    return path
  }

  searchInSection(keyword = this.keyword, section = this.section) {
    if (!section) return

    const subitems = section.find(keyword) as unknown as IMatch[]
    if (!subitems.length) return

    const navItem = section.navitem
    if (navItem) {
      const path = this.getNavPath(navItem)
      path.pop()
      return {
        id: navItem.href,
        excerpt: navItem.label,
        description: path.map((i) => i.label).join(' / '),
        subitems: subitems.map((i) => ({ ...i, id: i.cfi! })),
        expanded: true,
      }
    }
  }

  search(keyword = this.keyword) {
    // avoid blocking input
    return new Promise<IMatch[] | undefined>((resolve) => {
      requestIdleCallback(() => {
        if (!keyword) {
          resolve(undefined)
          return
        }

        const results: IMatch[] = []

        this.sections?.forEach((s) => {
          const result = this.searchInSection(keyword, s)
          if (result) results.push(result)
        })

        resolve(results)
      })
    })
  }

  private _el?: HTMLDivElement
  onRender?: () => void
  async render(el: HTMLDivElement) {
    if (el === this._el) return
    this._el = ref(el)

    const file = await db?.files.get(this.book.id)
    if (!file) return

    this.epub = ref(await fileToEpub(file.file))

    this.epub.loaded.navigation.then((nav) => {
      this.nav = nav
    })
    console.log(this.epub)
    this.epub.loaded.spine.then((spine: any) => {
      const sections = spine.spineItems as ISection[]
      // https://github.com/futurepress/epub.js/issues/887#issuecomment-700736486
      const promises = sections.map((s) =>
        s.load(this.epub?.load.bind(this.epub)),
      )

      Promise.all(promises).then(() => {
        sections.forEach((s) => {
          s.length = s.document.body.textContent?.length ?? 0
          s.images = [...s.document.querySelectorAll('img')].map((el) => el.src)
          this.epub!.loaded.navigation.then(() => {
            s.navitem = this.mapSectionToNavItem(s.href)
          })
        })
        this.sections = ref(sections)
      })
    })
    this.rendition = ref(
      this.epub.renderTo(el, {
        width: '100%',
        height: '100%',
        allowScriptedContent: true,
      }),
    )
    console.log(this.rendition)
    this.rendition.display(
      this.location?.start.cfi ?? this.book.cfi ?? undefined,
    )
    this.rendition.themes.default(defaultStyle)
    this.rendition.hooks.render.register((view: any) => {
      console.log('hooks.render', view)
      this.onRender?.()
    })

    this.rendition.on('relocated', (loc: Location) => {
      console.log('relocated', loc)
      this.rendered = true
      this.timeline.unshift({
        location: loc,
        timestamp: Date.now(),
      })

      // calculate percentage
      if (this.sections) {
        const start = loc.start
        const i = this.sections.findIndex((s) => s.href === start.href)
        const previousSectionsLength = this.sections
          .slice(0, i)
          .reduce((acc, s) => acc + s.length, 0)
        const previousSectionsPercentage =
          previousSectionsLength / this.totalLength
        const currentSectionPercentage =
          this.sections[i]!.length / this.totalLength
        const displayedPercentage = start.displayed.page / start.displayed.total

        const percentage =
          previousSectionsPercentage +
          currentSectionPercentage * displayedPercentage

        this.updateBook({ cfi: start.cfi, percentage })
      }
    })

    this.rendition.on('attached', (...args: any[]) => {
      console.log('attached', args)
    })
    this.rendition.on('started', (...args: any[]) => {
      console.log('started', args)
    })
    this.rendition.on('displayed', (...args: any[]) => {
      console.log('displayed', args)
    })
    this.rendition.on('rendered', (section: ISection, view: any) => {
      console.log('rendered', [section, view])
      this.section = ref(section)
      this.iframe = ref(view.window as Window)
    })
    this.rendition.on('selected', (...args: any[]) => {
      console.log('selected', args)
    })
    this.rendition.on('removed', (...args: any[]) => {
      console.log('removed', args)
    })
  }

  constructor(public book: BookRecord) {
    super(book.id, book.name)

    // don't subscribe `db.books` in `constructor`, it will
    // 1. update the unproxied instance, which is not reactive
    // 2. update unnecessary state (e.g. percentage) of all tabs with the same book
  }

  get isPdf(): boolean {
    return this.book.metadata.isPdf === true
  }
}

export class PdfTab extends BookTab {
  pdf?: pdfjsLib.PDFDocumentProxy
  currentPage = 1
  totalPages = 0
  pdfFileUrl?: string

  async render(el: HTMLDivElement) {
    console.log('PdfTab render called', el)
    if (el === this._el) return
    this._el = ref(el)

    const file = await db?.files.get(this.book.id)
    if (!file) {
      console.error('No file found for PDF book:', this.book.id)
      return
    }

    console.log('Loading PDF file:', file.file.name)
    
    // Create object URL for PDF file
    this.pdfFileUrl = URL.createObjectURL(file.file)
    console.log('Created PDF URL:', this.pdfFileUrl)
    
    // Load PDF document
    try {
      this.pdf = ref(await fileToPdf(file.file))
      this.totalPages = this.pdf.numPages
      this.currentPage = this.book.currentPage || 1
      console.log('PDF loaded successfully, pages:', this.totalPages)
      
      // Create and render PDF viewer
      this.renderPdfViewer(el)
    } catch (error) {
      console.error('Error loading PDF:', error)
    }
  }

  private renderPdfViewer(el: HTMLDivElement) {
    console.log('Rendering PDF viewer in element:', el)
    
    // Import SimplePdfViewer with default layout for full functionality
    import('../components/SimplePdfViewer').then(({ SimplePdfViewer }) => {
      console.log('SimplePdfViewer component loaded')
      const React = require('react')
      const ReactDOM = require('react-dom/client')
      
      console.log('Creating React root for PDF viewer')
      const root = ReactDOM.createRoot(el)
      root.render(
        React.createElement(SimplePdfViewer, {
          fileUrl: this.pdfFileUrl!,
          tab: this,
          book: this.book,
        })
      )
      console.log('PDF viewer rendered')
    }).catch(error => {
      console.error('Error loading SimplePdfViewer component:', error)
      // Fallback to simple iframe
      el.innerHTML = `
        <iframe src="${this.pdfFileUrl}" style="width: 100%; height: 100%; border: none; background: white;"></iframe>
      `
    })
  }

  // Override navigation methods for PDF
  prev() {
    if (this.currentPage > 1) {
      this.goToPage(this.currentPage - 1)
    }
  }

  next() {
    if (this.currentPage < this.totalPages) {
      this.goToPage(this.currentPage + 1)
    }
  }

  goToPage(page: number) {
    this.currentPage = Math.max(1, Math.min(page, this.totalPages))
    this.updateBook({ currentPage: this.currentPage })
  }

  // Override annotation methods for PDF page-based positioning
  putAnnotation(
    type: AnnotationType,
    page: number,
    color: AnnotationColor,
    text: string,
    notes?: string,
    extraData?: any,
  ) {
    const i = this.book.annotations.findIndex((a) => a.page === page && a.text === text)
    let annotation = this.book.annotations[i]

    const now = Date.now()
    if (!annotation) {
      annotation = {
        id: uuidv4(),
        bookId: this.book.id,
        page,
        spine: {
          index: page - 1,
          title: `Page ${page}`,
        },
        createAt: now,
        updatedAt: now,
        type,
        color,
        notes,
        text,
        ...extraData, // Spread extra data like highlightAreas
      }

      this.updateBook({
        annotations: [...snapshot(this.book.annotations), annotation],
      })
    } else {
      annotation = {
        ...this.book.annotations[i]!,
        type,
        updatedAt: now,
        color,
        notes,
        text,
        ...extraData, // Spread extra data like highlightAreas
      }

      const newAnnotations = [...this.book.annotations]
      newAnnotations[i] = annotation
      this.updateBook({ annotations: newAnnotations })
    }
  }

  // Clean up object URL when tab is destroyed
  destroy() {
    if (this.pdfFileUrl) {
      URL.revokeObjectURL(this.pdfFileUrl)
    }
  }
}

class PageTab extends BaseTab {
  constructor(public readonly Component: React.FC<any>) {
    super(Component.displayName ?? 'untitled')
  }
}

type Tab = BookTab | PdfTab | PageTab
type TabParam = ConstructorParameters<typeof BookTab | typeof PdfTab | typeof PageTab>[0]

export class Group {
  id = uuidv4()
  tabs: Tab[] = []

  constructor(
    tabs: Array<Tab | TabParam> = [],
    public selectedIndex = tabs.length - 1,
  ) {
    this.tabs = tabs.map((t) => {
      if (t instanceof BookTab || t instanceof PdfTab || t instanceof PageTab) return t
      const isPage = typeof t === 'function'
      if (isPage) return new PageTab(t)
      
      // Check if it's a PDF book and create appropriate tab type
      const bookRecord = t as BookRecord
      const isPdf = bookRecord.metadata.isPdf
      console.log('Creating tab for book:', bookRecord.name, 'isPdf:', isPdf)
      return isPdf ? new PdfTab(bookRecord) : new BookTab(bookRecord)
    })
  }

  get selectedTab() {
    return this.tabs[this.selectedIndex]
  }

  get bookTabs() {
    return this.tabs.filter((t) => t instanceof BookTab || t instanceof PdfTab) as (BookTab | PdfTab)[]
  }

  removeTab(index: number) {
    const tab = this.tabs.splice(index, 1)
    this.selectedIndex = updateIndex(this.tabs, index)
    return tab[0]
  }

  addTab(param: TabParam | Tab) {
    const isTab = param instanceof BookTab || param instanceof PdfTab || param instanceof PageTab
    const isPage = typeof param === 'function'

    const id = isTab ? param.id : isPage ? param.displayName : param.id

    const index = this.tabs.findIndex((t) => t.id === id)
    if (index > -1) {
      this.selectTab(index)
      return this.tabs[index]
    }

    const tab = isTab ? param : isPage ? new PageTab(param) : 
      ((param as BookRecord).metadata.isPdf ? new PdfTab(param as BookRecord) : new BookTab(param as BookRecord))

    this.tabs.splice(++this.selectedIndex, 0, tab)
    return tab
  }

  replaceTab(param: TabParam, index = this.selectedIndex) {
    this.addTab(param)
    this.removeTab(index)
  }

  selectTab(index: number) {
    this.selectedIndex = index
  }
}

export class Reader {
  groups: Group[] = []
  focusedIndex = -1

  get focusedGroup() {
    return this.groups[this.focusedIndex]
  }

  get focusedTab() {
    return this.focusedGroup?.selectedTab
  }

  get focusedBookTab() {
    return this.focusedTab instanceof BookTab || this.focusedTab instanceof PdfTab ? this.focusedTab : undefined
  }

  addTab(param: TabParam | Tab, groupIdx = this.focusedIndex) {
    let group = this.groups[groupIdx]
    if (group) {
      this.focusedIndex = groupIdx
    } else {
      group = this.addGroup([])
    }
    return group.addTab(param)
  }

  removeTab(index: number, groupIdx = this.focusedIndex) {
    const group = this.groups[groupIdx]
    if (group?.tabs.length === 1) {
      this.removeGroup(groupIdx)
      return group.tabs[0]
    }
    return group?.removeTab(index)
  }

  replaceTab(
    param: TabParam,
    index = this.focusedIndex,
    groupIdx = this.focusedIndex,
  ) {
    const group = this.groups[groupIdx]
    group?.replaceTab(param, index)
  }

  removeGroup(index: number) {
    this.groups.splice(index, 1)
    this.focusedIndex = updateIndex(this.groups, index)
  }

  addGroup(tabs: Array<Tab | TabParam>, index = this.focusedIndex + 1) {
    const group = proxy(new Group(tabs))
    this.groups.splice(index, 0, group)
    this.focusedIndex = index
    return group
  }

  selectGroup(index: number) {
    this.focusedIndex = index
  }

  clear() {
    this.groups = []
    this.focusedIndex = -1
  }

  resize() {
    this.groups.forEach(({ bookTabs }) => {
      bookTabs.forEach((tab) => {
        try {
          if (tab instanceof PdfTab) {
            // PDF tabs don't need resize - the PDF viewer handles its own resizing
            return
          } else if (tab instanceof BookTab) {
            tab.rendition?.resize()
          }
        } catch (error) {
          console.error(error)
        }
      })
    })
  }
}

export const reader = proxy(new Reader())

subscribe(reader, () => {
  console.log(snapshot(reader))
})

export function useReaderSnapshot() {
  return useSnapshot(reader)
}

declare global {
  interface Window {
    reader: Reader
  }
}

if (!IS_SERVER) {
  window.reader = reader
}
