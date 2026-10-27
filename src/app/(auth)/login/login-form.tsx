"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Alert, Field, Input } from "@/components/ui/primitives";
import { loginAction, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" loading={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field label="Work email" required error={state.fieldErrors?.email?.[0]}>
        <Input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@nandini.example"
          required
          autoFocus
        />
      </Field>

      <Field label="Password" required error={state.fieldErrors?.password?.[0]}>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton />
    </form>
  );
}
