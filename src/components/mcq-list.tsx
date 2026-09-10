"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

type McqListRow = {
	id: string;
	title: string;
	description: string | null;
	question: string;
	createdBy: string;
	createdAt: string;
	updatedAt: string;
};

type ListResponse = {
	mcqs: McqListRow[];
	pagination: { page: number; limit: number; total: number; pages: number };
	error?: string;
};

const LIST_LIMIT = 10;

function truncate(text: string | null, max = 80): string {
	if (!text) {
		return "—";
	}
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

function listUrl(page: number, search: string): string {
	const params = new URLSearchParams({ page: String(page), limit: String(LIST_LIMIT) });
	if (search) {
		params.set("search", search);
	}
	return `/api/mcqs?${params.toString()}`;
}

export function McqList() {
	const [mcqs, setMcqs] = useState<McqListRow[]>([]);
	const [pagination, setPagination] = useState({ page: 1, limit: LIST_LIMIT, total: 0, pages: 0 });
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState("");
	const [searchInput, setSearchInput] = useState("");
	const [reloadToken, setReloadToken] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function run() {
			try {
				const response = await fetch(listUrl(page, search));
				const json = (await response.json().catch(() => ({}))) as ListResponse;
				if (cancelled) {
					return;
				}
				if (response.status !== 200) {
					setError("Unable to load questions.");
					setMcqs([]);
					setLoading(false);
					return;
				}
				setMcqs(json.mcqs ?? []);
				setPagination(json.pagination);
				setError(null);
				setLoading(false);
			} catch {
				if (!cancelled) {
					setError("Unable to load questions.");
					setMcqs([]);
					setLoading(false);
				}
			}
		}

		void run();
		return () => {
			cancelled = true;
		};
	}, [page, search, reloadToken]);

	function handleSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPage(1);
		setSearch(searchInput.trim());
	}

	async function handleDelete(id: string) {
		if (!window.confirm("Delete this question? This cannot be undone.")) {
			return;
		}

		try {
			const response = await fetch(`/api/mcqs/${id}`, { method: "DELETE" });
			if (response.status !== 204 && response.status !== 200) {
				const json = (await response.json().catch(() => ({}))) as { error?: string };
				setError(json.error ?? "Unable to delete the question.");
				return;
			}
			setReloadToken((current) => current + 1);
		} catch {
			setError("Unable to delete the question.");
		}
	}

	const empty = !loading && !error && mcqs.length === 0;

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 p-6">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="text-2xl font-semibold">Multiple Choice Questions</h1>
				<div className="flex flex-wrap items-center gap-3">
					<Link href="/mcqs/create" className={buttonVariants()}>
						Create Question
					</Link>
					<LogoutButton />
				</div>
			</div>

			<form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
				<Field className="max-w-sm">
					<FieldLabel htmlFor="search">Search</FieldLabel>
					<Input
						id="search"
						name="search"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
					/>
				</Field>
				<Button type="submit">Search</Button>
			</form>

			<FieldError errors={error ? [{ message: error }] : undefined} />

			{loading ? (
				<p role="status">Loading questions…</p>
			) : error ? null : empty ? (
				<p>No questions yet. Create one to start the shared test bank.</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Title</TableHead>
							<TableHead>Description</TableHead>
							<TableHead>Question</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell>{mcq.title}</TableCell>
								<TableCell className="max-w-xs truncate">{truncate(mcq.description)}</TableCell>
								<TableCell className="max-w-xs truncate">{truncate(mcq.question)}</TableCell>
								<TableCell>{mcq.createdAt}</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-2">
										<Link
											href={`/mcqs/${mcq.id}/edit`}
											className={buttonVariants({ variant: "outline", size: "sm" })}
										>
											Edit
										</Link>
										<Link
											href={`/mcqs/${mcq.id}/preview`}
											className={buttonVariants({ variant: "outline", size: "sm" })}
										>
											Preview
										</Link>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={() => void handleDelete(mcq.id)}
										>
											Delete
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			{!loading && !error && pagination.pages > 1 ? (
				<div className="flex items-center gap-3">
					<Button
						type="button"
						variant="outline"
						disabled={page <= 1}
						onClick={() => setPage((current) => Math.max(1, current - 1))}
					>
						Previous
					</Button>
					<p>
						Page {pagination.page} of {pagination.pages}
					</p>
					<Button
						type="button"
						variant="outline"
						disabled={page >= pagination.pages}
						onClick={() => setPage((current) => current + 1)}
					>
						Next
					</Button>
				</div>
			) : null}
		</div>
	);
}
