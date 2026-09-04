import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/components/login-form";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const pushMock = vi.fn();
const fetchMock = vi.fn();

describe("LoginForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useRouter).mockReturnValue({ push: pushMock } as never);
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("renders username and password fields", () => {
		render(<LoginForm />);

		expect(screen.getByLabelText(/username/i)).toBeTruthy();
		expect(screen.getByLabelText(/password/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /^login$/i })).toBeTruthy();
	});

	it("posts passwordHash without plaintext password and navigates on 200", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ user: { id: "user-1" } }),
		});

		render(<LoginForm />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText(/username/i), "jane@school.edu");
		await user.type(screen.getByLabelText(/password/i), "secret123");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/auth/login");
		expect(options.method).toBe("POST");
		const body = JSON.parse(String(options.body)) as Record<string, unknown>;
		expect(body.username).toBe("jane@school.edu");
		expect(body.passwordHash).toMatch(/^[a-f0-9]{64}$/);
		expect(body).not.toHaveProperty("password");
		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mcqs"));
	});

	it("shows Invalid username or password on 401", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 401,
			json: async () => ({ error: "Invalid username or password." }),
		});

		render(<LoginForm />);
		const user = userEvent.setup();
		await user.type(screen.getByLabelText(/username/i), "jane@school.edu");
		await user.type(screen.getByLabelText(/password/i), "secret123");
		await user.click(screen.getByRole("button", { name: /^login$/i }));

		expect((await screen.findByRole("alert")).textContent).toBe("Invalid username or password.");
		expect(pushMock).not.toHaveBeenCalled();
	});
});
