import { apiFail, apiOk, mobileRoute } from "@/lib/api/mobile";
import { OWN_PHOTO_PATH, ownRider } from "@/lib/api/mobile-rider";
import { PERM } from "@/lib/permissions/codes";

/** The main company printed on every card. */
const MAIN_COMPANY = "Nandini Logistics";

/** The facts on the caller's own digital ID card — SOW §3.6 item 3. */
export const GET = mobileRoute([PERM.hr.employee.idCard], async (_req, actor) => {
  const e = await ownRider(actor.id);
  if (!e) return apiFail(404, "There is no rider record linked to your login.", "no-rider");
  return apiOk({
    name: e.name,
    mobile: e.mobile,
    photoUrl: e.photoKey ? OWN_PHOTO_PATH : null,
    riderId: e.employeeCode,
    mainCompany: MAIN_COMPANY,
    /** Client company names, as printed on the card. */
    companies: e.companies.map((c) => c.company.name),
    insuranceNumber: e.insuranceNumber,
    emergencyNumber: e.emergencyMobileFamily,
    status: e.status,
    onboardingStatus: e.onboardingStatus,
    joinedOn: e.joinedOn ? e.joinedOn.toISOString().slice(0, 10) : null,
  });
});
