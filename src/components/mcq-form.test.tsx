import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqForm } from "@/components/mcq-form";
import { setCurrentUserId } from "@/lib/current-user";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const pushMock = vi.fn();
const fetchMock = vi.fn();

async function fillValidQuestion(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText(/^title$/i), "Photosynthesis");
	await user.type(screen.getByLabelText(/^question$/i), "What do plants use to make food?");
	await user.type(screen.getByLabelText(/^choice 1$/i), "Sunlight");
	await user.type(screen.getByLabelText(/^choice 2$/i), "Moonlight");
	await user.click(screen.getByLabelText(/mark choice 1 as correct/i));
}

describe("McqForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useRouter).mockReturnValue({ push: pushMock } as never);
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		localStorage.clear();
		setCurrentUserId("user-1");
	});

	it("posts a new MCQ without calling the database and navigates on 201", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ id: "mcq-1" }),
		});

		render(<McqForm />);
		const user = userEvent.setup();
		await fillValidQuestion(user);
		await user.click(screen.getByRole("button", { name: /save question/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/mcqs");
		expect(options.method).toBe("POST");
		const body = JSON.parse(String(options.body)) as Record<string, unknown>;
		expect(body).toMatchObject({
			title: "Photosynthesis",
			question: "What do plants use to make food?",
			createdBy: "user-1",
		});
		const choices = body.choices as Array<{ choiceText: string; isCorrect: boolean; orderIndex: number }>;
		expect(choices).toHaveLength(2);
		expect(choices.filter((choice) => choice.isCorrect)).toHaveLength(1);
		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mcqs"));
	});

	it("does not submit when fewer than two choices have text", async () => {
		render(<McqForm />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText(/^title$/i), "Photosynthesis");
		await user.type(screen.getByLabelText(/^question$/i), "What do plants use to make food?");
		await user.type(screen.getByLabelText(/^choice 1$/i), "Sunlight");
		await user.click(screen.getByRole("button", { name: /save question/i }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect((await screen.findByRole("alert")).textContent).toMatch(/choice/i);
	});

	it("puts an existing MCQ and navigates on 200", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ id: "mcq-1" }),
		});

		render(
			<McqForm
				mcqId="mcq-1"
				initialMcq={{
					title: "Photosynthesis",
					description: "Grade 7",
					question: "What do plants use to make food?",
					createdBy: "user-1",
					choices: [
						{ choiceText: "Sunlight", isCorrect: true, orderIndex: 0 },
						{ choiceText: "Moonlight", isCorrect: false, orderIndex: 1 },
					],
				}}
			/>,
		);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: /save question/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/mcqs/mcq-1");
		expect(options.method).toBe("PUT");
		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mcqs"));
	});
});
