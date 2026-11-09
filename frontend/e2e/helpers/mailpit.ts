import { MAILPIT } from './env';

/** Lee el último correo enviado a `to` desde Mailpit (SMTP real del backend) y extrae un código. */
export async function latestMessageFor(to: string, since: number, timeoutMs = 15000): Promise<string> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}&limit=5`);
    const data = (await res.json()) as { messages: Array<{ ID: string; Created: string }> };
    const msg = data.messages?.find((m) => new Date(m.Created).getTime() >= since - 2000);
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as { Text: string; HTML: string };
      return `${full.Text}\n${full.HTML}`;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No llegó correo a ${to}`);
}

export function extractOtp(body: string): string {
  const m = body.replace(/<[^>]+>/g, ' ').match(/\b(\d{6})\b/);
  if (!m) throw new Error('No se encontró OTP en el correo');
  return m[1];
}
