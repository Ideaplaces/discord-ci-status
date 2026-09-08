// Pure decisions: what to post, what to delete. No network in this file.

export const RED = 15158332;
export const MARKER = "#ci-status=";

// Which red messages a green run is allowed to clear. Workflow file, job id and
// branch: a green CI on feature/x clears the red CI on feature/x, and nothing
// else. On a pull request the branch is the PR head, not "123/merge".
export function streamKey(env) {
  const ref = env.GITHUB_WORKFLOW_REF || "";
  const path = ref.split("@")[0];
  const file = path.slice(path.lastIndexOf("/") + 1) || "workflow";
  const job = env.GITHUB_JOB || "job";
  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "unknown";
  return `${file}/${job}@${branch}`;
}

export function runUrl(env) {
  const server = env.GITHUB_SERVER_URL || "https://github.com";
  return `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

// The key rides in the embed URL fragment. GitHub ignores it, Discord does not
// show it, and it is how a later run recognises the messages it may delete.
export function markedUrl(env, key) {
  return `${runUrl(env)}${MARKER}${encodeURIComponent(key)}`;
}

export function parseWebhook(url) {
  const m = /\/api\/(?:v\d+\/)?webhooks\/(\d+)\/([^/?#]+)/.exec(url || "");
  if (!m) throw new Error("webhook is not a Discord webhook URL");
  return { id: m[1], token: m[2] };
}

export function firstLine(text) {
  return (text || "").split(/\r?\n/)[0].trim();
}

export function defaultDescription(env, event) {
  const commit =
    firstLine(event?.head_commit?.message) ||
    firstLine(event?.pull_request?.title) ||
    (env.GITHUB_SHA || "").slice(0, 7) ||
    "(manual run)";
  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "";
  const actor = env.GITHUB_ACTOR || "";
  return `**Commit:** ${commit}\n**Branch:** ${branch}\n**By:** ${actor}`;
}

export function failurePayload({ env, event, key, title, description, footer, mention }) {
  const embed = {
    title: `:x: ${title}`,
    description: description || defaultDescription(env, event),
    url: markedUrl(env, key),
    color: RED,
    timestamp: new Date().toISOString(),
  };
  if (footer) embed.footer = { text: footer };
  const payload = { embeds: [embed] };
  if (mention) payload.content = mention;
  return payload;
}

// Messages this webhook posted for this key. Anything else in the channel,
// including other embeds that link to the same run, is left alone.
export function staleMessages(messages, webhookId, key) {
  const suffix = MARKER + encodeURIComponent(key);
  return messages.filter(
    (m) =>
      m.webhook_id === webhookId &&
      Array.isArray(m.embeds) &&
      m.embeds.some((e) => typeof e.url === "string" && e.url.endsWith(suffix)),
  );
}
