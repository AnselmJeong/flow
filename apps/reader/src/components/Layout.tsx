import { Overlay } from '@literal-ui/core'
import clsx from 'clsx'
import { ComponentProps, useEffect, useState } from 'react'
import { useMemo } from 'react'
import { IconType } from 'react-icons'
import {
  MdFormatUnderlined,
  MdOutlineImage,
  MdSearch,
  MdToc,
  MdTimeline,
  MdOutlineLightMode,
  MdChat,
} from 'react-icons/md'
import { RiFontSize, RiHome6Line, RiSettings5Line } from 'react-icons/ri'
import { useRecoilState } from 'recoil'

import {
  Env,
  Action,
  useAction,
  useBackground,
  useColorScheme,
  useMobile,
  useTranslation,
} from '../hooks'
import { reader, useReaderSnapshot } from '../models'
import { navbarState } from '../state'
import { activeClass } from '../styles'

import { SplitView, useSplitViewItem } from './base'
import { Settings } from './pages'
import { AIChatView } from './viewlets/AIChatView'
import { AnnotationView } from './viewlets/AnnotationView'
import { ImageView } from './viewlets/ImageView'
import { SearchView } from './viewlets/SearchView'
import { ThemeView } from './viewlets/ThemeView'
import { TimelineView } from './viewlets/TimelineView'
import { TocView } from './viewlets/TocView'
import { TypographyView } from './viewlets/TypographyView'

export const Layout: React.FC = ({ children }) => {
  useColorScheme()

  const [ready, setReady] = useState(false)
  const [selectedText, setSelectedText] = useState<string>()
  const [selectedCfi, setSelectedCfi] = useState<string>()
  const [action, setAction] = useAction()
  const [aiChatOpen, setAiChatOpen] = useState(false)
  const mobile = useMobile()
  const r = useReaderSnapshot()

  useEffect(() => {
    if (mobile === undefined) return
    // Only auto-open TOC for ePub files, not PDFs
    const focusedTab = r.focusedBookTab
    const isPdf = focusedTab && 'currentPage' in focusedTab // PdfTab has currentPage, BookTab doesn't
    setAction(mobile ? undefined : (isPdf ? undefined : 'toc'))
    setReady(true)
  }, [mobile, setAction, r.focusedBookTab])

  // Listen for AI chat requests from text selection
  useEffect(() => {
    const handleAIChatRequest = (event: CustomEvent) => {
      const { text, cfi, page } = event.detail
      setSelectedText(text)
      // For PDF, use page-based CFI format; for ePub, use the actual CFI
      setSelectedCfi(cfi || (page ? `page-${page}` : undefined))
      setAiChatOpen(true)
    }

    window.addEventListener('ai-chat-request', handleAIChatRequest as EventListener)
    return () => {
      window.removeEventListener('ai-chat-request', handleAIChatRequest as EventListener)
    }
  }, [])

  return (
    <div id="layout" className="select-none">
      <SplitView>
        {mobile === false && <ActivityBar />}
        {mobile === true && <NavigationBar />}
        {ready && <SideBar selectedText={selectedText} selectedCfi={selectedCfi} />}
        {ready && <ReaderWithAIChat 
          aiChatOpen={aiChatOpen} 
          setAiChatOpen={setAiChatOpen}
          selectedText={selectedText}
          selectedCfi={selectedCfi}
          focusedBookTab={r.focusedBookTab}
        >{children}</ReaderWithAIChat>}
      </SplitView>
    </div>
  )
}

interface IAction {
  name: string
  title: string
  Icon: IconType
  env: number
}
interface IViewAction extends IAction {
  name: Action
  View: React.FC<any>
}

const viewActions: IViewAction[] = [
  {
    name: 'toc',
    title: 'toc',
    Icon: MdToc,
    View: TocView,
    env: Env.Desktop | Env.Mobile,
  },
  {
    name: 'search',
    title: 'search',
    Icon: MdSearch,
    View: SearchView,
    env: Env.Desktop | Env.Mobile,
  },
  {
    name: 'annotation',
    title: 'annotation',
    Icon: MdFormatUnderlined,
    View: AnnotationView,
    env: Env.Desktop | Env.Mobile,
  },
  {
    name: 'image',
    title: 'image',
    Icon: MdOutlineImage,
    View: ImageView,
    env: Env.Desktop,
  },
  {
    name: 'timeline',
    title: 'timeline',
    Icon: MdTimeline,
    View: TimelineView,
    env: Env.Desktop,
  },
  {
    name: 'typography',
    title: 'typography',
    Icon: RiFontSize,
    View: TypographyView,
    env: Env.Desktop | Env.Mobile,
  },
  {
    name: 'theme',
    title: 'theme',
    Icon: MdOutlineLightMode,
    View: ThemeView,
    env: Env.Desktop | Env.Mobile,
  },
  // AI Chat moved to separate side panel
]

const ActivityBar: React.FC = () => {
  useSplitViewItem(ActivityBar, {
    preferredSize: 48,
    minSize: 48,
    maxSize: 48,
  })
  return (
    <div className="ActivityBar flex flex-col justify-between">
      <ViewActionBar env={Env.Desktop} />
      <PageActionBar env={Env.Desktop} />
    </div>
  )
}

interface EnvActionBarProps extends ComponentProps<'div'> {
  env: Env
}

function ViewActionBar({ className, env }: EnvActionBarProps) {
  const [action, setAction] = useAction()
  const t = useTranslation()

  return (
    <ActionBar className={className}>
      {viewActions
        .filter((a) => a.env & env)
        .map(({ name, title, Icon }) => {
          const active = action === name
          return (
            <Action
              title={t(`${title}.title`)}
              Icon={Icon}
              active={active}
              onClick={() => setAction(active ? undefined : name)}
              key={name}
            />
          )
        })}
    </ActionBar>
  )
}

function PageActionBar({ env }: EnvActionBarProps) {
  const mobile = useMobile()
  const [action, setAction] = useState('Home')
  const t = useTranslation()

  interface IPageAction extends IAction {
    Component?: React.FC
    disabled?: boolean
  }

  const pageActions: IPageAction[] = useMemo(
    () => [
      {
        name: 'home',
        title: 'home',
        Icon: RiHome6Line,
        env: Env.Mobile,
      },
      {
        name: 'settings',
        title: 'settings',
        Icon: RiSettings5Line,
        Component: Settings,
        env: Env.Desktop | Env.Mobile,
      },
    ],
    [],
  )

  return (
    <ActionBar>
      {pageActions
        .filter((a) => a.env & env)
        .map(({ name, title, Icon, Component, disabled }, i) => (
          <Action
            title={t(`${title}.title`)}
            Icon={Icon}
            active={mobile ? action === name : undefined}
            disabled={disabled}
            onClick={() => {
              Component ? reader.addTab(Component) : reader.clear()
              setAction(name)
            }}
            key={i}
          />
        ))}
    </ActionBar>
  )
}

function NavigationBar() {
  const r = useReaderSnapshot()
  const readMode = r.focusedTab?.isBook
  const [visible, setVisible] = useRecoilState(navbarState)

  return (
    <>
      {visible && (
        <Overlay
          className="!bg-transparent"
          onClick={() => setVisible(false)}
        />
      )}
      <div className="NavigationBar bg-surface border-surface-variant fixed inset-x-0 bottom-0 z-10 border-t">
        {readMode ? (
          <ViewActionBar
            env={Env.Mobile}
            className={clsx(visible || 'hidden')}
          />
        ) : (
          <PageActionBar env={Env.Mobile} />
        )}
      </div>
    </>
  )
}

interface ActionBarProps extends ComponentProps<'ul'> {}
function ActionBar({ className, ...props }: ActionBarProps) {
  return (
    <ul className={clsx('ActionBar flex sm:flex-col', className)} {...props} />
  )
}

interface ActionProps extends ComponentProps<'button'> {
  Icon: IconType
  active?: boolean
}
const Action: React.FC<ActionProps> = ({
  className,
  Icon,
  active,
  ...props
}) => {
  const mobile = useMobile()
  return (
    <button
      className={clsx(
        'Action relative flex h-12 w-12 flex-1 items-center justify-center sm:flex-initial',
        active ? 'text-on-surface-variant' : 'text-outline/70',
        props.disabled ? 'text-on-disabled' : 'hover:text-on-surface-variant ',
        className,
      )}
      {...props}
    >
      {active &&
        (mobile || (
          <div
            className={clsx('absolute', 'inset-y-0 left-0 w-0.5', activeClass)}
          />
        ))}
      <Icon size={28} />
    </button>
  )
}

interface SideBarProps {
  selectedText?: string
  selectedCfi?: string
}

const SideBar: React.FC<SideBarProps> = ({ selectedText, selectedCfi }) => {
  const [action, setAction] = useAction()
  const mobile = useMobile()
  const t = useTranslation()
  const r = useReaderSnapshot()

  const { size } = useSplitViewItem(SideBar, {
    preferredSize: 240,
    minSize: 160,
    visible: !!action,
  })

  return (
    <>
      {action && mobile && <Overlay onClick={() => setAction(undefined)} />}
      <div
        className={clsx(
          'SideBar bg-surface flex flex-col',
          !action && '!hidden',
          mobile ? 'absolute inset-y-0 right-0 z-10' : '',
        )}
        style={{ width: mobile ? '75%' : size }}
      >
        {viewActions.map(({ name, title, View }) => (
          <View
            key={name}
            name={t(`${name}.title`)}
            title={t(`${title}.title`)}
            className={clsx(name !== action && '!hidden')}
          />
        ))}
      </div>
    </>
  )
}

interface ReaderProps extends ComponentProps<'div'> {}
const Reader: React.FC = ({ className, ...props }: ReaderProps) => {
  useSplitViewItem(Reader)
  const [bg] = useBackground()

  const r = useReaderSnapshot()
  const readMode = r.focusedTab?.isBook

  return (
    <div
      className={clsx(
        'Reader flex-1 overflow-hidden',
        readMode || 'mb-12 sm:mb-0',
        bg,
      )}
      {...props}
    />
  )
}

interface ReaderWithAIChatProps {
  aiChatOpen: boolean
  setAiChatOpen: (open: boolean) => void
  selectedText?: string
  selectedCfi?: string
  focusedBookTab?: any
  children: React.ReactNode
}

const ReaderWithAIChat: React.FC<ReaderWithAIChatProps> = ({
  aiChatOpen,
  setAiChatOpen,
  selectedText,
  selectedCfi,
  focusedBookTab,
  children
}) => {
  const mobile = useMobile()

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* AI Chat Toggle Button - Top Right */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setAiChatOpen(!aiChatOpen)}
          className={clsx(
            'flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all duration-200',
            aiChatOpen 
              ? 'bg-blue-500 text-white hover:bg-blue-600' 
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          )}
          title="AI 채팅"
        >
          <MdChat size={20} />
        </button>
      </div>

      {/* Main Content */}
      <SplitView>
        <Reader>{children}</Reader>
        {aiChatOpen && (
          <AIChatSidePanel 
            selectedText={selectedText}
            selectedCfi={selectedCfi}
            focusedBookTab={focusedBookTab}
            onClose={() => setAiChatOpen(false)}
          />
        )}
      </SplitView>
    </div>
  )
}

interface AIChatSidePanelProps {
  selectedText?: string
  selectedCfi?: string
  focusedBookTab?: any
  onClose: () => void
}

const AIChatSidePanel: React.FC<AIChatSidePanelProps> = ({ selectedText, selectedCfi, focusedBookTab, onClose }) => {
  const mobile = useMobile()
  
  const { size } = useSplitViewItem(AIChatSidePanel, {
    preferredSize: 800,
    minSize: 300,
    visible: true,
  })

  return (
    <>
      {mobile && <Overlay onClick={onClose} />}
      <div
        className={clsx(
          'AIChatSidePanel bg-surface flex flex-col',
          mobile ? 'absolute inset-y-0 right-0 z-10' : '',
        )}
        style={{ width: mobile ? '85%' : size }}
      >
        <AIChatView
          tab={focusedBookTab}
          selectedText={selectedText}
          selectedCfi={selectedCfi}
          onClose={onClose}
          className="h-full"
        />
      </div>
    </>
  )
}
