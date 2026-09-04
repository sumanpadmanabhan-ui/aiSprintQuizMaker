import { createUser, UserConflictError } from "@/lib/services/user-service";
import {
	parseRegisterBody,
	readJsonBody,
	RequestValidationError,
	toPublicUser,
} from "@/app/api/auth/validation";

export async function POST(request: Request): Promise<Response> {
	try {
		const input = parseRegisterBody(await readJsonBody(request));
		const user = await createUser(input);
		return Response.json({ user: toPublicUser(user) }, { status: 201 });
	} catch (error) {
		if (error instanceof RequestValidationError) {
			return Response.json({ error: error.message }, { status: 400 });
		}
		if (error instanceof UserConflictError) {
			return Response.json({ error: error.message }, { status: 409 });
		}
		return Response.json({ error: "Internal server error." }, { status: 500 });
	}
}
