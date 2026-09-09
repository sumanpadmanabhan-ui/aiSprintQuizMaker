"use client";

import { useState, type ComponentProps, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setCurrentUserId } from "@/lib/current-user";
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

export function LoginForm({ className, ...props }: ComponentProps<"div">) {
	const router = useRouter();
	const [formError, setFormError] = useState<string | null>(null);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		const form = new FormData(event.currentTarget);
		const username = String(form.get("username") ?? "").trim();
		const password = String(form.get("password") ?? "");

		if (!username || password.length < 8) {
			setFormError("Username and a password of at least 8 characters are required.");
			return;
		}

		const passwordHash = await hashPassword(password);
		const response = await fetch("/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username, passwordHash }),
		});
		const json = (await response.json().catch(() => ({}))) as {
			error?: string;
			user?: { id?: string };
		};

		if (response.status === 200) {
			if (json.user?.id) {
				setCurrentUserId(json.user.id);
			}
			router.push("/mcqs");
			return;
		}

		if (response.status === 401) {
			setFormError("Invalid username or password.");
			return;
		}

		setFormError(json.error ?? "Unable to log in.");
	}

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader>
					<CardTitle>Login to your account</CardTitle>
					<CardDescription>Enter your username below to login to your account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="username">Username</FieldLabel>
								<Input id="username" name="username" type="text" placeholder="jane@school.edu" required />
							</Field>
							<Field>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input id="password" name="password" type="password" required />
							</Field>
							<Field>
								<Button type="submit">Login</Button>
								<FieldError errors={formError ? [{ message: formError }] : undefined} />
								<FieldDescription className="text-center">
									Don&apos;t have an account? <Link href="/register">Sign up</Link>
								</FieldDescription>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
