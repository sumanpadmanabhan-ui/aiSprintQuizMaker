import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function loadMigrationSql(): string {
	const migrationsDir = join(process.cwd(), "migrations");
	expect(existsSync(migrationsDir), "expected a migrations/ directory").toBe(true);

	const sqlFiles = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
	expect(sqlFiles.length, "expected at least one SQL migration").toBeGreaterThan(0);

	return sqlFiles
		.map((name) => readFileSync(join(migrationsDir, name), "utf8"))
		.join("\n");
}

describe("users table migration", () => {
	it("creates a users table with the required columns and uniqueness", () => {
		const sql = loadMigrationSql();
		const normalized = sql.replace(/\s+/g, " ").toLowerCase();

		expect(normalized).toContain("create table users");
		expect(normalized).toMatch(/id text primary key/);
		expect(normalized).toContain("first_name");
		expect(normalized).toContain("last_name");
		expect(normalized).toContain("username");
		expect(normalized).toContain("email");
		expect(normalized).toContain("password_hash");
		expect(normalized).toMatch(/username text not null unique/);
		expect(normalized).toMatch(/email text not null unique/);
	});
});
