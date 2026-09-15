/**
 * Minimal Telegram Bot API client (long-polling + sendMessage).
 */

const API_ROOT = "https://api.telegram.org";

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramApiUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type?: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

function botUrl(token: string, method: string): string {
  return `${API_ROOT}/bot${token}/${method}`;
}

async function callApi<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(botUrl(token, method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as ApiResponse<T>;
  if (!data.ok || data.result === undefined) {
    throw new Error(
      `Telegram API ${method} failed: ${data.description ?? res.statusText} (${data.error_code ?? res.status})`,
    );
  }
  return data.result;
}

export async function getMe(token: string): Promise<TelegramUser> {
  return callApi<TelegramUser>(token, "getMe");
}

export async function getUpdates(
  token: string,
  offset: number,
  timeout = 30,
): Promise<TelegramApiUpdate[]> {
  return callApi<TelegramApiUpdate[]>(token, "getUpdates", {
    offset,
    timeout,
    allowed_updates: ["message"],
  });
}

export async function sendMessage(
  token: string,
  chatId: number | string,
  text: string,
): Promise<unknown> {
  return callApi(token, "sendMessage", {
    chat_id: chatId,
    text,
  });
}

/** Clear webhook so getUpdates long-polling works. */
export async function deleteWebhook(token: string): Promise<boolean> {
  return callApi<boolean>(token, "deleteWebhook", { drop_pending_updates: false });
}
