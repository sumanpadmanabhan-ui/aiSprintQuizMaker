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

function normalizedSql(): string {
	return loadMigrationSql().replace(/\s+/g, " ").toLowerCase();
}

describe("mcq tables migration", () => {
	it("creates an mcqs table with required columns and a users foreign key", () => {
		const sql = normalizedSql();

		expect(sql).toContain("create table mcqs");
		expect(sql).toMatch(/id text primary key/);
		expect(sql).toContain("title text not null");
		expect(sql).toContain("description");
		expect(sql).toContain("question text not null");
		expect(sql).toMatch(/created_by text not null references users\s*\(\s*id\s*\)/);
		expect(sql).toContain("on delete cascade");
	});

	it("creates an mcq_choices table with a cascade foreign key to mcqs", () => {
		const sql = normalizedSql();

		expect(sql).toContain("create table mcq_choices");
		expect(sql).toMatch(/mcq_id text not null references mcqs\s*\(\s*id\s*\)/);
		expect(sql).toContain("choice_text text not null");
		expect(sql).toMatch(/is_correct integer not null/);
		expect(sql).toContain("order_index integer not null");
	});

	it("creates an mcq_attempts table with foreign keys to mcqs, users, and choices", () => {
		const sql = normalizedSql();

		expect(sql).toContain("create table mcq_attempts");
		expect(sql).toMatch(/mcq_id text not null references mcqs\s*\(\s*id\s*\)/);
		expect(sql).toMatch(/user_id text not null references users\s*\(\s*id\s*\)/);
		expect(sql).toMatch(
			/selected_choice_id text not null references mcq_choices\s*\(\s*id\s*\)/,
		);
		expect(sql).toMatch(/is_correct integer not null/);
	});

	it("creates the required lookup indexes", () => {
		const sql = normalizedSql();

		expect(sql).toContain("create index idx_mcqs_created_by on mcqs (created_by)");
		expect(sql).toContain("create index idx_mcqs_created_at on mcqs (created_at)");
		expect(sql).toContain("create index idx_mcqs_title on mcqs (title)");
		expect(sql).toContain("create index idx_mcq_choices_mcq_id on mcq_choices (mcq_id)");
		expect(sql).toContain("create index idx_mcq_choices_order on mcq_choices (mcq_id, order_index)");
		expect(sql).toContain("create index idx_mcq_attempts_mcq_id on mcq_attempts (mcq_id)");
		expect(sql).toContain("create index idx_mcq_attempts_user_id on mcq_attempts (user_id)");
		expect(sql).toContain("create index idx_mcq_attempts_attempted_at on mcq_attempts (attempted_at)");
	});
});
