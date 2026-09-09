import { getDb } from "@/lib/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	McqNotFoundError,
	McqValidationError,
	createMcq,
	deleteMcq,
	getMcqById,
	listMcqs,
	recordAttempt,
	updateMcq,
} from "@/lib/services/mcq-service";

vi.mock("@/lib/db", () => ({
	getDb: vi.fn(),
}));

const getDbMock = vi.mocked(getDb);

const validInput = {
	title: " Photosynthesis ",
	description: " Grade 7 life science ",
	question: " What do plants use to make food? ",
	createdBy: " user-1 ",
	choices: [
		{ choiceText: " Sunlight ", isCorrect: true, orderIndex: 0 },
		{ choiceText: " Moonlight ", isCorrect: false, orderIndex: 1 },
	],
};

const mcqRow = {
	id: "mcq-1",
	title: "Photosynthesis",
	description: "Grade 7 life science",
	question: "What do plants use to make food?",
	created_by: "user-1",
	created_at: "2026-09-09 10:00:00",
	updated_at: "2026-09-09 10:00:00",
};

const sunlightRow = {
	id: "choice-1",
	mcq_id: "mcq-1",
	choice_text: "Sunlight",
	is_correct: 1,
	order_index: 0,
};

const moonlightRow = {
	id: "choice-2",
	mcq_id: "mcq-1",
	choice_text: "Moonlight",
	is_correct: 0,
	order_index: 1,
};

function createStatement(options?: {
	results?: Record<string, unknown>[];
	changes?: number;
	runError?: Error;
	allError?: Error;
}) {
	const statement = {
		bind: vi.fn(() => statement),
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

function sqlOf(prepare: ReturnType<typeof vi.fn>, index = 0): string {
	return String(prepare.mock.calls[index]?.[0] ?? "");
}

describe("mcq service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("createMcq", () => {
		it("trims fields, binds numbered placeholders, and stores is_correct as 0 or 1", async () => {
			const mcqInsert = createStatement({ results: [mcqRow] });
			const sunlightInsert = createStatement({ results: [sunlightRow] });
			const moonlightInsert = createStatement({ results: [moonlightRow] });
			let choiceInserts = 0;
			const prepare = vi.fn((sql: string) => {
				if (/insert into mcqs/i.test(sql)) {
					return mcqInsert;
				}
				if (/insert into mcq_choices/i.test(sql)) {
					choiceInserts += 1;
					return choiceInserts === 1 ? sunlightInsert : moonlightInsert;
				}
				throw new Error(`Unexpected SQL: ${sql}`);
			});
			getDbMock.mockResolvedValue({ prepare } as never);

			const mcq = await createMcq(validInput);

			expect(sqlOf(prepare, 0)).toMatch(/\?1/);
			expect(sqlOf(prepare, 0)).toMatch(/\?2/);
			expect(sqlOf(prepare, 0)).not.toMatch(/\?[^0-9]/);
			expect(mcqInsert.bind).toHaveBeenCalledWith(
				"Photosynthesis",
				"Grade 7 life science",
				"What do plants use to make food?",
				"user-1",
			);
			expect(sunlightInsert.bind).toHaveBeenCalledWith("mcq-1", "Sunlight", 1, 0);
			expect(moonlightInsert.bind).toHaveBeenCalledWith("mcq-1", "Moonlight", 0, 1);
			expect(mcq).toEqual({
				id: "mcq-1",
				title: "Photosynthesis",
				description: "Grade 7 life science",
				question: "What do plants use to make food?",
				createdBy: "user-1",
				createdAt: mcqRow.created_at,
				updatedAt: mcqRow.updated_at,
				choices: [
					{ id: "choice-1", choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
					{ id: "choice-2", choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
				],
			});
		});

		it("stores a blank description as null", async () => {
			const mcqInsert = createStatement({
				results: [{ ...mcqRow, description: null }],
			});
			const sunlightInsert = createStatement({ results: [sunlightRow] });
			const moonlightInsert = createStatement({ results: [moonlightRow] });
			let choiceInserts = 0;
			getDbMock.mockResolvedValue({
				prepare: vi.fn((sql: string) => {
					if (/insert into mcqs/i.test(sql)) {
						return mcqInsert;
					}
					if (/insert into mcq_choices/i.test(sql)) {
						choiceInserts += 1;
						return choiceInserts === 1 ? sunlightInsert : moonlightInsert;
					}
					throw new Error(`Unexpected SQL: ${sql}`);
				}),
			} as never);

			await createMcq({ ...validInput, description: "   " });

			expect(mcqInsert.bind).toHaveBeenCalledWith(
				"Photosynthesis",
				null,
				"What do plants use to make food?",
				"user-1",
			);
		});

		it("rejects a missing title or question", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(createMcq({ ...validInput, title: "  " })).rejects.toBeInstanceOf(
				McqValidationError,
			);
			await expect(createMcq({ ...validInput, question: "" })).rejects.toBeInstanceOf(
				McqValidationError,
			);
			expect(getDbMock).not.toHaveBeenCalled();
		});

		it("rejects titles, descriptions, and questions that exceed character limits", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(createMcq({ ...validInput, title: "t".repeat(201) })).rejects.toMatchObject({
				name: "McqValidationError",
				message: expect.stringMatching(/title/i),
			});
			await expect(
				createMcq({ ...validInput, description: "d".repeat(501) }),
			).rejects.toMatchObject({
				name: "McqValidationError",
				message: expect.stringMatching(/description/i),
			});
			await expect(createMcq({ ...validInput, question: "q".repeat(1001) })).rejects.toMatchObject({
				name: "McqValidationError",
				message: expect.stringMatching(/question/i),
			});
		});

		it("rejects fewer than 2 or more than 6 choices", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(
				createMcq({
					...validInput,
					choices: [{ choiceText: "Only one", isCorrect: true, orderIndex: 0 }],
				}),
			).rejects.toBeInstanceOf(McqValidationError);
			await expect(
				createMcq({
					...validInput,
					choices: Array.from({ length: 7 }, (_, orderIndex) => ({
						choiceText: `Choice ${orderIndex}`,
						isCorrect: orderIndex === 0,
						orderIndex,
					})),
				}),
			).rejects.toBeInstanceOf(McqValidationError);
		});

		it("rejects empty choice text and not-exactly-one correct choice", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(
				createMcq({
					...validInput,
					choices: [
						{ choiceText: "  ", isCorrect: true, orderIndex: 0 },
						{ choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
					],
				}),
			).rejects.toBeInstanceOf(McqValidationError);
			await expect(
				createMcq({
					...validInput,
					choices: [
						{ choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
						{ choiceText: "Moonlight", isCorrect: true, orderIndex: 1 },
					],
				}),
			).rejects.toBeInstanceOf(McqValidationError);
			await expect(
				createMcq({
					...validInput,
					choices: [
						{ choiceText: "Sunlight", isCorrect: false, orderIndex: 0 },
						{ choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
					],
				}),
			).rejects.toBeInstanceOf(McqValidationError);
		});

		it("rejects a missing createdBy", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(createMcq({ ...validInput, createdBy: "  " })).rejects.toBeInstanceOf(
				McqValidationError,
			);
		});
	});

	describe("getMcqById", () => {
		it("returns the MCQ with choices ordered by order_index", async () => {
			const mcqSelect = createStatement({ results: [mcqRow] });
			const choiceSelect = createStatement({
				results: [moonlightRow, sunlightRow],
			});
			const prepare = vi.fn((sql: string) => {
				if (/from mcq_choices/i.test(sql)) {
					return choiceSelect;
				}
				if (/from mcqs/i.test(sql)) {
					return mcqSelect;
				}
				throw new Error(`Unexpected SQL: ${sql}`);
			});
			getDbMock.mockResolvedValue({ prepare } as never);

			const mcq = await getMcqById("mcq-1");

			expect(mcqSelect.bind).toHaveBeenCalledWith("mcq-1");
			const choiceSql = prepare.mock.calls
				.map((call) => String(call[0]))
				.find((sql) => /mcq_choices/i.test(sql));
			expect(choiceSql?.toLowerCase()).toContain("order by order_index");
			expect(mcq?.choices.map((choice) => choice.orderIndex)).toEqual([0, 1]);
			expect(mcq?.choices[0]?.isCorrect).toBe(true);
			expect(mcq?.choices[1]?.isCorrect).toBe(false);
		});

		it("returns null when the MCQ does not exist", async () => {
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => createStatement({ results: [] })),
			} as never);

			await expect(getMcqById("missing")).resolves.toBeNull();
		});
	});

	describe("listMcqs", () => {
		it("returns paginated rows without choices and binds search as a parameter", async () => {
			const countSelect = createStatement({ results: [{ total: 25 }] });
			const listSelect = createStatement({
				results: [{ ...mcqRow }, { ...mcqRow, id: "mcq-2", title: "Respiration" }],
			});
			const prepare = vi.fn((sql: string) => {
				if (/count\s*\(/i.test(sql)) {
					return countSelect;
				}
				return listSelect;
			});
			getDbMock.mockResolvedValue({ prepare } as never);

			const result = await listMcqs({ page: 2, limit: 10, search: "plant" });

			expect(countSelect.bind).toHaveBeenCalledWith("%plant%");
			expect(listSelect.bind).toHaveBeenCalledWith("%plant%", 10, 10);
			expect(sqlOf(prepare, 1)).toMatch(/\?1/);
			expect(sqlOf(prepare, 1).toLowerCase()).not.toContain("%plant%");
			expect(result.mcqs).toHaveLength(2);
			expect(result.mcqs[0]).not.toHaveProperty("choices");
			expect(result.pagination).toEqual({ page: 2, limit: 10, total: 25, pages: 3 });
		});

		it("filters by createdBy when provided", async () => {
			const countSelect = createStatement({ results: [{ total: 1 }] });
			const listSelect = createStatement({ results: [mcqRow] });
			getDbMock.mockResolvedValue({
				prepare: vi.fn((sql: string) => (/count\s*\(/i.test(sql) ? countSelect : listSelect)),
			} as never);

			await listMcqs({ createdBy: "user-1" });

			expect(countSelect.bind).toHaveBeenCalledWith("user-1");
			expect(listSelect.bind.mock.calls[0]?.slice(0, 1)).toEqual(["user-1"]);
		});

		it("rejects invalid page or limit", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(listMcqs({ page: 0 })).rejects.toBeInstanceOf(McqValidationError);
			await expect(listMcqs({ limit: 51 })).rejects.toBeInstanceOf(McqValidationError);
			expect(getDbMock).not.toHaveBeenCalled();
		});
	});

	describe("updateMcq", () => {
		it("updates fields, preserves created_by, and replaces choices as a set", async () => {
			const mcqSelect = createStatement({ results: [mcqRow] });
			const mcqUpdate = createStatement({
				results: [{ ...mcqRow, title: "Plant energy", updated_at: "2026-09-09 11:00:00" }],
			});
			const choiceDelete = createStatement({ changes: 2 });
			const sunlightInsert = createStatement({
				results: [{ ...sunlightRow, choice_text: "The sun", is_correct: 1 }],
			});
			const moonlightInsert = createStatement({
				results: [{ ...moonlightRow, choice_text: "Soil", is_correct: 0 }],
			});
			let choiceInserts = 0;
			const prepare = vi.fn((sql: string) => {
				if (/^update mcqs/i.test(sql.trim())) {
					return mcqUpdate;
				}
				if (/delete from mcq_choices/i.test(sql)) {
					return choiceDelete;
				}
				if (/insert into mcq_choices/i.test(sql)) {
					choiceInserts += 1;
					return choiceInserts === 1 ? sunlightInsert : moonlightInsert;
				}
				if (/from mcqs/i.test(sql)) {
					return mcqSelect;
				}
				throw new Error(`Unexpected SQL: ${sql}`);
			});
			getDbMock.mockResolvedValue({ prepare } as never);

			const mcq = await updateMcq({
				id: "mcq-1",
				title: "Plant energy",
				description: "Grade 7 life science",
				question: "What do plants use to make food?",
				createdBy: "someone-else",
				choices: [
					{ choiceText: "The sun", isCorrect: true, orderIndex: 0 },
					{ choiceText: "Soil", isCorrect: false, orderIndex: 1 },
				],
			});

			const updateSql = prepare.mock.calls
				.map((call) => String(call[0]))
				.find((sql) => /^update mcqs/i.test(sql.trim()));
			const setClause = updateSql?.toLowerCase().split("where")[0] ?? "";
			expect(setClause).not.toContain("created_by");
			expect(mcqUpdate.bind).toHaveBeenCalledWith(
				"Plant energy",
				"Grade 7 life science",
				"What do plants use to make food?",
				"mcq-1",
			);
			expect(choiceDelete.bind).toHaveBeenCalledWith("mcq-1");
			expect(mcq.createdBy).toBe("user-1");
			expect(mcq.choices).toHaveLength(2);
		});

		it("throws McqNotFoundError when the id does not exist", async () => {
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => createStatement({ results: [] })),
			} as never);

			await expect(
				updateMcq({
					id: "missing",
					title: "Plant energy",
					question: "What do plants use to make food?",
					choices: validInput.choices,
				}),
			).rejects.toBeInstanceOf(McqNotFoundError);
		});
	});

	describe("deleteMcq", () => {
		it("deletes the MCQ by id and relies on cascade for choices and attempts", async () => {
			const statement = createStatement({ changes: 1 });
			const prepare = vi.fn(() => statement);
			getDbMock.mockResolvedValue({ prepare } as never);

			await expect(deleteMcq("mcq-1")).resolves.toBeUndefined();
			expect(statement.bind).toHaveBeenCalledWith("mcq-1");
			expect(sqlOf(prepare).toLowerCase()).toContain("delete from mcqs");
			expect(sqlOf(prepare).toLowerCase()).not.toContain("delete from mcq_choices");
			expect(sqlOf(prepare).toLowerCase()).not.toContain("delete from mcq_attempts");
		});

		it("throws McqNotFoundError when deleting a missing id", async () => {
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => createStatement({ changes: 0 })),
			} as never);

			await expect(deleteMcq("missing")).rejects.toBeInstanceOf(McqNotFoundError);
		});
	});

	describe("recordAttempt", () => {
		it("records 1 when the selected choice is correct and returns both choices", async () => {
			const mcqSelect = createStatement({ results: [mcqRow] });
			const choiceSelect = createStatement({ results: [sunlightRow, moonlightRow] });
			const attemptInsert = createStatement({ results: [{ id: "attempt-1" }] });
			const prepare = vi.fn((sql: string) => {
				if (/insert into mcq_attempts/i.test(sql)) {
					return attemptInsert;
				}
				if (/from mcq_choices/i.test(sql)) {
					return choiceSelect;
				}
				if (/from mcqs/i.test(sql)) {
					return mcqSelect;
				}
				throw new Error(`Unexpected SQL: ${sql}`);
			});
			getDbMock.mockResolvedValue({ prepare } as never);

			const result = await recordAttempt({
				mcqId: "mcq-1",
				userId: "user-2",
				selectedChoiceId: "choice-1",
			});

			expect(attemptInsert.bind).toHaveBeenCalledWith("mcq-1", "user-2", "choice-1", 1);
			expect(result).toEqual({
				attemptId: "attempt-1",
				isCorrect: true,
				selectedChoice: { id: "choice-1", choiceText: "Sunlight" },
				correctChoice: { id: "choice-1", choiceText: "Sunlight" },
			});
		});

		it("records 0 when the selected choice is incorrect", async () => {
			const mcqSelect = createStatement({ results: [mcqRow] });
			const choiceSelect = createStatement({ results: [sunlightRow, moonlightRow] });
			const attemptInsert = createStatement({ results: [{ id: "attempt-2" }] });
			getDbMock.mockResolvedValue({
				prepare: vi.fn((sql: string) => {
					if (/insert into mcq_attempts/i.test(sql)) {
						return attemptInsert;
					}
					if (/from mcq_choices/i.test(sql)) {
						return choiceSelect;
					}
					return mcqSelect;
				}),
			} as never);

			const result = await recordAttempt({
				mcqId: "mcq-1",
				userId: "user-2",
				selectedChoiceId: "choice-2",
			});

			expect(attemptInsert.bind).toHaveBeenCalledWith("mcq-1", "user-2", "choice-2", 0);
			expect(result.isCorrect).toBe(false);
			expect(result.correctChoice).toEqual({ id: "choice-1", choiceText: "Sunlight" });
		});

		it("throws McqNotFoundError when the MCQ is missing", async () => {
			getDbMock.mockResolvedValue({
				prepare: vi.fn(() => createStatement({ results: [] })),
			} as never);

			await expect(
				recordAttempt({
					mcqId: "missing",
					userId: "user-2",
					selectedChoiceId: "choice-1",
				}),
			).rejects.toBeInstanceOf(McqNotFoundError);
		});

		it("rejects a selected choice that does not belong to the MCQ", async () => {
			getDbMock.mockResolvedValue({
				prepare: vi.fn((sql: string) => {
					if (/from mcq_choices/i.test(sql)) {
						return createStatement({ results: [sunlightRow, moonlightRow] });
					}
					return createStatement({ results: [mcqRow] });
				}),
			} as never);

			await expect(
				recordAttempt({
					mcqId: "mcq-1",
					userId: "user-2",
					selectedChoiceId: "choice-other",
				}),
			).rejects.toBeInstanceOf(McqValidationError);
		});

		it("rejects a missing userId", async () => {
			getDbMock.mockResolvedValue({ prepare: vi.fn() } as never);

			await expect(
				recordAttempt({
					mcqId: "mcq-1",
					userId: "  ",
					selectedChoiceId: "choice-1",
				}),
			).rejects.toBeInstanceOf(McqValidationError);
		});
	});
});
