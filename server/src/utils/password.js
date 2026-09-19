import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(128, "Password must be 128 characters or fewer.")
  .refine((value) => /[a-z]/.test(value), "Add a lowercase letter.")
  .refine((value) => /[A-Z]/.test(value), "Add an uppercase letter.")
  .refine((value) => /\d/.test(value), "Add a number.")
  .refine(
    (value) => /[^A-Za-z0-9]/.test(value),
    "Add a symbol or punctuation mark.",
  );

export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  active: user.active,
  mustChangePassword: user.mustChangePassword,
});
