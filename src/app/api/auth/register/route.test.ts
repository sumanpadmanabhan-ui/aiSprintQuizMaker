import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, UserConflictError } from "@/lib/services/user-service";
import { POST } from "./route";

vi.mock("@/lib/services/user-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/user-service")>();
	return {
		...actual,
		createUser: vi.fn(),
	};
});

const createUserMock = vi.mocked(createUser);

const validBody = {
	firstName: "Jane",
	lastName: "Doe",
	username: "jane@school.edu",
	email: "jane@school.edu",
	passwordHash: "a".repeat(64),
};

const publicUser = {
	id: "user-1",
	firstName: "Jane",
	lastName: "Doe",
	username: "jane@school.edu",
	email: "jane@school.edu",
};

function postRegister(body: unknown) {
	return POST(
		new Request("http://localhost/api/auth/register", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

describe("POST /api/auth/register", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 and a public user without a password hash", async () => {
		createUserMock.mockResolvedValue({
			...publicUser,
			passwordHash: "a".repeat(64),
		} as typeof publicUser);

		const response = await postRegister(validBody);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json.user).toEqual(publicUser);
		expect(json.user).not.toHaveProperty("passwordHash");
		expect(json.user).not.toHaveProperty("password_hash");
		expect(JSON.stringify(json)).not.toContain("passwordHash");
		expect(createUserMock).toHaveBeenCalledWith({
			firstName: "Jane",
			lastName: "Doe",
			username: "jane@school.edu",
			email: "jane@school.edu",
			passwordHash: validBody.passwordHash,
		});
	});

	it("allows username and email to be the same", async () => {
		createUserMock.mockResolvedValue(publicUser);

		const response = await postRegister(validBody);

		expect(response.status).toBe(201);
		expect(createUserMock).toHaveBeenCalledOnce();
	});

	it("returns 400 when required fields are missing", async () => {
		const response = await postRegister({
			lastName: "Doe",
			username: "jane@school.edu",
			email: "jane@school.edu",
			passwordHash: validBody.passwordHash,
		});

		expect(response.status).toBe(400);
		expect(createUserMock).not.toHaveBeenCalled();
	});

	it("returns 400 when email is invalid", async () => {
		const response = await postRegister({
			...validBody,
			email: "not-an-email",
		});

		expect(response.status).toBe(400);
		expect(createUserMock).not.toHaveBeenCalled();
	});

	it("returns 400 when the body includes a password field", async () => {
		const response = await postRegister({
			...validBody,
			password: "secret123",
		});

		expect(response.status).toBe(400);
		expect(createUserMock).not.toHaveBeenCalled();
	});

	it("returns 400 when passwordHash is not 64 hex characters", async () => {
		const response = await postRegister({
			...validBody,
			passwordHash: "abc",
		});

		expect(response.status).toBe(400);
		expect(createUserMock).not.toHaveBeenCalled();
	});

	it("returns 409 when the user service reports a conflict", async () => {
		createUserMock.mockRejectedValue(new UserConflictError("username"));

		const response = await postRegister(validBody);
		const json = await response.json();

		expect(response.status).toBe(409);
		expect(json.error).toMatch(/username/i);
	});
});
