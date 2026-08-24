import crypto from "node:crypto";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { notificationQueries } from "../db/queries";

type FcmMessage = {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
};

type FcmCredentials = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const base64Url = (value: Buffer | string) =>
  Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const parseServiceAccountJson = (): Partial<FcmCredentials> => {
  if (!env.fcm.serviceAccountJson) {
    return {};
  }

  const raw = env.fcm.serviceAccountJson.trim().startsWith("{")
    ? env.fcm.serviceAccountJson
    : Buffer.from(env.fcm.serviceAccountJson, "base64").toString("utf8");
  let parsed: {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };

  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("FCM_SERVICE_ACCOUNT_JSON is not valid JSON. FCM is disabled.");
    return {};
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
  };
};

const getCredentials = (): FcmCredentials | null => {
  const fromJson = parseServiceAccountJson();
  const projectId = env.fcm.projectId ?? fromJson.projectId;
  const clientEmail = env.fcm.clientEmail ?? fromJson.clientEmail;
  const privateKey = env.fcm.privateKey ?? fromJson.privateKey;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }
  return { projectId, clientEmail, privateKey };
};

export const isFcmConfigured = () => getCredentials() !== null;

const createServiceAccountJwt = (credentials: FcmCredentials) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: credentials.clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), credentials.privateKey);
  return `${unsigned}.${base64Url(signature)}`;
};

const getAccessToken = async (credentials: FcmCredentials) => {
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60000 > Date.now()) {
    return cachedAccessToken.token;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createServiceAccountJwt(credentials),
    }),
  });

  if (!response.ok) {
    throw new Error(`FCM access token request failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedAccessToken.token;
};

const isInvalidTokenResponse = (status: number, body: string) =>
  status === 404 ||
  body.includes("UNREGISTERED") ||
  body.includes("INVALID_ARGUMENT") ||
  body.includes("registration-token-not-registered");

export const sendFcmMessage = async (message: FcmMessage) => {
  const credentials = getCredentials();
  if (!credentials) {
    console.warn("FCM is not configured. Skipping push notification.");
    return { sent: false, invalidToken: false };
  }

  const accessToken = await getAccessToken(credentials);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${credentials.projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: message.token,
          notification: {
            title: message.title,
            body: message.body,
          },
          data: message.data ?? {},
          android: {
            priority: "HIGH",
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
              },
            },
          },
        },
      }),
    }
  );

  const body = await response.text();
  if (!response.ok) {
    return { sent: false, invalidToken: isInvalidTokenResponse(response.status, body) };
  }

  return { sent: true, invalidToken: false };
};

export const disableFcmToken = async (token: string) => {
  const q = notificationQueries.disableFcmTokenByToken(token);
  await pool.query(q.sql, q.values);
};
