const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = "-1003956728376";
const WEBHOOK_PATH = "/api/tv/a8f4c1e7b62d49c3b1e0d7f6";

app.use(express.text({ type: "*/*", limit: "64kb" }));

function parseSignal(body) {
  if (!body) return {};

  // TradingView actualmente envía key=value línea por línea.
  if (typeof body === "string") {
    const text = body.trim();

    // También aceptamos JSON por si después cambiamos el formato.
    try {
      const json = JSON.parse(text);
      if (json && typeof json === "object") return json;
    } catch (_) {}

    const data = {};

    for (const line of text.split(/\r?\n/)) {
      const pos = line.indexOf("=");
      if (pos === -1) continue;

      const key = line.slice(0, pos).trim();
      const value = line.slice(pos + 1).trim();

      if (key) data[key] = value;
    }

    return data;
  }

  return body;
}

function normalizeSymbol(symbol) {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/^.*:/, "")
    .replace(/\.P$/, "")
    .replace(/USDT$/, "");
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatPrice(value) {
  return Number(value).toFixed(8).replace(/\.?0+$/, "");
}

function buildCornixMessage(signal) {
  const symbol = normalizeSymbol(signal.symbol);
  const side = String(signal.side || "").trim().toUpperCase();

  const entry = numberValue(signal.entry);
  const sl = numberValue(signal.sl);
  const tp1 = numberValue(signal.tp1);
  const tp2 = numberValue(signal.tp2);
  const tp3 = numberValue(signal.tp3);

  if (!symbol) throw new Error("missing_symbol");
  if (!["LONG", "SHORT"].includes(side)) throw new Error("invalid_side");

  if ([entry, sl, tp1, tp2, tp3].some(v => v === null)) {
    throw new Error("invalid_prices");
  }

  const risk = Math.abs(entry - sl);

  if (!(risk > 0)) throw new Error("invalid_risk");

  if (side === "LONG") {
    if (!(sl < entry && tp1 > entry && tp2 > tp1 && tp3 > tp2)) {
      throw new Error("invalid_long_structure");
    }
  } else {
    if (!(sl > entry && tp1 < entry && tp2 < tp1 && tp3 < tp2)) {
      throw new Error("invalid_short_structure");
    }
  }

  // Runner: TP4 dinámico a 10R.
  const tp4 =
    side === "LONG"
      ? entry + 10 * risk
      : entry - 10 * risk;

  const signalType = side === "LONG" ? "Long" : "Short";

  return `#${symbol}/USDT

Signal Type: Regular (${signalType})
Leverage: Isolated (30X)

Entry:
${formatPrice(entry)}

Take-Profit Targets:
1) ${formatPrice(tp1)}
2) ${formatPrice(tp2)}
3) ${formatPrice(tp3)}
4) ${formatPrice(tp4)}

Stop Targets:
1) ${formatPrice(sl)}

Trailing Configuration:
Stop: Breakeven - Trigger: Target (1)`;
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("telegram_token_not_configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        disable_web_page_preview: true
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      `telegram_error_${response.status}: ${JSON.stringify(result)}`
    );
  }

  return result;
}

app.get("/", (_q, r) => {
  r.json({
    ok: true,
    service: "Avalanche VIP Direct Bridge",
    route: "TradingView -> Render -> Telegram -> Cornix"
  });
});

app.get("/health", (_q, r) => {
  r.json({
    ok: true,
    status: "healthy",
    telegramConfigured: Boolean(TELEGRAM_BOT_TOKEN)
  });
});

app.get(WEBHOOK_PATH, (_q, r) => {
  r.json({
    ok: true,
    endpoint: "tradingview-webhook",
    method: "POST",
    destination: "AVALANCHE VIP"
  });
});

app.post(WEBHOOK_PATH, async (q, r) => {
  try {
    const signal = parseSignal(q.body);

    console.log(
      JSON.stringify({
        event: "tradingview_webhook_received",
        at: new Date().toISOString(),
        symbol: signal.symbol || null,
        side: signal.side || null
      })
    );

    const message = buildCornixMessage(signal);

    const telegram = await sendTelegram(message);

    console.log(
      JSON.stringify({
        event: "telegram_signal_sent",
        at: new Date().toISOString(),
        symbol: signal.symbol,
        side: signal.side,
        chatId: CHAT_ID,
        messageId: telegram.result?.message_id || null
      })
    );

    r.json({
      ok: true,
      delivered: true,
      destination: "AVALANCHE VIP",
      messageId: telegram.result?.message_id || null
    });
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "bridge_error",
        at: new Date().toISOString(),
        error: e?.message || String(e)
      })
    );

    r.status(400).json({
      ok: false,
      error: e?.message || "bridge_error"
    });
  }
});

app.use((_q, r) => {
  r.status(404).json({
    ok: false,
    error: "not_found"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Avalanche VIP Direct Bridge listening on ${PORT}`);
});
