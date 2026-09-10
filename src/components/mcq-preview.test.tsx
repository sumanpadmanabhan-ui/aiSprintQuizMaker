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
		expect(JSON.parse(String(options.body))).not.toHaveProperty("isCorrect");
	});

	it("shows a loading state before the question arrives", async () => {
		let resolveGet: ((value: unknown) => void) | undefined;
		fetchMock.mockReturnValue(
			new Promise((resolve) => {
				resolveGet = resolve;
			}),
		);

		render(<McqPreview mcqId="mcq-1" />);

		expect((await screen.findByRole("status")).textContent).toMatch(/loading/i);
		expect(screen.queryByText("What do plants use to make food?")).toBeNull();

		resolveGet?.({
			ok: true,
			status: 200,
			json: async () => mcq,
		});

		expect(await screen.findByText("What do plants use to make food?")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Photosynthesis" })).toBeTruthy();
		expect(screen.getByText("Grade 7 life science")).toBeTruthy();
		expect(screen.getByRole("link", { name: /back/i }).getAttribute("href")).toBe("/mcqs");
	});

	it("shows an error when the question cannot be loaded", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 404,
			json: async () => ({ error: "MCQ not found." }),
		});

		render(<McqPreview mcqId="missing" />);

		expect((await screen.findByRole("alert")).textContent).toMatch(/not found/i);
		expect(screen.queryByRole("button", { name: /submit answer/i })).toBeNull();
	});

	it("does not submit until a choice is selected", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mcq,
		});

		render(<McqPreview mcqId="mcq-1" />);
		await screen.findByText("What do plants use to make food?");
		await userEvent.click(screen.getByRole("button", { name: /submit answer/i }));

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect((await screen.findByRole("alert")).textContent).toMatch(/select a choice/i);
	});

	it("lets the user try again after feedback without trusting client correctness", async () => {
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
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 201,
				json: async () => ({
					attemptId: "attempt-3",
					isCorrect: true,
					selectedChoice: { id: "choice-1", choiceText: "Sunlight" },
					correctChoice: { id: "choice-1", choiceText: "Sunlight" },
				}),
			});

		render(<McqPreview mcqId="mcq-1" />);
		await screen.findByText("What do plants use to make food?");
		const user = userEvent.setup();
		await user.click(screen.getByLabelText(/moonlight/i));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));
		expect((await screen.findByRole("status")).textContent).toMatch(/incorrect/i);

		await user.click(screen.getByRole("button", { name: /try again/i }));
		expect(screen.queryByRole("status")).toBeNull();
		await user.click(screen.getByLabelText(/sunlight/i));
		await user.click(screen.getByRole("button", { name: /submit answer/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		const [, secondAttempt] = fetchMock.mock.calls[2] as [string, RequestInit];
		expect(JSON.parse(String(secondAttempt.body))).toEqual({
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
