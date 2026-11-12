import { Bot, Send } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../lib/client-context'
import { AssistantError, askAssistant, type ChatMessage } from './api'

// Chat con el asistente. Cuando crea un pedido, avisa para recargar la lista.
export function AssistantChat({ companyId, onOrderCreated }: { companyId: string; onOrderCreated: () => void }) {
  const { t } = useTranslation()
  const client = useSupabase()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState(false)
  const logRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const inputId = useId()
  const hintId = useId()
  const titleId = useId()

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView?.({ block: 'nearest' })
  }, [messages, busy])

  async function send(text: string) {
    const content = text.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setDraft('')
    setError(null)
    setNotice(false)
    setBusy(true)
    try {
      const result = await askAssistant(client, companyId, next)
      setMessages([...next, { role: 'assistant', content: result.reply }])
      if (result.orderIds.length > 0) {
        setNotice(true)
        onOrderCreated()
      }
    } catch (e) {
      const code = e instanceof AssistantError ? e.code : 'failed'
      setError(t(`assistant.errors.${code}`, { defaultValue: t('assistant.errors.failed') }))
      // Devuelve el texto para no perderlo.
      setMessages(messages)
      setDraft(content)
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void send(draft)
  }

  const suggestions = t('assistant.suggestions', { returnObjects: true }) as string[]

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-bold">
          {t('assistant.chatTitle')}
        </h2>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setMessages([])
              setError(null)
              setNotice(false)
              inputRef.current?.focus()
            }}
          >
            {t('assistant.restart')}
          </Button>
        )}
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted">{t('assistant.empty')}</p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <li key={s}>
                <Button variant="secondary" className="w-full justify-start text-left" disabled={busy} onClick={() => void send(s)}>
                  {s}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div
          role="log"
          aria-live="polite"
          aria-label={t('assistant.chatTitle')}
          className="max-h-[28rem] min-h-40 overflow-y-auto rounded-xl bg-slate-50 p-3"
        >
          <ol ref={logRef} className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <li key={i} className={`flex max-w-[85%] flex-col gap-0.5 ${m.role === 'user' ? 'self-end items-end' : 'self-start'}`}>
                <span className="text-xs font-semibold text-muted">
                  {m.role === 'user' ? t('assistant.you') : t('assistant.bot')}
                </span>
                <p
                  className={`rounded-2xl px-3 py-2 break-words whitespace-pre-wrap ${
                    m.role === 'user' ? 'btn-solid rounded-br-sm' : 'rounded-bl-sm border border-line bg-surface text-ink'
                  }`}
                >
                  {m.content}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {busy && (
        <p role="status" className="flex items-center gap-2 text-muted">
          <Bot aria-hidden="true" className="size-5 motion-safe:animate-pulse" />
          {t('assistant.thinking')}
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{t('assistant.orderCreated')}</Alert>}

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={inputId} className="font-medium">
          {t('assistant.message')}
        </label>
        <p id={hintId} className="text-sm text-muted">
          {t('assistant.messageHint')}
        </p>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            id={inputId}
            aria-describedby={hintId}
            rows={2}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void send(draft)
              }
            }}
            className="min-h-11 w-full min-w-0 flex-1 resize-y rounded-lg border border-slate-500 bg-surface px-3 py-2 text-base transition-colors hover:border-brand-700"
          />
          <Button type="submit" busy={busy} disabled={!draft.trim()}>
            <Send aria-hidden="true" className="size-5" />
            {t('assistant.send')}
          </Button>
        </div>
      </form>
    </section>
  )
}
