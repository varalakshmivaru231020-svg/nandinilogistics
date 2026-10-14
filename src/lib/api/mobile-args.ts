import type { MobileActionDef, MobileArg } from "./mobile-actions";

/**
 * Turning a JSON request body into the positional arguments a server action
 * takes.
 *
 * Pure, and apart from the route, because this is the only part of the mobile
 * boundary with any judgement in it: what an argument of each kind may be, and
 * what a caller is told when it is not. The route itself does no more than read
 * the body and hand the result to the action.
 */
/** The JSON a `form` argument is given as, turned into the FormData it expects. */
export function toFormData(value: unknown, name: string): FormData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`\`${name}\` must be an object of form fields.`);
  }
  const form = new FormData();
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw === null || raw === undefined) continue;
    // A repeated field is how a multi-select arrives, and what getAll() reads.
    if (Array.isArray(raw)) {
      for (const one of raw) form.append(key, String(one));
    } else {
      form.append(key, String(raw));
    }
  }
  return form;
}

export function coerce(arg: MobileArg, value: unknown, attached: FormData | null): unknown {
  if (value === undefined || value === null) {
    // The action takes `| null` here, so nothing is a legitimate answer.
    if (arg.nullable) return null;
    if (arg.optional) return undefined;
    throw new Error(`\`${arg.name}\` is required.`);
  }

  /*
   * An empty box on a form is nothing, not "". It matters where the action
   * falls back on it — `projectId ?? lead.projectId` with an empty string is
   * an id that does not exist.
   */
  if (arg.nullable && value === "") return null;

  switch (arg.kind) {
    case "text":
      if (typeof value !== "string") throw new Error(`\`${arg.name}\` must be text.`);
      return value;

    case "num": {
      const n = Number(value);
      if (!Number.isFinite(n)) throw new Error(`\`${arg.name}\` must be a number.`);
      return n;
    }

    case "bool":
      if (typeof value !== "boolean") throw new Error(`\`${arg.name}\` must be true or false.`);
      return value;

    case "ids":
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        throw new Error(`\`${arg.name}\` must be a list of ids.`);
      }
      return value;

    /*
     * Checked here rather than left to the action, because the type that
     * restricts it is erased at runtime: `"PM" | "ADMIN"` is just a string by
     * the time the action sees it, and an action that switches on it without a
     * default would take an unknown value as "neither".
     */
    case "enum": {
      if (typeof value !== "string" || !arg.values?.includes(value)) {
        throw new Error(`\`${arg.name}\` must be one of: ${arg.values?.join(", ")}.`);
      }
      return value;
    }

    case "form":
      // An attachment cannot travel in JSON, so a multipart body hands the
      // action the request's own FormData where it asked for "@formdata".
      if (value === "@formdata") {
        if (!attached) throw new Error(`\`${arg.name}\` needs a multipart body.`);
        return attached;
      }
      return toFormData(value, arg.name);

    /*
     * A record or a list of them — an indent's lines, a tower's planned units.
     * Passed through, because every one of these actions parses its input with
     * zod before it touches the database. Validating the shape again here would
     * be a second definition of it, and the two would drift.
     */
    case "json":
      return value;
  }
}

export function buildArgs(def: MobileActionDef, raw: unknown, attached: FormData | null): unknown[] {
  if (raw !== undefined && !Array.isArray(raw)) {
    throw new Error("`args` must be a list, positional, in the order the action takes them.");
  }
  const given = (raw as unknown[] | undefined) ?? [];
  if (given.length > def.args.length) {
    throw new Error(`This action takes ${def.args.length} argument(s), not ${given.length}.`);
  }

  const out: unknown[] = [];
  for (const [i, arg] of def.args.entries()) out.push(coerce(arg, given[i], attached));

  // Trailing optionals left off entirely, so a default in the action applies.
  while (out.length && out[out.length - 1] === undefined) out.pop();
  return out;
}
