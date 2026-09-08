import { config } from "dotenv";

config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — tests run against a real Postgres database.");
}
