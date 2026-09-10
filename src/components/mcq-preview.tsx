"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getCurrentUserId } from "@/lib/current-user";

type PreviewChoice = {
	id: string;
	choiceText: string;
	isCorrect: boolean;
	orderIndex: number;
};

type PreviewMcq = {
	id: string;
	title: string;
	description: string | null;
	question: string;
	choices: PreviewChoice[];
};

type AttemptResult = {
	attemptId: string;
	isCorrect: boolean;
	selectedChoice: { id: string; choiceText: string };
	correctChoice: { id: string; choiceText: string };
	error?: string;
};

export function McqPreview({ mcqId }: { mcqId: string }) {
	const [mcq, setMcq] = useState<PreviewMcq | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [userId, setUserId] = useState(() => getCurrentUserId() ?? "");
	const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
	const [result, setResult] = useState<AttemptResult | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const json = (await response.json().catch(() => ({}))) as PreviewMcq & { error?: string };
				if (cancelled) {
					return;
				}
				if (response.status !== 200) {
					setLoadError(json.error ?? "MCQ not found.");
					return;
				}
				setMcq(json);
			} catch {
				if (!cancelled) {
					setLoadError("Unable to load the question.");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [mcqId]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitError(null);

		const trimmedUserId = userId.trim();
		if (!trimmedUserId) {
			setSubmitError("Author user ID is required.");
			return;
		}
		if (!selectedChoiceId) {
			setSubmitError("Select a choice before submitting.");
			return;
		}

		setSubmitting(true);
		try {
			const response = await fetch(`/api/mcqs/${mcqId}/attempts`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userId: trimmedUserId, selectedChoiceId }),
			});
			const json = (await response.json().catch(() => ({}))) as AttemptResult;
			if (response.status !== 201) {
				setSubmitError(json.error ?? "Unable to record the attempt.");
				return;
			}
			setResult(json);
		} catch {
			setSubmitError("Unable to record the attempt.");
		} finally {
			setSubmitting(false);
		}
	}

	function handleTryAgain() {
		setResult(null);
		setSelectedChoiceId(null);
		setSubmitError(null);
	}

	if (loadError) {
		return (
			<div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-4 p-6">
				<p role="alert">{loadError}</p>
				<Link href="/mcqs" className={buttonVariants({ variant: "link" })}>
					Back to questions
				</Link>
			</div>
		);
	}

	if (!mcq) {
		return <p className="p-6" role="status">Loading question…</p>;
	}

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6">
			<Card>
				<CardHeader>
					<h1 className="font-heading text-base leading-snug font-medium">{mcq.title}</h1>
					{mcq.description ? <CardDescription>{mcq.description}</CardDescription> : null}
				</CardHeader>
				<CardContent className="flex flex-col gap-6">
					<p>{mcq.question}</p>
					{result ? (
						<div className="flex flex-col gap-4">
							<p role="status">
								{result.isCorrect
									? "Correct"
									: `Incorrect. The correct choice is ${result.correctChoice.choiceText}.`}
							</p>
							<Button type="button" variant="outline" onClick={handleTryAgain}>
								Try Again
							</Button>
						</div>
					) : (
						<form onSubmit={handleSubmit}>
							<FieldGroup>
								<Field>
									<FieldLabel htmlFor="attempt-user-id">Author user ID</FieldLabel>
									<Input
										id="attempt-user-id"
										name="userId"
										value={userId}
										onChange={(event) => setUserId(event.target.value)}
									/>
								</Field>
								{mcq.choices.map((choice) => (
									<label key={choice.id} className="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="selected-choice"
											value={choice.id}
											checked={selectedChoiceId === choice.id}
											onChange={() => setSelectedChoiceId(choice.id)}
										/>
										{choice.choiceText}
									</label>
								))}
								<Field>
									<Button type="submit" disabled={submitting}>
										Submit answer
									</Button>
									<FieldError errors={submitError ? [{ message: submitError }] : undefined} />
								</Field>
							</FieldGroup>
						</form>
					)}
					<Link href="/mcqs" className={buttonVariants({ variant: "link" })}>
						Back to questions
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
