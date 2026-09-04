import { getCloudflareContext } from "@opennextjs/cloudflare";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "@/lib/db";

vi.mock("@opennextjs/cloudflare", () => ({
	getCloudflareContext: vi.fn(),
}));

const getCloudflareContextMock = vi.mocked(getCloudflareContext);

describe("getDb", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns env.DB from the Cloudflare context", async () => {
		const mockDb = { prepare: vi.fn() };
		getCloudflareContextMock.mockResolvedValue({
			env: { DB: mockDb },
		} as never);

		await expect(getDb()).resolves.toBe(mockDb);
		expect(getCloudflareContextMock).toHaveBeenCalledOnce();
	});
});
