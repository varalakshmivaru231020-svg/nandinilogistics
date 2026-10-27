/**
 * A rider's own sign-up from the app — SOW §3.6 item 1. Pure: the route
 * reads the multipart body into a plain record and this decides whether it
 * is a sign-up, so the rules can be asserted without a request.
 */
import { AADHAAR_RE, aadhaarDigits, PAN_RE } from "./onboarding";

export const SIGNUP_FILES = {
  photo: "Photo",
  "doc:Aadhaar front": "Aadhaar front",
  "doc:Aadhaar back": "Aadhaar back",
  "doc:PAN card": "PAN card",
  "doc:Driving licence": "Driving licence",
} as const;

/** Files the sign-up cannot go without: the face and both sides of the Aadhaar. */
export const REQUIRED_SIGNUP_FILES = ["photo", "doc:Aadhaar front", "doc:Aadhaar back"] as const;

export interface SignupInput {
  referralCode?: string | null;
  mobile?: string | null;
  name?: string | null;
  companyId?: string | null;
  address?: string | null;
  emergencyMobileFamily?: string | null;
  emergencyMobileFriend?: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  drivingLicence?: string | null;
  pin?: string | null;
}

export interface SignupValues {
  referralCode: string | null;
  /** Ten digits, without +91 or a leading 0. */
  mobile: string;
  name: string;
  companyId: string | null;
  address: string;
  emergencyMobileFamily: string;
  emergencyMobileFriend: string;
  aadhaar: string;
  pan: string | null;
  drivingLicence: string | null;
  pin: string;
}

export type SignupResult =
  | { ok: true; value: SignupValues }
  | { ok: false; error: string; fieldErrors: Record<string, string[]> };

/** The ten digits of an Indian mobile number, or null when it is not one. */
export function mobileDigits(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const ten =
    digits.length === 12 && digits.startsWith("91") ? digits.slice(2)
    : digits.length === 11 && digits.startsWith("0") ? digits.slice(1)
    : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

const t = (v: string | null | undefined) => String(v ?? "").trim();

export function validateSignup(input: SignupInput, presentFiles: ReadonlySet<string>): SignupResult {
  const errors: Record<string, string[]> = {};
  const fail = (field: string, msg: string) => {
    (errors[field] ??= []).push(msg);
  };

  const name = t(input.name);
  if (name.length < 2) fail("name", "Name is required");

  const mobile = mobileDigits(input.mobile);
  if (!mobile) fail("mobile", "Enter a valid 10-digit mobile number");

  const address = t(input.address);
  if (address.length < 5) fail("address", "Address is required");

  const family = mobileDigits(input.emergencyMobileFamily);
  if (!family) fail("emergencyMobileFamily", "Enter a valid father / mother mobile");
  const friend = mobileDigits(input.emergencyMobileFriend);
  if (!friend) fail("emergencyMobileFriend", "Enter a valid friend mobile");
  if (mobile && (family === mobile || friend === mobile)) {
    fail(family === mobile ? "emergencyMobileFamily" : "emergencyMobileFriend", "An emergency number must not be your own");
  }

  const aadhaar = aadhaarDigits(input.aadhaar);
  if (!AADHAAR_RE.test(aadhaar)) fail("aadhaar", "Aadhaar must be 12 digits");

  const pan = t(input.pan).toUpperCase();
  if (pan && !PAN_RE.test(pan)) fail("pan", "PAN should look like ABCDE1234F");

  const pin = t(input.pin);
  if (!/^\d{4}$/.test(pin)) fail("pin", "The PIN must be exactly 4 digits");

  for (const f of REQUIRED_SIGNUP_FILES) {
    if (!presentFiles.has(f)) fail(f, `${SIGNUP_FILES[f]} is required`);
  }

  const fields = Object.keys(errors);
  if (fields.length) return { ok: false, error: errors[fields[0]][0], fieldErrors: errors };

  return {
    ok: true,
    value: {
      referralCode: t(input.referralCode).toUpperCase() || null,
      mobile: mobile!,
      name,
      companyId: t(input.companyId) || null,
      address,
      emergencyMobileFamily: family!,
      emergencyMobileFriend: friend!,
      aadhaar,
      pan: pan || null,
      drivingLicence: t(input.drivingLicence).toUpperCase() || null,
      pin,
    },
  };
}
