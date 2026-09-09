import { getDb } from "@/lib/db";

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 500;
export const QUESTION_MAX = 1000;
export const CHOICES_MIN = 2;
export const CHOICES_MAX = 6;
export const LIST_LIMIT_DEFAULT = 10;
export const LIST_LIMIT_MAX = 50;

export type McqChoiceInput = {
	choiceText: string;
	isCorrect: boolean;
	orderIndex?: number;
};

export type CreateMcqInput = {
	title: string;
	description?: string | null;
	question: string;
	createdBy: string;
	choices: McqChoiceInput[];
};

export type UpdateMcqInput = {
	id: string;
	title: string;
	description?: string | null;
	question: string;
	createdBy?: string;
	choices: McqChoiceInput[];
};

export type ListMcqsQuery = {
	page?: number;
	limit?: number;
	search?: string;
	createdBy?: string;
};

export type McqChoice = {
	id: string;
	choiceText: string;
	isCorrect: boolean;
	orderIndex: number;
};

export type Mcq = {
	id: string;
	title: string;
	description: string | null;
	question: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

export type McqWithChoices = Mcq & {
	choices: McqChoice[];
};

export type ListMcqsResult = {
	mcqs: Mcq[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		pages: number;
	};
};

export type RecordAttemptInput = {
	mcqId: string;
	userId: string;
	selectedChoiceId: string;
};

export type AttemptResult = {
	attemptId: string;
	isCorrect: boolean;
	selectedChoice: { id: string; choiceText: string };
	correctChoice: { id: string; choiceText: string };
};

export class McqValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "McqValidationError";
	}
}

export class McqNotFoundError extends Error {
	constructor() {
		super("MCQ not found.");
		this.name = "McqNotFoundError";
	}
}

type McqRow = {
	id: string;
	title: string;
	description: string | null;
	question: string;
	created_by: string;
	created_at: string;
	updated_at: string;
};

type ChoiceRow = {
	id: string;
	mcq_id: string;
	choice_text: string;
	is_correct: number;
	order_index: number;
};

type NormalizedChoice = {
	choiceText: string;
	isCorrect: boolean;
	orderIndex: number;
};

function requiredText(value: string | null | undefined, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new McqValidationError(`${field} is required.`);
	}
	return value.trim();
}

function optionalDescription(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : trimmed;
}

function assertMaxLength(value: string, field: string, max: number): void {
	if (value.length > max) {
		throw new McqValidationError(`${field} must be at most ${max} characters.`);
	}
}

function normalizeChoices(choices: McqChoiceInput[] | undefined): NormalizedChoice[] {
	if (!Array.isArray(choices)) {
		throw new McqValidationError("choices must be an array.");
	}
	if (choices.length < CHOICES_MIN || choices.length > CHOICES_MAX) {
		throw new McqValidationError(`Provide between ${CHOICES_MIN} and ${CHOICES_MAX} choices.`);
	}

	const normalized = choices.map((choice, index) => {
		const choiceText = requiredText(choice.choiceText, "choiceText");
		return {
			choiceText,
			isCorrect: choice.isCorrect === true,
			orderIndex: choice.orderIndex ?? index,
		};
	});

	const correctCount = normalized.filter((choice) => choice.isCorrect).length;
	if (correctCount !== 1) {
		throw new McqValidationError("Exactly one choice must be marked correct.");
	}

	return normalized;
}

function validateMcqFields(input: {
	title: string;
	description?: string | null;
	question: string;
	choices: McqChoiceInput[];
}): { title: string; description: string | null; question: string; choices: NormalizedChoice[] } {
	const title = requiredText(input.title, "title");
	const question = requiredText(input.question, "question");
	const description = optionalDescription(input.description);
	assertMaxLength(title, "title", TITLE_MAX);
	assertMaxLength(question, "question", QUESTION_MAX);
	if (description) {
		assertMaxLength(description, "description", DESCRIPTION_MAX);
	}

	return {
		title,
		question,
		description,
		choices: normalizeChoices(input.choices),
	};
}

function toMcq(row: McqRow): Mcq {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		question: row.question,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toChoice(row: ChoiceRow): McqChoice {
	return {
		id: row.id,
		choiceText: row.choice_text,
		isCorrect: row.is_correct === 1,
		orderIndex: row.order_index,
	};
}

function sortChoices(choices: McqChoice[]): McqChoice[] {
	return [...choices].sort((a, b) => a.orderIndex - b.orderIndex);
}

async function insertChoices(db: D1Database, mcqId: string, choices: NormalizedChoice[]): Promise<McqChoice[]> {
	const inserted: McqChoice[] = [];

	for (const choice of choices) {
		const { results } = await db
			.prepare(
				`INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, order_index)
				 VALUES (?1, ?2, ?3, ?4)
				 RETURNING id, mcq_id, choice_text, is_correct, order_index`,
			)
			.bind(mcqId, choice.choiceText, choice.isCorrect ? 1 : 0, choice.orderIndex)
			.all<ChoiceRow>();

		const row = results[0];
		if (!row) {
			throw new Error("Insert did not return a choice.");
		}
		inserted.push(toChoice(row));
	}

	return sortChoices(inserted);
}

async function loadChoices(db: D1Database, mcqId: string): Promise<McqChoice[]> {
	const { results } = await db
		.prepare(
			`SELECT id, mcq_id, choice_text, is_correct, order_index
			 FROM mcq_choices
			 WHERE mcq_id = ?1
			 ORDER BY order_index ASC`,
		)
		.bind(mcqId)
		.all<ChoiceRow>();

	return sortChoices(results.map(toChoice));
}

export async function createMcq(input: CreateMcqInput): Promise<McqWithChoices> {
	const createdBy = requiredText(input.createdBy, "createdBy");
	const fields = validateMcqFields(input);
	const db = await getDb();

	const { results } = await db
		.prepare(
			`INSERT INTO mcqs (title, description, question, created_by)
			 VALUES (?1, ?2, ?3, ?4)
			 RETURNING id, title, description, question, created_by, created_at, updated_at`,
		)
		.bind(fields.title, fields.description, fields.question, createdBy)
		.all<McqRow>();

	const row = results[0];
	if (!row) {
		throw new Error("Insert did not return an MCQ.");
	}

	const choices = await insertChoices(db, row.id, fields.choices);
	return { ...toMcq(row), choices };
}

export async function getMcqById(id: string): Promise<McqWithChoices | null> {
	const db = await getDb();
	const { results } = await db
		.prepare(
			`SELECT id, title, description, question, created_by, created_at, updated_at
			 FROM mcqs
			 WHERE id = ?1`,
		)
		.bind(id)
		.all<McqRow>();

	const row = results[0];
	if (!row) {
		return null;
	}

	const choices = await loadChoices(db, row.id);
	return { ...toMcq(row), choices };
}

export async function listMcqs(query: ListMcqsQuery = {}): Promise<ListMcqsResult> {
	const page = query.page ?? 1;
	const limit = query.limit ?? LIST_LIMIT_DEFAULT;

	if (!Number.isInteger(page) || page < 1) {
		throw new McqValidationError("page must be a positive integer.");
	}
	if (!Number.isInteger(limit) || limit < 1 || limit > LIST_LIMIT_MAX) {
		throw new McqValidationError(`limit must be between 1 and ${LIST_LIMIT_MAX}.`);
	}

	const search = query.search?.trim() ?? "";
	const createdBy = query.createdBy?.trim() ?? "";
	const where: string[] = [];
	const values: unknown[] = [];
	let placeholder = 1;

	if (search) {
		where.push(
			`(title LIKE ?${placeholder} OR description LIKE ?${placeholder} OR question LIKE ?${placeholder})`,
		);
		values.push(`%${search}%`);
		placeholder += 1;
	}
	if (createdBy) {
		where.push(`created_by = ?${placeholder}`);
		values.push(createdBy);
		placeholder += 1;
	}

	const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
	const db = await getDb();

	const { results: countRows } = await db
		.prepare(`SELECT COUNT(*) AS total FROM mcqs ${whereSql}`)
		.bind(...values)
		.all<{ total: number | string }>();

	const total = Number(countRows[0]?.total ?? 0);
	const offset = (page - 1) * limit;

	const { results } = await db
		.prepare(
			`SELECT id, title, description, question, created_by, created_at, updated_at
			 FROM mcqs
			 ${whereSql}
			 ORDER BY created_at DESC
			 LIMIT ?${placeholder} OFFSET ?${placeholder + 1}`,
		)
		.bind(...values, limit, offset)
		.all<McqRow>();

	return {
		mcqs: results.map(toMcq),
		pagination: {
			page,
			limit,
			total,
			pages: total === 0 ? 0 : Math.ceil(total / limit),
		},
	};
}

export async function updateMcq(input: UpdateMcqInput): Promise<McqWithChoices> {
	const fields = validateMcqFields(input);
	const db = await getDb();

	const { results: existing } = await db
		.prepare(
			`SELECT id, title, description, question, created_by, created_at, updated_at
			 FROM mcqs
			 WHERE id = ?1`,
		)
		.bind(input.id)
		.all<McqRow>();

	if (!existing[0]) {
		throw new McqNotFoundError();
	}

	const { results } = await db
		.prepare(
			`UPDATE mcqs
			 SET title = ?1, description = ?2, question = ?3, updated_at = datetime('now')
			 WHERE id = ?4
			 RETURNING id, title, description, question, created_by, created_at, updated_at`,
		)
		.bind(fields.title, fields.description, fields.question, input.id)
		.all<McqRow>();

	const row = results[0];
	if (!row) {
		throw new McqNotFoundError();
	}

	await db.prepare(`DELETE FROM mcq_choices WHERE mcq_id = ?1`).bind(input.id).run();
	const choices = await insertChoices(db, input.id, fields.choices);
	return { ...toMcq(row), choices };
}

export async function deleteMcq(id: string): Promise<void> {
	const db = await getDb();
	const result = await db.prepare(`DELETE FROM mcqs WHERE id = ?1`).bind(id).run();
	const changes = result.meta.changes ?? 0;

	if (changes === 0) {
		throw new McqNotFoundError();
	}
}

export async function recordAttempt(input: RecordAttemptInput): Promise<AttemptResult> {
	const userId = requiredText(input.userId, "userId");
	const selectedChoiceId = requiredText(input.selectedChoiceId, "selectedChoiceId");
	const mcqId = requiredText(input.mcqId, "mcqId");

	const mcq = await getMcqById(mcqId);
	if (!mcq) {
		throw new McqNotFoundError();
	}

	const selectedChoice = mcq.choices.find((choice) => choice.id === selectedChoiceId);
	if (!selectedChoice) {
		throw new McqValidationError("selectedChoiceId must belong to the MCQ.");
	}

	const correctChoice = mcq.choices.find((choice) => choice.isCorrect);
	if (!correctChoice) {
		throw new McqValidationError("MCQ does not have a correct choice.");
	}

	const isCorrect = selectedChoice.isCorrect ? 1 : 0;
	const db = await getDb();
	const { results } = await db
		.prepare(
			`INSERT INTO mcq_attempts (mcq_id, user_id, selected_choice_id, is_correct)
			 VALUES (?1, ?2, ?3, ?4)
			 RETURNING id`,
		)
		.bind(mcqId, userId, selectedChoiceId, isCorrect)
		.all<{ id: string }>();

	const row = results[0];
	if (!row) {
		throw new Error("Insert did not return an attempt.");
	}

	return {
		attemptId: row.id,
		isCorrect: isCorrect === 1,
		selectedChoice: { id: selectedChoice.id, choiceText: selectedChoice.choiceText },
		correctChoice: { id: correctChoice.id, choiceText: correctChoice.choiceText },
	};
}
