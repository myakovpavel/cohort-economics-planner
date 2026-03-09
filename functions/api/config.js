function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
    status: init.status ?? 200,
  });
}

function hasValidPayload(payload) {
  if (payload && Array.isArray(payload.funnels) && payload.funnels.length === 2) {
    return true;
  }

  return (
    payload &&
    Array.isArray(payload.profiles) &&
    payload.profiles.length >= 1 &&
    payload.profiles.every(
      (profile) =>
        profile &&
        typeof profile.name === "string" &&
        Array.isArray(profile.funnels) &&
        profile.funnels.length === 2,
    )
  );
}

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.cohort_economics_planner_db) {
    return json({ error: "Database binding is missing." }, { status: 500 });
  }

  const result = await env.cohort_economics_planner_db
    .prepare(
      "SELECT payload, updated_at FROM app_config WHERE config_key = ? LIMIT 1",
    )
    .bind("shared")
    .first();

  if (!result) {
    return json({
      ok: true,
      payload: null,
      updatedAt: null,
    });
  }

  let payload = null;
  try {
    payload = JSON.parse(result.payload);
  } catch {
    return json({ error: "Stored payload is invalid JSON." }, { status: 500 });
  }

  return json({
    ok: true,
    payload,
    updatedAt: result.updated_at,
  });
}

export async function onRequestPut(context) {
  const { request, env } = context;

  if (!env.cohort_economics_planner_db) {
    return json({ error: "Database binding is missing." }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!hasValidPayload(body?.payload)) {
    return json({ error: "Payload must contain two funnels." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify(body.payload);

  await env.cohort_economics_planner_db
    .prepare(
      `
        INSERT INTO app_config (config_key, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(config_key) DO UPDATE
        SET payload = excluded.payload,
            updated_at = excluded.updated_at
      `,
    )
    .bind("shared", payload, updatedAt)
    .run();

  return json({
    ok: true,
    updatedAt,
  });
}
