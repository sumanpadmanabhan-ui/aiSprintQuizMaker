const STORAGE_KEY = "quiz-maker-user-id";

export function getCurrentUserId(): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	const value = window.localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
	return value.length > 0 ? value : null;
}

export function setCurrentUserId(userId: string): void {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(STORAGE_KEY, userId.trim());
}

export function clearCurrentUserId(): void {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.removeItem(STORAGE_KEY);
}
