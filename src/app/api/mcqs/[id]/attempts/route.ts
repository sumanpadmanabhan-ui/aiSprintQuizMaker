import { recordAttempt } from "@/lib/services/mcq-service";
import {
	mcqErrorResponse,
	parseAttemptBody,
	readJsonBody,
	readRouteId,
	type McqRouteContext,
} from "@/app/api/mcqs/validation";

export async function POST(request: Request, context: McqRouteContext): Promise<Response> {
	try {
		const mcqId = await readRouteId(context);
		const body = parseAttemptBody(await readJsonBody(request));
		const result = await recordAttempt({ ...body, mcqId });
		return Response.json(result, { status: 201 });
	} catch (error) {
		return mcqErrorResponse(error);
	}
}
