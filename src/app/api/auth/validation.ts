import type { User } from "@/lib/services/user-service";

export class RequestValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RequestValidationError";
	}
}

const HEX_64 = /^[a-f0-9]{64}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readJsonBody(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		throw new RequestValidationError("Request body must be valid JSON.");
	}
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new RequestValidationError(`${field} is required.`);
	}
	return value.trim();
}

function requiredPasswordHash(body: Record<string, unknown>): string {
	if ("password" in body) {
		throw new RequestValidationError("Send passwordHash, not password.");
	}

	const passwordHash = requiredString(body.passwordHash, "passwordHash");
	if (!HEX_64.test(passwordHash)) {
		throw new RequestValidationError("passwordHash must be a 64-character hex string.");
	}
	return passwordHash;
}

export type RegisterBody = {
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
};

export type LoginBody = {
	username: string;
	passwordHash: string;
};

export function parseRegisterBody(body: unknown): RegisterBody {
	if (!isPlainObject(body)) {
		throw new RequestValidationError("Request body must be a JSON object.");
	}

	const email = requiredString(body.email, "email");
	if (!EMAIL.test(email)) {
		throw new RequestValidationError("email must be a valid email address.");
	}

	return {
		firstName: requiredString(body.firstName, "firstName"),
		lastName: requiredString(body.lastName, "lastName"),
		username: requiredString(body.username, "username"),
		email,
		passwordHash: requiredPasswordHash(body),
	};
}

export function parseLoginBody(body: unknown): LoginBody {
	if (!isPlainObject(body)) {
		throw new RequestValidationError("Request body must be a JSON object.");
	}

	return {
		username: requiredString(body.username, "username"),
		passwordHash: requiredPasswordHash(body),
	};
}

export function toPublicUser(user: User): User {
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		username: user.username,
		email: user.email,
	};
}

export const INVALID_CREDENTIALS = "Invalid username or password.";
