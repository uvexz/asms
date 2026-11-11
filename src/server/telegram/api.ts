import type { TelegramConfig, TelegramUpdate } from './types'

export class TelegramApiError extends Error {
  readonly method: string
  readonly code: string
  readonly retryAfter?: number

  constructor(
    method: string,
    code: string,
    message: string,
    retryAfter?: number,
  ) {
    super(message)
    this.name = 'TelegramApiError'
    this.method = method
    this.code = code
    this.retryAfter = retryAfter
  }
}

type Envelope<T> = {
  ok?: boolean
  result?: T
  description?: string
  error_code?: number
  parameters?: { retry_after?: number }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Minimal Bot API client. Raw fetch is intentional: Bot API 10.4 widget
 * methods are newer than most SDK typings, and this keeps the dependency
 * surface at zero. Errors never contain the bot token or request URL.
 */
export class TelegramApi {
  constructor(private readonly config: TelegramConfig) {}

  private async call<T>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<T> {
    const url = `https://api.telegram.org/bot${this.config.token}/${method}`

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        throw new TelegramApiError(method, 'NETWORK', 'Telegram request failed')
      }

      let data: Envelope<T> | null = null
      try {
        data = (await response.json()) as Envelope<T>
      } catch {
        data = null
      }

      if (response.ok && data?.ok) {
        return data.result as T
      }

      const retryAfter = data?.parameters?.retry_after
      if (response.status === 429 && retryAfter && attempt === 0) {
        await wait(Math.min(5_000, retryAfter * 1_000))
        continue
      }

      throw new TelegramApiError(
        method,
        String(data?.error_code ?? response.status),
        data?.description ?? 'Telegram request failed',
        retryAfter,
      )
    }

    throw new TelegramApiError(method, 'RATE_LIMITED', 'Telegram rate limited')
  }

  getMe() {
    return this.call<{
      id: number
      username?: string
      first_name: string
    }>('getMe', {})
  }

  getUpdates(params: {
    offset: number
    timeout: number
    allowed_updates: string[]
  }) {
    return this.call<TelegramUpdate[]>('getUpdates', params, 45_000)
  }

  sendWidget(params: Record<string, unknown>) {
    return this.call<{ message_id: number }>('sendWidget', params)
  }

  editMessageWidgetData(params: Record<string, unknown>) {
    return this.call<boolean>('editMessageWidgetData', params)
  }

  answerWidgetQuery(params: { widget_query_id: string; data?: string }) {
    return this.call<boolean>('answerWidgetQuery', params)
  }

  sendMessage(params: Record<string, unknown>) {
    return this.call<unknown>('sendMessage', params)
  }

  setWebhook(params: Record<string, unknown>) {
    return this.call<boolean>('setWebhook', params)
  }

  getWebhookInfo() {
    return this.call<{
      url?: string
      pending_update_count?: number
      last_error_message?: string
    }>('getWebhookInfo', {})
  }

  deleteWebhook(params: Record<string, unknown> = {}) {
    return this.call<boolean>('deleteWebhook', params)
  }
}
