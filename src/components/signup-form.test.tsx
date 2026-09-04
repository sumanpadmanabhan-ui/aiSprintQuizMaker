import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "@/components/signup-form";

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}));

const pushMock = vi.fn();
const fetchMock = vi.fn();

async function fillValidSignup() {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText(/first name/i), "Jane");
	await user.type(screen.getByLabelText(/last name/i), "Doe");
	await user.type(screen.getByLabelText(/^username$/i), "jane@school.edu");
	await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
	await user.type(screen.getByLabelText(/^password$/i), "secret123");
	await user.type(screen.getByLabelText(/confirm password/i), "secret123");
	return user;
}

describe("SignupForm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useRouter).mockReturnValue({ push: pushMock } as never);
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("renders the register fields and submit control", () => {
		render(<SignupForm />);

		expect(screen.getByLabelText(/first name/i)).toBeTruthy();
		expect(screen.getByLabelText(/last name/i)).toBeTruthy();
		expect(screen.getByLabelText(/^username$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
		expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
		expect(screen.getByLabelText(/confirm password/i)).toBeTruthy();
		expect(screen.getByRole("button", { name: /create account/i })).toBeTruthy();
	});

	it("does not call fetch when confirm password does not match", async () => {
		render(<SignupForm />);
		const user = userEvent.setup();

		await user.type(screen.getByLabelText(/first name/i), "Jane");
		await user.type(screen.getByLabelText(/last name/i), "Doe");
		await user.type(screen.getByLabelText(/^username$/i), "jane@school.edu");
		await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
		await user.type(screen.getByLabelText(/^password$/i), "secret123");
		await user.type(screen.getByLabelText(/confirm password/i), "different1");
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByRole("alert")).toBeTruthy();
	});

	it("posts passwordHash without plaintext password and allows username to equal email", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ user: { id: "user-1" } }),
		});

		render(<SignupForm />);
		const user = await fillValidSignup();
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("/api/auth/register");
		expect(options.method).toBe("POST");
		const body = JSON.parse(String(options.body)) as Record<string, unknown>;
		expect(body.username).toBe("jane@school.edu");
		expect(body.email).toBe("jane@school.edu");
		expect(body.passwordHash).toMatch(/^[a-f0-9]{64}$/);
		expect(body).not.toHaveProperty("password");
	});

	it("navigates to /mcqs after a 201 response", async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			status: 201,
			json: async () => ({ user: { id: "user-1" } }),
		});

		render(<SignupForm />);
		const user = await fillValidSignup();
		await user.click(screen.getByRole("button", { name: /create account/i }));

		await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/mcqs"));
	});

	it("shows a 409 conflict message the user can read", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 409,
			json: async () => ({ error: "Username already in use." }),
		});

		render(<SignupForm />);
		const user = await fillValidSignup();
		await user.click(screen.getByRole("button", { name: /create account/i }));

		expect((await screen.findByRole("alert")).textContent).toMatch(/username already in use/i);
		expect(pushMock).not.toHaveBeenCalled();
	});
});
