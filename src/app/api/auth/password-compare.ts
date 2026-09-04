import { timingSafeEqual } from "node:crypto";

export function passwordHashesEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);

	if (leftBytes.length !== rightBytes.length) {
		return false;
	}

	return timingSafeEqual(leftBytes, rightBytes);
}
