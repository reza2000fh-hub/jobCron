import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "@/config/constants";

export class TelegramError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = "TelegramError";
  }
}

/**
 * Sends a message to Telegram
 */
export async function sendTelegramMessage(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new TelegramError("Telegram credentials not configured");
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new TelegramError(
        errorData.description || `Failed to send message: ${response.statusText}`,
        response.status
      );
    }
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError(
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sends a message to a specific Telegram bot/channel (arbitrary credentials)
 */
export async function sendTelegramMessageTo(
  botToken: string,
  chatId: string,
  message: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new TelegramError(
      errorData.description || `Failed to send message: ${response.statusText}`,
      response.status
    );
  }
}

/**
 * Rate-limited message sender
 */
export async function sendMessagesWithRateLimit(
  messages: string[],
  delayMs: number = 2000
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i++) {
    try {
      await sendTelegramMessage(messages[i]);
      sent++;

      // Wait between messages to avoid rate limiting
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Failed to send message ${i + 1}:`, error);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Rate-limited message sender to an arbitrary bot/channel
 */
export async function sendMessagesWithRateLimitTo(
  botToken: string,
  chatId: string,
  messages: string[],
  delayMs: number = 2000
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < messages.length; i++) {
    try {
      await sendTelegramMessageTo(botToken, chatId, messages[i]);
      sent++;

      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Failed to send GOAT message ${i + 1}:`, error);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Sends a file (document) to Telegram using native FormData (Node.js 18+)
 */
export async function sendTelegramFile(
  fileBuffer: Buffer,
  filename: string,
  caption?: string
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new TelegramError("Telegram credentials not configured");
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;

  try {
    // Convert Buffer to Uint8Array for compatibility
    const uint8Array = new Uint8Array(fileBuffer);

    // Create a Blob from the buffer
    const blob = new Blob([uint8Array], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Create a File object
    const file = new File([blob], filename, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    // Use native FormData (available in Node.js 18+)
    const formData = new FormData();
    formData.append("chat_id", TELEGRAM_CHAT_ID);
    formData.append("document", file);

    if (caption) {
      formData.append("caption", caption);
    }

    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new TelegramError(
        errorData.description || `Failed to send file: ${response.statusText}`,
        response.status
      );
    }
  } catch (error) {
    if (error instanceof TelegramError) {
      throw error;
    }
    throw new TelegramError(
      `Network error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
