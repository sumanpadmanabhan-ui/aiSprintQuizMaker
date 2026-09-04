import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, getUserAuthByUsername, getUserByUsername } from "@/lib/services/user-service";
import { POST } from "./route";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		createUser: vi.fn(),
		getUserAuthByUsername: vi.fn(),
		getUserByUsername: vi.fn(),
	};
});

const createUserMock = vi.mocked(createUser);
const getUserAuthByUsernameMock = vi.mocked(getUserAuthByUsername);
const getUserByUsernameMock = vi.mocked(getUserByUsername);

describe("POST /api/auth/logout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and does not call the user service", async () => {
		const response = await POST(
			new Request("http://localhost/api/auth/logout", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual({ ok: true });
		expect(createUserMock).not.toHaveBeenCalled();
		expect(getUserAuthByUsernameMock).not.toHaveBeenCalled();
		expect(getUserByUsernameMock).not.toHaveBeenCalled();
	});
});
