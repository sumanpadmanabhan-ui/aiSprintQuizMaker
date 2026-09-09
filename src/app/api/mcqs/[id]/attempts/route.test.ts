import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqNotFoundError, McqValidationError, recordAttempt } from "@/lib/services/mcq-service";
import { POST } from "./route";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		recordAttempt: vi.fn(),
	};
});

const recordAttemptMock = vi.mocked(recordAttempt);

const context = { params: Promise.resolve({ id: "mcq-1" }) };

function postAttempt(body: unknown) {
	return POST(
		new Request("http://localhost/api/mcqs/mcq-1/attempts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
		context,
	);
}

describe("POST /api/mcqs/[id]/attempts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with server-computed correctness", async () => {
		recordAttemptMock.mockResolvedValue({
			attemptId: "attempt-1",
			isCorrect: true,
			selectedChoice: { id: "choice-1", choiceText: "Sunlight" },
			correctChoice: { id: "choice-1", choiceText: "Sunlight" },
		});

		const response = await postAttempt({
			userId: "user-2",
			selectedChoiceId: "choice-1",
		});
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json).toEqual({
			attemptId: "attempt-1",
			isCorrect: true,
			selectedChoice: { id: "choice-1", choiceText: "Sunlight" },
			correctChoice: { id: "choice-1", choiceText: "Sunlight" },
		});
		expect(recordAttemptMock).toHaveBeenCalledWith({
			mcqId: "mcq-1",
			userId: "user-2",
			selectedChoiceId: "choice-1",
		});
	});

	it("returns 400 for a missing userId without calling the service", async () => {
		const response = await postAttempt({ selectedChoiceId: "choice-1" });

		expect(response.status).toBe(400);
		expect(recordAttemptMock).not.toHaveBeenCalled();
	});

	it("returns 400 when the selected choice does not belong to the MCQ", async () => {
		recordAttemptMock.mockRejectedValue(
			new McqValidationError("selectedChoiceId must belong to the MCQ."),
		);

		const response = await postAttempt({
			userId: "user-2",
			selectedChoiceId: "choice-other",
		});
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.error).toBe("selectedChoiceId must belong to the MCQ.");
	});

	it("returns 404 when the MCQ is missing", async () => {
		recordAttemptMock.mockRejectedValue(new McqNotFoundError());

		const response = await postAttempt({
			userId: "user-2",
			selectedChoiceId: "choice-1",
		});
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json.error).toBe("MCQ not found.");
	});
});
