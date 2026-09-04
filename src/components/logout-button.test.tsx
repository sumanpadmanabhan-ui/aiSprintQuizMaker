import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "@/components/logout-button";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const pushMock = vi.fn();
const fetchMock = vi.fn();

describe("LogoutButton", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useRouter).mockReturnValue({ push: pushMock } as never);
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("posts logout then navigates to /login", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ ok: true }),
		});

		render(<LogoutButton />);
		await userEvent.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/auth/logout",
				expect.objectContaining({ method: "POST" }),
			),
		);
		expect(pushMock).toHaveBeenCalledWith("/login");
	});

	it("navigates to /login even when logout fetch rejects", async () => {
		fetchMock.mockRejectedValue(new Error("network"));

		render(<LogoutButton />);
		await userEvent.click(screen.getByRole("button", { name: /log out/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
	});
});
