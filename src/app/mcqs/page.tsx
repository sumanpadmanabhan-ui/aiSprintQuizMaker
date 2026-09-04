import { LogoutButton } from "@/components/logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function McqsPage() {
	return (
		<div className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-6 p-6">
			<Card>
				<CardHeader>
					<CardTitle>Multiple-choice questions</CardTitle>
					<CardDescription>
						Question authoring arrives in a later sprint. This page is a placeholder so teachers
						have somewhere to land after registering or logging in.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<LogoutButton />
				</CardContent>
			</Card>
		</div>
	);
}
