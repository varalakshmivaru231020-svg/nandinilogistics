/**
 * The country codes the web offers beside a mobile number, in its own order.
 *
 * `leads-screen.tsx` and `hr-screen.tsx` both put this select next to the
 * number and prefix what was typed with the code's dial part — so the list
 * lives here and both sides read it, including the phone's own forms.
 */
export const COUNTRY_CODES = [
  "+91 India", "+971 UAE", "+966 Saudi Arabia", "+974 Qatar", "+965 Kuwait", "+973 Bahrain",
  "+968 Oman", "+65 Singapore", "+60 Malaysia", "+1 USA / Canada", "+44 UK", "+61 Australia",
  "+64 New Zealand", "+49 Germany", "+33 France", "+81 Japan", "+86 China", "+94 Sri Lanka",
  "+977 Nepal", "+880 Bangladesh",
] as const;

/** The dial part of a chosen code — "+91 India" → "+91". */
export const dialOf = (code: string): string => code.split(" ")[0] ?? "";
