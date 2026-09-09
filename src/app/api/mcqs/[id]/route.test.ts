import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteMcq, getMcqById, McqNotFoundError, updateMcq } from "@/lib/services/mcq-service";
import { DELETE, GET, PUT } from "./route";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		getMcqById: vi.fn(),
		updateMcq: vi.fn(),
		deleteMcq: vi.fn(),
	};
});

const getMcqByIdMock = vi.mocked(getMcqById);
const updateMcqMock = vi.mocked(updateMcq);
const deleteMcqMock = vi.mocked(deleteMcq);

const mcq = {
	id: "mcq-1",
	title: "Photosynthesis",
	description: "Grade 7 life science",
	question: "What do plants use to make food?",
	createdBy: "user-1",
	createdAt: "2026-09-09 10:00:00",
	updatedAt: "2026-09-09 10:00:00",
	choices: [
		{ id: "choice-1", choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
		{ id: "choice-2", choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
	],
};

const validBody = {
	title: "Plant energy",
	description: "Grade 7 life science",
	question: "What do plants use to make food?",
	createdBy: "someone-else",
	choices: [
		{ choiceText: "The sun", isCorrect: true, orderIndex: 0 },
		{ choiceText: "Soil", isCorrect: false, orderIndex: 1 },
	],
};

const context = { params: Promise.resolve({ id: "mcq-1" }) };

function getById() {
	return GET(new Request("http://localhost/api/mcqs/mcq-1"), context);
}

function putById(body: unknown) {
	return PUT(
		new Request("http://localhost/api/mcqs/mcq-1", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
		context,
	);
}

function deleteById() {
	return DELETE(new Request("http://localhost/api/mcqs/mcq-1", { method: "DELETE" }), context);
}

describe("GET /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with choices ordered by the service", async () => {
		getMcqByIdMock.mockResolvedValue(mcq);

		const response = await getById();
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json).toEqual(mcq);
		expect(getMcqByIdMock).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when the MCQ is missing", async () => {
		getMcqByIdMock.mockResolvedValue(null);

		const response = await getById();
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json.error).toBe("MCQ not found.");
	});
});

describe("PUT /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 and does not treat createdBy as an ownership check", async () => {
		updateMcqMock.mockResolvedValue({ ...mcq, title: "Plant energy" });

		const response = await putById(validBody);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.title).toBe("Plant energy");
		expect(updateMcqMock).toHaveBeenCalledWith({
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
	});

	it("returns 400 for invalid bodies without calling the service", async () => {
		const response = await putById({ ...validBody, choices: [] });

		expect(response.status).toBe(400);
		expect(updateMcqMock).not.toHaveBeenCalled();
	});

	it("returns 404 when the service reports a missing MCQ", async () => {
		updateMcqMock.mockRejectedValue(new McqNotFoundError());

		const response = await putById(validBody);
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json.error).toBe("MCQ not found.");
	});
});

describe("DELETE /api/mcqs/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 204 with an empty body", async () => {
		deleteMcqMock.mockResolvedValue(undefined);

		const response = await deleteById();

		expect(response.status).toBe(204);
		expect(await response.text()).toBe("");
		expect(deleteMcqMock).toHaveBeenCalledWith("mcq-1");
	});

	it("returns 404 when deleting a missing MCQ", async () => {
		deleteMcqMock.mockRejectedValue(new McqNotFoundError());

		const response = await deleteById();
		const json = await response.json();

		expect(response.status).toBe(404);
		expect(json.error).toBe("MCQ not found.");
	});
});
