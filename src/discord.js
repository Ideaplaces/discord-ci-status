// The thin network layer. One fetch wrapper that honours Discord's 429s, and
// the four calls the action needs.

const API = "https://discord.com/api/v10";
const UA = "DiscordBot (https://github.com/Ideaplaces/discord-ci-status, 1.0)";

export function makeClient({ fetchImpl = fetch, sleep = defaultSleep, maxRetries = 5 } = {}) {
  async function call(path, { method = "GET", headers = {}, body } = {}) {
    const url = path.startsWith("http") ? path : API + path;
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method,
        headers: { "User-Agent": UA, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < maxRetries) {
        let wait = 1;
        try {
          const data = await res.json();
          if (typeof data.retry_after === "number") wait = data.retry_after;
        } catch {
          // no body, keep the one second default
        }
        await sleep(wait * 1000 + 100);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Discord ${method} ${path.replace(/\/webhooks\/\d+\/[^/?#]+/, "/webhooks/<id>/<token>")} -> ${res.status} ${text.slice(0, 300)}`);
      }
      if (res.status === 204) return null;
      return res.json();
    }
  }

  return {
    webhookInfo: (id, token) => call(`/webhooks/${id}/${token}`),
    post: (id, token, payload) => call(`/webhooks/${id}/${token}?wait=true`, { method: "POST", body: payload }),
    deleteOwn: (id, token, messageId) =>
      call(`/webhooks/${id}/${token}/messages/${messageId}`, { method: "DELETE" }),
    async channelMessages(botToken, channelId, { pages = 5 } = {}) {
      const all = [];
      let before = "";
      for (let i = 0; i < pages; i++) {
        const page = await call(`/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ""}`, {
          headers: { Authorization: `Bot ${botToken}` },
        });
        all.push(...page);
        if (page.length < 100) break;
        before = page[page.length - 1].id;
      }
      return all;
    },
  };
}

function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
