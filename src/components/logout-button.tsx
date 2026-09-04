"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function LogoutButton() {
	const router = useRouter();
	const [error, setError] = useState<string | null>(null);

	async function handleLogout() {
		try {
			await fetch("/api/auth/logout", { method: "POST" });
		} catch {
			setError("Logout request failed. Returning to login.");
		}
		router.push("/login");
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<Button type="button" variant="outline" onClick={handleLogout}>
				Log out
			</Button>
			<FieldError errors={error ? [{ message: error }] : undefined} />
		</div>
	);
}
