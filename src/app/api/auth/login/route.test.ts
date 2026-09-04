import { beforeEach, describe, expect, it, vi } from "vitest";
import { getUserAuthByUsername, getUserByUsername } from "@/lib/services/user-service";
import { POST } from "./route";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		getUserAuthByUsername: vi.fn(),
		getUserByUsername: vi.fn(),
	};
});

const getUserAuthByUsernameMock = vi.mocked(getUserAuthByUsername);
const getUserByUsernameMock = vi.mocked(getUserByUsername);

const passwordHash = "a".repeat(64);
const otherHash = "b".repeat(64);

const publicUser = {
	id: "user-1",
	firstName: "Jane",
	lastName: "Doe",
	username: "jane@school.edu",
	email: "jane@school.edu",
};

function postLogin(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/login", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and a public user without a password hash", async () => {
		getUserAuthByUsernameMock.mockResolvedValue({
			id: "user-1",
			passwordHash,
		});
		getUserByUsernameMock.mockResolvedValue(publicUser);

		const response = await postLogin({
			username: "jane@school.edu",
			passwordHash,
		});
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.user).toEqual(publicUser);
		expect(json.user).not.toHaveProperty("passwordHash");
		expect(json.user).not.toHaveProperty("password_hash");
	});

	it("returns 401 with the same message for an unknown username", async () => {
		getUserAuthByUsernameMock.mockResolvedValue(null);

		const response = await postLogin({
			username: "missing",
			passwordHash,
		});
		const json = await response.json();

		expect(response.status).toBe(401);
		expect(json.error).toBe("Invalid username or password.");
		expect(getUserByUsernameMock).not.toHaveBeenCalled();
	});

	it("returns 401 with the same message for a hash mismatch", async () => {
		getUserAuthByUsernameMock.mockResolvedValueOnce(null);
		const unknownUserResponse = await postLogin({
			username: "missing",
			passwordHash,
		});

		getUserAuthByUsernameMock.mockResolvedValueOnce({
			id: "user-1",
			passwordHash,
		});
		const mismatchResponse = await postLogin({
			username: "jane@school.edu",
			passwordHash: otherHash,
		});

		const unknownJson = await unknownUserResponse.json();
		const mismatchJson = await mismatchResponse.json();

		expect(unknownUserResponse.status).toBe(401);
		expect(mismatchResponse.status).toBe(401);
		expect(mismatchJson.error).toBe("Invalid username or password.");
		expect(unknownJson.error).toBe(mismatchJson.error);
		expect(getUserByUsernameMock).not.toHaveBeenCalled();
	});

	it("returns 400 for an invalid body", async () => {
		const response = await postLogin({
			username: "jane@school.edu",
			password: "secret123",
		});

		expect(response.status).toBe(400);
		expect(getUserAuthByUsernameMock).not.toHaveBeenCalled();
	});
});
