import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcq, listMcqs } from "@/lib/services/mcq-service";
import { GET, POST } from "./route";

vi.mock("@/lib/services/mcq-service", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/services/mcq-service")>();
	return {
		...actual,
		createMcq: vi.fn(),
		listMcqs: vi.fn(),
	};
});

const createMcqMock = vi.mocked(createMcq);
const listMcqsMock = vi.mocked(listMcqs);

const createdMcq = {
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
	title: "Photosynthesis",
	description: "Grade 7 life science",
	question: "What do plants use to make food?",
	createdBy: "user-1",
	choices: [
		{ choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
		{ choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
	],
};

function getMcqs(url: string) {
	return GET(new Request(url));
}

function postMcqs(body: unknown) {
	return POST(
		new Request("http://localhost/api/mcqs", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);
}

describe("GET /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 200 with paginated MCQs and no choices", async () => {
		listMcqsMock.mockResolvedValue({
			mcqs: [
				{
					id: "mcq-1",
					title: "Photosynthesis",
					description: "Grade 7 life science",
					question: "What do plants use to make food?",
					createdBy: "user-1",
					createdAt: "2026-09-09 10:00:00",
					updatedAt: "2026-09-09 10:00:00",
				},
			],
			pagination: { page: 2, limit: 10, total: 25, pages: 3 },
		});

		const response = await getMcqs(
			"http://localhost/api/mcqs?page=2&limit=10&search=plant&createdBy=user-1",
		);
		const json = await response.json();

		expect(response.status).toBe(200);
		expect(json.mcqs).toHaveLength(1);
		expect(json.mcqs[0]).not.toHaveProperty("choices");
		expect(json.pagination).toEqual({ page: 2, limit: 10, total: 25, pages: 3 });
		expect(listMcqsMock).toHaveBeenCalledWith({
			page: 2,
			limit: 10,
			search: "plant",
			createdBy: "user-1",
		});
	});

	it("returns 400 for an invalid page or limit without calling the service", async () => {
		const pageResponse = await getMcqs("http://localhost/api/mcqs?page=0");
		const limitResponse = await getMcqs("http://localhost/api/mcqs?limit=51");

		expect(pageResponse.status).toBe(400);
		expect(limitResponse.status).toBe(400);
		expect(listMcqsMock).not.toHaveBeenCalled();
	});

	it("returns 500 when listing fails unexpectedly", async () => {
		listMcqsMock.mockRejectedValue(new Error("d1 down"));

		const response = await getMcqs("http://localhost/api/mcqs");
		const json = await response.json();

		expect(response.status).toBe(500);
		expect(json.error).toBe("Internal server error.");
	});
});

describe("POST /api/mcqs", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns 201 with the created MCQ and choices", async () => {
		createMcqMock.mockResolvedValue(createdMcq);

		const response = await postMcqs(validBody);
		const json = await response.json();

		expect(response.status).toBe(201);
		expect(json).toEqual(createdMcq);
		expect(createMcqMock).toHaveBeenCalledWith({
			title: "Photosynthesis",
			description: "Grade 7 life science",
			question: "What do plants use to make food?",
			createdBy: "user-1",
			choices: [
				{ choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
				{ choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
			],
		});
	});

	it("returns 400 for invalid bodies without calling the service", async () => {
		const missingTitle = await postMcqs({ ...validBody, title: "" });
		const twoCorrect = await postMcqs({
			...validBody,
			choices: [
				{ choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
				{ choiceText: "Moonlight", isCorrect: true, orderIndex: 1 },
			],
		});
		const notJson = await postMcqs("{");

		expect(missingTitle.status).toBe(400);
		expect(twoCorrect.status).toBe(400);
		expect(notJson.status).toBe(400);
		expect(createMcqMock).not.toHaveBeenCalled();
	});
});
