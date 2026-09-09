import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { McqList } from "@/components/mcq-list";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const fetchMock = vi.fn();

const listPayload = {
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
	pagination: { page: 1, limit: 10, total: 1, pages: 1 },
};

describe("McqList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as never);
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(window, "confirm").mockReturnValue(true);
	});

	it("loads MCQs and shows title, search, create, and actions", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => listPayload,
		});

		render(<McqList />);

		expect(await screen.findByText("Photosynthesis")).toBeTruthy();
		expect(screen.getByRole("heading", { name: /multiple choice questions/i })).toBeTruthy();
		expect(screen.getByRole("link", { name: /create/i })).toBeTruthy();
		expect(screen.getByRole("link", { name: /^edit$/i })).toBeTruthy();
		expect(screen.getByRole("link", { name: /preview/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith("/api/mcqs?page=1&limit=10");
	});

	it("shows an empty state when there are no MCQs", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({
				mcqs: [],
				pagination: { page: 1, limit: 10, total: 0, pages: 0 },
			}),
		});

		render(<McqList />);

		expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
	});

	it("searches through the API", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => listPayload,
		});

		render(<McqList />);
		await screen.findByText("Photosynthesis");
		const user = userEvent.setup();
		await user.type(screen.getByLabelText(/search/i), "plant");
		await user.click(screen.getByRole("button", { name: /^search$/i }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith("/api/mcqs?page=1&limit=10&search=plant"),
		);
	});

	it("deletes an MCQ after confirmation", async () => {
		fetchMock
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => listPayload,
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 204,
				text: async () => "",
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					mcqs: [],
					pagination: { page: 1, limit: 10, total: 0, pages: 0 },
				}),
			});

		render(<McqList />);
		await screen.findByText("Photosynthesis");
		await userEvent.click(screen.getByRole("button", { name: /delete/i }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/mcqs/mcq-1",
				expect.objectContaining({ method: "DELETE" }),
			),
		);
		expect(window.confirm).toHaveBeenCalled();
		expect(await screen.findByText(/no questions yet/i)).toBeTruthy();
	});
});
