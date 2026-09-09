import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqPreview } from "@/components/mcq-preview";
import { setCurrentUserId } from "@/lib/current-user";

const fetchMock = vi.fn();

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

describe("McqPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		localStorage.clear();
		setCurrentUserId("user-2");
	});

	it("loads the question and records a server-computed attempt", async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mcq,
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					attemptId: "attempt-1",
					isCorrect: true,
					selectedChoice: { id: "choice-1", choiceText: "Sunlight" },
					correctChoice: { id: "choice-1", choiceText: "Sunlight" },
				}),
			});

		render(<McqPreview mcqId="mcq-1" />);

		expect(await screen.findByText("What do plants use to make food?")).toBeTruthy();
		expect(screen.getByRole("link", { name: /back to questions/i })).toBeTruthy();
		const user = userEvent.setup();
		await user.click(screen.getByLabelText(/sunlight/i));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
		expect(url).toBe("/api/mcqs/mcq-1/attempts");
		expect(options.method).toBe("POST");
		expect(JSON.parse(String(options.body))).toEqual({
			userId: "user-2",
			selectedChoiceId: "choice-1",
		});
		expect((await screen.findByRole("status")).textContent).toMatch(/correct/i);
	});

	it("shows the correct choice when the selected answer is wrong", async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => mcq,
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					attemptId: "attempt-2",
					isCorrect: false,
					selectedChoice: { id: "choice-2", choiceText: "Moonlight" },
					correctChoice: { id: "choice-1", choiceText: "Sunlight" },
				}),
			});

		render(<McqPreview mcqId="mcq-1" />);
		await screen.findByText("What do plants use to make food?");
		const user = userEvent.setup();
		await user.click(screen.getByLabelText(/moonlight/i));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		expect((await screen.findByRole("status")).textContent).toMatch(/incorrect/i);
		expect(screen.getByText(/sunlight/i)).toBeTruthy();
	});
});
