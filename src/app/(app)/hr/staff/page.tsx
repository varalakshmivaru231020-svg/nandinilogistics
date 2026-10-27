import { Workforce, type WorkforceSearch } from "../workforce";

export const metadata = { title: "Internal Staff" };

export default function Page({ searchParams }: { searchParams: WorkforceSearch }) {
  return <Workforce searchParams={searchParams} view="staff" />;
}
