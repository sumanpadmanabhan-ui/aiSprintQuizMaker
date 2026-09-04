import { getDb } from "@/lib/db";

export type User = {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
};

export type UserAuth = {
	id: string;
	passwordHash: string;
};

export type CreateUserInput = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type UpdateUserInput = {
	id: string;
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
	passwordHash?: string;
};

export class UserConflictError extends Error {
	readonly field: "username" | "email" | "unknown";

	constructor(field: "username" | "email" | "unknown") {
		const message =
			field === "unknown"
				? "Username or email already in use."
				: `${field === "username" ? "Username" : "Email"} already in use.`;
		super(message);
		this.name = "UserConflictError";
		this.field = field;
	}
}

export class UserNotFoundError extends Error {
	constructor() {
		super("User not found.");
		this.name = "UserNotFoundError";
	}
}

type UserRow = {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
};

type UserAuthRow = {
	id: string;
	password_hash: string;
};

function toUser(row: UserRow): User {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
	};
}

function normalizeUsername(username: string): string {
	return username.trim().toLowerCase();
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function asConflictError(error: unknown): UserConflictError | null {
	const message = error instanceof Error ? error.message : String(error);
	if (!/unique constraint/i.test(message)) {
		return null;
	}
	if (/users\.username/i.test(message)) {
		return new UserConflictError("username");
	}
	if (/users\.email/i.test(message)) {
		return new UserConflictError("email");
	}
	return new UserConflictError("unknown");
}

export async function createUser(input: CreateUserInput): Promise<User> {
	const db = await getDb();
	const firstName = input.firstName.trim();
	const lastName = input.lastName.trim();
	const username = normalizeUsername(input.username);
	const email = normalizeEmail(input.email);

	try {
		const { results } = await db
			.prepare(
				`INSERT INTO users (first_name, last_name, username, email, password_hash)
				 VALUES (?1, ?2, ?3, ?4, ?5)
				 RETURNING id, first_name, last_name, username, email`,
			)
			.bind(firstName, lastName, username, email, input.passwordHash)
			.all<UserRow>();

		const row = results[0];
		if (!row) {
			throw new Error("Insert did not return a user.");
		}
		return toUser(row);
	} catch (error) {
		throw asConflictError(error) ?? error;
	}
}

export async function getUserByUsername(username: string): Promise<User | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email
			 FROM users
			 WHERE username = ?1`,
		)
		.bind(normalizeUsername(username))
		.all<UserRow>();

	const row = results[0];
	return row ? toUser(row) : null;
}

export async function getUserById(id: string): Promise<User | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, first_name, last_name, username, email
			 FROM users
			 WHERE id = ?1`,
		)
		.bind(id)
		.all<UserRow>();

	const row = results[0];
	return row ? toUser(row) : null;
}

export async function getUserAuthByUsername(username: string): Promise<UserAuth | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, password_hash
			 FROM users
			 WHERE username = ?1`,
		)
		.bind(normalizeUsername(username))
		.all<UserAuthRow>();

	const row = results[0];
	if (!row) {
		return null;
	}

	return { id: row.id, passwordHash: row.password_hash };
}

export async function updateUser(input: UpdateUserInput): Promise<User> {
	const db = await getDb();
	const assignments: string[] = [];
	const values: unknown[] = [];
	let placeholder = 1;

	if (input.firstName !== undefined) {
		assignments.push(`first_name = ?${placeholder}`);
		values.push(input.firstName.trim());
		placeholder += 1;
	}
	if (input.lastName !== undefined) {
		assignments.push(`last_name = ?${placeholder}`);
		values.push(input.lastName.trim());
		placeholder += 1;
	}
	if (input.username !== undefined) {
		assignments.push(`username = ?${placeholder}`);
		values.push(normalizeUsername(input.username));
		placeholder += 1;
	}
	if (input.email !== undefined) {
		assignments.push(`email = ?${placeholder}`);
		values.push(normalizeEmail(input.email));
		placeholder += 1;
	}
	if (input.passwordHash !== undefined) {
		assignments.push(`password_hash = ?${placeholder}`);
		values.push(input.passwordHash);
		placeholder += 1;
	}

	assignments.push("updated_at = datetime('now')");
	values.push(input.id);

	try {
		const { results } = await db
			.prepare(
				`UPDATE users
				 SET ${assignments.join(", ")}
				 WHERE id = ?${placeholder}
				 RETURNING id, first_name, last_name, username, email`,
			)
			.bind(...values)
			.all<UserRow>();

		const row = results[0];
		if (!row) {
			throw new UserNotFoundError();
		}
		return toUser(row);
	} catch (error) {
		if (error instanceof UserNotFoundError) {
			throw error;
		}
		throw asConflictError(error) ?? error;
	}
}

export async function deleteUser(id: string): Promise<void> {
	const db = await getDb();
	const result = await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run();
	const changes = result.meta.changes ?? 0;

	if (changes === 0) {
		throw new UserNotFoundError();
	}
}
