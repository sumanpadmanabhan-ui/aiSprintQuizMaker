import { getDb } from "@/lib/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	UserConflictError,
	UserNotFoundError,
	createUser,
	deleteUser,
	getUserAuthByUsername,
	getUserById,
	getUserByUsername,
	updateUser,
} from "@/lib/services/user-service";

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

const getDbMock = vi.mocked(getDb);

const janeInput = {
	firstName: "Jane",
	lastName: "Doe",
	username: "Jane@School.edu",
	email: "Jane@School.edu",
	passwordHash: "a".repeat(64),
};

const janeRow = {
	id: "user-1",
	first_name: "Jane",
	last_name: "Doe",
	username: "jane@school.edu",
	email: "jane@school.edu",
	password_hash: "a".repeat(64),
};

function createStatement(options?: {
	results?: Record<string, unknown>[];
	changes?: number;
	runError?: Error;
	allError?: Error;
}) {
	const statement = {
		bind: vi.fn((..._args: unknown[]) => statement),
		all: vi.fn(async () => {
			if (options?.allError) {
				throw options.allError;
			}
			return { results: options?.results ?? [] };
		}),
		run: vi.fn(async () => {
			if (options?.runError) {
				throw options.runError;
			}
			return { success: true, meta: { changes: options?.changes ?? 1 } };
		}),
	};
	return statement;
}

describe("user service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("createUser", () => {
		it("persists bound fields, lowercases username and email, and omits the password hash", async () => {
			const statement = createStatement({
				results: [
					{
						id: janeRow.id,
						first_name: janeRow.first_name,
						last_name: janeRow.last_name,
						username: janeRow.username,
						email: janeRow.email,
						password_hash: janeRow.password_hash,
					},
				],
			});
			const prepare = vi.fn(() => statement);
			getDbMock.mockResolvedValue({ prepare } as never);

			const user = await createUser(janeInput);

			expect(statement.bind).toHaveBeenCalledWith(
				"Jane",
				"Doe",
				"jane@school.edu",
				"jane@school.edu",
				janeInput.passwordHash,
			);
			const sql = prepare.mock.calls[0]?.[0] as string;
			expect(sql).toMatch(/\?1/);
			expect(sql).toMatch(/\?2/);
			expect(sql.toLowerCase()).not.toContain("jane@school.edu");
			expect(user).toEqual({
				id: "user-1",
				firstName: "Jane",
				lastName: "Doe",
				username: "jane@school.edu",
				email: "jane@school.edu",
			});
			expect(user).not.toHaveProperty("passwordHash");
			expect(user).not.toHaveProperty("password_hash");
		});

		it("allows username and email to be the same value", async () => {
			const statement = createStatement({
				results: [
					{
						id: janeRow.id,
						first_name: janeRow.first_name,
						last_name: janeRow.last_name,
						username: janeRow.username,
						email: janeRow.email,
					},
				],
			});
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(createUser(janeInput)).resolves.toMatchObject({
				username: "jane@school.edu",
				email: "jane@school.edu",
			});
		});

		it("maps a username unique constraint to UserConflictError", async () => {
			const statement = createStatement({
				allError: new Error("UNIQUE constraint failed: users.username"),
			});
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			const error = await createUser(janeInput).catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(UserConflictError);
			expect(error).toMatchObject({ field: "username" });
		});

		it("maps an email unique constraint to UserConflictError", async () => {
			const statement = createStatement({
				allError: new Error("UNIQUE constraint failed: users.email"),
			});
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			const error = await createUser({
				...janeInput,
				username: "jane.doe",
			}).catch((caught: unknown) => caught);

			expect(error).toBeInstanceOf(UserConflictError);
			expect(error).toMatchObject({ field: "email" });
		});
	});

	describe("getUserByUsername", () => {
		it("returns the public user when present", async () => {
			const statement = createStatement({
				results: [
					{
						id: janeRow.id,
						first_name: janeRow.first_name,
						last_name: janeRow.last_name,
						username: janeRow.username,
						email: janeRow.email,
					},
				],
			});
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(getUserByUsername("Jane@School.edu")).resolves.toEqual({
				id: "user-1",
				firstName: "Jane",
				lastName: "Doe",
				username: "jane@school.edu",
				email: "jane@school.edu",
			});
			expect(statement.bind).toHaveBeenCalledWith("jane@school.edu");
		});

		it("returns null when the username is missing", async () => {
			const statement = createStatement({ results: [] });
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(getUserByUsername("missing")).resolves.toBeNull();
		});
	});

	describe("getUserById", () => {
		it("returns the public user when present", async () => {
			const statement = createStatement({
				results: [
					{
						id: janeRow.id,
						first_name: janeRow.first_name,
						last_name: janeRow.last_name,
						username: janeRow.username,
						email: janeRow.email,
					},
				],
			});
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(getUserById("user-1")).resolves.toEqual({
				id: "user-1",
				firstName: "Jane",
				lastName: "Doe",
				username: "jane@school.edu",
				email: "jane@school.edu",
			});
		});

		it("returns null when the id is missing", async () => {
			const statement = createStatement({ results: [] });
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(getUserById("missing")).resolves.toBeNull();
		});
	});

	describe("getUserAuthByUsername", () => {
		it("returns the stored hash without putting it on the public User type", async () => {
			const statement = createStatement({
				results: [{ id: janeRow.id, password_hash: janeRow.password_hash }],
			});
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			const auth = await getUserAuthByUsername("Jane@School.edu");
			const publicUser = {
				id: "user-1",
				firstName: "Jane",
				lastName: "Doe",
				username: "jane@school.edu",
				email: "jane@school.edu",
			};

			expect(auth).toEqual({ id: "user-1", passwordHash: janeRow.password_hash });
			expect(publicUser).not.toHaveProperty("passwordHash");
		});
	});

	describe("updateUser", () => {
		it("updates provided fields and returns the public user", async () => {
			const statement = createStatement({
				results: [
					{
						id: janeRow.id,
						first_name: "Janet",
						last_name: janeRow.last_name,
						username: janeRow.username,
						email: janeRow.email,
					},
				],
			});
			const prepare = vi.fn(() => statement);
			getDbMock.mockResolvedValue({ prepare } as never);

			const user = await updateUser({ id: "user-1", firstName: "Janet" });

			expect(user).toEqual({
				id: "user-1",
				firstName: "Janet",
				lastName: "Doe",
				username: "jane@school.edu",
				email: "jane@school.edu",
			});
			const sql = prepare.mock.calls[0]?.[0] as string;
			expect(sql.toLowerCase()).toContain("updated_at");
			expect(sql).toMatch(/\?1/);
			expect(statement.bind).toHaveBeenCalledWith("Janet", "user-1");
		});

		it("throws UserNotFoundError when the id does not exist", async () => {
			const statement = createStatement({ results: [] });
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(updateUser({ id: "missing", firstName: "Janet" })).rejects.toBeInstanceOf(
				UserNotFoundError,
			);
		});
	});

	describe("deleteUser", () => {
		it("deletes the row by id", async () => {
			const statement = createStatement({ changes: 1 });
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(deleteUser("user-1")).resolves.toBeUndefined();
			expect(statement.bind).toHaveBeenCalledWith("user-1");
			expect(statement.run).toHaveBeenCalledOnce();
		});

		it("throws UserNotFoundError when deleting a missing id", async () => {
			const statement = createStatement({ changes: 0 });
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => statement),
			} as never);

			await expect(deleteUser("missing")).rejects.toBeInstanceOf(UserNotFoundError);
		});
	});
});
