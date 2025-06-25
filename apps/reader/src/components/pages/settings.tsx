import { useEventListener } from '@literal-ui/hooks'
import Dexie from 'dexie'
import { useRouter } from 'next/router'
import { parseCookies, destroyCookie } from 'nookies'

import {
  ColorScheme,
  useColorScheme,
  useForceRender,
  useTranslation,
} from '@flow/reader/hooks'
import { dbx, mapToToken, OAUTH_SUCCESS_MESSAGE, pack } from '@flow/reader/sync'

import { Button } from '../Button'
import { Select } from '../Form'
import { Page } from '../Page'

export const Settings: React.FC = () => {
  const { scheme, setScheme } = useColorScheme()
  const { asPath, push, locale } = useRouter()
  const t = useTranslation('settings')

  return (
    <Page headline={t('title')}>
      <div className="space-y-6">
        <Item title={t('language')}>
          <Select
            value={locale}
            onChange={(e) => {
              push(asPath, undefined, { locale: e.target.value })
            }}
          >
            <option value="en-US">English</option>
            <option value="zh-CN">简体中文</option>
            <option value="ja-JP">日本語</option>
          </Select>
        </Item>
        <Item title={t('color_scheme')}>
          <Select
            value={scheme}
            onChange={(e) => {
              setScheme(e.target.value as ColorScheme)
            }}
          >
            <option value="system">{t('color_scheme.system')}</option>
            <option value="light">{t('color_scheme.light')}</option>
            <option value="dark">{t('color_scheme.dark')}</option>
          </Select>
        </Item>
        <Synchronization />
        <Item title="데이터 관리">
          <div className="space-y-3">
            <div>
              <Button
                onClick={pack}
                className="mb-2"
              >
                전체 데이터 내보내기
              </Button>
              <p className="text-sm text-gray-600">
                모든 책과 채팅 기록, 주석을 포함한 전체 데이터를 ZIP 파일로 다운로드합니다. 
                백업이나 다른 기기로 데이터를 이전할 때 사용하세요.
              </p>
            </div>
          </div>
        </Item>
        <Item title={t('cache')}>
          <Button
            variant="secondary"
            onClick={() => {
              window.localStorage.clear()
              Dexie.getDatabaseNames().then((names) => {
                names.forEach((n) => Dexie.delete(n))
              })
            }}
          >
            {t('cache.clear')}
          </Button>
        </Item>
      </div>
    </Page>
  )
}

const Synchronization: React.FC = () => {
  const cookies = parseCookies()
  const refreshToken = cookies[mapToToken['dropbox']]
  const render = useForceRender()
  const t = useTranslation('settings.synchronization')

  useEventListener('message', (e) => {
    if (e.data === OAUTH_SUCCESS_MESSAGE) {
      // init app (generate access token, fetch remote data, etc.)
      window.location.reload()
    }
  })

  return (
    <Item title={t('title')}>
      <Select>
        <option value="dropbox">Dropbox</option>
      </Select>
      <div className="mt-2">
        {refreshToken ? (
          <Button
            variant="secondary"
            onClick={() => {
              destroyCookie(null, mapToToken['dropbox'])
              render()
            }}
          >
            {t('unauthorize')}
          </Button>
        ) : (
          <Button
            onClick={() => {
              const redirectUri =
                window.location.origin + '/api/callback/dropbox'

              dbx.auth
                .getAuthenticationUrl(
                  redirectUri,
                  JSON.stringify({ redirectUri }),
                  'code',
                  'offline',
                )
                .then((url) => {
                  window.open(url as string, '_blank')
                })
            }}
          >
            {t('authorize')}
          </Button>
        )}
      </div>
    </Item>
  )
}

interface PartProps {
  title: string
}
const Item: React.FC<PartProps> = ({ title, children }) => {
  return (
    <div>
      <h3 className="typescale-title-small text-on-surface-variant">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}

Settings.displayName = 'settings'
