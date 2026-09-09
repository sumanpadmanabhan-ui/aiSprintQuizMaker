import { beforeEach, describe, expect, it } from "vitest";
import { clearCurrentUserId, getCurrentUserId, setCurrentUserId } from "@/lib/current-user";

describe("current user id", () => {
	beforeEach(() => {
		clearCurrentUserId();
	});

	it("returns null when nothing is stored", () => {
		expect(getCurrentUserId()).toBeNull();
	});

	it("stores and returns a trimmed user id", () => {
		setCurrentUserId("  user-1  ");
		expect(getCurrentUserId()).toBe("user-1");
	});

	it("clears the stored user id", () => {
		setCurrentUserId("user-1");
		clearCurrentUserId();
		expect(getCurrentUserId()).toBeNull();
	});
});
