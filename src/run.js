// The orchestration: given inputs, env and a client, post or clean up.
// Returns what it did so the entry point and the tests can report it.

import { failurePayload, parseWebhook, staleMessages, streamKey } from "./lib.js";

export async function run({ inputs, env, event, client, log = console.log, warn = console.warn }) {
  const status = (inputs.status || "").toLowerCase();
  if (!inputs.webhook) {
    log("no webhook configured, nothing to do");
    return { action: "none" };
  }
  const { id, token } = parseWebhook(inputs.webhook);
  const key = inputs.key || streamKey(env);

  if (status === "failure") {
    const payload = failurePayload({
      env,
      event,
      key,
      title: inputs.title,
      description: inputs.description,
      footer: inputs.footer,
      mention: inputs.mention,
    });
    const posted = await client.post(id, token, payload);
    log(`posted failure ${posted?.id || ""} for ${key}`);
    return { action: "posted", key, messageId: posted?.id };
  }

  if (status !== "success") {
    log(`status ${status || "(empty)"}: nothing to post, nothing to clear`);
    return { action: "none", key };
  }

  if (!inputs.botToken) {
    warn("success, but no bot-token given: earlier failures stay in the channel");
    return { action: "none", key };
  }
  const info = await client.webhookInfo(id, token);
  const messages = await client.channelMessages(inputs.botToken, info.channel_id);
  const stale = staleMessages(messages, id, key);
  for (const m of stale) {
    await client.deleteOwn(id, token, m.id);
    log(`deleted failure ${m.id} (${m.embeds?.[0]?.title || ""})`);
  }
  log(`cleared ${stale.length} earlier failure${stale.length === 1 ? "" : "s"} for ${key}`);
  return { action: "cleared", key, deleted: stale.map((m) => m.id) };
}
