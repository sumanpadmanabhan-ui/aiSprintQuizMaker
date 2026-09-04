import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Home() {
	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle>Quiz Maker</CardTitle>
					<CardDescription>
						A shared test bank for teachers. Register or log in to start collaborating on
						multiple-choice questions.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-2">
					<Link href="/register" className={cn(buttonVariants())}>
						Register
					</Link>
					<Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
						Log in
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
