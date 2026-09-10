import {
	CHOICES_MAX,
	CHOICES_MIN,
	DESCRIPTION_MAX,
	LIST_LIMIT_DEFAULT,
	LIST_LIMIT_MAX,
	McqNotFoundError,
	McqValidationError,
	QUESTION_MAX,
	TITLE_MAX,
	type CreateMcqInput,
	type ListMcqsQuery,
	type McqChoiceInput,
	type RecordAttemptInput,
} from "@/lib/services/mcq-service";

export class RequestValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RequestValidationError";
	}
}

export type McqRouteContext = {
	params: Promise<{ id: string }>;
};

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

function optionalDescription(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== "string") {
		throw new RequestValidationError("description must be a string.");
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function parsePositiveInt(value: string | null, field: string, fallback: number, max?: number): number {
	if (value === null || value === "") {
		return fallback;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || (max !== undefined && parsed > max)) {
		throw new RequestValidationError(
			max === undefined
				? `${field} must be a positive integer.`
				: `${field} must be between 1 and ${max}.`,
		);
	}
	return parsed;
}

function parseChoices(value: unknown): McqChoiceInput[] {
	if (!Array.isArray(value)) {
		throw new RequestValidationError("choices must be an array.");
	}
	if (value.length < CHOICES_MIN || value.length > CHOICES_MAX) {
		throw new RequestValidationError(`Provide between ${CHOICES_MIN} and ${CHOICES_MAX} choices.`);
	}

	const choices = value.map((item, index) => {
		if (!isPlainObject(item)) {
			throw new RequestValidationError("Each choice must be an object.");
		}
		const choiceText = requiredString(item.choiceText, "choiceText");
		if (typeof item.isCorrect !== "boolean") {
			throw new RequestValidationError("isCorrect must be a boolean.");
		}
		const rawOrderIndex = item.orderIndex;
		if (
			rawOrderIndex !== undefined &&
			rawOrderIndex !== null &&
			(typeof rawOrderIndex !== "number" || !Number.isInteger(rawOrderIndex) || rawOrderIndex < 0)
		) {
			throw new RequestValidationError("orderIndex must be a non-negative integer.");
		}
		return {
			choiceText,
			isCorrect: item.isCorrect,
			orderIndex: typeof rawOrderIndex === "number" ? rawOrderIndex : index,
		};
	});

	const correctCount = choices.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		throw new RequestValidationError("Exactly one choice must be marked correct.");
	}

	return choices;
}

function assertMaxLength(value: string, field: string, max: number): void {
	if (value.length > max) {
		throw new RequestValidationError(`${field} must be at most ${max} characters.`);
	}
}

export function parseListQuery(url: URL): ListMcqsQuery {
	const page = parsePositiveInt(url.searchParams.get("page"), "page", 1);
	const limit = parsePositiveInt(
		url.searchParams.get("limit"),
		"limit",
		LIST_LIMIT_DEFAULT,
		LIST_LIMIT_MAX,
	);
	const search = url.searchParams.get("search")?.trim() || undefined;
	const createdBy = url.searchParams.get("createdBy")?.trim() || undefined;

	return { page, limit, search, createdBy };
}

export function parseMcqBody(body: unknown): CreateMcqInput {
	if (!isPlainObject(body)) {
		throw new RequestValidationError("Request body must be a JSON object.");
	}

	const title = requiredString(body.title, "title");
	const question = requiredString(body.question, "question");
	const description = optionalDescription(body.description);
	const createdBy = requiredString(body.createdBy, "createdBy");
	const choices = parseChoices(body.choices);

	assertMaxLength(title, "title", TITLE_MAX);
	assertMaxLength(question, "question", QUESTION_MAX);
	if (description) {
		assertMaxLength(description, "description", DESCRIPTION_MAX);
	}

	return { title, description, question, createdBy, choices };
}

export function parseAttemptBody(body: unknown): Omit<RecordAttemptInput, "mcqId"> {
	if (!isPlainObject(body)) {
		throw new RequestValidationError("Request body must be a JSON object.");
	}

	return {
		userId: requiredString(body.userId, "userId"),
		selectedChoiceId: requiredString(body.selectedChoiceId, "selectedChoiceId"),
	};
}

export async function readRouteId(context: McqRouteContext): Promise<string> {
	const { id } = await context.params;
	return requiredString(id, "id");
}

export function mcqErrorResponse(error: unknown): Response {
	if (error instanceof RequestValidationError || error instanceof McqValidationError) {
		return Response.json({ error: error.message }, { status: 400 });
	}
	if (error instanceof McqNotFoundError) {
		return Response.json({ error: error.message }, { status: 404 });
	}
	return Response.json({ error: "Internal server error." }, { status: 500 });
}
