import crypto from "node:crypto";
import https from "node:https";

export function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function amzDate(now: Date): { dateStamp: string; dateTime: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { dateStamp: iso.slice(0, 8), dateTime: iso };
}

function signingKey(secret: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function formatFrom(): string {
  const email = process.env.SES_FROM_EMAIL;
  if (!email) throw new Error("SES_FROM_EMAIL is not configured");
  const name = process.env.SES_FROM_NAME || "Execution Guidance System";
  return `${name} <${email}>`;
}

function post(host: string, body: string, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.request({ method: "POST", host, path: "/v2/email/outbound-emails", headers }, (res) => {
      let response = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { response += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`SES send failed (${res.statusCode}): ${response}`));
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function sendSesEmail(toEmail: string, subject: string, html: string, text: string): Promise<void> {
  const region = process.env.SES_REGION || process.env.AWS_REGION || "ap-southeast-2";
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS credentials are not available for SES signing");

  const host = `email.${region}.amazonaws.com`;
  const body = JSON.stringify({
    FromEmailAddress: formatFrom(),
    Destination: { ToAddresses: [toEmail] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: text, Charset: "UTF-8" },
          Html: { Data: html, Charset: "UTF-8" },
        },
      },
    },
  });

  const now = new Date();
  const { dateStamp, dateTime } = amzDate(now);
  const payloadHash = sha256Hex(body);
  const baseHeaders: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": dateTime,
    "x-amz-content-sha256": payloadHash,
  };
  if (sessionToken) baseHeaders["x-amz-security-token"] = sessionToken;

  const sortedHeaderNames = Object.keys(baseHeaders).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${baseHeaders[name].trim()}\n`).join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = ["POST", "/v2/email/outbound-emails", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", dateTime, scope, sha256Hex(canonicalRequest)].join("\n");
  const signature = crypto.createHmac("sha256", signingKey(secretAccessKey, dateStamp, region, "ses")).update(stringToSign, "utf8").digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  await post(host, body, { ...baseHeaders, Authorization: authorization, "content-length": Buffer.byteLength(body).toString() });
}
