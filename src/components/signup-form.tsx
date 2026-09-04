"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hashPassword } from "@/lib/password";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({ ...props }: ComponentProps<typeof Card>) {
	const router = useRouter();
	const [formError, setFormError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<{
		confirmPassword?: string;
		username?: string;
		email?: string;
	}>({});

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		setFieldErrors({});

		const form = new FormData(event.currentTarget);
		const firstName = String(form.get("firstName") ?? "").trim();
		const lastName = String(form.get("lastName") ?? "").trim();
		const username = String(form.get("username") ?? "").trim();
		const email = String(form.get("email") ?? "").trim();
		const password = String(form.get("password") ?? "");
		const confirmPassword = String(form.get("confirmPassword") ?? "");

		if (!firstName || !lastName || !username || !email || !password) {
			setFormError("All fields are required.");
			return;
		}
		if (!EMAIL.test(email)) {
			setFieldErrors({ email: "Enter a valid email address." });
			return;
		}
		if (password.length < 8) {
			setFormError("Password must be at least 8 characters long.");
			return;
		}
		if (password !== confirmPassword) {
			setFieldErrors({ confirmPassword: "Passwords do not match." });
			return;
		}

		const passwordHash = await hashPassword(password);
		const response = await fetch("/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ firstName, lastName, username, email, passwordHash }),
		});
		const json = (await response.json().catch(() => ({}))) as { error?: string };

		if (response.status === 201) {
			router.push("/mcqs");
			return;
		}

		if (response.status === 409) {
			const message = json.error ?? "Username or email already in use.";
			if (/email/i.test(message) && !/username/i.test(message)) {
				setFieldErrors({ email: message });
			} else if (/username/i.test(message)) {
				setFieldErrors({ username: message });
			} else {
				setFormError(message);
			}
			return;
		}

		setFormError(json.error ?? "Unable to create your account.");
	}

	return (
		<Card {...props}>
			<CardHeader>
				<CardTitle>Create an account</CardTitle>
				<CardDescription>
					Enter your information below to create your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="first-name">First name</FieldLabel>
							<Input id="first-name" name="firstName" type="text" placeholder="Jane" required />
						</Field>
						<Field>
							<FieldLabel htmlFor="last-name">Last name</FieldLabel>
							<Input id="last-name" name="lastName" type="text" placeholder="Doe" required />
						</Field>
						<Field>
							<FieldLabel htmlFor="username">Username</FieldLabel>
							<Input id="username" name="username" type="text" placeholder="jane@school.edu" required />
							<FieldDescription>
								You can use your email as the username if you want one value for both.
							</FieldDescription>
							<FieldError errors={fieldErrors.username ? [{ message: fieldErrors.username }] : undefined} />
						</Field>
						<Field>
							<FieldLabel htmlFor="email">Email</FieldLabel>
							<Input id="email" name="email" type="email" placeholder="m@example.com" required />
							<FieldDescription>
								We&apos;ll use this to contact you. We will not share your email with anyone else.
							</FieldDescription>
							<FieldError errors={fieldErrors.email ? [{ message: fieldErrors.email }] : undefined} />
						</Field>
						<Field>
							<FieldLabel htmlFor="password">Password</FieldLabel>
							<Input id="password" name="password" type="password" required />
							<FieldDescription>Must be at least 8 characters long.</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
							<Input id="confirm-password" name="confirmPassword" type="password" required />
							<FieldDescription>Please confirm your password.</FieldDescription>
							<FieldError
								errors={
									fieldErrors.confirmPassword
										? [{ message: fieldErrors.confirmPassword }]
										: undefined
								}
							/>
						</Field>
						<FieldGroup>
							<Field>
								<Button type="submit">Create Account</Button>
								<FieldError errors={formError ? [{ message: formError }] : undefined} />
								<FieldDescription className="px-6 text-center">
									Already have an account? <Link href="/login">Sign in</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</FieldGroup>
				</form>
			</CardContent>
		</Card>
	);
}
