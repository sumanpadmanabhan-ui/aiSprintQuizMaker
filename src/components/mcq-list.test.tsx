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
		expect(screen.getByRole("link", { name: /create question/i }).getAttribute("href")).toBe(
			"/mcqs/create",
		);
		expect(screen.getByRole("link", { name: /^edit$/i }).getAttribute("href")).toBe(
			"/mcqs/mcq-1/edit",
		);
		expect(screen.getByRole("link", { name: /preview/i }).getAttribute("href")).toBe(
			"/mcqs/mcq-1/preview",
		);
		expect(screen.getByRole("button", { name: /delete/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith("/api/mcqs?page=1&limit=10");
	});

	it("shows a loading state before the list arrives", async () => {
		let resolveList: ((value: unknown) => void) | undefined;
		fetchMock.mockReturnValue(
			new Promise((resolve) => {
				resolveList = resolve;
			}),
		);

		render(<McqList />);

		expect((await screen.findByRole("status")).textContent).toMatch(/loading/i);
		expect(screen.queryByText("Photosynthesis")).toBeNull();

		resolveList?.({
			ok: true,
			status: 200,
			json: async () => listPayload,
		});

		expect(await screen.findByText("Photosynthesis")).toBeTruthy();
		expect(screen.queryByRole("status")).toBeNull();
	});

	it("shows an error without the empty state when the list request fails", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 500,
			json: async () => ({ error: "Internal server error." }),
		});

		render(<McqList />);

		expect((await screen.findByRole("alert")).textContent).toMatch(/unable to load/i);
		expect(screen.queryByText(/no questions yet/i)).toBeNull();
		expect(screen.queryByRole("link", { name: /^edit$/i })).toBeNull();
	});

	it("does not delete when confirmation is cancelled", async () => {
		vi.spyOn(window, "confirm").mockReturnValue(false);
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => listPayload,
		});

		render(<McqList />);
		await screen.findByText("Photosynthesis");
		await userEvent.click(screen.getByRole("button", { name: /delete/i }));

		expect(window.confirm).toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalledWith(
			"/api/mcqs/mcq-1",
			expect.objectContaining({ method: "DELETE" }),
		);
		expect(screen.getByText("Photosynthesis")).toBeTruthy();
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
