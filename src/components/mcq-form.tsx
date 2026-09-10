"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
} from "@/components/ui/card";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getCurrentUserId } from "@/lib/current-user";
import { cn } from "@/lib/utils";

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 500;
const QUESTION_MAX = 1000;
const CHOICES_MIN = 2;
const CHOICES_MAX = 6;

export type McqFormChoice = {
	choiceText: string;
	isCorrect: boolean;
	orderIndex?: number;
};

export type McqFormValues = {
	title: string;
	description?: string | null;
	question: string;
	createdBy: string;
	choices: McqFormChoice[];
};

type ChoiceDraft = {
	choiceText: string;
	isCorrect: boolean;
};

type McqFormProps = {
	mcqId?: string;
	initialMcq?: McqFormValues;
};

function emptyChoices(): ChoiceDraft[] {
	return [
		{ choiceText: "", isCorrect: false },
		{ choiceText: "", isCorrect: false },
	];
}

function choicesFromInitial(initial?: McqFormValues): ChoiceDraft[] {
	if (!initial?.choices.length) {
		return emptyChoices();
	}

	const sorted = [...initial.choices].sort(
		(left, right) => (left.orderIndex ?? 0) - (right.orderIndex ?? 0),
	);
	return sorted.map((choice) => ({
		choiceText: choice.choiceText,
		isCorrect: choice.isCorrect,
	}));
}

const textareaClassName = cn(
	"min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
);

export function McqForm({ mcqId, initialMcq }: McqFormProps) {
	const router = useRouter();
	const isEdit = Boolean(mcqId);
	const [title, setTitle] = useState(initialMcq?.title ?? "");
	const [description, setDescription] = useState(initialMcq?.description ?? "");
	const [question, setQuestion] = useState(initialMcq?.question ?? "");
	const [createdBy, setCreatedBy] = useState(
		initialMcq?.createdBy ?? getCurrentUserId() ?? "",
	);
	const [choices, setChoices] = useState<ChoiceDraft[]>(() => choicesFromInitial(initialMcq));
	const [formError, setFormError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	function updateChoice(index: number, patch: Partial<ChoiceDraft>) {
		setChoices((current) =>
			current.map((choice, choiceIndex) =>
				choiceIndex === index ? { ...choice, ...patch } : choice,
			),
		);
	}

	function markCorrect(index: number) {
		setChoices((current) =>
			current.map((choice, choiceIndex) => ({
				...choice,
				isCorrect: choiceIndex === index,
			})),
		);
	}

	function addChoice() {
		setChoices((current) =>
			current.length >= CHOICES_MAX ? current : [...current, { choiceText: "", isCorrect: false }],
		);
	}

	function removeChoice(index: number) {
		setChoices((current) => (current.length <= CHOICES_MIN ? current : current.filter((_, i) => i !== index)));
	}

	function moveChoice(index: number, direction: -1 | 1) {
		setChoices((current) => {
			const nextIndex = index + direction;
			if (nextIndex < 0 || nextIndex >= current.length) {
				return current;
			}
			const next = [...current];
			const [moved] = next.splice(index, 1);
			next.splice(nextIndex, 0, moved);
			return next;
		});
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);

		const trimmedTitle = title.trim();
		const trimmedQuestion = question.trim();
		const trimmedCreatedBy = createdBy.trim();
		const filled = choices
			.map((choice) => ({
				choiceText: choice.choiceText.trim(),
				isCorrect: choice.isCorrect,
			}))
			.filter((choice) => choice.choiceText.length > 0);

		if (!trimmedTitle || !trimmedQuestion) {
			setFormError("Title and question are required.");
			return;
		}
		if (filled.length < CHOICES_MIN) {
			setFormError("At least two choices with text are required.");
			return;
		}
		if (filled.length > CHOICES_MAX) {
			setFormError("At most six choices are allowed.");
			return;
		}
		if (filled.filter((choice) => choice.isCorrect).length !== 1) {
			setFormError("Exactly one choice must be marked as correct.");
			return;
		}
		if (!trimmedCreatedBy) {
			setFormError("Author user ID is required.");
			return;
		}

		const payload = {
			title: trimmedTitle,
			description: description.trim() || null,
			question: trimmedQuestion,
			createdBy: trimmedCreatedBy,
			choices: filled.map((choice, orderIndex) => ({
				choiceText: choice.choiceText,
				isCorrect: choice.isCorrect,
				orderIndex,
			})),
		};

		setSubmitting(true);
		try {
			const response = await fetch(isEdit ? `/api/mcqs/${mcqId}` : "/api/mcqs", {
				method: isEdit ? "PUT" : "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const json = (await response.json().catch(() => ({}))) as { error?: string };
			const ok = isEdit ? response.status === 200 : response.status === 201;
			if (!ok) {
				setFormError(json.error ?? "Unable to save the question.");
				return;
			}
			router.push("/mcqs");
		} catch {
			setFormError("Unable to save the question.");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 p-6">
			<Card>
				<CardHeader>
					<h1 className="font-heading text-base leading-snug font-medium">
						{isEdit ? "Edit Question" : "New Question"}
					</h1>
					<CardDescription>
						Title, question stem, and 2–6 choices with exactly one correct answer.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit}>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="title">Title</FieldLabel>
								<Input
									id="title"
									name="title"
									value={title}
									maxLength={TITLE_MAX}
									onChange={(event) => setTitle(event.target.value)}
									required
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="description">Description</FieldLabel>
								<textarea
									id="description"
									name="description"
									value={description ?? ""}
									maxLength={DESCRIPTION_MAX}
									onChange={(event) => setDescription(event.target.value)}
									className={textareaClassName}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="question">Question</FieldLabel>
								<textarea
									id="question"
									name="question"
									value={question}
									maxLength={QUESTION_MAX}
									onChange={(event) => setQuestion(event.target.value)}
									required
									className={textareaClassName}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="created-by">Author user ID</FieldLabel>
								<Input
									id="created-by"
									name="createdBy"
									value={createdBy}
									onChange={(event) => setCreatedBy(event.target.value)}
									required
								/>
								<FieldDescription>
									There is no login session yet, so create and update send this users.id as
									createdBy. It is attribution, not authorization.
								</FieldDescription>
							</Field>
							{choices.map((choice, index) => (
								<Field key={index} className="rounded-lg border border-border p-3">
									<FieldLabel htmlFor={`choice-${index}`}>Choice {index + 1}</FieldLabel>
									<Input
										id={`choice-${index}`}
										name={`choice-${index}`}
										value={choice.choiceText}
										onChange={(event) => updateChoice(index, { choiceText: event.target.value })}
									/>
									<label className="flex items-center gap-2 text-sm">
										<input
											type="radio"
											name="correct-choice"
											checked={choice.isCorrect}
											onChange={() => markCorrect(index)}
											aria-label={`Mark choice ${index + 1} as correct`}
										/>
										Correct answer
									</label>
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => moveChoice(index, -1)}
											disabled={index === 0}
										>
											Move choice {index + 1} up
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => moveChoice(index, 1)}
											disabled={index === choices.length - 1}
										>
											Move choice {index + 1} down
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => removeChoice(index)}
											disabled={choices.length <= CHOICES_MIN}
										>
											Remove choice {index + 1}
										</Button>
									</div>
								</Field>
							))}
							<Field>
								<Button
									type="button"
									variant="outline"
									onClick={addChoice}
									disabled={choices.length >= CHOICES_MAX}
								>
									Add choice
								</Button>
							</Field>
							<Field>
								<Button type="submit" disabled={submitting}>
									{submitting ? "Saving question…" : "Save question"}
								</Button>
								<Link href="/mcqs" className={buttonVariants({ variant: "outline" })}>
									Cancel
								</Link>
								<FieldError errors={formError ? [{ message: formError }] : undefined} />
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

export function McqEdit({ mcqId }: { mcqId: string }) {
	const [initialMcq, setInitialMcq] = useState<McqFormValues | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const response = await fetch(`/api/mcqs/${mcqId}`);
				const json = (await response.json().catch(() => ({}))) as McqFormValues & {
					error?: string;
				};
				if (cancelled) {
					return;
				}
				if (response.status !== 200) {
					setError(json.error ?? "MCQ not found.");
					return;
				}
				setInitialMcq({
					title: json.title,
					description: json.description ?? "",
					question: json.question,
					createdBy: json.createdBy,
					choices: json.choices ?? [],
				});
			} catch {
				if (!cancelled) {
					setError("Unable to load the question.");
				}
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, [mcqId]);

	if (error) {
		return (
			<div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-4 p-6">
				<p role="alert">{error}</p>
				<Link href="/mcqs" className={buttonVariants({ variant: "link" })}>
					Back to questions
				</Link>
			</div>
		);
	}

	if (!initialMcq) {
		return <p className="p-6" role="status">Loading question…</p>;
	}

	return <McqForm mcqId={mcqId} initialMcq={initialMcq} />;
}
