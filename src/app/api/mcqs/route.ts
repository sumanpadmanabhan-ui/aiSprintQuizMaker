import { createMcq, listMcqs } from "@/lib/services/mcq-service";
import {
	mcqErrorResponse,
	parseListQuery,
	parseMcqBody,
	readJsonBody,
} from "@/app/api/mcqs/validation";

export async function GET(request: Request): Promise<Response> {
	try {
		const result = await listMcqs(parseListQuery(new URL(request.url)));
		return Response.json(result);
	} catch (error) {
		return mcqErrorResponse(error);
	}
}

export async function POST(request: Request): Promise<Response> {
	try {
		const mcq = await createMcq(parseMcqBody(await readJsonBody(request)));
		return Response.json(mcq, { status: 201 });
	} catch (error) {
		return mcqErrorResponse(error);
	}
}
