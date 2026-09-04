import { describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/password";

describe("hashPassword", () => {
	it("returns a 64-character lowercase hex string", async () => {
		const hash = await hashPassword("secret123");

		expect(hash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("hashes the same plaintext the same way", async () => {
		await expect(hashPassword("secret123")).resolves.toBe(await hashPassword("secret123"));
	});

	it("hashes different plaintext differently", async () => {
		const first = await hashPassword("secret123");
		const second = await hashPassword("secret124");

		expect(first).not.toBe(second);
	});

	it("does not return the plaintext password", async () => {
		const plaintext = "secret123";

		await expect(hashPassword(plaintext)).resolves.not.toBe(plaintext);
	});
});
