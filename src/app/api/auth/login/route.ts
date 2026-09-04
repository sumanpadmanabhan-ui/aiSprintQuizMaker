import { getUserAuthByUsername, getUserByUsername } from "@/lib/services/user-service";
import { passwordHashesEqual } from "@/app/api/auth/password-compare";
import {
	INVALID_CREDENTIALS,
	parseLoginBody,
	readJsonBody,
	RequestValidationError,
	toPublicUser,
} from "@/app/api/auth/validation";

export async function POST(request: Request): Promise<Response> {
	try {
		const input = parseLoginBody(await readJsonBody(request));
		const auth = await getUserAuthByUsername(input.username);
		const storedHash = auth?.passwordHash ?? "0".repeat(64);
		const hashesMatch = passwordHashesEqual(storedHash, input.passwordHash);

		if (!auth || !hashesMatch) {
			return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
		}

		const user = await getUserByUsername(input.username);
		if (!user) {
			return Response.json({ error: INVALID_CREDENTIALS }, { status: 401 });
		}

		return Response.json({ user: toPublicUser(user) });
	} catch (error) {
		if (error instanceof RequestValidationError) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		return Response.json({ error: "Internal server error." }, { status: 500 });
	}
}
